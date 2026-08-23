/**
 * Cobro con Stripe usando su API REST directamente (sin librería extra).
 *
 * REGLA DE SEGURIDAD: los precios NUNCA vienen del navegador. El servidor los
 * lee de la tabla `addons`, así nadie puede manipular el monto desde la
 * consola del navegador.
 */

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export type CartItem = { code: string; quantity: number };

type AddonRow = {
  code: string;
  name: string;
  description: string | null;
  price: number;
  recurring: boolean;
};

/** Convierte el carrito en parámetros de Stripe (form-urlencoded). */
function buildForm(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Crea la sesión de pago y devuelve la URL a la que hay que mandar al cliente.
 * Nunca lanza excepción.
 */
export async function createCheckout(opts: {
  admin: any;
  orgId: string;
  email?: string | null;
  items: CartItem[];
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: "Los pagos aún no están habilitados. Escríbenos y lo resolvemos." };

  const wanted = opts.items.filter((i) => i.quantity > 0);
  if (!wanted.length) return { ok: false, error: "Tu carrito está vacío." };

  // Precios desde la base, NUNCA desde el navegador
  const { data, error } = await opts.admin
    .from("addons")
    .select("code, name, description, price, recurring")
    .in("code", wanted.map((i) => i.code))
    .eq("active", true);

  if (error || !data?.length) return { ok: false, error: "No pudimos leer los complementos. Inténtalo de nuevo." };

  const byCode: Record<string, AddonRow> = {};
  for (const a of data as AddonRow[]) byCode[a.code] = a;

  const params: Record<string, string> = {
    mode: wanted.some((i) => byCode[i.code]?.recurring) ? "subscription" : "payment",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    "metadata[org_id]": opts.orgId,
    allow_promotion_codes: "true",
    // En dólares, igual que los planes. Si los complementos se cobraran en
    // moneda local y el plan no, el mismo cliente vería dos monedas en la
    // misma cuenta — y eso se lee como que le están cambiando el precio.
    // El porqué de fondo está explicado en `suscripcion.ts`.
    "adaptive_pricing[enabled]": "false",
  };
  if (opts.email) params.customer_email = opts.email;

  let i = 0;
  for (const item of wanted) {
    const a = byCode[item.code];
    if (!a) continue;
    const qty = Math.min(99, Math.max(1, Math.floor(item.quantity)));

    params[`line_items[${i}][quantity]`] = String(qty);
    params[`line_items[${i}][price_data][currency]`] = "usd";
    params[`line_items[${i}][price_data][product_data][name]`] = a.name;
    if (a.description) {
      params[`line_items[${i}][price_data][product_data][description]`] = a.description.slice(0, 300);
    }
    params[`line_items[${i}][price_data][unit_amount]`] = String(Math.round(Number(a.price) * 100));
    if (a.recurring) {
      params[`line_items[${i}][price_data][recurring][interval]`] = "month";
    }
    // Guarda qué se compró para poder activarlo al confirmarse el pago
    params[`metadata[item_${i}]`] = `${a.code}:${qty}`;
    i++;
  }

  if (i === 0) return { ok: false, error: "Tu carrito está vacío." };

  try {
    const res = await fetch(STRIPE_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: buildForm(params),
    });

    const j = await res.json();
    if (!res.ok || !j?.url) {
      console.error("[stripe] error:", res.status, j?.error?.message);
      return { ok: false, error: "No pudimos abrir el pago. Inténtalo de nuevo en un momento." };
    }
    return { ok: true, url: j.url as string };
  } catch (e: any) {
    console.error("[stripe] fallo de red:", e?.message ?? e);
    return { ok: false, error: "No pudimos conectar con el sistema de pagos." };
  }
}
