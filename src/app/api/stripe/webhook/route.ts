import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// El cuerpo tiene que llegar EXACTAMENTE como lo mandó Stripe: la firma se
// calcula sobre esos bytes. Cualquier transformación la invalidaría.
export const runtime = "nodejs";

/**
 * Lo que Stripe nos cuenta.
 *
 * SIN ESTO EL COBRO NO EXISTE. Se puede abrir el pago, el cliente puede pagar
 * y Stripe puede cobrarle todos los meses — pero si nadie escucha, la
 * plataforma nunca se entera y el cliente paga sin recibir nada. Este archivo
 * es el que convierte un cobro en un plan activo.
 *
 * DÍAS DE GRACIA: cuando falla el pago no se corta de golpe. Se marca
 * `pago_fallido` con 7 días por delante. Una tarjeta vencida es lo más normal
 * del mundo y no debe costar un cliente; en esos 7 días Stripe reintenta solo
 * y la plataforma se lo avisa en pantalla.
 */

const DIAS_DE_GRACIA = 7;

/**
 * LOS EVENTOS QUE MUEVEN DINERO.
 *
 * Se listan a propósito en vez de tratarlos todos igual: en esta misma cuenta
 * de Stripe viven otros productos de la casa, y sus avisos llegan a esta misma
 * dirección. Uno de esos sin organización NO es un fallo nuestro. Uno de
 * ESTOS sin organización sí lo es: quiere decir que alguien pagó y su cuenta
 * no se enteró.
 *
 * Quien añada un `case` nuevo al switch tiene que añadirlo aquí también: hay
 * una prueba estática que lo exige.
 */
const EVENTOS_DE_DINERO = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

/**
 * Lo que se apunta cuando un evento de dinero no encuentra su organización.
 *
 * Lleva con qué buscarlo a mano en Stripe —cliente, correo, factura— porque
 * quien lo lea va a tener que ir a mirar allá.
 */
function sinOrganizacion(tipo: string, obj: any): string {
  const customer = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
  const pistas = [
    `tipo=${tipo}`,
    customer ? `customer=${customer}` : null,
    obj?.customer_email ? `email=${obj.customer_email}` : null,
    obj?.subscription ? `subscription=${obj.subscription}` : null,
    obj?.id ? `objeto=${obj.id}` : null,
  ].filter(Boolean).join(" ");

  /* ── AJENO NO ES AVERÍA, Y MEZCLARLOS ES PEOR QUE NO APUNTAR NADA ────────
   *
   * Esta cuenta de Stripe la comparten varias actividades, así que aquí caen
   * avisos que esta plataforma nunca originó. Antes todos se apuntaban igual,
   * como `sin_organizacion`. El problema no es el dinero: es que ruido con
   * pinta de incidente entrena a no mirar. Tres avisos por semana que
   * resultan ser de otra cosa y nadie revisa el cuarto — que sí lo era.
   *
   * CÓMO SE DISTINGUEN, sin adivinar: `src/lib/billing/stripe.ts` pone
   * SIEMPRE `metadata[org_id]` al abrir un pago nuestro, y el checkout deja
   * `client_reference_id`. Si un aviso no trae ninguno de los dos, no salió
   * de aquí.
   *
   *   · trae dueño y no lo encontramos → INCIDENTE. Alguien pagó con nuestro
   *     botón y su cuenta no se enteró. Eso es lo único que debe dar la
   *     alarma.
   *   · no trae dueño ninguno → `ajeno`. Se apunta para tener el historial,
   *     no para despertar a nadie.
   */
  const decíaDeQuiénEra =
    obj?.metadata?.org_id ??
    obj?.subscription_details?.metadata?.org_id ??
    obj?.parent?.subscription_details?.metadata?.org_id ??
    obj?.client_reference_id ??
    null;

  return (
    decíaDeQuiénEra
      ? `sin_organizacion · decia org_id=${decíaDeQuiénEra} y no existe · ${pistas}`
      : `ajeno · ${pistas}`
  ).slice(0, 500);
}

