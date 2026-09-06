"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { sampleFlow } from "@/lib/flow/sample";
import { infoOrigen, ORIGENES } from "@/lib/flow/origenes";
import { modoDeRespuestaPublica } from "@/lib/canales/comentarioPublico";
import { botpenguinToGraph } from "@/lib/flow/import";

const CHANNELS = new Set(["whatsapp", "instagram", "messenger", "webchat"]);
const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "Web",
};

/**
 * ¿Este chatbot está DE VERDAD conectado a su canal?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXISTE POR UN FALLO QUE SE VIO CON UN CLIENTE NUEVO. Creó su chatbot de
 * Instagram, le dio a conectar, Meta no le dejó —la revisión de los permisos de
 * Instagram sigue pendiente, así que hoy solo conectan las cuentas con rol en
 * la app— y aun así terminó el asistente, que le dijo «¡Y listo!». Salió
 * convencido de que su chatbot estaba funcionando. No lo estaba: no iba a
 * recibir un solo mensaje.
 *
 * El asistente no puede saberlo por su cuenta: la conexión se hace saliendo a
 * Meta y volviendo por otra ruta, así que hay que PREGUNTAR.
 *
 * `webchat` siempre cuenta como conectado y no es una excepción tramposa: el
 * widget no se «conecta» a ningún sitio, se pega en la web del cliente. No hay
 * nada que Meta pueda negar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function canalConectado(botId: string): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId || !botId) return false;
  const supabase = createClient();

  const { data: bot } = await supabase
    .from("bots").select("channel").eq("id", botId).maybeSingle();
  const canal = String((bot as any)?.channel ?? "webchat");
  if (canal === "webchat") return true;

  // CADA CANAL TIENE SU TABLA, y las que no la tienen NO se dan por buenas.
  // Escribir `canal === "instagram" ? ig : wa` metía a Messenger en la tabla de
  // WhatsApp: como ahí nunca hay fila, habría contestado siempre «no
  // conectado» — que da la casualidad de ser cierto hoy, pero por accidente. Un
  // acierto por accidente deja de acertar el día que alguien añada Messenger.
  const TABLA: Record<string, string> = {
    instagram: "instagram_channels",
    whatsapp: "whatsapp_channels",
  };
  const tabla = TABLA[canal];
  if (!tabla) return false;

  const { data } = await supabase.from(tabla).select("id").eq("bot_id", botId).maybeSingle();
  return !!data;
}

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

// ─────────────── Wizard de primeros pasos ───────────────

/** Grafo inicial mínimo para un chatbot nuevo: inicio → mensaje de bienvenida. */
function starterGraph(welcome: string) {
  return {
    nodes: [
      { id: "start", type: "start", position: { x: 60, y: 60 }, data: { label: "Cliente escribe", text: "Se activa cuando llega un mensaje nuevo.", to: "welcome" } },
      { id: "welcome", type: "message", position: { x: 60, y: 240 }, data: { label: "Bienvenida", text: welcome, media: "none", typingDelay: 1, isStart: true } },
    ],
    edges: [{ id: "e-start", source: "start", target: "welcome" }],
  };
}

const DEFAULT_WELCOME = "¡Hola! 👋 Gracias por escribirnos. ¿En qué te puedo ayudar hoy?";

/**
 * Crea un chatbot borrador con su flujo de Bienvenida (para el wizard).
 * Devuelve los IDs para que el wizard siga con Conexión y Primer mensaje.
 */
export async function createDraftBot(channel: string, name: string): Promise<{ botId: string; flowId: string } | null> {
  const ch = CHANNELS.has(channel) ? channel : "webchat";
  const nm = String(name ?? "").trim() || `Chatbot de ${CHANNEL_LABEL[ch]}`;
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;
  const supabase = createClient();

  const { data: bot } = await supabase
    .from("bots")
    .insert({ org_id: orgId, name: nm, status: "draft", channel: ch })
    .select("id")
    .single();
  if (!bot) return null;

  const { data: flow } = await supabase
    .from("flows")
    .insert({ bot_id: bot.id, org_id: orgId, graph: starterGraph(DEFAULT_WELCOME), is_live: true, version: 1, name: "Bienvenida", trigger_type: "welcome", enabled: true })
    .select("id")
    .single();

  revalidatePath("/bots");
  return { botId: bot.id, flowId: (flow?.id as string) ?? "" };
}

