"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
}

/** Agrega un producto al catálogo del chatbot. */
export async function createProduct(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!orgId || !botId || !name) return;

  await createClient().from("products").insert({
    org_id: orgId,
    bot_id: botId,
    name,
    sku: String(formData.get("sku") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    price: num(formData.get("price")),
    currency: String(formData.get("currency") ?? "MXN"),
    image_url: String(formData.get("image_url") ?? "").trim() || null,
    available: true,
  });

  revalidatePath(`/bots/${botId}/catalog`);
}

export async function deleteProduct(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("products").delete().eq("id", id);
  revalidatePath(`/bots/${botId}/catalog`);
}

/** Muestra u oculta un producto del catálogo. */
export async function toggleProduct(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const available = String(formData.get("available") ?? "") === "true";
  if (!id) return;
  await createClient().from("products").update({ available: !available, updated_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/bots/${botId}/catalog`);
}

/** Guarda el ID del catálogo de Meta Commerce del número conectado. */
export async function setCatalogId(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const catalogId = String(formData.get("catalog_id") ?? "").trim() || null;
  if (!botId) return;
  await createClient().from("whatsapp_channels").update({ catalog_id: catalogId }).eq("bot_id", botId);
  revalidatePath(`/bots/${botId}/catalog`);
}
