/**
 * Suscripción a un plan con Stripe.
 *
 * Complementa a `stripe.ts` (que cobra complementos sueltos) y a
 * `stripePlans.ts` (que crea el Producto y el Precio de cada plan en Stripe).
 * Aquí vive lo que faltaba: que un cliente se SUSCRIBA.
 *
 * SE USA LA API REST DE STRIPE A PELO, sin su librería, igual que el resto del
 * cobro. Es una dependencia menos y el formato es form-urlencoded, nada raro.
 *
 * REGLA QUE NO SE ROMPE: el precio NUNCA viene del navegador. Se lee de la
 * tabla `plans` en el servidor. Si viniera del cliente, cualquiera podría
 * suscribirse al plan Profesional por un dólar desde la consola.
 */

import { HABLA_CON_NOSOTROS } from "@/lib/contacto";

const API = "https://api.stripe.com/v1";

export function stripeConfigurado(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

function form(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function stripe(path: string, params?: Record<string, string>, method = "POST") {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe no está configurado");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" && params ? form(params) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? `Stripe respondió ${res.status}`);
  return j;
}

export type Resultado = { ok: true; url: string } | { ok: false; error: string };

/**
 * El cliente de Stripe de esta organización, creándolo si es la primera vez.
 *
 * SE GUARDA EL IDENTIFICADOR para que el cliente sea SIEMPRE el mismo. Si se
 * creara uno nuevo en cada pago, el mismo negocio saldría repetido en Stripe y
 * su historial de cobros quedaría partido en pedazos.
 */
async function clienteDeStripe(
  admin: any,
  org: { id: string; name: string | null; stripe_customer_id: string | null },
  email?: string | null,
): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;

  const creado = await stripe("/customers", {
    name: org.name ?? "Cliente Demandu",
    ...(email ? { email } : {}),
    "metadata[org_id]": org.id,
  });

  await admin.from("organizations").update({ stripe_customer_id: creado.id }).eq("id", org.id);
  return creado.id as string;
}

/**
 * Abre el pago de un plan y devuelve la URL a la que hay que mandar al cliente.
 *
 * LOS DÍAS DE PRUEBA QUE LE QUEDEN SE RESPETAN. Si alguien se suscribe el día 3
 * de su prueba de 14, Stripe no le cobra hasta el día 14. Cobrarle al momento
 * sería castigar al que decide rápido, que es justo el mejor cliente.
 */
