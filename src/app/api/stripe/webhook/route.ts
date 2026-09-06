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

/** De un objeto de Stripe, la organización a la que pertenece. */
async function orgDelEvento(admin: any, obj: any): Promise<string | null> {
  const porMetadata = obj?.metadata?.org_id ?? obj?.subscription_details?.metadata?.org_id;
  if (porMetadata) return porMetadata as string;
  if (obj?.client_reference_id) return obj.client_reference_id as string;

  // Las facturas no siempre traen la metadata: se busca por el cliente.
  const customer = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
  if (!customer) return null;
  const { data } = await admin
    .from("organizations").select("id").eq("stripe_customer_id", customer).maybeSingle();
  return (data as any)?.id ?? null;
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

  let fallo: string | null = null;
  try {
    switch (evento.type) {
      // El cliente terminó de pagar en la pantalla de Stripe.
      case "checkout.session.completed": {
        if (!orgId) break;
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
        if (!orgId) break;
        await aplicarSuscripcion(admin, orgId, obj);
        break;
      }

      // Se cobró el mes. Es la confirmación de que sigue todo bien.
      case "invoice.paid": {
        if (!orgId) break;
        await admin.from("organizations").update({
          estado_cobro: "activa",
          gracia_termina_at: null,
          periodo_termina_at: aFecha(obj?.lines?.data?.[0]?.period?.end) ?? undefined,
        }).eq("id", orgId);
        break;
      }

      // Falló la tarjeta. Empiezan los días de gracia.
      case "invoice.payment_failed": {
        if (!orgId) break;
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
