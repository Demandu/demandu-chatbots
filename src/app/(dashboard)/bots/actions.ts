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
    name: "Bienvenida",
    trigger_type: "welcome",
  });

  revalidatePath("/bots");
  redirect(`/bots/${bot.id}`);
}

export async function deleteBot(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("bots").delete().eq("id", id);
  revalidatePath("/bots");
  redirect("/bots");
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

  // Canal del bot importado. Por defecto WhatsApp (el caso más común al
  // importar flujos de BotPenguin); si viene otro válido, se respeta.
  const rawCh = String(formData.get("channel") ?? "").trim();
  const channel = CHANNELS.has(rawCh) ? rawCh : "whatsapp";

  const supabase = createClient();
  const { data: bot } = await supabase
    .from("bots")
    .insert({ org_id: orgId, name, status: "draft", channel })
    .select("id")
    .single();
  if (!bot) return;

  await supabase.from("flows").insert({
    bot_id: bot.id,
    org_id: orgId,
    graph,
    is_live: true,
    version: 1,
    name: "Bienvenida",
    trigger_type: "welcome",
  });

  revalidatePath("/bots");
  redirect(`/bots/${bot.id}`);
}

// ─────────────── Flujos dentro de un bot (con disparador) ───────────────

const TRIGGERS = new Set(["welcome", "keyword", "returning"]);
function defaultFlowName(t: string) {
  return t === "keyword" ? "Palabras clave" : t === "returning" ? "Leads que regresan" : "Bienvenida";
}
function parseKeywords(raw: string) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Crea un flujo nuevo dentro de un bot, con su disparador, y abre el editor. */
export async function createFlow(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const botId = String(formData.get("bot_id") ?? "");
  if (!botId) return;
  const rawT = String(formData.get("trigger_type") ?? "welcome");
  const trigger_type = TRIGGERS.has(rawT) ? rawT : "welcome";
  const name = String(formData.get("name") ?? "").trim() || defaultFlowName(trigger_type);
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));

  const supabase = createClient();
  // El de bienvenida arranca con el flujo semilla; los demás, en blanco.
  const seed =
    trigger_type === "welcome"
      ? { nodes: sampleFlow.nodes, edges: sampleFlow.edges }
      : { nodes: [], edges: [] };

  const { data: flow } = await supabase
    .from("flows")
    .insert({ bot_id: botId, org_id: orgId, graph: seed, is_live: true, version: 1, name, trigger_type, keywords, enabled: true })
    .select("id")
    .single();
  if (!flow) return;

  revalidatePath(`/bots/${botId}`);
  redirect(`/bots/${botId}/flows/${flow.id}`);
}

/** Publica o vuelve a borrador un bot. */
export async function setBotStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const status = String(formData.get("status") ?? "draft") === "published" ? "published" : "draft";
  await createClient().from("bots").update({ status }).eq("id", id);
  revalidatePath(`/bots/${id}`);
  revalidatePath(`/bots/${id}/settings`);
}

export async function deleteFlow(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("flows").delete().eq("id", id);
  revalidatePath(`/bots/${botId}`);
}

/** Guarda el disparador de un flujo (tipo, nombre, palabras clave, activo). */
export async function setFlowTrigger(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const rawT = String(formData.get("trigger_type") ?? "welcome");
  const trigger_type = TRIGGERS.has(rawT) ? rawT : "welcome";
  const name = String(formData.get("name") ?? "").trim();
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  const enabled = formData.get("enabled") === "on";

  const patch: Record<string, unknown> = { trigger_type, keywords, enabled };
  if (name) patch.name = name;
  await createClient().from("flows").update(patch).eq("id", id);
  revalidatePath(`/bots/${botId}`);
  revalidatePath(`/bots/${botId}/flows/${id}`);
}
