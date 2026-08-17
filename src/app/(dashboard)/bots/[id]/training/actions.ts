"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

/** Agrega un dato del negocio a la base de conocimiento del chatbot. */
export async function addKnowledge(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!orgId || !botId || !title || !content) return;

  await createClient().from("bot_knowledge").insert({
    org_id: orgId,
    bot_id: botId,
    title,
    content,
    source_type: String(formData.get("source_type") ?? "text"),
  });

  revalidatePath(`/bots/${botId}/training`);
}

export async function deleteKnowledge(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("bot_knowledge").delete().eq("id", id);
  revalidatePath(`/bots/${botId}/training`);
}

/** Activa o desactiva un dato sin borrarlo. */
export async function toggleKnowledge(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;
  await createClient()
    .from("bot_knowledge")
    .update({ enabled: !enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(`/bots/${botId}/training`);
}
