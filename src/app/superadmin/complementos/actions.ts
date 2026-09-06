"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncAddonToStripe, archiveAddonInStripe } from "@/lib/billing/stripeAddons";

const BASE = "/superadmin/complementos";

/**
 * El catálogo de complementos, y su espejo en Stripe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HASTA HOY NO HABÍA PANTALLA. El único camino para crear un complemento era
 * escribir el `insert` a mano en la base — que es literalmente como entró el de
 * la tienda. Y como no se sincronizaba con Stripe, el cobro le armaba el precio
 * al vuelo en cada compra, creando un producto nuevo cada vez.
 *
 * Los PLANES ya se hacían bien desde el principio (`syncPlanToStripe`). Esto es
 * lo mismo para los complementos, con la misma regla de oro: SI STRIPE FALLA, EL
 * COMPLEMENTO SE GUARDA IGUAL y queda marcado para reintentar. Perder el trabajo
 * del equipo porque un tercero tuvo un mal minuto no es una opción.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Solo el equipo de Demandu. La base lo vuelve a comprobar con su política. */
async function soloDemandu() {
  const supabase = createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) redirect("/dashboard");
  return supabase;
}

function codigo(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function precio(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Guarda el complemento y lo crea o actualiza en Stripe. */
export async function guardarComplemento(formData: FormData) {
  const supabase = await soloDemandu();

  const nombre = String(formData.get("name") ?? "").trim();
  const monto = precio(formData.get("price"));
  // EL CÓDIGO NO SE CAMBIA NUNCA. Es lo que guarda cada compra en sus
  // metadatos: renombrarlo dejaría huérfano todo lo vendido antes.
  const code = String(formData.get("code") ?? "").trim() || codigo(nombre);

  if (!nombre || monto <= 0) {
    redirect(`${BASE}?error=${encodeURIComponent("Hace falta un nombre y un precio mayor que cero.")}`);
  }

  const fila = {
    code,
    name: nombre,
    description: String(formData.get("description") ?? "").trim() || null,
    unit: String(formData.get("unit") ?? "").trim() || "unidad",
    price: monto,
    currency: "USD",
    recurring: formData.get("recurring") !== null,
    sort: Number(String(formData.get("sort") ?? "50")) || 50,
    active: formData.get("active") !== null,
    is_quote: formData.get("is_quote") !== null,
  };

  const { error } = await supabase.from("addons").upsert(fila, { onConflict: "code" });
  if (error) {
    redirect(`${BASE}?error=${encodeURIComponent("No se pudo guardar: " + error.message)}`);
  }

  // Se relee para llevarnos los identificadores que ya tuviera: sin ellos, cada
  // guardado crearía un producto nuevo en Stripe en vez de actualizar el suyo.
  const { data: guardado } = await supabase.from("addons").select("*").eq("code", code).maybeSingle();

  // UNO QUE SE APAGA SE ARCHIVA EN STRIPE. Dejarlo vivo allá permite que
  // alguien con un enlace viejo lo siga contratando.
  if (!fila.active) {
    await archiveAddonInStripe(guardado as any);
    await supabase.from("addons").update({ stripe_error: null }).eq("code", code);
    revalidatePath(BASE);
    redirect(`${BASE}?guardado=1`);
  }

  const sync = await syncAddonToStripe(guardado as any);
  await supabase
    .from("addons")
    .update(
      sync.ok
        ? {
            stripe_product_id: sync.productId,
            stripe_price_id: sync.priceId,
            stripe_synced_at: new Date().toISOString(),
            stripe_error: null,
          }
        : { stripe_error: sync.error },
    )
    .eq("code", code);

  revalidatePath(BASE);
  redirect(sync.ok ? `${BASE}?guardado=1` : `${BASE}?aviso=${encodeURIComponent(sync.error)}`);
}

/** Reintenta la sincronización de uno que falló. */
export async function resincronizar(formData: FormData) {
  const supabase = await soloDemandu();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return;

  const { data: a } = await supabase.from("addons").select("*").eq("code", code).maybeSingle();
  if (!a) return;

  const sync = await syncAddonToStripe(a as any);
  await supabase
    .from("addons")
    .update(
      sync.ok
        ? {
            stripe_product_id: sync.productId,
            stripe_price_id: sync.priceId,
            stripe_synced_at: new Date().toISOString(),
            stripe_error: null,
          }
        : { stripe_error: sync.error },
    )
    .eq("code", code);

  revalidatePath(BASE);
}
