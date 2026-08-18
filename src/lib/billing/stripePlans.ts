/**
 * Sincroniza los planes de Demandu con Stripe.
 *
 * Cuando el equipo crea un plan (público o a la medida), aquí se crea
 * automáticamente el Producto y su Precio en Stripe.
 *
 * DETALLE IMPORTANTE DE STRIPE: los precios son INMUTABLES. Si cambia el
 * monto, no se edita — se crea un precio nuevo y se archiva el anterior.
 * Esta función lo maneja sola.
 */

const API = "https://api.stripe.com/v1";

function form(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

async function stripe(path: string, params: Record<string, string>, method = "POST") {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe no está configurado");

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? form(params) : undefined,
  });

  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? `Stripe respondió ${res.status}`);
  return j;
}

export type PlanForStripe = {
  code: string;
  name: string;
  price_monthly: number;
  currency?: string | null;
  messages_month?: number | null;
  agents_included?: number | null;
  storage_mb?: number | null;
  bots_limit?: number | null;
  is_custom?: boolean | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
};

export type SyncResult =
  | { ok: true; productId: string; priceId: string; changed: boolean }
  | { ok: false; error: string };

/** Descripción legible que se verá en Stripe y en el recibo del cliente. */
function describe(p: PlanForStripe): string {
  const partes = [
    p.messages_month ? `${Number(p.messages_month).toLocaleString("es-MX")} mensajes/mes` : null,
    p.bots_limit ? (p.bots_limit >= 999 ? "chatbots ilimitados" : `${p.bots_limit} chatbots`) : null,
    p.agents_included ? `${p.agents_included} agentes` : null,
    p.storage_mb
      ? p.storage_mb >= 1024
        ? `${Math.round(p.storage_mb / 1024)} GB de entrenamiento`
        : `${p.storage_mb} MB de entrenamiento`
      : null,
  ].filter(Boolean);
  return partes.join(" · ").slice(0, 350);
}

/**
 * Crea o actualiza el plan en Stripe. Devuelve los IDs para guardarlos.
 * Nunca lanza excepción: los errores vuelven en el resultado.
 */
export async function syncPlanToStripe(plan: PlanForStripe): Promise<SyncResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: "Los pagos aún no están configurados en la plataforma." };
  }

  const currency = (plan.currency ?? "USD").toLowerCase();
  const amount = Math.round(Number(plan.price_monthly ?? 0) * 100);
  if (amount <= 0) return { ok: false, error: "El precio debe ser mayor a cero." };

  try {
    // 1) Producto: se crea una vez y se reutiliza
    let productId = plan.stripe_product_id ?? "";
    const productParams: Record<string, string> = {
      name: plan.is_custom ? `${plan.name} (a la medida)` : plan.name,
      description: describe(plan),
      "metadata[plan_code]": plan.code,
      "metadata[origen]": "demandu",
    };

    if (productId) {
      await stripe(`/products/${productId}`, productParams);
    } else {
      const prod = await stripe("/products", productParams);
      productId = prod.id;
    }

    // 2) Precio: si ya existe y el monto es el mismo, no se toca
    if (plan.stripe_price_id) {
      try {
        const actual = await stripe(`/prices/${plan.stripe_price_id}`, {}, "GET");
        if (actual?.unit_amount === amount && actual?.currency === currency && actual?.active) {
          return { ok: true, productId, priceId: plan.stripe_price_id, changed: false };
        }
        // Cambió el monto: se archiva el precio viejo
        await stripe(`/prices/${plan.stripe_price_id}`, { active: "false" });
      } catch {
        /* si no se pudo leer, simplemente creamos uno nuevo */
      }
    }

    const price = await stripe("/prices", {
      product: productId,
      currency,
      unit_amount: String(amount),
      "recurring[interval]": "month",
      "metadata[plan_code]": plan.code,
    });

    return { ok: true, productId, priceId: price.id, changed: true };
  } catch (e: any) {
    const msg = e?.message ?? "No se pudo sincronizar con Stripe";
    console.error("[stripe planes]", msg);
    return { ok: false, error: msg };
  }
}

/** Archiva el plan en Stripe para que ya no se pueda contratar. */
export async function archivePlanInStripe(plan: PlanForStripe): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: "Stripe no está configurado." };
  try {
    if (plan.stripe_price_id) await stripe(`/prices/${plan.stripe_price_id}`, { active: "false" });
    if (plan.stripe_product_id) await stripe(`/products/${plan.stripe_product_id}`, { active: "false" });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo archivar en Stripe" };
  }
}
