import "server-only";
import { stripe } from "@/lib/billing/stripePlans";

/**
 * Descuentos y meses gratis para un cliente que YA PAGA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO VIVE EN STRIPE Y NO EN NUESTRA BASE, y no es una preferencia técnica.
 * Quien cobra es Stripe. Un descuento apuntado solo de nuestro lado haría que
 * la pantalla dijera «-30%» mientras la tarjeta del cliente sigue cobrando el
 * precio entero — y de esa discusión no se sale bien.
 *
 * ── «UN MES GRATIS» SON DOS COSAS DISTINTAS ───────────────────────────────
 *
 * A quien TODAVÍA NO PAGA se le alarga la prueba: es una fecha nuestra y no
 * hay nada que cobrar. Eso no pasa por aquí.
 *
 * A quien YA PAGA, alargarle la prueba no hace absolutamente nada: Stripe le
 * cobra igual el día que toca. Ahí hace falta un cupón, que es lo que hay aquí.
 *
 * ── LO QUE HACE UN CUPÓN, EN CRISTIANO ────────────────────────────────────
 *
 * · «Un mes gratis»  → 100% de descuento UNA vez. Se salta el siguiente cobro.
 * · «-30% tres meses» → 30% durante 3 cobros, y después vuelve solo al precio.
 * · «-20% siempre»    → 20% mientras dure la suscripción.
 *
 * SE CREA UN CUPÓN NUEVO CADA VEZ. Reutilizar uno sería más «limpio» y es peor:
 * los cupones de Stripe se pueden borrar, y un cupón compartido borrado por
 * error le quitaría el descuento a todos los que lo tuvieran a la vez.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Descuento =
  | { tipo: "mes_gratis"; meses: number }
  | { tipo: "porcentaje"; porcentaje: number; meses: number | null };

export type ResultadoDescuento =
  | { ok: true; cuponId: string; explicacion: string }
  | { ok: false; error: string };

/** Cómo se le cuenta a una persona lo que se acaba de aplicar. */
export function explicar(d: Descuento): string {
  if (d.tipo === "mes_gratis") {
    return d.meses === 1
      ? "Un mes gratis: no se le cobra el próximo cobro."
      : `${d.meses} meses gratis: no se le cobran los próximos ${d.meses} cobros.`;
  }
  if (d.meses === null) return `${d.porcentaje}% de descuento mientras siga suscrito.`;
  return d.meses === 1
    ? `${d.porcentaje}% de descuento en el próximo cobro.`
    : `${d.porcentaje}% de descuento durante ${d.meses} cobros.`;
}

/**
 * ¿Tiene sentido este descuento?
 *
 * SE COMPRUEBA ANTES DE HABLAR CON STRIPE. Un porcentaje de 0 o de 150 lo
 * rechaza Stripe con un error en inglés para programadores, y quien está en
 * superadmin dándole un trato a un cliente no tiene por qué leer eso.
 */
export function revisar(d: Descuento): string | null {
  const meses = d.tipo === "mes_gratis" ? d.meses : d.meses;
  if (meses !== null && (!Number.isFinite(meses) || meses < 1 || meses > 36)) {
    return "Los meses tienen que ser entre 1 y 36.";
  }
  if (d.tipo === "porcentaje") {
    const p = Number(d.porcentaje);
    if (!Number.isFinite(p) || p <= 0 || p > 100) {
      return "El descuento tiene que ser entre 1% y 100%.";
    }
  }
  return null;
}

/**
 * Aplica el descuento a la suscripción del cliente.
 *
 * NUNCA LANZA: los errores vuelven en el resultado, como el resto de lo que
 * habla con Stripe en este proyecto.
 */
export async function aplicarDescuento(
  subscriptionId: string,
  d: Descuento,
): Promise<ResultadoDescuento> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: "Los pagos no están configurados en este entorno." };
  }
  if (!subscriptionId) {
    return {
      ok: false,
      error:
        "Este cliente no tiene una suscripción activa en Stripe. Si todavía está en prueba, " +
        "alárgale la prueba en vez de darle un descuento.",
    };
  }

  const malo = revisar(d);
  if (malo) return { ok: false, error: malo };

  const params: Record<string, string> = {
    name: explicar(d).slice(0, 40),
    "metadata[origen]": "demandu-superadmin",
  };

  if (d.tipo === "mes_gratis") {
    params.percent_off = "100";
    // `repeating` + `duration_in_months` es lo que hace que vuelva solo al
    // precio normal. Con `forever` por descuido, ese cliente no vuelve a pagar
    // nunca y nadie lo nota hasta que alguien mira los ingresos.
    params.duration = d.meses > 1 ? "repeating" : "once";
    if (d.meses > 1) params.duration_in_months = String(d.meses);
  } else {
    params.percent_off = String(d.porcentaje);
    if (d.meses === null) {
      params.duration = "forever";
    } else if (d.meses === 1) {
      params.duration = "once";
    } else {
      params.duration = "repeating";
      params.duration_in_months = String(d.meses);
    }
  }

  try {
    const cupon = await stripe("/coupons", params);
    if (!cupon?.id) return { ok: false, error: "Stripe no devolvió el cupón." };

    // Se pega a la suscripción. A partir del siguiente cobro, Stripe aplica el
    // descuento solo — no hay nada que recordar hacer después.
    await stripe(`/subscriptions/${subscriptionId}`, { coupon: cupon.id });

    return { ok: true, cuponId: cupon.id, explicacion: explicar(d) };
  } catch (e: any) {
    const msg = e?.message ?? "No se pudo aplicar el descuento.";
    console.error("[descuentos]", msg);
    return { ok: false, error: msg };
  }
}

/** Le quita el descuento que tenga. */
export async function quitarDescuento(
  subscriptionId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: "Stripe no está configurado." };
  if (!subscriptionId) return { ok: false, error: "Este cliente no tiene suscripción." };
  try {
    await stripe(`/subscriptions/${subscriptionId}/discount`, {}, "DELETE");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo quitar el descuento." };
  }
}

/**
 * Qué descuento tiene ahora mismo, leído de Stripe.
 *
 * SE PREGUNTA A STRIPE, no a nuestra base. Un descuento se puede quitar desde
 * el panel de Stripe, se puede acabar solo, y puede haberlo puesto otra
 * persona. Lo que digamos en pantalla tiene que ser lo que de verdad se le va a
 * cobrar.
 */
export async function descuentoActual(
  subscriptionId: string,
): Promise<{ texto: string } | null> {
  if (!process.env.STRIPE_SECRET_KEY || !subscriptionId) return null;
  try {
    const sub = await stripe(`/subscriptions/${subscriptionId}`, {}, "GET");
    const c = sub?.discount?.coupon;
    if (!c) return null;

    const cuanto = c.percent_off ? `${c.percent_off}%` : `${(c.amount_off ?? 0) / 100}`;
    const cuando =
      c.duration === "forever"
        ? "siempre"
        : c.duration === "once"
          ? "una vez"
          : `${c.duration_in_months} meses`;
    return { texto: `${cuanto} · ${cuando}` };
  } catch {
    return null;
  }
}