/**
 * ¿Esto lo mandó Stripe de verdad?
 *
 * La dirección del webhook es pública: cualquiera puede mandarle un JSON
 * diciendo "este cliente ya pagó". Lo único que lo impide es esta firma.
 * Se calcula HMAC-SHA256 sobre `timestamp.cuerpo` con el secreto del webhook.
 *
 * Se compara con `timingSafeEqual` y no con `===` porque comparar cadenas se
 * corta en la primera letra distinta, y ese tiempo de más deja adivinar la
 * firma byte a byte. Es una precaución barata y estándar.
 */
function firmaValida(cuerpo: string, cabecera: string | null, secreto: string): boolean {
  if (!cabecera) return false;

  let t = "";
  const firmas: string[] = [];
  for (const parte of cabecera.split(",")) {
    const [k, v] = parte.trim().split("=");
    if (k === "t") t = v;
    if (k === "v1" && v) firmas.push(v);
  }
  if (!t || !firmas.length) return false;

  // Un evento viejo reenviado no vale: sin esto, quien capture una petición
  // legítima podría repetirla mañana. Cinco minutos es la tolerancia de Stripe.
  const edad = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return false;

  const esperada = createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
  const a = Buffer.from(esperada, "utf8");

  return firmas.some((f) => {
    const b = Buffer.from(f, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * De un objeto de Stripe, la organización a la que pertenece.
 *
 * SE BUSCA POR TRES CAMINOS, de más fiable a menos, porque perder este dato es
 * perder el cobro entero: el aviso llega, no se sabe de quién es, y el cliente
 * paga sin que su cuenta se entere.
 *
 *   1. La metadata que dejamos nosotros al abrir el pago (`suscripcion.ts`).
 *      Las facturas la reciben copiada en `subscription_details`; las versiones
 *      nuevas de la API de Stripe la cuelgan además de `parent`.
 *   2. El cliente de Stripe, que se guarda en la organización ANTES de cobrar.
 *   3. La suscripción. Un cobro mensual de una suscripción que YA conocemos es
 *      nuestro aunque el identificador de cliente se haya perdido por el
 *      camino — y es justo el caso de una suscripción dada de alta a mano desde
 *      el panel de Stripe, que no lleva metadata ninguna.
 */
async function orgDelEvento(admin: any, obj: any): Promise<string | null> {
  // UN FALLO DE LA BASE NO ES «NO EXISTE». Si no se mira el error, un corte de
  // un segundo se lee igual que un cliente ajeno y el cobro se da por perdido.
  const buscar = async (columna: string, valor: string): Promise<string | null> => {
    const { data, error } = await admin
      .from("organizations").select("id").eq(columna, valor).maybeSingle();
    // Se usa la misma etiqueta corta que el resto de los avisos de este
    // archivo: el dato que hace falta es la columna y el mensaje de la base.
    if (error) console.error("[stripe webhook]", columna, error.message);
    return (data as any)?.id ?? null;
  };

  /* ── LA METADATA DICE DE QUIÉN ES; LA BASE DICE SI EXISTE ────────────────
   *
   * Antes se devolvía el `org_id` de la metadata TAL CUAL, sin comprobar
   * nada. Si esa organización ya no está —se borró la cuenta, o el
   * identificador viene de una prueba vieja— el resto del archivo hacía su
   * `update ... where id = <ese uuid>`, que afecta a CERO filas y no falla.
   * El cobro quedaba dado por aplicado y nadie se enteraba.
   *
   * Es el mismo agujero que cerró H-01, entrando por otra puerta: el evento
   * se marcaba procesado y sin error. Devolver `null` aquí lo manda al
   * camino de «sin organización», que sí deja rastro.
   */
  const porMetadata =
    obj?.metadata?.org_id ??
    obj?.subscription_details?.metadata?.org_id ??
    obj?.parent?.subscription_details?.metadata?.org_id ??
    obj?.client_reference_id;
  if (porMetadata) return await buscar("id", String(porMetadata));

  const customer = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
  if (customer) {
    const porCliente = await buscar("stripe_customer_id", customer);
    if (porCliente) return porCliente;
  }

  const suscripcion =
    (typeof obj?.subscription === "string" ? obj.subscription : obj?.subscription?.id) ??
    obj?.parent?.subscription_details?.subscription ??
    (typeof obj?.id === "string" && obj.id.startsWith("sub_") ? obj.id : null);
  if (suscripcion) return await buscar("stripe_subscription_id", suscripcion);

  return null;
}

/** Trae la suscripción completa desde Stripe (los eventos vienen recortados). */
async function leerSuscripcion(id: string): Promise<any | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !id) return null;
  try {
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

const aFecha = (unix?: number | null) =>
  unix ? new Date(unix * 1000).toISOString() : null;

/** Guarda en la organización lo que dice una suscripción de Stripe. */
async function aplicarSuscripcion(admin: any, orgId: string, sub: any) {
  const planCode = sub?.metadata?.plan_code ?? null;

  // `trialing` y `active` son las dos formas de estar al día. Se guardan igual
  // de "activa" porque para la plataforma significan lo mismo: puede trabajar.
  const estado =
    sub?.status === "active" || sub?.status === "trialing" ? "activa"
    : sub?.status === "past_due" || sub?.status === "unpaid" ? "pago_fallido"
    : sub?.status === "canceled" || sub?.status === "incomplete_expired" ? "cancelada"
    : null;

  const patch: any = {
    stripe_subscription_id: sub?.id ?? null,
    periodo_termina_at: aFecha(sub?.current_period_end),
    // Canceló pero su mes sigue corriendo. La cuenta trabaja hasta el final
    // del periodo; esto solo sirve para decírselo en pantalla y para ofrecerle
    // deshacerlo mientras siga a tiempo.
    cancela_al_terminar: !!sub?.cancel_at_period_end,
  };
  if (estado) patch.estado_cobro = estado;
  if (planCode) patch.plan = planCode;

  if (estado === "activa") {
    // Se paga: se limpia cualquier gracia pendiente de un fallo anterior.
    patch.gracia_termina_at = null;
    patch.cancelada_at = null;
  }
  if (estado === "pago_fallido") {
    patch.gracia_termina_at = new Date(Date.now() + DIAS_DE_GRACIA * 86400000).toISOString();
  }
  if (estado === "cancelada") {
    patch.cancelada_at = new Date().toISOString();
    patch.gracia_termina_at = null;
    // Ya terminó de verdad: la bandera de "va a cancelar" deja de tener sentido.
    patch.cancela_al_terminar = false;
  }

  await admin.from("organizations").update(patch).eq("id", orgId);
}

export async function POST(req: Request) {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) {
    console.error("[stripe webhook] falta STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "no configurado" }, { status: 500 });
  }

  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get("stripe-signature"), secreto)) {
    // 400 a propósito: Stripe lo reintenta y a un impostor no le dice nada.
    return NextResponse.json({ error: "firma inválida" }, { status: 400 });
  }

  let evento: any;
  try { evento = JSON.parse(cuerpo); } catch { return NextResponse.json({ ok: true }); }

  const admin = createAdminClient();
  const obj = evento?.data?.object ?? {};
  const orgId = await orgDelEvento(admin, obj);

  // IDEMPOTENCIA. Stripe reenvía el mismo evento si tardamos en contestar, y a
  // veces lo manda dos veces por diseño. El `unique` de `stripe_event_id` hace
  // que el segundo intento falle aquí y no llegue a tocar nada.
  const { error: yaEstaba } = await admin.from("billing_events").insert({
    stripe_event_id: evento.id,
    tipo: evento.type,
    org_id: orgId,
    payload: evento,
  });
  if (yaEstaba) {
    // Se contesta 200: para Stripe está entregado, y lo está.
    return NextResponse.json({ ok: true, repetido: true });
  }

  // UN EVENTO DE DINERO SIN ORGANIZACIÓN NO SE DA POR BUENO.
  //
  // Antes esto era un `if (!orgId) break;` dentro de cada `case`: sin registro,
  // sin marca de fallo y con un 200 de vuelta. El evento quedaba guardado como
  // procesado correctamente, Stripe lo daba por entregado y no lo reintentaba
  // nunca más. Si quien pagó era un cliente nuestro, pagó y su cuenta se quedó
  // igual — y no había forma de enterarse.
  //
  // SE SIGUE CONTESTANDO 200 a propósito: el aviso de otro producto de la casa
  // no se va a arreglar por reintentarlo, y Stripe desactiva la dirección
  // entera cuando una serie de avisos falla. Lo que cambia es que queda
  // apuntado en `error` y sale en el panel de estado, que es lo que faltaba.
  const sinDuenio =
    !orgId && EVENTOS_DE_DINERO.has(evento.type) ? sinOrganizacion(evento.type, obj) : null;
  // UN AVISO AJENO NO SE GRITA. Va a `log` y no a `error` para que lo que
  // llegue a la bandeja de errores sea solo lo que hay que mirar hoy; el
  // historial completo sigue en `billing_events`.
  if (sinDuenio) {
    if (sinDuenio.startsWith("ajeno")) console.log("[stripe webhook]", evento.id, sinDuenio);
    else console.error("[stripe webhook]", evento.id, sinDuenio);
  }

  let fallo: string | null = sinDuenio;

  // Sin organización no hay a quién aplicarle nada; el porqué ya quedó escrito.
  if (orgId) {
    try {
      switch (evento.type) {
        // El cliente terminó de pagar en la pantalla de Stripe.
        case "checkout.session.completed": {
          // El pago de complementos también cae aquí; se distingue por el modo.
          if (obj.mode === "subscription" && obj.subscription) {
            const sub = await leerSuscripcion(obj.subscription);
            if (sub) await aplicarSuscripcion(admin, orgId, sub);
          } else if (obj.mode === "payment" || obj.mode === "subscription") {
            await activarComplementos(admin, orgId, obj);
          }
          // El cliente de Stripe se guarda siempre: es lo que abre el portal.
          if (obj.customer) {
            await admin.from("organizations")
              .update({ stripe_customer_id: obj.customer })
              .eq("id", orgId);
          }
          break;
        }

        // Cambios de la suscripción: renovación, cambio de plan, cancelación.
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          await aplicarSuscripcion(admin, orgId, obj);
          break;
        }

        // Se cobró el mes. Es la confirmación de que sigue todo bien.
        case "invoice.paid": {
          await admin.from("organizations").update({
            estado_cobro: "activa",
            gracia_termina_at: null,
            periodo_termina_at: aFecha(obj?.lines?.data?.[0]?.period?.end) ?? undefined,
          }).eq("id", orgId);
          break;
        }

        // Falló la tarjeta. Empiezan los días de gracia.
        case "invoice.payment_failed": {
          await admin.from("organizations").update({
            estado_cobro: "pago_fallido",
            gracia_termina_at: new Date(Date.now() + DIAS_DE_GRACIA * 86400000).toISOString(),
          }).eq("id", orgId);
          break;
        }

        default:
          // Los demás eventos se guardan y ya. Tener el registro cuesta nada y
          // el día que haga falta uno nuevo, el historial ya está ahí.
          break;
      }
    } catch (e: any) {
      fallo = String(e?.message ?? e).slice(0, 500);
      console.error("[stripe webhook]", evento.type, fallo);
    }
  }

  await admin.from("billing_events")
    .update({ procesado_at: new Date().toISOString(), error: fallo })
    .eq("stripe_event_id", evento.id);

  // Siempre 200 salvo firma inválida: si contestáramos error, Stripe
  // reintentaría en bucle un evento que ya quedó registrado.
  return NextResponse.json({ ok: true });
}

/**
 * Complementos comprados sueltos (`/api/checkout`).
 *
 * La sesión trae `metadata[item_N] = "codigo:cantidad"`, que es como lo dejó
 * escrito `createCheckout`. Se suman a lo que ya tuviera en vez de pisarlo:
 * comprar un segundo agente no debe borrar el primero.
 */
async function activarComplementos(admin: any, orgId: string, sesion: any) {
  const meta = sesion?.metadata ?? {};
  for (const [k, v] of Object.entries(meta)) {
    if (!k.startsWith("item_") || typeof v !== "string") continue;
    const [code, cantidad] = v.split(":");
    if (!code) continue;
    const qty = Math.max(1, Number(cantidad) || 1);

    const { data: ya } = await admin
      .from("org_addons").select("id, quantity")
      .eq("org_id", orgId).eq("addon_code", code).maybeSingle();

    if (ya) {
      await admin.from("org_addons")
        .update({ quantity: (Number(ya.quantity) || 0) + qty, active: true })
        .eq("id", ya.id);
    } else {
      await admin.from("org_addons")
        .insert({ org_id: orgId, addon_code: code, quantity: qty, active: true });
    }
  }
}
