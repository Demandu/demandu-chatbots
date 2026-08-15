"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { sampleFlow } from "@/lib/flow/sample";
import { botpenguinToGraph } from "@/lib/flow/import";

const CHANNELS = new Set(["whatsapp", "instagram", "messenger", "webchat"]);
const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "Web",
};

/** Crea un bot + su flujo inicial (semilla) y abre el editor. */
export async function createBot(formData: FormData) {
  const rawCh = String(formData.get("channel") ?? "").trim();
  const channel = CHANNELS.has(rawCh) ? rawCh : "webchat";
  const name =
    String(formData.get("name") ?? "").trim() || `Bot de ${CHANNEL_LABEL[channel]}`;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();

  const { data: bot } = await supabase
    .from("bots")
    .insert({ org_id: orgId, name, status: "draft", channel })
    .select("id")
    .single();
  if (!bot) return;

  const seed = { nodes: sampleFlow.nodes, edges: sampleFlow.edges };
  await supabase.from("flows").insert({
    bot_id: bot.id,
    org_id: orgId,
    graph: seed,
    is_live: true,
    version: 1,
  });

  revalidatePath("/bots");
  redirect(`/bots/${bot.id}`);
}

export async function deleteBot(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("bots").delete().eq("id", id);
  revalidatePath("/bots");
}

export async function renameBot(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await createClient().from("bots").update({ name }).eq("id", id);
  revalidatePath("/bots");
  revalidatePath(`/bots/${id}`);
}

/** Importa/clona un bot desde un JSON exportado (formato BotPenguin). */
export async function importBot(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const file = formData.get("file") as File | null;
  let json: any = null;
  if (file && file.size > 0) {
    try {
      json = JSON.parse(await file.text());
    } catch {
      return;
    }
  }
  if (!json) return;

  const graph = botpenguinToGraph(json);
  if (!graph.nodes.length) return;

  const name =
    String(formData.get("name") ?? "").trim() ||
    json?.payload?.name ||
    "Bot importado";

  const supabase = createClient();
  const { data: bot } = await supabase
    .from("bots")
    .insert({ org_id: orgId, name, status: "draft" })
    .select("id")
    .single();
  if (!bot) return;

  await supabase.from("flows").insert({
    bot_id: bot.id,
    org_id: orgId,
    graph,
    is_live: true,
    version: 1,
  });

  revalidatePath("/bots");
  redirect(`/bots/${bot.id}`);
}