/** Fija el texto del mensaje de bienvenida del flujo (paso "Primer mensaje" del wizard). */
export async function setWelcomeMessage(flowId: string, text: string) {
  const body = String(text ?? "").trim();
  if (!flowId || !body) return;
  const supabase = createClient();
  const { data: flow } = await supabase.from("flows").select("graph, bot_id").eq("id", flowId).maybeSingle();
  const graph = ((flow?.graph as any) ?? starterGraph(body)) as any;
  const nodes = (graph.nodes ?? []) as any[];
  // Actualiza el nodo de bienvenida (id "welcome") o, en su defecto, el primer mensaje.
  let touched = false;
  const next = nodes.map((n) => {
    if (!touched && (n.id === "welcome" || n.type === "message")) {
      touched = true;
      return { ...n, data: { ...n.data, text: body } };
    }
    return n;
  });
  await supabase.from("flows").update({ graph: { ...graph, nodes: next } }).eq("id", flowId);
  if (flow?.bot_id) revalidatePath(`/bots/${flow.bot_id}`);
}

// ─────────────── Flujos dentro de un bot (con disparador) ───────────────

const TRIGGERS = new Set(["welcome", "keyword", "returning"]);
/* ── LA LISTA SALE DEL CATÁLOGO, NO SE ESCRIBE AQUÍ ───────────────────────
 *
 * Escrita a mano se quedó sin «live»: el negocio elegía «comentario en un
 * directo», guardaba, y la fila se grababa con «dm». Sin error y sin aviso —
 * su flujo dejaba de escuchar donde él había dicho. Es exactamente el mismo
 * fallo que este archivo ya arregló dos líneas más abajo con `infoOrigen`.
 */
const ORIGENES_VALIDOS = new Set<string>(ORIGENES.map((o) => o.valor));

/** Lee del formulario los campos del disparador social, ya saneados. */
function leerOrigen(formData: FormData) {
  const bruto = String(formData.get("origen") ?? "dm");
  const origen = ORIGENES_VALIDOS.has(bruto) ? bruto : "dm";
  // Fuera de los comentarios, publicación y respuesta pública no significan
  // nada: guardarlas dejaría datos sueltos que confunden al leer la fila.
  // DEL CATÁLOGO, no de una lista a mano. Escrito aquí como «post o reel», los
  // directos guardaban su respuesta pública como nula aunque la pantalla la
  // pidiera: el negocio la escribía, guardaba, y desaparecía sin decir nada.
  const info = infoOrigen(origen);
  const enComentario = !!info.admitePublica;
  return {
    origen,
    publicacion: info.pidePublicacion ? String(formData.get("publicacion") ?? "").trim() || null : null,
    respuesta_publica: enComentario ? String(formData.get("respuesta_publica") ?? "").trim() || null : null,
    // EL MODO SE SANEA, no se guarda lo que venga. Es una columna con
    // restricción en la base: una cadena inventada haría fallar el guardado
    // entero y el negocio perdería también el nombre y las palabras clave.
    respuesta_publica_modo: enComentario ? modoDeRespuestaPublica({
      respuesta_publica_modo: String(formData.get("respuesta_publica_modo") ?? ""),
    }) : "texto",
    // Una casilla SIN marcar no manda nada en el formulario. Comprobando que
    // valga "si" —en vez de que no valga "no"— desmarcarla funciona de verdad.
    una_por_persona: enComentario ? formData.get("una_por_persona") === "si" : true,
  };
}
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
    .insert({ bot_id: botId, org_id: orgId, graph: seed, is_live: true, version: 1, name, trigger_type, keywords, enabled: true, ...leerOrigen(formData) })
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

  const patch: Record<string, unknown> = { trigger_type, keywords, enabled, ...leerOrigen(formData) };
  if (name) patch.name = name;
  await createClient().from("flows").update(patch).eq("id", id);
  revalidatePath(`/bots/${botId}`);
  revalidatePath(`/bots/${botId}/flows/${id}`);
}
