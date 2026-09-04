import "server-only";
import { stripe } from "@/lib/billing/stripePlans";

/**
 * Los complementos, en Stripe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GEMELO DE `stripePlans.ts`, Y A PROPÓSITO. Los planes se sincronizan con
 * Stripe desde que existen; los complementos no, y el cobro les armaba el precio
 * al vuelo en cada compra. Eso funcionaba —por eso nadie lo notó— pero cada
 * compra creaba un producto NUEVO en Stripe: veinte clientes con la tienda son
 * veinte productos distintos con el mismo nombre, y ninguna forma de saber
 * cuánto factura la tienda como producto.
 *
 * ── LO QUE NUNCA HACE ESTA FUNCIÓN ────────────────────────────────────────
 *
 * NO LANZA. Si Stripe se cae, el complemento se guarda igual en la base y queda
 * marcado con el error para reintentar. Perder el trabajo del equipo porque un
 * tercero tuvo un mal minuto no es una opción — y es exactamente como se decidió
 * ya para los planes.
 *
 * ── LA REGLA DE LOS PRECIOS EN STRIPE ─────────────────────────────────────
 *
 * UN PRECIO NO SE EDITA, SE ARCHIVA Y SE CREA OTRO. Stripe no deja cambiarle el
 * monto a un precio existente, y con razón: quien ya está suscrito al viejo
 * sigue pagando lo que firmó. Subirle el precio a la tienda crea un precio nuevo
 * para los que vengan y NO le toca la factura a nadie que ya la tenga.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AddonParaStripe = {
  code: string;
  name: string;
  description?: string | null;
  price: number | string;
  currency?: string | null;
  recurring?: boolean | null;
  unit?: string | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
};

export type SyncAddon =
  | { ok: true; productId: string; priceId: string; changed: boolean }
  | { ok: false; error: string };

export async function syncAddonToStripe(a: AddonParaStripe): Promise<SyncAddon> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: "Los pagos aún no están configurados en la plataforma." };
  }

  const currency = String(a.currency ?? "USD").toLowerCase();
  const amount = Math.round(Number(a.price ?? 0) * 100);
  if (amount <= 0) return { ok: false, error: "El precio debe ser mayor a cero." };

  try {
    // 1) El producto se crea una vez y se reutiliza toda la vida del complemento.
    let productId = String(a.stripe_product_id ?? "");
    const productParams: Record<string, string> = {
      name: a.name,
      "metadata[addon_code]": a.code,
      "metadata[origen]": "demandu",
    };
    if (a.description) productParams.description = String(a.description).slice(0, 350);
    // La unidad es lo que hace legible una factura de una cadena: «tienda × 5»
    // se entiende; «5 unidades» no.
    if (a.unit) productParams["metadata[unidad]"] = String(a.unit);

    if (productId) {
      await stripe(`/products/${productId}`, productParams);
    } else {
      const prod = await stripe("/products", productParams);
      productId = prod.id;
    }

    // 2) El precio: si ya existe y no cambió nada, no se toca.
    if (a.stripe_price_id) {
      try {
        const actual = await stripe(`/prices/${a.stripe_price_id}`, {}, "GET");
        const mismoTipo = Boolean(actual?.recurring) === Boolean(a.recurring);
        if (actual?.unit_amount === amount && actual?.currency === currency && actual?.active && mismoTipo) {
          return { ok: true, productId, priceId: a.stripe_price_id, changed: false };
        }
        // Cambió el monto: el viejo se archiva para que nadie lo contrate nuevo.
        // Quien ya lo tenía sigue pagando lo que firmó, que es lo correcto.
        await stripe(`/prices/${a.stripe_price_id}`, { active: "false" });
      } catch {
        /* si no se pudo leer, se crea uno nuevo y ya */
      }
    }

    const params: Record<string, string> = {
      product: productId,
      currency,
      unit_amount: String(amount),
      "metadata[addon_code]": a.code,
    };
    // UN COMPLEMENTO DE UNA SOLA VEZ NO LLEVA `recurring`. Mandarlo con
    // intervalo mensual le abriría una suscripción a alguien que compró una
    // instalación asistida — un cargo mensual que nadie pidió.
    if (a.recurring) params["recurring[interval]"] = "month";

    const price = await stripe("/prices", params);
    return { ok: true, productId, priceId: price.id, changed: true };
  } catch (e: any) {
    const msg = e?.message ?? "No se pudo sincronizar con Stripe";
    console.error("[stripe complementos]", msg);
    return { ok: false, error: msg };
  }
}

/** Lo saca del catálogo de Stripe para que ya no se pueda contratar. */
export async function archiveAddonInStripe(
  a: AddonParaStripe,
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: "Stripe no está configurado." };
  try {
    if (a.stripe_price_id) await stripe(`/prices/${a.stripe_price_id}`, { active: "false" });
    if (a.stripe_product_id) await stripe(`/products/${a.stripe_product_id}`, { active: "false" });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo archivar en Stripe" };
  }
}
