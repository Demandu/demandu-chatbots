"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { fetchPageText } from "@/lib/ai/fromUrl";
import { ingestText } from "@/lib/ai/ingest";
import { checkQuota } from "@/lib/billing/quota";

/** Agrega un dato del negocio a la base de conocimiento del chatbot. */
export async function addKnowledge(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!orgId || !botId || !title || !content) return;

  const supabase = createClient();
  const quota = await checkQuota(supabase, orgId, Buffer.byteLength(content, "utf8"));
  if (!quota.ok) {
    redirect(`/bots/${botId}/training?error=${encodeURIComponent(quota.message)}`);
  }

  await supabase.from("bot_knowledge").insert({
    org_id: orgId,
    bot_id: botId,
    title,
    content,
    source_type: String(formData.get("source_type") ?? "text"),
  });

  revalidatePath(`/bots/${botId}/training`);
}

/** Lee una página web del cliente y carga su contenido como conocimiento. */
export async function importFromUrl(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!orgId || !botId || !url) return;

  const base = `/bots/${botId}/training`;
  const page = await fetchPageText(url);

  if (!page.ok) {
    redirect(`${base}?error=${encodeURIComponent(page.error)}`);
  }

  // ¿Cabe en el plan del cliente?
  const quota = await checkQuota(createClient(), orgId, Buffer.byteLength(page.text, "utf8"));
  if (!quota.ok) {
    redirect(`${base}?error=${encodeURIComponent(quota.message)}`);
  }

  const n = await ingestText({
    admin: createAdminClient(),
    orgId,
    botId,
    title: page.title,
    text: page.text,
    sourceType: "url",
    sourceUrl: page.url,
    sourceName: page.url,
    replaceSourceName: true,
  });

  revalidatePath(base);
  redirect(n > 0 ? `${base}?imported=${n}` : `${base}?error=${encodeURIComponent("No se pudo guardar el contenido.")}`);
}

/** Borra de golpe todo lo que vino de una misma fuente. */
export async function deleteSource(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const sourceName = String(formData.get("source_name") ?? "");
  if (!botId || !sourceName) return;
  await createClient().from("bot_knowledge").delete().eq("bot_id", botId).eq("source_name", sourceName);
  revalidatePath(`/bots/${botId}/training`);
}

/** Edita un dato ya guardado. */
export async function updateKnowledge(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!id || !title || !content) return;

  await createClient()
    .from("bot_knowledge")
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq("id", id);

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
