"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncPlanToStripe, archivePlanInStripe } from "@/lib/billing/stripePlans";

const BASE = "/admin/planes";

/** ¿El usuario pertenece al equipo interno de Demandu? */
async function requireAdmin() {
  const supabase = createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) redirect("/dashboard");
  return supabase;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function num(v: FormDataEntryValue | null, def = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/**
 * Crea un plan a la medida para un cliente y lo registra en Stripe
 * automáticamente. Si Stripe falla, el plan se guarda igual y queda
 * marcado para reintentar — no se pierde el trabajo del equipo.
 */
export async function createCustomPlan(formData: FormData) {
  const supabase = await requireAdmin();

  const orgId = String(formData.get("org_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const price = num(formData.get("price_monthly"));
  if (!orgId || !name || price <= 0) {
    redirect(`${BASE}?error=${encodeURIComponent("Faltan datos: cliente, nombre y precio son obligatorios.")}`);
  }

  const code = `custom_${slug(name)}_${Date.now().toString(36)}`;

  const plan = {
    code,
    name,
    org_id: orgId,
    is_custom: true,
    sort: 99,
    price_monthly: price,
    currency: "USD",
    messages_month: num(formData.get("messages_month"), 1000),
    ai_message_weight: Math.max(1, num(formData.get("ai_message_weight"), 3)),
    agents_included: num(formData.get("agents_included"), 1),
    bots_limit: num(formData.get("bots_limit"), 1),
    storage_mb: num(formData.get("storage_mb"), 200),
    conversations_month: num(formData.get("messages_month"), 1000),
    extra_1k_messages_price: num(formData.get("extra_1k_messages_price"), 20),
    channels: String(formData.get("channels") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    integrations: String(formData.get("integrations") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    notes: String(formData.get("notes") ?? "").trim() || null,
    active: true,
  };

  const { error } = await supabase.from("plans").insert(plan);
  if (error) {
    redirect(`${BASE}?error=${encodeURIComponent("No se pudo crear el plan: " + error.message)}`);
  }

  // Sincroniza con Stripe
  const sync = await syncPlanToStripe(plan as any);
  if (sync.ok) {
    await supabase
      .from("plans")
      .update({
        stripe_product_id: sync.productId,
        stripe_price_id: sync.priceId,
        stripe_synced_at: new Date().toISOString(),
        stripe_error: null,
      })
      .eq("code", code);
  } else {
    await supabase.from("plans").update({ stripe_error: sync.error }).eq("code", code);
  }

  revalidatePath(BASE);
  redirect(sync.ok ? `${BASE}?creado=1` : `${BASE}?aviso=${encodeURIComponent(sync.error)}`);
}

/** Reintenta la sincronización de un plan que falló. */
export async function resyncPlan(formData: FormData) {
  const supabase = await requireAdmin();
  const code = String(formData.get("code") ?? "");
  if (!code) return;

  const { data: plan } = await supabase.from("plans").select("*").eq("code", code).maybeSingle();
  if (!plan) return;

  const sync = await syncPlanToStripe(plan as any);
  await supabase
    .from("plans")
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

/** Desactiva un plan a la medida y lo archiva en Stripe. */
export async function archivePlan(formData: FormData) {
  const supabase = await requireAdmin();
  const code = String(formData.get("code") ?? "");
  if (!code) return;

  const { data: plan } = await supabase.from("plans").select("*").eq("code", code).maybeSingle();
  if (plan) await archivePlanInStripe(plan as any);

  await supabase.from("plans").update({ active: false }).eq("code", code);
  revalidatePath(BASE);
}