export async function abrirPagoDePlan(opts: {
  admin: any;
  orgId: string;
  planCode: string;
  email?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<Resultado> {
  if (!stripeConfigurado()) {
    return { ok: false, error: `Los pagos todavía no están habilitados. ${HABLA_CON_NOSOTROS}` };
  }

  const { data: org } = await opts.admin
    .from("organizations")
    .select("id, name, stripe_customer_id, prueba_termina_at, estado_cobro")
    .eq("id", opts.orgId)
    .maybeSingle();
  if (!org) return { ok: false, error: "No encontramos tu cuenta." };

  // El plan se lee del servidor, y solo si es público o suyo. Sin el filtro de
  // `org_id` un cliente podría suscribirse al plan a la medida de otro.
  const { data: plan } = await opts.admin
    .from("plans")
    .select("code, name, price_monthly, stripe_price_id, is_custom, org_id, active")
    .eq("code", opts.planCode)
    .maybeSingle();

  if (!plan || plan.active === false) return { ok: false, error: "Ese plan ya no está disponible." };
  if (plan.org_id && plan.org_id !== opts.orgId) {
    return { ok: false, error: "Ese plan no está disponible para tu cuenta." };
  }
  if (Number(plan.price_monthly) <= 0) {
    // Un plan a la medida no se arma solo: lo prepara el equipo y después le
    // aparece al cliente ya listo para contratar.
    return { ok: false, error: `Ese plan se cotiza a la medida. ${HABLA_CON_NOSOTROS}` };
  }
  if (!plan.stripe_price_id) {
    // Le pasa a un plan recién creado que todavía no se sincronizó.
    return { ok: false, error: "Ese plan aún se está preparando. Inténtalo en un minuto." };
  }

  try {
    const customer = await clienteDeStripe(opts.admin, org, opts.email);

    const params: Record<string, string> = {
      mode: "subscription",
      customer,
      "line_items[0][price]": plan.stripe_price_id,
      "line_items[0][quantity]": "1",
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      client_reference_id: opts.orgId,
      "metadata[org_id]": opts.orgId,
      "metadata[plan_code]": plan.code,
      // El webhook lee esto de la suscripción, no de la sesión: cuando llega
      // `customer.subscription.updated` la sesión ya no está a mano.
      "subscription_data[metadata][org_id]": opts.orgId,
      "subscription_data[metadata][plan_code]": plan.code,
      allow_promotion_codes: "true",
      // Para poder emitir facturas con los datos fiscales del cliente.
      "billing_address_collection": "auto",
      // TODO SE COBRA EN DÓLARES. Decisión de negocio, no técnica.
      //
      // Stripe tiene «Adaptive Pricing»: convierte el precio a la moneda del
      // cliente y le mete entre un 2% y un 4% de conversión dentro del tipo de
      // cambio. En México eso ayuda a vender. En PANAMÁ es un despropósito: el
      // balboa está fijado 1:1 con el dólar por ley, y Stripe igual aplicaba
      // 1 USD = 1.0400 PAB. Un panameño veía B/. 61.36 donde dice $59 — casi
      // dos dólares y medio de más por convertir a una moneda que ES el dólar.
      //
      // El panel de Stripe no permite excluir un país: es todo o nada. Este
      // parámetro sí es por sesión y MANDA SOBRE EL PANEL, así que la decisión
      // vive aquí, en el código, donde se revisa — y no depende de que nadie
      // vuelva a mover un interruptor por error.
      "adaptive_pricing[enabled]": "false",
    };

    // Los días de prueba que le queden, respetados.
    const prueba = org.prueba_termina_at ? new Date(org.prueba_termina_at).getTime() : 0;
    const ahora = Date.now();
    // Stripe exige que el fin de prueba esté al menos 48 h en el futuro.
    if (org.estado_cobro === "prueba" && prueba > ahora + 48 * 3600 * 1000) {
      params["subscription_data[trial_end]"] = String(Math.floor(prueba / 1000));
    }

    const sesion = await stripe("/checkout/sessions", params);
    if (!sesion?.url) return { ok: false, error: "No pudimos abrir el pago. Inténtalo otra vez." };
    return { ok: true, url: sesion.url as string };
  } catch (e: any) {
    console.error("[suscripcion] abrir pago:", e?.message ?? e);
    return { ok: false, error: "No pudimos abrir el pago. Inténtalo otra vez en un momento." };
  }
}

/**
 * Cancelar el plan. Sin contratos, sin penalización, sin llamar a nadie.
 *
 * NO SE CORTA EN EL ACTO, y es a propósito: el mes ya está pagado. Se le dice
 * a Stripe que no renueve (`cancel_at_period_end`), la cuenta sigue trabajando
 * hasta que termine el periodo y ahí se apaga sola. Cortar antes sería
 * quedarnos con dinero por un servicio que dejamos de dar.
 *
 * Y como no se corta, se puede DESHACER: mientras el periodo siga corriendo,
 * `reactivar()` lo devuelve todo a su sitio sin cobrar de nuevo. Buena parte de
 * las cancelaciones son un enojo de un martes; conviene que el camino de vuelta
 * exista y sea de un clic.
 */
export async function cancelarSuscripcion(opts: {
  admin: any;
  orgId: string;
}): Promise<{ ok: boolean; error?: string; hasta?: string | null }> {
  return cambiarRenovacion(opts.admin, opts.orgId, true);
}

/** Deshacer la cancelación, mientras el periodo pagado siga vivo. */
export async function reactivarSuscripcion(opts: {
  admin: any;
  orgId: string;
}): Promise<{ ok: boolean; error?: string; hasta?: string | null }> {
  return cambiarRenovacion(opts.admin, opts.orgId, false);
}

async function cambiarRenovacion(
  admin: any,
  orgId: string,
  cancelar: boolean,
): Promise<{ ok: boolean; error?: string; hasta?: string | null }> {
  if (!stripeConfigurado()) return { ok: false, error: "Los pagos no están habilitados." };

  const { data: org } = await admin
    .from("organizations")
    .select("stripe_subscription_id, estado_cobro")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.stripe_subscription_id) {
    // En prueba todavía no hay nada que cancelar: no se ha cobrado nunca.
    return {
      ok: false,
      error:
        org?.estado_cobro === "prueba"
          ? "Todavía estás en tu prueba gratuita: no hay nada que cancelar ni se te ha cobrado nada."
          : "No encontramos una suscripción activa.",
    };
  }

  try {
    const sub = await stripe(`/subscriptions/${org.stripe_subscription_id}`, {
      cancel_at_period_end: cancelar ? "true" : "false",
    });

    const hasta = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    // Se guarda ya, sin esperar al webhook: el cliente acaba de dar el clic y
    // tiene que ver el cambio al instante. El webhook confirmará lo mismo.
    await admin
      .from("organizations")
      .update({ cancela_al_terminar: cancelar, ...(hasta ? { periodo_termina_at: hasta } : {}) })
      .eq("id", orgId);

    return { ok: true, hasta };
  } catch (e: any) {
    console.error("[suscripcion] renovación:", e?.message ?? e);
    return { ok: false, error: "No pudimos completar el cambio. Inténtalo otra vez." };
  }
}

/**
 * El portal de Stripe: cambiar tarjeta, ver recibos, cancelar.
 *
 * SE USA EL PORTAL DE STRIPE Y NO UNA PANTALLA PROPIA porque los datos de la
 * tarjeta no deben pasar nunca por nuestro servidor. Además, los recibos y las
 * facturas ya los genera Stripe: rehacerlos sería trabajo para empeorarlo.
 */
export async function abrirPortal(opts: {
  admin: any;
  orgId: string;
  returnUrl: string;
}): Promise<Resultado> {
  if (!stripeConfigurado()) {
    return { ok: false, error: "Los pagos todavía no están habilitados." };
  }

  const { data: org } = await opts.admin
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", opts.orgId)
    .maybeSingle();

  if (!org?.stripe_customer_id) {
    return { ok: false, error: "Todavía no tienes ningún pago registrado." };
  }

  try {
    const sesion = await stripe("/billing_portal/sessions", {
      customer: org.stripe_customer_id,
      return_url: opts.returnUrl,
    });
    if (!sesion?.url) return { ok: false, error: "No pudimos abrir el portal de pagos." };
    return { ok: true, url: sesion.url as string };
  } catch (e: any) {
    console.error("[suscripcion] portal:", e?.message ?? e);
    return { ok: false, error: "No pudimos abrir el portal de pagos." };
  }
}
