import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "demandu_wa_2026";
const GRAPH = "https://graph.facebook.com/v20.0";

/**
 * Sube este número al tocar el archivo. Sirve para comprobar que lo que corre
 * en producción es lo mismo que está en el repo (`GET ?version`).
 */
const VERSION_MOTOR = "39";

/**
 * Diagnóstico de la IA del motor.
 *
 * POR QUÉ EXISTE: `responderConIA` convierte CUALQUIER fallo en el mensaje de
 * respaldo ("esa no me la sé"). Eso está bien para el cliente final —nunca ve
 * un error— pero para nosotros significa que un modelo retirado, una llave mal
 * pegada y una pregunta que de verdad no está en el conocimiento se ven
 * EXACTAMENTE IGUAL. Ya nos costó una noche entera en agosto.
 *
 * Esto lo separa en un solo viaje: dice si la llave está, si trae espacios de
 * más (el fallo más común al pegarla), qué modelo se está usando y qué
 * contesta Anthropic de verdad.
 *
 * NUNCA devuelve la llave ni parte de ella. Solo si existe y cuánto mide.
 * Va detrás del mismo token del webhook para que no lo pueda llamar cualquiera.
 */
async function diagnosticoIA() {
  const cruda = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const key = cruda.trim();
  const modeloVar = Deno.env.get("ANTHROPIC_MODEL");
  const modelo = modeloVar ?? "claude-haiku-4-5";

  const fuera: any = {
    version: VERSION_MOTOR,
    llave: key ? "presente" : "AUSENTE",
    largo_de_la_llave: key.length,
    // Pegar la llave con un espacio o un salto de línea al final la rompe, y
    // en el panel no se ve. Es el fallo más común y el más difícil de mirar.
    tiene_espacios_de_mas: cruda !== key,
    modelo,
    modelo_viene_de: modeloVar ? "la variable ANTHROPIC_MODEL" : "el valor por defecto del motor",
  };

  if (!key) {
    fuera.veredicto = "No hay ANTHROPIC_API_KEY en los secretos de esta función. La IA nunca se llama.";
    return fuera;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: modelo, max_tokens: 1, messages: [{ role: "user", content: "hola" }] }),
    });
    const cuerpo = await res.text().catch(() => "");
    if (res.ok) {
      fuera.anthropic = { ok: true, status: res.status };
      fuera.veredicto = "La IA funciona. Si el bot sigue diciendo «esa no me la sé», es que de verdad no está en el conocimiento del chatbot.";
      return fuera;
    }
    let tipo = "", mensaje = "";
    try {
      const j = JSON.parse(cuerpo);
      tipo = j?.error?.type ?? "";
      mensaje = j?.error?.message ?? "";
    } catch { mensaje = cuerpo.slice(0, 200); }
    fuera.anthropic = { ok: false, status: res.status, tipo, mensaje: mensaje.slice(0, 300) };
    fuera.veredicto =
      res.status === 401 ? "La llave no es válida. Hay que generar una nueva en console.anthropic.com y volver a pegarla."
      : res.status === 404 ? `El modelo «${modelo}» no existe o ya no está disponible. Borra la variable ANTHROPIC_MODEL para usar el que trae el motor.`
      : res.status === 400 ? `Anthropic rechazó la petición. Casi siempre es el nombre del modelo: «${modelo}».`
      : res.status === 429 ? "Se acabó el crédito o el límite de la cuenta de Anthropic."
      : "Anthropic contestó con un error. El detalle está arriba.";
    return fuera;
  } catch (e) {
    fuera.anthropic = { ok: false, error_de_red: String(e).slice(0, 200) };
    fuera.veredicto = "No se pudo ni conectar con Anthropic desde la función.";
    return fuera;
  }
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---- analítica: recorridos de flujo ----
// Copia en Deno de src/lib/flow/flowRuns.ts. Si cambias los motivos de fin,
// cámbialos en los dos motores (hay una prueba estática que lo vigila).
//
// REGLA: esto es medición, no conversación. Si falla, el bot sigue igual.
// Por eso todo va en try/catch y nada lanza.
async function abrirRecorrido(db: any, d: any): Promise<string | null> {
  try {
    const { data, error } = await db.from("flow_runs").insert({
      org_id: d.orgId, conversation_id: d.conversationId, bot_id: d.botId ?? null,
      flow_id: d.flowId ?? null, flow_name: d.flowName ?? null, channel: d.channel ?? "whatsapp",
    }).select("id").single();
    if (error) throw error;
    return data?.id ?? null;
  } catch (e) {
    console.error("[analítica] no se pudo abrir el recorrido:", e);
    return null;
  }
}
async function avanzarRecorrido(db: any, runId: string | null, pasos: number, ultimoNodo?: string | null) {
  if (!runId) return;
  try {
    const { data } = await db.from("flow_runs").select("steps").eq("id", runId).single();
    await db.from("flow_runs").update({
      steps: (data?.steps ?? 0) + Math.max(0, pasos),
      last_node_id: ultimoNodo ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", runId);
  } catch (e) {
    console.error("[analítica] no se pudo avanzar el recorrido:", e);
  }
}
async function cerrarRecorrido(db: any, runId: string | null, motivo: string, pasos = 0, ultimoNodo?: string | null) {
  if (!runId) return;
  try {
    const { data } = await db.from("flow_runs").select("steps").eq("id", runId).single();
    const ahora = new Date().toISOString();
    await db.from("flow_runs").update({
      steps: (data?.steps ?? 0) + Math.max(0, pasos),
      last_node_id: ultimoNodo ?? null,
      ended_at: ahora, ended_reason: motivo, updated_at: ahora,
    }).eq("id", runId).is("ended_at", null);
  } catch (e) {
    console.error("[analítica] no se pudo cerrar el recorrido:", e);
  }
}

// ---- helpers de flujo ----
function getNode(flow: any, id: string) { return flow.nodes.find((n: any) => n.id === id); }
function getStartNode(flow: any) {
  return flow.nodes.find((n: any) => n.data?.isStart) ?? flow.nodes.find((n: any) => n.type === "start") ?? flow.nodes[0];
}
function defaultNext(flow: any, node: any) {
  const e = flow.edges.find((e: any) => e.source === node.id && !e.sourceHandle);
  return e?.target ?? node.data?.to;
}
function buttonTarget(flow: any, nodeId: string, button: any) {
  const e = flow.edges.find((e: any) => e.source === nodeId && e.sourceHandle === button.id);
  return e?.target ?? button.to;
}
function interp(t: string, vars: Record<string, string>) {
  const out = (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
  // Si una variable vino vacía, no dejamos "Hola, !" ni dobles espacios.
  return out
    .replace(/([,;:])\s*([!?.…])/g, "$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}

/**
 * Textos de ejemplo que el constructor pone al soltar un bloque nuevo
 * (la descripción del componente). NUNCA deben enviarse al cliente:
 * si un bloque todavía tiene su descripción, es que no se ha configurado.
 */
const PLACEHOLDERS = new Set([
  "Disparador del flujo", "Texto simple", "Imagen, video o archivo",
  "Captura una respuesta", "Opciones / menú", "Ramifica según reglas",
  "Ramifica según los datos del contacto", "Respuesta con IA", "Pausa temporizada",
  "Webhook o integración", "Google Calendar", "Segmenta el contacto",
  "Transferir a tu equipo", "Reparte a agente / equipo", "Va a otro flujo / bot",
  "Llama una API y ramifica", "Llama una API y ramifica por respuesta",
  "Formulario nativo de WhatsApp", "Cobro con pasarela",
  "Venta de productos por WhatsApp", "Mensaje con plantilla aprobada",
  "Reacciona a menciones/respuestas de historias IG",
  "Responde comentarios y pasa a DM", "Envía un DM de Instagram",
  "Responde comentarios de Facebook y pasa a DM",
  "Captura datos en tu sitio", "Cierra el flujo",
]);
const esEjemplo = (t?: string | null) => !!t && PLACEHOLDERS.has(t.trim());

/** País (ISO-2) a partir del teléfono internacional, para mostrar la bandera del lead. */
const PREFIJOS_PAIS: Record<string, string> = {
  "1787": "PR", "1939": "PR", "1809": "DO", "1829": "DO", "1849": "DO",
  "1876": "JM", "1868": "TT", "1345": "KY", "1242": "BS", "1": "US",
  "52": "MX", "54": "AR", "55": "BR", "56": "CL", "57": "CO", "58": "VE",
  "51": "PE", "593": "EC", "591": "BO", "595": "PY", "598": "UY", "597": "SR",
  "592": "GY", "594": "GF", "502": "GT", "503": "SV", "504": "HN", "505": "NI",
  "506": "CR", "507": "PA", "501": "BZ", "509": "HT", "53": "CU",
  "34": "ES", "351": "PT", "33": "FR", "39": "IT", "49": "DE", "44": "GB",
  "31": "NL", "32": "BE", "41": "CH", "43": "AT", "46": "SE", "47": "NO",
  "45": "DK", "358": "FI", "353": "IE", "48": "PL", "30": "GR", "40": "RO",
  "420": "CZ", "36": "HU", "380": "UA", "7": "RU", "90": "TR",
  "212": "MA", "20": "EG", "27": "ZA", "234": "NG", "254": "KE",
  "91": "IN", "86": "CN", "81": "JP", "82": "KR", "62": "ID", "63": "PH",
  "60": "MY", "65": "SG", "66": "TH", "84": "VN", "61": "AU", "64": "NZ",
  "972": "IL", "971": "AE", "966": "SA", "974": "QA", "965": "KW",
};
const PREFIJOS_ORDEN = Object.keys(PREFIJOS_PAIS).sort((a, b) => b.length - a.length);
function paisDesdeTelefono(phone?: string | null): string | null {
  const n = String(phone ?? "").replace(/\D/g, "");
  if (!n) return null;
  for (const p of PREFIJOS_ORDEN) if (n.startsWith(p)) return PREFIJOS_PAIS[p];
  return null;
}

/**
 * Atajos del chatbot: palabras que el lead puede escribir en cualquier momento
 * para reiniciar la conversación o pedir una persona. Se revisan ANTES que el
 * flujo, así funcionan aunque el bot esté esperando otra respuesta.
 * (Mismo comportamiento que `src/lib/flow/shortcuts.ts` — si cambias uno, cambia el otro.)
 */
const ATAJOS_DEFAULT = {
  reset: { enabled: true, words: ["0", "menu", "men\u00fa", "reiniciar", "inicio"], reply: "Listo, empezamos de nuevo \ud83d\udd04" },
  agent: { enabled: true, words: ["1", "asesor", "agente", "humano", "persona"], reply: "Enseguida te atiende una persona del equipo \ud83d\ude4c Dame un momento." },
  hint: { enabled: true, text: "Escribe *0* para volver al inicio o *1* para hablar con una persona.", onStart: true, onOptions: false },
};
function leerAtajos(raw: any) {
  const a = raw ?? {};
  return {
    reset: { ...ATAJOS_DEFAULT.reset, ...(a.reset ?? {}) },
    agent: { ...ATAJOS_DEFAULT.agent, ...(a.agent ?? {}) },
    hint: { ...ATAJOS_DEFAULT.hint, ...(a.hint ?? {}) },
  };
}
function normalizarAtajo(t: string) {
  // Los signos se limpian al principio Y al final: en español se escribe
  // "\u00a10!" o "\u00bf1?" y eso debe activar el atajo igual.
  return String(t ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[\u00a1!\u00bf?.,;:\s]+/g, "")
    .replace(/[\u00a1!\u00bf?.,;:\s]+$/g, "")
    .replace(/\s+/g, " ");
}
function detectarAtajo(texto: string, atajos: any): "reset" | "agent" | null {
  const t = normalizarAtajo(texto);
  if (!t) return null;
  const coincide = (a: any) => a?.enabled && (a.words ?? []).some((w: string) => w && normalizarAtajo(w) === t);
  if (coincide(atajos.agent)) return "agent";
  if (coincide(atajos.reset)) return "reset";
  return null;
}

/**
 * Formas de decir que sí.
 *
 * EL FALLO QUE ARREGLA: cuando la IA no sabe algo, el bot dice "esa no me la sé
 * 🙈 ¿Quieres que te comunique con una persona del equipo?". El cliente
 * contestaba "sí"… y no pasaba absolutamente nada. Nadie se enteraba.
 *
 * "sí" NO puede ser un atajo global: secuestraría cualquier pregunta de sí/no
 * del flujo ("¿Confirmas tu cita?" → "sí" → te paso con un asesor). Por eso
 * solo cuenta en el turno siguiente a la oferta, y solo entonces.
 *
 * Copia en Deno de `src/lib/flow/desvio.ts`. Si cambias una lista, cambia la
 * otra: el canal web y WhatsApp tienen que entender lo mismo.
 */
const AFIRMACIONES = new Set([
  "si", "sí", "s", "claro", "ok", "okay", "oki", "va", "vale", "sale", "dale",
  "porfa", "por favor", "porfavor", "obvio", "simon", "andale", "orale",
  "si porfa", "si por favor", "claro que si", "me gustaria", "quiero",
  "si quiero", "adelante", "hazlo", "yes", "yep", "sure",
]);

/**
 * ¿Está aceptando la oferta de pasar con una persona?
 *
 * Conservador a propósito: solo frases cortas y claras. "sí, pero antes dime el
 * precio" NO es un sí a hablar con un humano — es otra pregunta, y la sigue
 * contestando la IA.
 */
function esAfirmacion(texto: string): boolean {
  const t = normalizarAtajo(texto).replace(/[.!¡?¿,]/g, "").trim();
  if (!t || t.split(" ").length > 3) return false;
  // `normalizarAtajo` ya quitó los acentos, así que "sí" llega como "si".
  return AFIRMACIONES.has(t);
}

// ---- envío a WhatsApp ----
/**
 * Traduce los errores de Meta a algo que un cliente no técnico entienda.
 * Es lo que se muestra en la Bandeja cuando un mensaje no llega.
 */
function motivoMeta(code: number, mensaje: string): string {
  switch (code) {
    case 131037:
      return "Meta todavía no aprueba el nombre para mostrar de tu número. Hasta que lo apruebe, WhatsApp no deja enviar mensajes.";
    case 131047:
      return "Pasaron más de 24 horas desde el último mensaje del cliente. Para retomar hay que enviarle una plantilla aprobada.";
    case 131026:
      return "Ese número no puede recibir mensajes de WhatsApp.";
    case 131051:
      return "Ese tipo de mensaje no está permitido en este número.";
    case 131056:
      return "Demasiados mensajes seguidos a este número. Meta pidió esperar un momento.";
    case 190:
    case 401:
      return "La conexión con Meta caducó. Hay que volver a conectar el número.";
    case 132000:
    case 132001:
    case 132007:
      return "La plantilla no existe o no está aprobada por Meta.";
    case 133010:
      return "El número no está registrado en WhatsApp Business.";
    default:
      return mensaje || "WhatsApp no aceptó el mensaje.";
  }
}

type ResultadoEnvio = { ok: boolean; error?: string; code?: number };

/**
 * El número de pruebas que Meta regala a cada cuenta: +1 555 XXX XXXX.
 * En ese número NO se puede aprobar el nombre para mostrar, así que la
 * revisión no termina nunca y el error 131037 manda al cliente a esperar
 * algo que no va a pasar. Detectarlo cambia por completo el mensaje.
 */
function esNumeroDePrueba(numero?: string | null): boolean {
  const n = String(numero ?? "").replace(/\D/g, "");
  return /^1555\d{7}$/.test(n);
}

async function waPost(pnid: string, token: string, payload: any): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(`${GRAPH}/${pnid}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    if (res.ok) return { ok: true };
    const cuerpo = await res.text().catch(() => "");
    console.error("wa send", res.status, cuerpo);
    let code = res.status;
    let mensaje = "";
    try {
      const j = JSON.parse(cuerpo);
      code = j?.error?.code ?? code;
      mensaje = j?.error?.message ?? "";
    } catch { /* respuesta no JSON */ }
    return { ok: false, code, error: motivoMeta(code, mensaje) };
  } catch (e) {
    console.error("wa send red:", e);
    return { ok: false, error: "No se pudo conectar con WhatsApp." };
  }
}
function sendText(pnid: string, token: string, to: string, body: string) {
  return waPost(pnid, token, { to, type: "text", text: { body: body.slice(0, 4096) } });
}
function sendButtons(pnid: string, token: string, to: string, body: string, buttons: any[]) {
  const opts = buttons.slice(0, 10);
  if (opts.length <= 3) {
    return waPost(pnid, token, { to, type: "interactive", interactive: { type: "button", body: { text: (body || "Elige una opción").slice(0, 1024) }, action: { buttons: opts.map((b) => ({ type: "reply", reply: { id: b.id, title: (b.label || "Opción").slice(0, 20) } })) } } });
  }
  return waPost(pnid, token, { to, type: "interactive", interactive: { type: "list", body: { text: (body || "Elige una opción").slice(0, 1024) }, action: { button: "Ver opciones", sections: [{ title: "Opciones", rows: opts.map((b) => ({ id: b.id, title: (b.label || "Opción").slice(0, 24) })) }] } } });
}

/* ────────────────────────────────────────────────────────────────────────────
 * MULTIMEDIA — POR QUÉ NO SE MANDA POR ENLACE
 *
 * Si a Meta se le pasa la URL de la imagen, Meta acepta la petición al instante
 * pero todavía tiene que ir a descargar el archivo antes de poder entregarlo.
 * Mientras hace ese viaje, el bloque siguiente —un texto o unos botones, que no
 * necesitan descargar nada— sale y llega ANTES. El cliente ve las opciones y
 * después la imagen, aunque la imagen fuera el inicio del flujo.
 *
 * Por eso el archivo se sube primero a Meta y se envía por su identificador:
 * cuando llega el turno de mandarlo, Meta ya tiene los bytes en la mano y no
 * hay nada que esperar. El orden se respeta siempre.
 *
 * El identificador se guarda en `wa_media_cache`, así que un archivo solo se
 * sube la primera vez y no en cada conversación.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Meta caduca los ids a los 30 días. Los damos por vencidos antes, a los 25. */
const DIAS_CACHE_MEDIA = 25;

/** Por encima de esto no subimos: se manda por enlace y que Meta lo descargue. */
const TOPE_SUBIDA = 16 * 1024 * 1024;

const TIPO_POR_DEFECTO: Record<string, string> = {
  image: "image/jpeg",
  video: "video/mp4",
  file: "application/pdf",
};

/**
 * Sube el archivo a Meta y devuelve el identificador que nos da.
 *
 * Devuelve null ante cualquier tropiezo —archivo caído, demasiado grande, Meta
 * de mal humor— y quien llama vuelve al envío por enlace. Que llegue tarde es
 * malo; que no llegue es peor.
 */
async function subirMediaAMeta(
  pnid: string, token: string, url: string,
  kind: "image" | "video" | "file", filename?: string,
): Promise<string | null> {
  try {
    const bajada = await fetch(url);
    if (!bajada.ok) {
      console.error("media bajar", bajada.status, url.slice(0, 120));
      return null;
    }
    const archivo = await bajada.blob();
    if (archivo.size === 0 || archivo.size > TOPE_SUBIDA) {
      console.error("media tamaño", archivo.size, url.slice(0, 120));
      return null;
    }

    const tipo = archivo.type || bajada.headers.get("content-type") || TIPO_POR_DEFECTO[kind];
    const nombre = filename || url.split("/").pop()?.split("?")[0] || "archivo";

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", tipo);
    form.append("file", new File([archivo], nombre, { type: tipo }));

    // Sin Content-Type a mano: lo pone fetch con el `boundary` que toca.
    const res = await fetch(`${GRAPH}/${pnid}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const cuerpo = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("media subir", res.status, cuerpo.slice(0, 300));
      return null;
    }
    return (JSON.parse(cuerpo)?.id as string) ?? null;
  } catch (e) {
    console.error("media subir red:", e);
    return null;
  }
}

/** El id de Meta para esta URL: de la caché si sigue fresco, o subiéndolo. */
async function mediaIdDeMeta(
  ctx: any, kind: "image" | "video" | "file", url: string, filename?: string,
): Promise<string | null> {
  const limite = new Date(Date.now() - DIAS_CACHE_MEDIA * 86400000).toISOString();

  const { data } = await ctx.db
    .from("wa_media_cache")
    .select("media_id")
    .eq("phone_number_id", ctx.pnid)
    .eq("url", url)
    .gt("created_at", limite)
    .maybeSingle();
  if (data?.media_id) return data.media_id as string;

  const id = await subirMediaAMeta(ctx.pnid, ctx.token, url, kind, filename);
  if (!id) return null;

  await ctx.db
    .from("wa_media_cache")
    .upsert(
      { phone_number_id: ctx.pnid, url, media_id: id, created_at: new Date().toISOString() },
      { onConflict: "phone_number_id,url" },
    );
  return id;
}

/** El envío en sí, dando a Meta o el id que ya tiene o el enlace. */
function mediaPost(
  pnid: string, token: string, to: string,
  kind: "image" | "video" | "file",
  fuente: { id: string } | { link: string },
  caption?: string, filename?: string,
) {
  const cap = (caption ?? "").slice(0, 1024);
  const cuerpo = { ...fuente, ...(cap ? { caption: cap } : {}) };
  if (kind === "video") return waPost(pnid, token, { to, type: "video", video: cuerpo });
  if (kind === "file") {
    return waPost(pnid, token, {
      to, type: "document",
      document: { ...cuerpo, ...(filename ? { filename } : {}) },
    });
  }
  return waPost(pnid, token, { to, type: "image", image: cuerpo });
}

/** Envía imagen, video o archivo con su texto (caption), en el orden correcto. */
async function sendMedia(
  ctx: any,
  kind: "image" | "video" | "file", url: string, caption?: string, filename?: string,
): Promise<ResultadoEnvio> {
  const mediaId = await mediaIdDeMeta(ctx, kind, url, filename);

  if (mediaId) {
    const r = await mediaPost(ctx.pnid, ctx.token, ctx.to, kind, { id: mediaId }, caption, filename);
    if (r.ok) return r;
    // El id pudo caducar antes de tiempo o borrarse del lado de Meta. Se tira
    // la fila para que la próxima vez se vuelva a subir, y se reintenta ahora
    // por enlace para que este cliente sí reciba su archivo.
    await ctx.db.from("wa_media_cache").delete()
      .eq("phone_number_id", ctx.pnid).eq("url", url);
  }

  return mediaPost(ctx.pnid, ctx.token, ctx.to, kind, { link: url }, caption, filename);
}

// ---- IA (mismo comportamiento que en el canal web) ----
const AI_DEFAULTS = {
  // Igual que en src/lib/ai/answer.ts: encendida salvo que la apaguen.
  enabled: true,
  persona: "Eres Lana, la asistente virtual del negocio. Ayudas a los clientes con amabilidad y vas al grano.",
  style: "Cercano y profesional. Tutea al cliente.",
  fallback: "Esa no me la sé todavía 🙈 ¿Quieres que te comunique con una persona del equipo?",
  maxWords: 80,
};

/** Fragmentos de conocimiento del NEGOCIO — siempre acotados a org + chatbot. */
async function buscarConocimiento(db: any, orgId: string, botId: string, pregunta: string, limit = 5) {
  const q = (pregunta ?? "").trim();
  // AISLAMIENTO: sin organización Y chatbot no se busca nada. Nunca.
  if (!q || !orgId || !botId) return [];

  // 1) Por significado (embeddings)
  try {
    const key = Deno.env.get("VOYAGE_API_KEY");
    if (key) {
      const r = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("VOYAGE_MODEL") ?? "voyage-3", input: [q], input_type: "query" }),
      });
      if (r.ok) {
        const j = await r.json();
        const vector = j?.data?.[0]?.embedding;
        if (vector) {
          const { data, error } = await db.rpc("match_bot_knowledge", {
            p_org_id: orgId, p_bot_id: botId, p_embedding: vector, p_limit: limit,
          });
          if (!error && data?.length) return data.map((d: any) => ({ title: d.title, content: d.content }));
        }
      }
    }
  } catch { /* seguimos a palabras clave */ }

  // 2) Por palabras, ordenado por relevancia (ver 0054).
  //
  // ANTES ESTO EXIGÍA QUE COINCIDIERAN TODAS LAS PALABRAS de la pregunta en un
  // mismo fragmento, cosa que casi nunca ocurre con una pregunta escrita por
  // una persona. Como no encontraba nada, se caía a un respaldo que devolvía
  // «los 5 primeros fragmentos» —siempre los mismos, sin relación con lo que
  // preguntaron— y la IA rellenaba el hueco con lo que le sonaba. Así fue como
  // aseguró que el plan de 99 USD «no tiene límite de mensajes».
  //
  // Por eso ese respaldo YA NO EXISTE: si no hay nada parecido a la pregunta,
  // se devuelve vacío y la IA dice que no lo sabe y ofrece una persona. Un «no
  // lo sé» cuesta una conversación; un dato inventado cuesta un cliente.
  try {
    const { data, error } = await db.rpc("buscar_conocimiento", {
      p_org_id: orgId, p_bot_id: botId, p_pregunta: q, p_limit: limit,
    });
    if (!error && data?.length) return data.map((d: any) => ({ title: d.title, content: d.content }));
  } catch { /* sin contexto */ }

  return [];
}

/**
 * ¿Esta cuenta ya se pasó de su tope de IA este mes?
 *
 * Casi siempre `tope_ia` es NULL y esto contesta que no sin contar nada — que
 * es el caso normal y no debe costar ni una consulta de más.
 *
 * Si algo falla, contesta que NO. Ante la duda, el bot responde: un cliente sin
 * respuestas por un error nuestro es mucho peor que unos centavos de IA.
 */
async function pasoElTopeDeIA(ctx: any): Promise<boolean> {
  try {
    const { data: org } = await ctx.db
      .from("organizations").select("tope_ia").eq("id", ctx.orgId).maybeSingle();

    const tope = org?.tope_ia;
    if (tope === null || tope === undefined) return false;

    const ini = new Date();
    ini.setUTCDate(1);
    ini.setUTCHours(0, 0, 0, 0);

    const { count } = await ctx.db
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("kind", "ai_message")
      .gte("created_at", ini.toISOString());

    return (count ?? 0) >= Number(tope);
  } catch (e) {
    console.error("[ia] tope:", e);
    return false;
  }
}

/** Responde con IA. Nunca revienta la conversación: ante cualquier fallo, respaldo. */
/**
 * LAS HERRAMIENTAS DEL AGENTE.
 *
 * Se arman por cliente, no por código: qué herramientas existen es universal,
 * QUÉ PUEDE HACER CADA UNA sale de los catálogos de esa organización. Una
 * clínica y una inmobiliaria califican distinto y ninguna necesita que
 * programemos su criterio.
 *
 * Ver `herramientas.md` en esta misma carpeta para el porqué completo.
 */
const CLAVES_DE_ACCION = [
  "etiquetar", "pasar_a_humano", "guardar_dato",
  "ver_horarios", "agendar_cita", "consultar_sistema",
];

/**
 * Las acciones que menciona un prompt, escritas con «/».
 *
 * GEMELO de `accionesDelPrompt` en `src/lib/ai/acciones.ts`. Son dos porque
 * son runtimes distintos; hay una prueba estática que falla si dejan de
 * comportarse igual.
 *
 * POR QUÉ EL PROMPT MANDA. Antes había que escribir el criterio en el prompt Y
 * acordarse de encender la herramienta en otra pantalla. Nadie se acuerda: se
 * vio un prompt de dos páginas pidiendo etiquetar y transferir con CERO
 * herramientas activadas. La IA solo podía hablar y no tenía forma de decirlo.
 *
 * La expresión es estricta a propósito: un prompt lleva fechas («12/09») y
 * direcciones («https://…/x»). Si cualquier barra encendiera acciones, un
 * cliente acabaría con herramientas que ESCRIBEN en las fichas de sus leads
 * sin haberlas pedido.
 */
/**
 * Datos que además tienen su CASILLA PROPIA en la ficha del lead.
 *
 * Sin esto, el correo que la IA captura se guarda como «un atributo más» y la
 * casilla «Correo» de la ficha se queda vacía. Pasó tal cual: el bot pidió el
 * correo, la persona lo dio, el bot dijo «ya quedó registrado» y en la ficha no
 * había nada donde el equipo lo busca. Para el agente que abre esa ficha, el
 * dato no existe.
 *
 * Se guarda en LOS DOS SITIOS: en la casilla, que es donde se mira, y en los
 * atributos, que es de donde tiran los flujos y las plantillas.
 */
/**
 * ¿El bot acaba de PROMETER que va a intervenir una persona?
 *
 * GEMELO de `src/lib/ai/promesas.ts`, donde está el porqué completo y las
 * pruebas. Resumen: un modelo con herramientas a veces NARRA la acción en vez
 * de ejecutarla — escribe «un asesor se va a comunicar contigo» y no llama a
 * `pasar_a_humano`. La conversación queda abierta, sin dueño, y el lead espera
 * a alguien que no va a llegar. Es el peor fallo posible: el bot promete en
 * nombre del negocio y el negocio no cumple.
 */
const PROM_PERSONA =
  "(?:asesor|asesora|agente|ejecutivo|ejecutiva|vendedor|vendedora|" +
  "una\\s+persona|alguien\\s+del\\s+equipo|del\\s+equipo|compa[nñ]er[oa])";
const PROM_COMPROMISO =
  "(?:se\\s+(?:va|van)\\s+a\\s+comunicar|se\\s+comunicar[aá]n?|te\\s+contactar[aá]n?|" +
  "lo\\s+contactar[aá]n?|la\\s+contactar[aá]n?|te\\s+escribir[aá]n?|te\\s+atender[aá]n?|" +
  "lo\\s+atender[aá]n?|la\\s+atender[aá]n?|te\\s+llamar[aá]n?|" +
  "en\\s+un\\s+momento\\s+te\\s+atiende|enseguida\\s+te\\s+atiende)";
const PROM_YO_TE_PASO =
  "(?:te|le|lo|la)\\s+(?:paso|comunico|conecto|transfiero|derivo|enlazo)\\s+(?:con|a)\\b";
const PROM_PATRONES = [
  new RegExp(`${PROM_PERSONA}[^.!?\\n]{0,60}${PROM_COMPROMISO}`, "i"),
  new RegExp(`${PROM_COMPROMISO}[^.!?\\n]{0,60}${PROM_PERSONA}`, "i"),
  new RegExp(PROM_YO_TE_PASO, "i"),
];
const PROM_SOLO_OFRECE =
  /(?:\?|¿)|(?:quieres|querés|desea|deseas|gustar[íi]a|prefieres|te sirve|puedo)\b/i;

function prometioUnaPersona(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  for (const frase of t.split(/(?<=[.!?\n])/)) {
    const f = frase.trim();
    if (!f || PROM_SOLO_OFRECE.test(f)) continue;
    if (PROM_PATRONES.some((p) => p.test(f))) return true;
  }
  return false;
}

const CASILLA_DE_LA_FICHA: Record<string, string> = {
  nombre: "name", name: "name", nombre_completo: "name",
  correo: "email", email: "email", mail: "email", correo_electronico: "email",
  telefono: "phone", phone: "phone", celular: "phone", movil: "phone",
  empresa: "company", company: "company", negocio: "company",
  pais: "country", country: "country",
};

function accionesDelPrompt(prompt: string | null | undefined): string[] {
  const texto = String(prompt ?? "");
  if (!texto) return [];
  const encontradas = new Set<string>();
  for (const m of texto.matchAll(/(^|[\s(])\/([a-z_]+)/gm)) {
    if (CLAVES_DE_ACCION.includes(m[2])) encontradas.add(m[2]);
  }
  return [...encontradas];
}

async function armarHerramientas(ctx: any, ai: any): Promise<{ tools: any[]; contexto: string }> {
  // LO QUE PIDE EL PROMPT CUENTA IGUAL QUE LO MARCADO EN LA PANTALLA.
  //
  // Se unen en vez de sustituirse: quien ya tenía herramientas marcadas no
  // pierde ninguna por escribir un prompt nuevo, y quien escribe `/etiquetar`
  // no tiene que ir a otra pantalla a encenderlo.
  //
  // `ai.persona` es el prompt que de verdad se está usando: si el bloque del
  // flujo trae el suyo, ya lo ha sustituido antes de llegar aquí. Así el «/»
  // funciona igual escrito en la pantalla de Lana IA o dentro del bloque.
  const marcadas: string[] = Array.isArray(ai.herramientas) ? ai.herramientas : [];
  const escritas = accionesDelPrompt(ai.persona);
  const quiere: string[] = [...new Set([...marcadas, ...escritas])];
  if (!quiere.length) return { tools: [], contexto: "" };

  const tools: any[] = [];
  const notas: string[] = [];

  if (quiere.includes("ver_horarios")) {
    tools.push({
      name: "ver_horarios",
      description:
        "Consulta los horarios libres en la agenda del negocio. Úsala ANTES de proponer una hora: " +
        "nunca inventes disponibilidad.",
      input_schema: {
        type: "object",
        properties: {
          dias: { type: "integer", description: "Cuántos días hacia adelante mirar. Por defecto 14." },
          duracion: { type: "integer", description: "Duración de la cita en minutos. Por defecto 30." },
        },
      },
    });
  }

  if (quiere.includes("agendar_cita")) {
    tools.push({
      name: "agendar_cita",
      description:
        "Reserva una cita. El `inicio` DEBE ser uno de los que devolvió ver_horarios, copiado tal cual. " +
        "No la llames sin haber confirmado la hora con la persona.",
      input_schema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "La fecha y hora exacta que devolvió ver_horarios." },
          nombre: { type: "string", description: "Nombre de quien reserva, si lo sabes." },
          correo: { type: "string", description: "Su correo, si lo sabes. Le llega la invitación." },
        },
        required: ["inicio"],
      },
    });
  }

  if (quiere.includes("etiquetar")) {
    // El catálogo REAL de este cliente. Sin esto el modelo se inventa etiquetas
    // y el embudo del negocio deja de significar nada.
    const { data: tags } = await ctx.db.from("tags").select("name").eq("org_id", ctx.orgId);
    const nombres = ((tags ?? []) as any[]).map((t) => t.name);
    if (nombres.length) {
      notas.push(`Etiquetas disponibles: ${nombres.join(", ")}.`);
      tools.push({
        name: "etiquetar",
        description:
          "Marca a esta persona con una etiqueta del negocio para clasificarla. " +
          "Solo puedes usar las etiquetas que existen; cualquier otra será rechazada.\n\n" +
          "CUÁNDO: solo cuando YA SEPAS lo que el criterio del negocio pide para decidir. " +
          "Si el criterio habla de ingresos, presupuesto o plazo y todavía no te lo han dicho, " +
          "NO llames a esta herramienta: pregúntalo primero y etiqueta después. " +
          "Etiquetar al principio 'por si acaso' llena el embudo del negocio de calificaciones " +
          "inventadas, y alguien toma decisiones de dinero con ellas.\n" +
          "Si te enteras de algo que cambia la calificación, vuelve a llamarla: la nueva " +
          "sustituye a la anterior.",
        input_schema: {
          type: "object",
          properties: {
            etiqueta: { type: "string", enum: nombres, description: "Una de las etiquetas existentes." },
            por_que: { type: "string", description: "En una frase, por qué le pones esta etiqueta." },
            // OBLIGATORIO Y A PROPÓSITO: obliga al modelo a nombrar lo que la
            // persona DIJO. Cuando no hay nada que citar, se nota —para él al
            // escribirlo y para quien lo lea después en el evento—, y eso
            // frena la calificación prematura mucho mejor que pedírselo en
            // prosa dentro del prompt.
            en_que_me_baso: {
              type: "array",
              items: { type: "string" },
              description:
                "Lo que la persona DIJO y te lleva a esta etiqueta, con sus palabras. " +
                "Si no puedes citar nada concreto, es que todavía no sabes lo suficiente: no etiquetes.",
            },
          },
          required: ["etiqueta", "por_que", "en_que_me_baso"],
        },
      });
    }
  }

  if (quiere.includes("guardar_dato")) {
    const { data: campos } = await ctx.db
      .from("custom_attributes").select("key, name, type").eq("org_id", ctx.orgId);
    const lista = ((campos ?? []) as any[]);
    if (lista.length) {
      notas.push(
        "Datos que puedes guardar de la persona: " +
          lista.map((c) => `${c.key} (${c.name})`).join(", ") + ".",
      );
      tools.push({
        name: "guardar_dato",
        description:
          "Guarda un dato de esta persona en su ficha, para que el equipo lo vea después. " +
          "Solo campos que existan.",
        input_schema: {
          type: "object",
          properties: {
            campo: { type: "string", enum: lista.map((c) => c.key), description: "La clave del campo." },
            valor: { type: "string", description: "Lo que la persona dijo, tal cual." },
          },
          required: ["campo", "valor"],
        },
      });
    }
  }

  if (quiere.includes("pasar_a_humano")) {
    tools.push({
      name: "pasar_a_humano",
      description:
        "Pasa la conversación a una persona del equipo. Úsala cuando te lo pidan, cuando no puedas " +
        "resolver algo importante, o cuando la persona esté molesta.",
      input_schema: {
        type: "object",
        properties: { motivo: { type: "string", description: "Por qué la pasas." } },
        required: ["motivo"],
      },
    });
  }

  if (quiere.includes("consultar_sistema") && ai.sistemaUrl) {
    tools.push({
      name: "consultar_sistema",
      description:
        String(ai.sistemaDescripcion ?? "") ||
        "Consulta el sistema del negocio para obtener información que no está en el conocimiento cargado.",
      input_schema: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Qué quieres consultar, en pocas palabras." },
        },
        required: ["consulta"],
      },
    });
  }

  // Los criterios del cliente, en su idioma. Esto es LA pieza que hace que el
  // mismo código sirva para una clínica y para una inmobiliaria.
  if (ai.criterios) notas.push(`Criterios del negocio:\n${ai.criterios}`);

  // ── LA LISTA DE VERDAD, Y VA LA ÚLTIMA ──────────────────────────────────
  //
  // Un prompt escrito por el cliente puede nombrar acciones que NO EXISTEN.
  // Pasó: un prompt de dos páginas terminaba diciendo «Acciones disponibles:
  // crear_lead_hubspot», una herramienta que nunca construimos. El modelo se
  // creyó esa lista, no llamó a las que sí tenía, y se limitó a NARRAR lo que
  // iba a hacer: dijo que registraba, que transfería, y no hizo ninguna.
  //
  // Esto va al FINAL a propósito, después del prompt del cliente: lo último
  // que se lee es lo que manda.
  if (tools.length) {
    notas.push(
      `ACCIONES QUE PUEDES EJECUTAR DE VERDAD: ${tools.map((t: any) => t.name).join(", ")}.\n` +
        "Esta es la lista completa. Si más arriba se menciona cualquier otra acción o " +
        "herramienta, NO existe: ignórala.\n" +
        "NO ANUNCIES LO QUE NO EJECUTAS. Si escribes que vas a pasar con una persona, " +
        "que registraste un dato o que guardaste algo, tienes que llamar a la herramienta " +
        "correspondiente EN ESE MISMO TURNO. Decirlo sin hacerlo deja al cliente esperando " +
        "algo que nunca pasa.",
    );
  }

  return { tools, contexto: notas.join("\n") };
}

/**
 * Ejecuta una herramienta que pidió el modelo.
 *
 * TODO SE VALIDA AQUÍ, no en el prompt. Lo que el modelo pide es una propuesta;
 * lo que se puede hacer lo decide la base. Cuando algo no cuadra se devuelve un
 * error EXPLICATIVO en vez de fallar en silencio: con eso el modelo corrige y
 * lo vuelve a intentar bien, que es justo lo que se quiere.
 */
async function ejecutarHerramienta(ctx: any, ai: any, nombre: string, args: any): Promise<string> {
  try {
    switch (nombre) {
      case "ver_horarios": {
        const r = await pedirAgenda({
          accion: "horarios",
          org_id: ctx.orgId,
          duracion: Number(args?.duracion) || 30,
          dias: Number(args?.dias) || 14,
          cuantos: 8,
        });
        const slots = r?.slots ?? [];
        if (!slots.length) {
          return "No hay horarios libres o la agenda no está conectada. Dile que le pasarás con una persona.";
        }
        return "Horarios libres (usa el valor de `inicio` tal cual al agendar):\n" +
          slots.map((s: any) => `- ${s.label} → inicio: ${s.startISO}`).join("\n");
      }

      case "agendar_cita": {
        const inicio = String(args?.inicio ?? "").trim();
        if (!inicio) return "Falta la hora. Llama primero a ver_horarios.";
        const r = await pedirAgenda({
          accion: "agendar",
          org_id: ctx.orgId,
          inicio,
          duracion: 30,
          titulo: `Cita con ${args?.nombre ?? ctx.vars?.nombre ?? "cliente"}`,
          descripcion: "Cita agendada por el agente de IA.",
          correo: args?.correo || undefined,
        });
        if (!r?.ok) return `No se pudo agendar: ${r?.error ?? "error desconocido"}. Ofrece otra hora.`;

        ctx.vars.cita_inicio = r.inicioISO ?? inicio;
        ctx.vars.cita_dia = r.dia ?? "";
        ctx.vars.cita_hora = r.hora ?? "";
        contarFuera(ctx.db, ctx.orgId, "cita.agendada", {
          telefono: ctx.to, nombre: args?.nombre ?? null, correo: args?.correo ?? null,
          inicio: r.inicioISO ?? inicio, dia: r.dia ?? null, hora: r.hora ?? null,
          enlace: r.enlace ?? null, conversacion_id: ctx.convId, por: "agente_ia",
        });
        return `Cita confirmada para el ${r.dia ?? ""} a las ${r.hora ?? ""}. Confírmaselo con esas palabras.`;
      }

      case "etiquetar": {
        const etiqueta = String(args?.etiqueta ?? "").trim();

        const { data: c } = await ctx.db.from("contacts")
          .select("id").eq("org_id", ctx.orgId).eq("channel", "whatsapp")
          .eq("external_id", ctx.to).maybeSingle();
        if (!c) return "No encuentro la ficha de esta persona.";

        // PONER LA ETIQUETA LO HACE LA BASE, no este archivo.
        //
        // Antes se hacía aquí con un conjunto: se añadía la nueva y se dejaban
        // todas las anteriores. Resultado real, visto el 31 ago: un lead quedó
        // como «lead-alto» Y «lead-medio» a la vez, porque la IA lo calificó
        // dos veces según iba sabiendo más. Un embudo donde alguien está en dos
        // niveles a la vez no significa nada.
        //
        // `poner_etiqueta` conoce los GRUPOS: si la etiqueta pertenece a uno
        // —«Calificación»—, quita a sus hermanas y deja solo esta. Las sueltas
        // («vip», «habla inglés») se siguen acumulando, que es lo suyo.
        //
        // Vive en la base porque hay DOS motores y esta regla no puede
        // divergir: la base es una sola.
        const { data: quedaron, error: fallo } = await ctx.db.rpc("poner_etiqueta", {
          p_org_id: ctx.orgId,
          p_contact_id: c.id,
          p_etiqueta: etiqueta,
        });

        if (fallo) {
          // El modelo se inventó una etiqueta. Se le devuelven las que sí
          // existen para que corrija: la IA propone, la base decide.
          const { data: tags } = await ctx.db.from("tags").select("name").eq("org_id", ctx.orgId);
          return `La etiqueta "${etiqueta}" no existe. Las que hay son: ` +
            ((tags ?? []) as any[]).map((t) => t.name).join(", ") + ".";
        }

        contarFuera(ctx.db, ctx.orgId, "lead.datos", {
          telefono: ctx.to, etiqueta, etiquetas: quedaron ?? [etiqueta],
          por_que: args?.por_que ?? null,
          // Queda por escrito en qué se basó. Es lo que permite auditar una
          // calificación después, en vez de discutir de memoria.
          en_que_me_baso: Array.isArray(args?.en_que_me_baso) ? args.en_que_me_baso : [],
          por: "agente_ia",
        });
        return `Listo, quedó etiquetado como "${etiqueta}". No se lo menciones a la persona.`;
      }

      case "guardar_dato": {
        const campo = String(args?.campo ?? "").trim();
        const valor = String(args?.valor ?? "").trim();
        const { data: attr } = await ctx.db
          .from("custom_attributes").select("key").eq("org_id", ctx.orgId).eq("key", campo).maybeSingle();
        if (!attr) {
          const { data: todos } = await ctx.db.from("custom_attributes").select("key").eq("org_id", ctx.orgId);
          return `El campo "${campo}" no existe. Los que hay son: ` +
            ((todos ?? []) as any[]).map((a) => a.key).join(", ") + ".";
        }

        const { data: c } = await ctx.db.from("contacts")
          .select("id, attributes").eq("org_id", ctx.orgId).eq("channel", "whatsapp")
          .eq("external_id", ctx.to).maybeSingle();
        if (!c) return "No encuentro la ficha de esta persona.";

        const cambios: any = { attributes: { ...(c.attributes ?? {}), [campo]: valor } };
        // Y si ese dato tiene casilla propia en la ficha, también ahí.
        const casilla = CASILLA_DE_LA_FICHA[campo.toLowerCase()];
        if (casilla) cambios[casilla] = valor;
        await ctx.db.from("contacts").update(cambios).eq("id", c.id);

        contarFuera(ctx.db, ctx.orgId, "lead.datos", {
          telefono: ctx.to, campo, valor, por: "agente_ia",
        });
        return `Guardado: ${campo} = ${valor}. No se lo menciones a la persona.`;
      }

      case "pasar_a_humano": {
        await ctx.db.from("conversations").update({
          status: "assigned",
          handoff_requested_at: new Date().toISOString(),
          handoff_reason: String(args?.motivo ?? "Lo pidió el agente de IA").slice(0, 200),
        }).eq("id", ctx.convId);

        // EL REPARTO NO SE LLAMA DESDE AQUÍ: lo hace un disparador de la base
        // en cuanto la conversación queda «assigned». Así reparte igual venga
        // del flujo, del atajo «1», de esta herramienta o de la Bandeja — un
        // solo sitio, sin cuatro copias que se desincronizan.
        ctx.finMotivo = "agente";
        ctx.pasoAHumano = true;
        contarFuera(ctx.db, ctx.orgId, "pase.a.humano", {
          telefono: ctx.to, motivo: args?.motivo ?? null, conversacion_id: ctx.convId, por: "agente_ia",
        });
        return "Hecho. Despídete diciendo que en un momento le atiende una persona del equipo.";
      }

      case "consultar_sistema": {
        // LA URL LA PONE EL CLIENTE, NUNCA EL MODELO. Si el modelo pudiera
        // elegir a dónde se llama, bastaría con convencerlo para hacernos
        // pedir cualquier dirección de internet desde nuestros servidores.
        const url = String(ai.sistemaUrl ?? "").trim();
        if (!url) return "No hay ningún sistema configurado.";

        const ctl = new AbortController();
        const reloj = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ consulta: args?.consulta ?? "", telefono: ctx.to }),
            signal: ctl.signal,
          });
          const texto = (await r.text().catch(() => "")).slice(0, 1500);
          if (!r.ok) return `El sistema respondió ${r.status}. Dile que ahora no puedes consultarlo.`;
          return texto || "El sistema no devolvió nada.";
        } catch (e: any) {
          return e?.name === "AbortError"
            ? "El sistema tardó demasiado. Dile que ahora no puedes consultarlo."
            : "No se pudo conectar con el sistema.";
        } finally {
          clearTimeout(reloj);
        }
      }

      default:
        return `No conozco la herramienta "${nombre}".`;
    }
  } catch (e: any) {
    console.error(`[herramienta ${nombre}]`, e);
    return "Hubo un error al ejecutarla. Sigue la conversación sin ella.";
  }
}

/**
 * SI EL BOT PROMETIÓ UNA PERSONA, QUE VENGA UNA PERSONA.
 *
 * El modelo a veces narra la acción en vez de ejecutarla: escribe «un asesor
 * se va a comunicar contigo» y no llama a `pasar_a_humano`. La conversación
 * queda abierta, sin dueño, y nadie se entera. El lead espera a alguien que no
 * va a llegar — y la promesa la hizo el bot EN NOMBRE DEL NEGOCIO.
 *
 * Así que se cumple igual. No es tapar el fallo del modelo: es que una promesa
 * hecha a un cliente no puede depender de que el modelo se acuerde de pulsar
 * el botón.
 *
 * Solo actúa si el cliente activó `pasar_a_humano`: en un bot que no tiene esa
 * acción, el pase no es algo que se pueda hacer.
 */
async function cumplirLoPrometido(ctx: any, texto: string, tools: any[]): Promise<string> {
  if (ctx.pasoAHumano) return texto;
  if (!tools.some((t: any) => t.name === "pasar_a_humano")) return texto;
  if (!prometioUnaPersona(texto)) return texto;

  console.log("[agente] prometió una persona sin llamar a la herramienta; se hace el pase");
  try {
    await ctx.db.from("conversations").update({
      status: "assigned",
      handoff_requested_at: new Date().toISOString(),
      handoff_reason: "El asistente prometió que atendería una persona",
    }).eq("id", ctx.convId);
    ctx.finMotivo = "agente";
    ctx.pasoAHumano = true;
    contarFuera(ctx.db, ctx.orgId, "pase.a.humano", {
      telefono: ctx.to,
      motivo: "el asistente lo prometió en su respuesta",
      conversacion_id: ctx.convId,
      por: "agente_ia",
    });
  } catch (e) {
    // Que falle el pase no puede dejar al cliente sin respuesta.
    console.error("[agente] no pude cumplir la promesa de pase:", e);
  }
  return texto;
}

async function responderConIA(ctx: any, pregunta: string, promptDelNodo?: string) {
  const ai = { ...AI_DEFAULTS, ...(ctx.aiSettings ?? {}) };
  if (promptDelNodo) ai.persona = promptDelNodo;

  // El interruptor «Responder con IA». Mismo comportamiento que el canal web:
  // apagada no se llama a la API, no se gasta y no se registra consumo.
  if (ai.enabled === false) return ai.fallback;

  // El `.trim()` no sobra: una llave pegada con un salto de línea al final se
  // ve idéntica en el panel y falla con 401 sin que nadie entienda por qué.
  const key = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (!key) return ai.fallback;

  // Freno de mano. Normalmente NO hay tope y la IA va incluida — es lo que se
  // vende. Se pone un número solo cuando una cuenta concreta se desborda.
  //
  // AL LLEGAR AL TOPE EL BOT NO SE CALLA: sigue con sus flujos y sus botones y
  // solo deja de pensar respuestas nuevas. Degradar es mejor que cortar — el
  // cliente sigue atendiendo mientras se habla con él para subirlo de plan.
  if (await pasoElTopeDeIA(ctx)) return ai.fallback;

  const kbRows = await buscarConocimiento(ctx.db, ctx.orgId, ctx.botId, pregunta);
  const kb = kbRows.length
    ? kbRows.map((k: any, i: number) => `[${i + 1}] ${k.title}\n${k.content}`).join("\n\n")
    : "(todavía no hay información cargada del negocio)";

  const system = [
    ai.persona,
    `Tono: ${ai.style}`,
    "",
    "INFORMACIÓN DEL NEGOCIO (úsala como única fuente de verdad):",
    kb,
    "",
    "REGLAS:",
    `- Responde en máximo ${ai.maxWords} palabras. Sé breve, es un chat.`,
    "- Usa SOLO la información del negocio de arriba. No inventes precios, horarios, direcciones ni políticas.",
    `- Si la respuesta no está en esa información, responde exactamente: "${ai.fallback}"`,
    "- Responde en el mismo idioma en que te escriba el cliente.",
    "- No menciones que existe una 'información del negocio' ni cites los números entre corchetes.",
    // Igual que en src/lib/ai/answer.ts: WhatsApp no entiende markdown.
    "- Escribe en texto plano. Nada de markdown: sin **negritas**, sin # títulos, sin viñetas con guiones.",
  ].join("\n");

  // Últimos mensajes, para que la IA tenga hilo
  let history: any[] = [];
  try {
    const { data } = await ctx.db.from("messages")
      .select("direction, body").eq("conversation_id", ctx.convId)
      .order("created_at", { ascending: false }).limit(6);
    history = (data ?? []).reverse()
      .filter((m: any) => m.body)
      .map((m: any) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));
  } catch { /* sin historial */ }

  // ── LAS HERRAMIENTAS ──────────────────────────────────────────────────────
  //
  // Si el cliente no activó ninguna, `tools` va vacío y esto se comporta
  // EXACTAMENTE como antes: una sola llamada y devuelve texto. Nadie que no
  // haya pedido un agente nota ninguna diferencia.
  const { tools, contexto } = await armarHerramientas(ctx, ai);

  // DE DÓNDE VIENE LA PERSONA. Que la IA lo sepa cambia la primera frase:
  // quien llega desde un anuncio de casas ya dijo qué quiere, y volver a
  // preguntárselo desde cero es la forma más rápida de perderlo.
  const deCampana = String(ctx.vars?.campana_titular ?? "").trim();
  const notas = [contexto, deCampana
    ? `Esta persona llegó desde el anuncio: "${deCampana}". Tenlo en cuenta, pero NO se lo menciones salvo que venga a cuento.`
    : ""].filter(Boolean).join("\n");

  const sistemaFinal = notas ? `${system}\n\n${notas}` : system;

  // Un modelo puede quedarse pidiendo herramientas en bucle, y esto corre dentro
  // del webhook de Meta —que reintenta si tardamos—. Cuatro vueltas cubren de
  // sobra «mira horarios → agenda → confirma» y cortan cualquier bucle.
  const MAX_VUELTAS = 4;
  const mensajes: any[] = [...history, { role: "user", content: pregunta }];

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const cuerpo: any = {
        // Debe coincidir con src/lib/ai/answer.ts. Si el nombre no existe, la
        // API falla y el bot contesta "esa no me la sé" sin que se note.
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5",
        max_tokens: 400,
        system: sistemaFinal,
        messages: mensajes,
      };
      if (tools.length) cuerpo.tools = tools;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        console.error("[ai]", res.status, (await res.text().catch(() => "")).slice(0, 200));
        return ai.fallback;
      }

      const j = await res.json();
      const bloques = j?.content ?? [];
      const texto = bloques.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n").trim();

      // Cada vuelta cuesta. Se cobra por vuelta, no por respuesta: si no, un
      // agente que llama tres herramientas costaría el triple y se facturaría
      // como uno.
      try {
        await ctx.db.from("usage_events").insert({ org_id: ctx.orgId, bot_id: ctx.botId, kind: "ai_message", quantity: 1 });
      } catch { /* no bloquea la respuesta */ }

      const pedidas = bloques.filter((c: any) => c?.type === "tool_use");
      if (j?.stop_reason !== "tool_use" || !pedidas.length) {
        return await cumplirLoPrometido(ctx, texto, tools) || ai.fallback;
      }

      // Se ejecuta lo que pidió y se le devuelve el resultado para que siga.
      mensajes.push({ role: "assistant", content: bloques });
      const resultados: any[] = [];
      for (const p of pedidas) {
        console.log(`[agente] usa ${p.name}`, JSON.stringify(p.input ?? {}).slice(0, 200));
        const salida = await ejecutarHerramienta(ctx, ai, p.name, p.input ?? {});
        resultados.push({ type: "tool_result", tool_use_id: p.id, content: salida });
      }
      mensajes.push({ role: "user", content: resultados });

      // Si la herramienta pasó la charla a una persona, no hay más que hablar:
      // seguir el ciclo sería que el bot siguiera conversando después de haber
      // dicho que lo atiende alguien.
      if (ctx.pasoAHumano) {
        return texto || "En un momento te atiende una persona del equipo 🙌";
      }
    }

    // Se acabaron las vueltas y el modelo seguía pidiendo herramientas.
    console.error("[agente] se agotaron las vueltas sin una respuesta final");
    return ai.fallback;
  } catch (e) {
    console.error("[ai] red:", e);
    return ai.fallback;
  }
}

// ---- motor ----
function evalRule(rule: any, vars: Record<string, string>) {
  const raw = rule.attribute ? (vars[rule.attribute] ?? "") : "";
  const a = String(raw).toLowerCase();
  const b = String(rule.value ?? "").toLowerCase();
  switch (rule.operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    case "greater_than": return parseFloat(raw) > parseFloat(rule.value);
    case "less_than": return parseFloat(raw) < parseFloat(rule.value);
    case "is_empty": return !raw;
    case "is_not_empty": return !!raw;
    default: return false;
  }
}
function evalCondition(flow: any, node: any, vars: Record<string, string>) {
  for (const br of node.data.conditions ?? []) {
    const results = (br.rules ?? []).map((r: any) => evalRule(r, vars));
    const ok = br.match === "any" ? results.some(Boolean) : results.every(Boolean);
    if (ok) { const e = flow.edges.find((e: any) => e.source === node.id && e.sourceHandle === br.id); if (e) return e.target; }
  }
  const other = flow.edges.find((e: any) => e.source === node.id && e.sourceHandle === "otherwise");
  return other?.target;
}

/**
 * Guarda el mensaje en la Bandeja anotando si WhatsApp lo aceptó.
 * Es importante: antes se guardaba igual aunque Meta lo rechazara, y el equipo
 * veía una conversación que el cliente nunca recibió.
 */
/**
 * Cuenta hacia fuera algo que acaba de pasar, para el CRM del cliente.
 *
 * Solo ENCOLA: entregar y reintentar es cosa del reloj de la base. Aquí no se
 * espera, no se comprueba y no se falla — esto corre en el camino de un mensaje
 * de WhatsApp, y un webhook mal configurado no puede tumbarle la conversación a
 * nadie ni hacerla más lenta.
 *
 * Si el cliente no configuró ninguna salida —el caso de casi todos— la función
 * de la base no inserta nada.
 */
function contarFuera(db: any, orgId: string, tipo: string, datos: Record<string, unknown>) {
  try {
    db.rpc("emitir_evento", { p_org_id: orgId, p_tipo: tipo, p_payload: datos })
      .then(({ error }: any) => {
        if (error) console.error(`[salidas] no pude encolar ${tipo}:`, error.message);
      });
  } catch (e) {
    console.error(`[salidas] fallo al encolar ${tipo}:`, e);
  }
}

async function registrar(ctx: any, body: string, envio: ResultadoEnvio, extra: any = {}) {
  // Todo lo que sale hacia el cliente pasa por aquí. Es el único sitio donde se
  // puede saber, sin dudas, si en este turno el bot abrió la boca — y de eso
  // depende la red de seguridad del final de `handleIncoming`.
  ctx.dijoAlgo = true;
  const payload: any = { ...extra };
  if (!envio.ok) {
    let motivo = envio.error ?? "No se pudo enviar";
    // El 131037 sobre el número de pruebas no es "espera a que te aprueben":
    // es "ese número nunca se va a aprobar, da de alta el tuyo".
    if (envio.code === 131037 && esNumeroDePrueba(ctx.numeroPropio)) {
      motivo =
        "Estás usando el número de pruebas de Meta (+1 555), que no permite aprobar un nombre " +
        "para mostrar. Da de alta tu propio número en Conexión para poder enviar mensajes.";
    }
    payload.no_entregado = { motivo, code: envio.code ?? null };
  }
  await ctx.db.from("messages").insert({
    conversation_id: ctx.convId, org_id: ctx.orgId,
    direction: "outbound", sender: "bot", body, payload,
  });
}

/**
 * Manda un FLUJO DE WHATSAPP (los formularios nativos de Meta dentro del chat).
 *
 * EL BLOQUE EXISTÍA EN EL CONSTRUCTOR Y EL MOTOR NO SABÍA ENVIARLO: caía en el
 * caso por defecto, mandaba el título del bloque como texto plano —«Flujo de
 * WhatsApp: Agendar Demo»— y seguía de largo. El cliente veía una frase rara y
 * ningún formulario.
 *
 * LA PARTE INCÓMODA: Meta exige `flow_action_payload.screen` —el nombre de la
 * primera pantalla— cuando la acción es `navigate`, y eso NO está en el bloque:
 * el constructor solo guarda el id del flujo y el texto del botón. Se descubre
 * preguntándole a Meta por el JSON del flujo, y se guarda en caché: sin la
 * caché serían dos viajes extra a Meta por cada mensaje enviado.
 */
/**
 * El bloque CALENDARIO: ofrece horarios reales y agenda la cita.
 *
 * NO HABLA CON GOOGLE DIRECTAMENTE, y es a propósito. El cálculo de huecos
 * —horario laboral del negocio, zona horaria, lo ya ocupado— vive en la web,
 * en `computeSlots`, y copiarlo aquí en Deno sería tener dos versiones que se
 * separan el día que alguien toque una. El motor le pregunta a la plataforma.
 *
 * ESTE ES EL CAMINO CORTO. El otro —Flujo de WhatsApp + bloque de API contra
 * `/api/v1/agenda`— llega al mismo sitio por fuera, y muchos clientes lo van a
 * preferir porque el formulario nativo de Meta se ve mejor. Los dos usan el
 * mismo motor de agenda: no puede pasar que uno ofrezca una hora que el otro
 * ya dio por ocupada.
 */
async function pedirAgenda(cuerpo: Record<string, any>): Promise<any> {
  const base = Deno.env.get("PLATAFORMA_URL") ?? "https://platform.demandu.tech";
  const llave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ctl = new AbortController();
  const reloj = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${base}/api/motor/agenda`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demandu-motor": llave },
      body: JSON.stringify(cuerpo),
      signal: ctl.signal,
    });
    const crudo = await r.text();
    if (!r.ok) {
      // SE REGISTRA EL PORQUÉ, NO SOLO EL QUÉ. Este bloque estuvo días diciendo
      // «no hay horarios disponibles» cuando la verdad era un 401: el mensaje
      // al cliente es el mismo, pero para arreglarlo son dos mundos distintos.
      console.error(`[agenda] la plataforma respondió ${r.status}: ${crudo.slice(0, 200)}`);
      return { __fallo: `http ${r.status}` };
    }
    try { return JSON.parse(crudo); } catch {
      console.error(`[agenda] respuesta ilegible: ${crudo.slice(0, 200)}`);
      return { __fallo: "respuesta ilegible" };
    }
  } catch (e) {
    console.error("[agenda] no contestó:", e);
    return { __fallo: "sin respuesta" };
  } finally {
    clearTimeout(reloj);
  }
}

async function sayCalendario(ctx: any, node: any) {
  const d = node.data ?? {};
  const r = await pedirAgenda({
    accion: "horarios",
    org_id: ctx.orgId,
    calendario: d.calendarId || undefined,
    duracion: Number(d.durationMin) || 30,
    cuantos: 6,
  });

  const slots = r?.slots ?? [];

  // Sin horarios NO se deja al lead colgado con un «no hay nada»: se pasa a una
  // persona. Puede que Google no esté conectado, que la agenda esté llena o que
  // el horario laboral esté sin configurar — para quien escribe da igual la
  // causa, lo que necesita es que alguien lo atienda.
  if (!slots.length) {
    const porque = r?.__fallo
      ? `la plataforma no respondió bien (${r.__fallo})`
      : r?.conectado === false
      ? "no hay agenda conectada"
      : "no hay horarios libres";
    console.error(`[agenda] sin horarios (${porque}) org=${ctx.orgId}`);
    await say(ctx, d.textoSinHorarios || "Ahora mismo no puedo ver horarios disponibles 😕 Te paso con una persona del equipo.");
    return null; // el bloque de abajo decide; ver el caso en el switch
  }

  // Los horarios se ofrecen como botones, con la etiqueta ya en español que
  // devuelve la plataforma («mié 27 ago, 10:00»). Formatear fechas dentro del
  // motor sería reimplementar lo que la web ya hace bien.
  const botones = slots.slice(0, 3).map((s: any) => ({ id: s.startISO, label: s.label }));
  const envio = await sendButtons(
    ctx.pnid, ctx.token, ctx.to,
    interp(d.text || "Estos son los horarios disponibles para tu cita:", ctx.vars),
    botones,
  );
  await registrar(ctx, d.text || "(horarios de cita)", envio, { slots: botones });
  return { nodeId: node.id, type: "cita" };
}

/**
 * El lead eligió una hora. Se crea la cita y se guarda todo en variables para
 * que el mensaje siguiente pueda decir cuándo quedó y con qué enlace.
 */
async function agendarElegido(ctx: any, node: any, inicioISO: string): Promise<boolean> {
  const d = node.data ?? {};
  const correo = d.attendeeAttr ? ctx.vars[d.attendeeAttr] : undefined;
  const nombre = d.nameAttr ? ctx.vars[d.nameAttr] : ctx.vars.nombre;

  const r = await pedirAgenda({
    accion: "agendar",
    org_id: ctx.orgId,
    inicio: inicioISO,
    duracion: Number(d.durationMin) || 30,
    calendario: d.calendarId || undefined,
    titulo: d.tituloEvento || `Cita con ${nombre ?? "cliente"}`,
    descripcion: d.descripcionEvento || "Cita agendada desde WhatsApp.",
    correo: correo || undefined,
  });

  if (r?.ok) {
    ctx.vars.cita_inicio = r.inicioISO ?? inicioISO;
    ctx.vars.cita_enlace = r.enlace ?? "";
    ctx.vars.cita_ok = "true";
    // Lo que de verdad se pega en un mensaje. La fecha en ISO no la escribe
    // nadie en un WhatsApp; si solo dejamos eso, el mensaje de confirmación
    // sale con los datos en blanco —y una confirmación en blanco es peor que
    // no confirmar—.
    ctx.vars.cita_dia = r.dia ?? "";
    ctx.vars.cita_hora = r.hora ?? "";
    ctx.vars.cita_cuando = r.etiqueta ?? "";
    contarFuera(ctx.db, ctx.orgId, "cita.agendada", {
      telefono: ctx.to,
      nombre: nombre ?? null,
      correo: correo ?? null,
      inicio: r.inicioISO ?? inicioISO,
      dia: r.dia ?? null,
      hora: r.hora ?? null,
      enlace: r.enlace ?? null,
      conversacion_id: ctx.convId,
    });
    return true;
  }

  ctx.vars.cita_ok = "false";
  ctx.vars.cita_error = r?.error ?? "No se pudo agendar.";
  // El motivo se le dice al lead tal cual viene: «ese horario acaba de
  // ocuparse» es accionable, «error 502» no lo es.
  await say(ctx, r?.error || "No pude agendar esa hora 😕 Intentemos con otra.");
  return false;
}

/**
 * PIDE PERMISO PARA LLAMAR.
 *
 * En WhatsApp un negocio NO puede llamar a quien quiera: primero tiene que
 * pedirlo y que la persona acepte. Meta limita las peticiones a una cada 24 h y
 * dos por semana, y si se abusa recorta el número. Por eso esto es un bloque
 * del constructor y no un botón suelto: se pide DENTRO de una conversación, en
 * el momento en que tiene sentido —«¿te llamo para terminar de configurarlo?»—
 * y no en frío.
 *
 * Devuelve si Meta lo aceptó. Si dijo que no, quien llama decide; lo que no se
 * hace es quedarse esperando una respuesta que no va a existir.
 */
async function pedirPermisoDeLlamada(ctx: any, node: any): Promise<boolean> {
  const d = node.data ?? {};
  const cuerpo = interp(
    d.text || "¿Nos autorizas a llamarte por WhatsApp para ayudarte con esto?",
    ctx.vars,
  ).slice(0, 1024);

  const interactive: any = {
    type: "call_permission_request",
    body: { text: cuerpo },
    action: { name: "call_permission_request" },
  };

  const envio = await waPost(ctx.pnid, ctx.token, { to: ctx.to, type: "interactive", interactive });
  await registrar(ctx, `📞 ${cuerpo}`, envio, { permiso_de_llamada: true });
  if (!envio?.ok) console.error("[llamadas] Meta rechazó la petición de permiso:", JSON.stringify(envio));

  // Queda apuntado que se pidió, aunque todavía no haya respuesta: de aquí sale
  // el «no vuelvas a pedirlo hasta mañana».
  if (envio?.ok) {
    try {
      await ctx.db.from("permisos_de_llamada").upsert(
        {
          org_id: ctx.orgId, telefono: ctx.to, estado: "pedido",
          pedido_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,telefono" },
      );
    } catch (e) { console.error("[llamadas] no se pudo apuntar la petición:", e); }
  }

  return !!envio?.ok;
}

/**
 * ETIQUETAR AL CONTACTO.
 *
 * El bloque existía en el constructor desde el principio y el motor NO lo
 * ejecutaba: el cliente etiquetaba «interesado en demo», guardaba, y la ficha
 * del lead seguía igual. Peor que no tener la función, porque el negocio creía
 * que estaba segmentando y filtraba por etiquetas que nunca se pusieron.
 *
 * En el constructor se eligen etiquetas por su id; en la ficha del contacto se
 * guardan por su NOMBRE (así el equipo las lee en la Bandeja sin resolver ids).
 * Aquí se traduce de una cosa a la otra.
 */
async function etiquetar(ctx: any, node: any) {
  const d = node.data ?? {};
  const poner: string[] = d.tagIdsAdd ?? [];
  const quitar: string[] = d.tagIdsRemove ?? [];
  const grupo: string = d.leadGroupId ?? "";
  if (!poner.length && !quitar.length && !grupo) return;

  try {
    const ids = [...poner, ...quitar];
    const { data: filas } = ids.length
      ? await ctx.db.from("tags").select("id, name").in("id", ids).eq("org_id", ctx.orgId)
      : { data: [] };
    const nombre = new Map((filas ?? []).map((t: any) => [t.id, t.name]));

    const { data: contacto } = await ctx.db
      .from("contacts").select("id, tags").eq("org_id", ctx.orgId)
      .eq("channel", "whatsapp").eq("external_id", ctx.to).maybeSingle();
    if (!contacto) return;

    // QUITAR se hace aquí; PONER lo hace la base.
    //
    // `poner_etiqueta` es quien conoce los GRUPOS: si la etiqueta pertenece a
    // uno —«Calificación»—, quita a sus hermanas. Si este bloque las añadiera
    // a mano como antes, un flujo podría dejar a un lead como «alto» y «bajo»
    // a la vez, que es exactamente el problema que arreglamos en la IA. La
    // regla tiene que valer para los DOS caminos, no solo para el agente.
    const actuales = new Set<string>(contacto.tags ?? []);
    for (const id of quitar) { const n = nombre.get(id); if (n) actuales.delete(n); }

    const cambios: any = { tags: [...actuales] };
    // Solo se toca el grupo si el bloque eligió uno. Un bloque que solo pone
    // etiquetas no debe sacar al lead del grupo donde ya estaba.
    if (grupo) cambios.lead_group_id = grupo;

    await ctx.db.from("contacts").update(cambios).eq("id", contacto.id);

    for (const id of poner) {
      const n = nombre.get(id);
      if (!n) continue;
      const { error } = await ctx.db.rpc("poner_etiqueta", {
        p_org_id: ctx.orgId, p_contact_id: contacto.id, p_etiqueta: n,
      });
      if (error) console.error(`[etiquetas] no pude poner "${n}":`, error.message);
    }
  } catch (e) {
    // Etiquetar es importante, pero no tanto como que la conversación siga.
    console.error("[etiquetas] no se pudieron aplicar:", e);
  }
}

/**
 * ACCIÓN / WEBHOOK: avisar a otro sistema y seguir.
 *
 * La diferencia con el bloque de API es intencionada y está escrita en el
 * propio constructor: la API pregunta y ramifica según la respuesta; esto
 * avisa y sigue. Por eso NO se espera el resultado — el cliente que puso este
 * bloque quiere que su CRM se entere, no que la persona en WhatsApp espere a
 * que su CRM conteste.
 */
async function dispararAccion(ctx: any, node: any) {
  const d = node.data ?? {};
  const url = interp(String(d.apiUrl ?? "").trim(), ctx.vars);
  if (!url) {
    console.error("[accion] el bloque no tiene dirección configurada:", node.id);
    return;
  }

  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };
  // Aquí las cabeceras son un JSON escrito a mano en una caja de texto (en el
  // bloque de API son una lista). Si está mal escrito no se rompe la
  // conversación por ello: se manda sin ellas y queda el aviso.
  try {
    const extra = JSON.parse(interp(String(d.apiHeaders ?? "").trim() || "{}", ctx.vars));
    for (const [k, v] of Object.entries(extra)) cabeceras[k] = String(v);
  } catch { console.error("[accion] cabeceras ilegibles en el bloque", node.id); }

  const metodo = String(d.apiMethod ?? "POST").toUpperCase();
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 10000);

  // Sin `await`: se dispara y la conversación sigue. El fallo queda en el
  // registro, no en la cara del cliente.
  fetch(url, {
    method: metodo,
    headers: cabeceras,
    body: metodo === "GET" || metodo === "HEAD" ? undefined : (interp(String(d.apiBody ?? ""), ctx.vars) || "{}"),
    signal: ctl.signal,
  })
    .then((r) => { if (!r.ok) console.error(`[accion] ${url} respondió ${r.status}`); })
    .catch((e) => console.error("[accion] no contestó:", e?.message ?? e));
}

/**
 * ESPERA ANTES DEL SIGUIENTE MENSAJE.
 *
 * Sirve para que el bot no dispare tres mensajes en el mismo segundo, que se
 * lee fatal. Se espera DE VERDAD, pero con tope: esto corre dentro de la
 * petición del webhook de Meta, y una función que se queda dormida un minuto
 * se corta sola y deja la conversación a medias.
 *
 * Minutos y horas necesitan un programador de tareas que retome la
 * conversación más tarde; eso todavía no existe, así que se avisa en el
 * registro en vez de fingir que se esperó.
 */
// 5 s y ni uno más. Meta reenvía el webhook si no le contestamos pronto, y cada
// reenvío es un flujo ejecutado de más. La red de seguridad contra reenvíos ya
// existe (ver 0056), pero no hay que ponérselo a prueba a propósito.
const ESPERA_MAXIMA_MS = 5000;

/**
 * Devuelve `true` si la conversación queda EN PAUSA (se retomará más tarde) y
 * el recorrido debe detenerse aquí.
 */
async function esperarDeVerdad(ctx: any, node: any): Promise<boolean> {
  const d = node.data ?? {};
  const valor = Number(d.delayValue) || 0;
  const unidad = String(d.delayUnit ?? "seconds");
  if (valor <= 0) return false;

  const ms = unidad === "seconds" ? valor * 1000 : unidad === "minutes" ? valor * 60000 : valor * 3600000;

  // Espera corta: se duerme aquí mismo y la conversación sigue de corrido.
  if (ms <= ESPERA_MAXIMA_MS) {
    await new Promise((r) => setTimeout(r, ms));
    return false;
  }

  // Espera larga: NO se puede dormir dentro del webhook. Se apunta dónde
  // seguir y quién la retome será el reloj de la base (ver 0058).
  const siguiente = defaultNext(ctx.flow, node);
  if (!siguiente) {
    console.error(`[espera] el bloque ${node.id} no tiene nada conectado después. No hay nada que retomar.`);
    return false;
  }

  const cuando = new Date(Date.now() + ms).toISOString();
  const { error } = await ctx.db.from("esperas_pendientes").insert({
    org_id: ctx.orgId,
    conversation_id: ctx.convId,
    bot_id: ctx.botId ?? null,
    flow_id: ctx.flowIdNuevo ?? ctx.flowId ?? null,
    nodo_id: siguiente,
    vars: ctx.vars ?? {},
    ejecutar_at: cuando,
  });

  if (error) {
    // Si no se pudo apuntar, se sigue de largo: es preferible un mensaje
    // antes de tiempo a una conversación que se queda muda para siempre.
    console.error("[espera] no pude programarla, sigo sin esperar:", error);
    return false;
  }

  console.log(`[espera] conversación ${ctx.convId} en pausa hasta ${cuando}, seguirá por ${siguiente}`);
  return true;
}

/**
 * PLANTILLA APROBADA.
 *
 * Es la única forma de escribirle a alguien fuera de la ventana de 24 horas.
 * Dentro de la ventana también funciona, y por eso el bloque existe en el
 * constructor: hay negocios que mandan siempre la misma confirmación y
 * prefieren tenerla aprobada.
 *
 * Las variables van por posición ({{1}}, {{2}}…), que es como las pide Meta. En
 * el bloque se escriben una por línea.
 */
async function sayPlantilla(ctx: any, node: any): Promise<boolean> {
  const d = node.data ?? {};
  const nombre = String(d.templateName ?? "").trim();
  if (!nombre) {
    console.error("[plantilla] el bloque no tiene nombre de plantilla:", node.id);
    return false;
  }

  const valores = String(d.text ?? "")
    .split("\n").map((l: string) => interp(l.trim(), ctx.vars)).filter(Boolean);

  const template: any = { name: nombre, language: { code: String(d.templateLang ?? "es_MX") } };
  if (valores.length) {
    template.components = [{
      type: "body",
      parameters: valores.map((v: string) => ({ type: "text", text: v })),
    }];
  }

  const envio = await waPost(ctx.pnid, ctx.token, { to: ctx.to, type: "template", template });
  await registrar(ctx, `📨 Plantilla «${nombre}»${valores.length ? ": " + valores.join(" · ") : ""}`, envio, { plantilla: nombre });
  if (!envio?.ok) console.error("[plantilla] Meta la rechazó:", JSON.stringify(envio));
  return !!envio?.ok;
}

/**
 * CATÁLOGO DE PRODUCTOS.
 *
 * Dos formas, y la diferencia importa: con SKUs se manda una lista de productos
 * concretos (`product_list`, que necesita el id del catálogo); sin SKUs se
 * manda el catálogo entero (`catalog_message`), y ahí Meta usa el catálogo que
 * el número ya tiene conectado.
 */
async function sayCatalogo(ctx: any, node: any): Promise<boolean> {
  const d = node.data ?? {};
  const texto = interp(d.text || "Estos son nuestros productos:", ctx.vars).slice(0, 1024);
  const skus = String(d.products ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean);
  const catalogo = String(d.catalogId ?? "").trim() || String(ctx.catalogId ?? "").trim();

  let interactive: any;
  if (skus.length && catalogo) {
    interactive = {
      type: "product_list",
      header: { type: "text", text: (d.label || "Productos").slice(0, 60) },
      body: { text: texto },
      action: {
        catalog_id: catalogo,
        sections: [{ title: "Disponibles", product_items: skus.map((id: string) => ({ product_retailer_id: id })) }],
      },
    };
  } else {
    interactive = { type: "catalog_message", body: { text: texto }, action: { name: "catalog_message" } };
  }

  const envio = await waPost(ctx.pnid, ctx.token, { to: ctx.to, type: "interactive", interactive });
  await registrar(ctx, texto, envio, { catalogo: catalogo || null, skus });
  if (!envio?.ok) console.error("[catalogo] Meta lo rechazó:", JSON.stringify(envio));
  return !!envio?.ok;
}

/**
 * REDIRIGIR A OTRO BOT.
 *
 * Para qué sirve: un negocio con varios chatbots —ventas, soporte, postventa—
 * quiere que el de ventas pase la conversación al de soporte sin que el
 * cliente tenga que escribir otra cosa.
 *
 * Se carga el flujo de bienvenida del bot destino. Se exige que esté publicado
 * (`is_live`) y encendido: redirigir a un borrador dejaría al cliente en un
 * flujo a medio hacer sin que nadie se entere.
 */
async function flujoDeOtroBot(ctx: any, node: any): Promise<{ id: string; nodes: any[]; edges: any[] } | null> {
  const destino = String(node.data?.targetBotId ?? "").trim();
  if (!destino) return null;

  try {
    const { data: flujos } = await ctx.db
      .from("flows").select("id, graph, trigger_type, enabled, is_live, priority")
      .eq("bot_id", destino).eq("org_id", ctx.orgId);

    const vivos = (flujos ?? []).filter((f: any) => f.enabled !== false && f.is_live !== false);
    const elegido = vivos.find((f: any) => f.trigger_type === "welcome")
      ?? vivos.find((f: any) => f.trigger_type !== "keyword")
      ?? vivos[0];

    const g = elegido?.graph;
    if (!g?.nodes?.length) return null;
    return { id: elegido.id, nodes: g.nodes, edges: g.edges ?? [] };
  } catch (e) {
    console.error("[redirigir] no pude cargar el bot destino:", e);
    return null;
  }
}

async function primeraPantalla(db: any, flowId: string, token: string): Promise<string | null> {
  try {
    const { data: cache } = await db.from("wa_flow_cache").select("screen").eq("flow_id", flowId).maybeSingle();
    if (cache?.screen) return cache.screen;

    const r = await fetch(`${GRAPH}/${flowId}/assets`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    const url = (j?.data ?? []).find((a: any) => a.asset_type === "FLOW_JSON")?.download_url;
    if (!url) return null;

    const def = await (await fetch(url)).json();
    const screen = def?.screens?.[0]?.id ?? null;
    if (screen) await db.from("wa_flow_cache").upsert({ flow_id: flowId, screen }, { onConflict: "flow_id" });
    return screen;
  } catch (e) {
    console.error("[wa flow] pantalla:", e);
    return null;
  }
}

/**
 * Llama a una API de fuera y sigue por la salida que toque.
 *
 * ES EL SEGUNDO BLOQUE QUE EL CONSTRUCTOR OFRECÍA Y EL MOTOR NO SABÍA EJECUTAR
 * (el otro era el Flujo de WhatsApp). Caía en el caso por defecto: mandaba el
 * nombre del bloque como texto —«contacto-demo demandu»— y seguía de largo,
 * así que ni se llamaba a nadie ni se tomaba ninguna de las tres salidas.
 *
 * TRES SALIDAS, Y LA TERCERA NO SOBRA:
 *   · Éxito (2xx) — contestaron y les pareció bien.
 *   · Error (4xx/5xx) — contestaron y algo estaba mal.
 *   · Otros — NO CONTESTARON: se cayó la red, tardaron demasiado, o el bloque
 *     ni siquiera tiene dirección configurada. Es distinto de un error del
 *     servidor y conviene poder atenderlo distinto.
 *
 * Lo que devuelva la API queda en variables (`api_status`, `api_ok` y cada
 * campo de la respuesta si es JSON), para poder usarlo en el mensaje siguiente
 * — por ejemplo, el número de la cita que acaba de crear.
 */
async function llamarApi(ctx: any, node: any): Promise<string | undefined> {
  const d = node.data ?? {};
  const botones = d.buttons ?? [];
  const salida = (prefijo: string) => {
    const b = botones.find((x: any) => String(x.id ?? "").startsWith(prefijo));
    return b ? buttonTarget(ctx.flow, node.id, b) : undefined;
  };

  const url = interp(String(d.apiUrl ?? "").trim(), ctx.vars);

  // Sin dirección no hay nada que llamar. Se va por «Otros» en vez de fingir
  // que salió bien: en el flujo de un cliente esa salida suele llevar a una
  // persona, que es exactamente lo que hace falta si el bloque quedó a medias.
  if (!url) {
    console.error("[api] el bloque no tiene dirección configurada:", node.id);
    ctx.vars.api_ok = "false";
    ctx.vars.api_status = "0";
    ctx.vars.api_error = "El bloque de API no tiene dirección configurada.";
    return salida("other-") ?? salida("err-") ?? defaultNext(ctx.flow, node);
  }

  const metodo = String(d.apiMethod ?? "GET").toUpperCase();
  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };
  for (const h of (d.apiHeaders ?? [])) {
    if (h?.key) cabeceras[String(h.key)] = interp(String(h.value ?? ""), ctx.vars);
  }

  let status = 0;
  let cuerpo = "";
  try {
    const ctl = new AbortController();
    // 15 s y fuera. Detrás hay una persona esperando en WhatsApp: dejar la
    // petición abierta "por si acaso" solo alarga su silencio.
    const reloj = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, {
      method: metodo,
      headers: cabeceras,
      body: metodo === "GET" || metodo === "HEAD" ? undefined : interp(String(d.apiBody ?? ""), ctx.vars) || undefined,
      signal: ctl.signal,
    });
    clearTimeout(reloj);
    status = res.status;
    cuerpo = await res.text().catch(() => "");
  } catch (e: any) {
    console.error("[api] no contestó:", e?.message ?? e);
    ctx.vars.api_ok = "false";
    ctx.vars.api_status = "0";
    ctx.vars.api_error = e?.name === "AbortError" ? "La API tardó demasiado." : "No se pudo conectar con la API.";
    return salida("other-") ?? salida("err-") ?? defaultNext(ctx.flow, node);
  }

  ctx.vars.api_status = String(status);
  ctx.vars.api_ok = status >= 200 && status < 300 ? "true" : "false";

  // Si contestaron con JSON, cada campo pasa a ser una variable del flujo.
  // Se limita a lo de primer nivel: anidar variables con puntos complicaría
  // el editor sin que nadie lo haya pedido.
  try {
    const j = JSON.parse(cuerpo);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      for (const [k, v] of Object.entries(j)) {
        if (v === null || typeof v === "object") continue;
        ctx.vars[`api_${k}`] = String(v);
      }
    }
  } catch { /* no era JSON, no pasa nada */ }

  if (status >= 200 && status < 300) return salida("ok-") ?? defaultNext(ctx.flow, node);
  return salida("err-") ?? salida("other-") ?? defaultNext(ctx.flow, node);
}

async function sayFlujo(ctx: any, node: any): Promise<boolean> {
  const d = node.data ?? {};
  const flowId = String(d.waFlowId ?? "").trim();
  if (!flowId) {
    console.error("[wa flow] el bloque no tiene id de flujo");
    return false;
  }

  const screen = await primeraPantalla(ctx.db, flowId, ctx.token);

  const parametros: any = {
    flow_message_version: "3",
    // Identifica esta apertura concreta: lleva dentro la conversación y el
    // bloque, para reconocer la respuesta cuando el cliente termine.
    flow_token: `${ctx.convId}:${node.id}`,
    flow_id: flowId,
    // Meta rechaza un botón de más de 20 caracteres o con emoji.
    flow_cta: (d.waFlowCta || "Abrir").replace(/[^\p{L}\p{N} .,!?'-]/gu, "").trim().slice(0, 20) || "Abrir",
  };

  // Sin nombre de pantalla no se puede navegar; se pide intercambio de datos,
  // que es lo que usan los flujos con servidor propio. Si el flujo no lo
  // admite, Meta dice por qué y queda en el registro — mejor eso que mandar un
  // texto suelto y aparentar que funcionó.
  if (screen) {
    parametros.flow_action = "navigate";
    parametros.flow_action_payload = { screen };
  } else {
    parametros.flow_action = "data_exchange";
  }

  // UN FORMULARIO SIN PUBLICAR SOLO SE PUEDE MANDAR EN MODO BORRADOR.
  //
  // Meta rechaza con «(#131009) Parameter value is not valid» —un mensaje que
  // no dice nada— cuando el flujo está en DRAFT y se manda como si estuviera
  // publicado. Y así es como está TODO formulario recién hecho: nadie publica
  // antes de probar. El cliente armaba su formulario, lo probaba, no le llegaba
  // nada, y el error no contaba el porqué.
  //
  // Si lo tenemos sincronizado y sabemos que está en borrador, se manda en modo
  // borrador. Solo lo ve quien tiene el número dado de alta en la cuenta de
  // Meta, que es justo quien está probando.
  try {
    const { data: ficha } = await ctx.db
      .from("whatsapp_forms").select("status").eq("meta_flow_id", flowId).maybeSingle();
    if (String(ficha?.status ?? "").toUpperCase() === "DRAFT") parametros.mode = "draft";
  } catch { /* si no lo sabemos, se manda normal */ }

  const interactive: any = {
    type: "flow",
    body: { text: interp(d.waBody || d.text || "Toca el botón de abajo 👇", ctx.vars).slice(0, 1024) },
    action: { name: "flow", parameters: parametros },
  };
  if (d.waFooter) interactive.footer = { text: String(d.waFooter).slice(0, 60) };
  if (d.waHeader) interactive.header = { type: "text", text: String(d.waHeader).slice(0, 60) };

  const envio = await waPost(ctx.pnid, ctx.token, { to: ctx.to, type: "interactive", interactive });
  await registrar(ctx, `📋 ${d.waFlowCta || "Formulario"}`, envio, { flow_id: flowId, screen, modo: parametros.mode ?? "publicado" });
  if (!envio?.ok) console.error("[wa flow] Meta rechazó el envío:", JSON.stringify(envio));
  return !!envio?.ok;
}

async function say(ctx: any, body: string) {
  if (esEjemplo(body)) return; // bloque sin configurar: no molestamos al cliente
  const text = interp(body, ctx.vars);
  if (!text) return;
  const envio = await sendText(ctx.pnid, ctx.token, ctx.to, text);
  await registrar(ctx, text, envio);
}
async function sayButtons(ctx: any, body: string, node: any) {
  let text = interp(body, ctx.vars);
  const hint = ctx.atajos?.hint;
  if (hint?.enabled && hint?.onOptions && hint?.text) text = `${text}\n\n${hint.text}`;
  const buttons = node.data.buttons ?? [];
  const envio = await sendButtons(ctx.pnid, ctx.token, ctx.to, text || "Elige una opción", buttons);
  await registrar(ctx, text || "(opciones)", envio, {
    buttons: buttons.map((b: any) => ({ id: b.id, label: b.label })),
  });
}

async function runFrom(startId: string | undefined, ctx: any) {
  let current = startId; let guard = 0;
  while (current && guard++ < 80) {
    const node = getNode(ctx.flow, current);
    if (!node) {
      // Un salto a un bloque que no existe deja al cliente sin respuesta. Antes
      // se salía de aquí sin decir ni pío y no quedaba ni rastro de por qué.
      console.error(`[flujo] el bloque "${current}" no existe en este flujo. Se corta el recorrido aquí.`);
      break;
    }
    // Analítica: cada bloque que se pisa cuenta como un paso del recorrido.
    ctx.pasos = (ctx.pasos ?? 0) + 1;
    ctx.ultimoNodo = node.id;
    switch (node.type) {
      case "start": {
        // NO SE CONFÍA EN `data.to` A CIEGAS. En el bot «Lana» ese campo
        // apuntaba a un bloque llamado «welcome» que ya no existía: el motor
        // saltaba al vacío y la conversación se moría en silencio. Quien
        // escribía a ese bot no recibía absolutamente nada.
        //
        // Pasa solo con arrastrar y borrar bloques en el constructor, así que
        // le puede haber pasado a cualquiera. Si el destino no existe, se usa
        // la flecha que sale del bloque, que es lo que el cliente ve dibujado.
        const porDato = node.data?.to && getNode(ctx.flow, node.data.to) ? node.data.to : undefined;
        if (node.data?.to && !porDato) {
          console.error(`[flujo] el inicio apunta a un bloque que no existe ("${node.data.to}"). Uso la flecha dibujada.`);
        }
        current = porDato ?? defaultNext(ctx.flow, node);
        break;
      }
      case "question": await say(ctx, node.data.text ?? ""); return { nodeId: node.id, type: "question" };
      case "buttons": await sayButtons(ctx, node.data.text ?? "", node); return { nodeId: node.id, type: "buttons" };
      case "condition": current = evalCondition(ctx.flow, node, ctx.vars); break;
      case "delay": {
        const enPausa = await esperarDeVerdad(ctx, node);
        if (enPausa) {
          // La conversación queda dormida. NO se deja `awaiting`: el bot no
          // está esperando que el cliente diga nada, está esperando al reloj.
          ctx.enPausa = true;
          return null;
        }
        current = defaultNext(ctx.flow, node);
        break;
      }
      case "tags": await etiquetar(ctx, node); current = defaultNext(ctx.flow, node); break;
      case "action": await dispararAccion(ctx, node); current = defaultNext(ctx.flow, node); break;

      case "template": {
        const salio = await sayPlantilla(ctx, node);
        // Si Meta rechaza la plantilla —no aprobada, idioma que no existe,
        // variables que no cuadran— el cliente NO se queda sin nada: se sigue
        // por la salida siguiente, que es lo mismo que hace el resto del motor
        // cuando un envío falla. El porqué queda en el registro.
        if (!salio) console.error("[plantilla] se sigue el flujo sin ella:", node.id);
        current = defaultNext(ctx.flow, node);
        break;
      }

      case "catalog": {
        await sayCatalogo(ctx, node);
        current = defaultNext(ctx.flow, node);
        break;
      }

      case "payment": {
        // QUÉ HACE Y QUÉ NO. Manda el concepto, el monto y el ENLACE DE COBRO
        // que el negocio pegó. No cobra por sí mismo: para eso habría que
        // conectar la cuenta de pasarela de cada cliente, y eso no existe
        // todavía en la plataforma.
        //
        // Es lo que hace hoy la mayoría de los negocios pequeños —un enlace de
        // Stripe o de Mercado Pago que reutilizan— así que sirve de verdad. Lo
        // que no se hace es fingir un cobro que nadie está procesando.
        const d = node.data ?? {};
        const enlace = interp(String(d.paymentUrl ?? "").trim(), ctx.vars);
        const monto = interp(String(d.amount ?? "").trim(), ctx.vars);
        const moneda = String(d.currency ?? "").trim();

        if (!enlace) {
          console.error(`[cobro] el bloque ${node.id} no tiene enlace de cobro configurado. No se manda nada.`);
          current = defaultNext(ctx.flow, node);
          break;
        }

        const concepto = interp(String(d.text ?? "").trim(), ctx.vars);
        const importe = monto ? `\n\nTotal: ${monto}${moneda ? " " + moneda : ""}` : "";
        await say(ctx, `${concepto || "Puedes completar tu pago aquí"}${importe}\n\n${enlace}`);
        current = defaultNext(ctx.flow, node);
        break;
      }

      case "redirect": {
        const otro = await flujoDeOtroBot(ctx, node);
        if (!otro) {
          console.error("[redirigir] no encontré flujo de destino en el bloque", node.id);
          current = defaultNext(ctx.flow, node);
          break;
        }
        // Se cambia el flujo EN CALIENTE y se sigue desde su inicio. El id
        // nuevo se guarda para que el turno siguiente retome donde toca: sin
        // eso, el estado apuntaría a un bloque de un flujo que ya no corre.
        ctx.flow = { nodes: otro.nodes, edges: otro.edges };
        ctx.flowIdNuevo = otro.id;
        current = getStartNode(ctx.flow)?.id;
        break;
      }

      // Multimedia: manda la imagen/video/archivo de verdad, con su texto.
      case "media": {
        const kind = (node.data.mediaType ?? "image") as "image" | "video" | "file";
        const caption = interp(node.data.caption ?? "", ctx.vars);
        if (node.data.mediaUrl) {
          const envio = await sendMedia(ctx, kind, node.data.mediaUrl, caption, node.data.mediaName);
          await registrar(
            ctx,
            caption || `(${kind === "video" ? "video" : kind === "file" ? "archivo" : "imagen"})`,
            envio,
            { media: { type: kind, url: node.data.mediaUrl, name: node.data.mediaName ?? null } },
          );
          // Cinturón además de tirantes: subir el archivo antes ya arregla el
          // orden, pero un respiro corto quita cualquier duda de que el bloque
          // siguiente adelante a la imagen dentro de la cola de Meta.
          if (envio.ok) await new Promise((r) => setTimeout(r, 400));
        } else if (caption) {
          // Sin archivo cargado todavía: al menos mandamos el texto, no un ejemplo.
          await say(ctx, node.data.caption ?? "");
        }
        current = defaultNext(ctx.flow, node);
        break;
      }

      // IA · Lana: responde con la información del negocio y se queda escuchando.
      case "ai": {
        if (!ctx.lastUserText) {
          await say(ctx, node.data.text ?? "");
          return { nodeId: node.id, type: "question" };
        }
        const respuesta = await responderConIA(ctx, ctx.lastUserText, node.data.systemPrompt);
        // Si lo que salió es el mensaje de respaldo, acabamos de OFRECER pasar
        // con una persona. Se apunta para entender el "sí" del turno siguiente.
        const respaldo = { ...AI_DEFAULTS, ...(ctx.aiSettings ?? {}) }.fallback;
        ctx.ofreciAgente = respuesta === respaldo;
        await say(ctx, respuesta);

        // Si el propio agente decidió pasar la charla con una persona, el
        // bloque NO puede quedarse esperando la siguiente pregunta: el
        // siguiente mensaje del cliente es para el humano, no para el bot.
        if (ctx.pasoAHumano) return null;

        return { nodeId: node.id, type: "question" };
      }

      case "human": case "assign":
        await say(ctx, node.data.text ?? "Te comunico con un asesor, un momento 🙌");
        // `handoff_requested_at` NO es decorativo: de él dependen el filtro
        // "Solicitudes" de la Bandeja, el aviso en pantalla y el reparto
        // automático. Sin él, el bot decía "te comunico con un asesor" y NADIE
        // se enteraba: la conversación se quedaba esperando en silencio.
        await ctx.db.from("conversations").update({
          status: "assigned",
          handoff_requested_at: new Date().toISOString(),
          handoff_reason: "El flujo lo mandó con una persona",
        }).eq("id", ctx.convId);

        // Quién la atiende lo decide el disparador de la base al ver
        // «assigned»: primero las reglas por etiqueta del cliente, y si
        // ninguna encaja, el reparto normal (rueda o menos carga).
        ctx.finMotivo = "agente";
        contarFuera(ctx.db, ctx.orgId, "pase.a.humano", {
          telefono: ctx.to,
          nombre: ctx.vars?.nombre ?? null,
          motivo: "el flujo lo mandó con una persona",
          conversacion_id: ctx.convId,
          datos: ctx.vars ?? {},
        });
        return null;
      case "calendar": {
        const espera = await sayCalendario(ctx, node);
        if (espera) return espera;

        // ── NO SE PUDO OFRECER NINGUNA HORA ────────────────────────────
        //
        // ANTES ESTO SEGUÍA POR LA SALIDA NORMAL, y era un error feo: en un
        // flujo real la salida normal es el mensaje de «tu cita ha sido
        // agendada». O sea que el bot decía «te paso con una persona» y acto
        // seguido le confirmaba al cliente una cita que NUNCA EXISTIÓ, con
        // todos los campos vacíos. Dos mentiras seguidas.
        //
        // Después de un fallo no se entra jamás al camino del éxito. Se pasa
        // de verdad con una persona y el flujo se detiene aquí.
        await ctx.db.from("conversations").update({
          status: "assigned",
          handoff_requested_at: new Date().toISOString(),
          handoff_reason: "No se pudieron ofrecer horarios de cita",
        }).eq("id", ctx.convId);
        ctx.finMotivo = "agente";
        return null;
      }

      case "api":
        current = await llamarApi(ctx, node);
        break;

      case "whatsapp_flow": {
        const salio = await sayFlujo(ctx, node);

        // SI EL FORMULARIO NO SALIÓ, NO SE ESPERA UNA RESPUESTA QUE NUNCA VA A
        // LLEGAR. Antes el motor se quedaba esperando el formulario aunque Meta
        // lo hubiera rechazado: al cliente no le llegaba nada, escribiera lo
        // que escribiera el bot no reaccionaba, y la conversación se moría de
        // pie. Pasó de verdad con un formulario que ya no existía en Meta.
        if (!salio) {
          await say(ctx, "No pude abrirte el formulario 😕 Te paso con una persona del equipo.");
          await ctx.db.from("conversations").update({
            status: "assigned",
            handoff_requested_at: new Date().toISOString(),
            handoff_reason: "Meta rechazó el formulario de WhatsApp",
          }).eq("id", ctx.convId);
          ctx.finMotivo = "agente";
          return null;
        }

        // Se queda esperando a que el cliente termine el formulario: el
        // siguiente bloque corre cuando llegue su respuesta.
        return { nodeId: node.id, type: "wa_flow" };
      }

      case "call_permission": {
        const salio = await pedirPermisoDeLlamada(ctx, node);
        if (!salio) {
          // Meta rechaza cuando ya se pidió hace poco (una cada 24 h, dos por
          // semana; contesta 138009). No es un error del cliente ni algo que
          // contarle: se sigue por la salida de «no aceptó» y la conversación
          // continúa.
          //
          // LAS VARIABLES SE PONEN AQUÍ TAMBIÉN, y no es un detalle: si no, se
          // quedan con el valor de la vez anterior. Lo vimos en la prueba — el
          // permiso ni siquiera llegó a pedirse y el mensaje siguiente decía
          // «permiso=si», porque en el intento previo el cliente había
          // aceptado. Una variable vieja miente peor que una vacía.
          ctx.vars.permiso_llamada = "no";
          ctx.vars.permiso_llamada_permanente = "no";
          // Para poder distinguir «dijo que no» de «no se le pudo ni preguntar»:
          // en el primer caso hay que respetar la respuesta, en el segundo se
          // puede volver a intentar mañana.
          ctx.vars.permiso_llamada_motivo = "no_se_pudo_pedir";
          const no = (node.data?.buttons ?? []).find((b: any) => String(b.id ?? "").startsWith("no-"));
          current = (no ? buttonTarget(ctx.flow, node.id, no) : undefined) ?? defaultNext(ctx.flow, node);
          break;
        }
        return { nodeId: node.id, type: "permiso_llamada" };
      }

      case "end":
        if (node.data.text) await say(ctx, node.data.text);
        await ctx.db.from("conversations").update({ status: "closed" }).eq("id", ctx.convId);
        ctx.finMotivo = "completado";
        contarFuera(ctx.db, ctx.orgId, "conversacion.cerrada", {
          telefono: ctx.to,
          nombre: ctx.vars?.nombre ?? null,
          motivo: "completado",
          conversacion_id: ctx.convId,
          datos: ctx.vars ?? {},
        });
        return null;
      // El bloque de texto de toda la vida. Antes no tenía caso propio y
      // funcionaba "de rebote" porque el caso por defecto manda `text`. Ahora
      // es explícito, para que el por defecto pueda dejar de mandar nada.
      case "message":
        if (node.data.text) await say(ctx, node.data.text);
        current = defaultNext(ctx.flow, node);
        break;

      default:
        // UN BLOQUE QUE EL MOTOR NO CONOCE NO LE ESCRIBE AL CLIENTE.
        //
        // Antes el por defecto mandaba `node.data.text`, que en los bloques sin
        // implementar es su NOMBRE. Por eso a un cliente le llegaban cosas como
        // «contacto-demo demandu» o «Flujo de WhatsApp: Agendar Demo»: no era
        // un mensaje, era la etiqueta del bloque escapándose al chat.
        //
        // Y lo peor es que fallaba en silencio: el flujo seguía como si el
        // bloque hubiera hecho su trabajo. Ahora se salta el bloque, se sigue
        // por la salida siguiente y queda un aviso claro en el registro.
        console.error(
          `[flujo] bloque sin implementar en el motor: type="${node.type}" id=${node.id} ` +
          `("${String(node.data?.label ?? "").slice(0, 40)}"). Se salta.`,
        );
        current = defaultNext(ctx.flow, node);
    }
  }
  return null;
}

async function handleIncoming(opts: any) {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}), ...(opts.baseVars ?? {}) };
  const ctx = {
    flow: opts.flow, pnid: opts.pnid, token: opts.token, to: opts.to,
    orgId: opts.orgId, convId: opts.convId, db: opts.db, vars,
    botId: opts.botId, aiSettings: opts.aiSettings ?? null, lastUserText: opts.visible ?? opts.text ?? "",
    atajos: opts.atajos ?? leerAtajos(null),
    numeroPropio: opts.numeroPropio ?? null,
    // Analítica: bloques recorridos en este turno y cómo terminó el recorrido.
    pasos: 0, ultimoNodo: null as string | null, finMotivo: null as string | null,
    // ¿En este turno el bot ofreció pasar con una persona? Lo sabrá el turno
    // siguiente, para entender un "sí" suelto.
    ofreciAgente: false,
    // ¿Salió algo hacia el cliente en este turno? Lo marca `registrar`, por
    // donde pasa todo lo que se envía. Ver la red de seguridad del final.
    dijoAlgo: false,
    // Si un bloque «Redirigir» cambió de bot a mitad del recorrido, aquí queda
    // el id del flujo que se está ejecutando de verdad.
    flowIdNuevo: undefined as string | undefined,
    // ¿La conversación quedó dormida esperando al reloj? No es lo mismo que
    // quedarse muda: aquí SÍ va a seguir sola, más tarde.
    enPausa: false,
    // ¿Una herramienta del agente pasó la charla a una persona? Si sí, el
    // bloque de IA tiene que DETENERSE, no quedarse esperando otra pregunta.
    pasoAHumano: false,
    // El catálogo conectado al número, para el bloque de catálogo sin SKUs.
    catalogId: opts.catalogId ?? null,
    // Qué flujo se está ejecutando. Lo necesita la espera larga para saber por
    // dónde retomar cuando despierte.
    flowId: opts.flowId ?? null,
  };

  // Analítica: el recorrido que venía abierto de turnos anteriores.
  let runId: string | null = opts.flowState?.run_id ?? null;
  const abrirNuevo = () => abrirRecorrido(opts.db, {
    orgId: opts.orgId, conversationId: opts.convId, botId: opts.botId,
    flowId: opts.flowId ?? null, flowName: opts.flowName ?? null, channel: "whatsapp",
  });
  // ── Atajos: lo primero que se revisa, pase lo que pase ──────────────────────
  const dicho = opts.visible ?? opts.text ?? "";
  const atajoDetectado = detectarAtajo(dicho, ctx.atajos);

  // El turno anterior el bot dijo "no sé, ¿te paso con una persona?" y ahora
  // contesta que sí. Sin esto la oferta era humo: el cliente aceptaba, no
  // pasaba nada, y nadie del equipo se enteraba de que lo estaban esperando.
  const aceptoLaOferta =
    !atajoDetectado && !!opts.flowState?.ofreciAgente && esAfirmacion(dicho);

  const atajo: "agent" | "reset" | null = aceptoLaOferta ? "agent" : atajoDetectado;

  if (atajo === "agent") {
    await say(ctx, ctx.atajos.agent.reply);
    await ctx.db.from("conversations").update({
      status: "assigned",
      handoff_requested_at: new Date().toISOString(),
      handoff_reason: aceptoLaOferta
        ? "La IA no supo y el lead aceptó pasar con una persona"
        : "El lead pidió hablar con una persona",
      // NO se fuerza `unread: 1`: lo lleva el disparador de la base al insertar
      // cada mensaje. Ponerlo aquí BAJABA el contador cuando había varios sin
      // leer, y entonces el aviso se perdía — justo lo contrario de lo que se
      // buscaba. (Mismo arreglo que ya tenía el canal web.)
    }).eq("id", opts.convId);
    // Analítica: el recorrido termina aquí, se lo lleva una persona.
    await cerrarRecorrido(opts.db, runId, "agente");
    // Se devuelve el estado sin `awaiting`: el bot deja de conducir la charla.
    return { vars, awaiting: null, atajo: "agent", run_id: null, ofreciAgente: false };
  }
  if (atajo === "reset") {
    await say(ctx, ctx.atajos.reset.reply);
    // Analítica: se cierra el recorrido anterior y empieza uno nuevo, para no
    // contar como "un recorrido larguísimo" lo que en realidad fueron dos.
    await cerrarRecorrido(opts.db, runId, "reiniciado");
    runId = await abrirNuevo();
    const inicio = getStartNode(opts.flow)?.id;
    const nuevo = await runFrom(inicio, ctx);
    if (runId && nuevo === null) {
      await cerrarRecorrido(opts.db, runId, ctx.finMotivo ?? "completado", ctx.pasos, ctx.ultimoNodo);
      runId = null;
    } else {
      await avanzarRecorrido(opts.db, runId, ctx.pasos, ctx.ultimoNodo);
    }
    return { vars, awaiting: nuevo, atajo: "reset", run_id: runId, ofreciAgente: ctx.ofreciAgente };
  }

  const awaiting = opts.flowState?.awaiting;
  let startId: string | undefined;

  // ¿Nos despertó el reloj de una espera larga? Entonces no hay mensaje del
  // cliente que interpretar: se retoma por el bloque exacto donde se dejó.
  if (opts.retomarEn) {
    startId = opts.retomarEn;
  } else if (awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "cita") {
      // El id del botón ES la hora en ISO: así no hay que guardar la lista de
      // horarios en ninguna parte ni preocuparse de que caduque.
      const ok = node ? await agendarElegido(ctx, node, opts.text) : false;
      // Solo se sigue adelante —al mensaje de «cita agendada»— si la cita se
      // creó de verdad. Ver el comentario del bloque `calendar`.
      startId = ok && node ? defaultNext(opts.flow, node) : undefined;
      if (!ok) {
        // Falló al agendar: se vuelven a ofrecer horarios en vez de seguir
        // adelante como si la cita existiera.
        if (node) await sayCalendario(ctx, node);
        await avanzarRecorrido(opts.db, runId, 1, node?.id ?? null);
        return { vars, awaiting: { nodeId: node?.id, type: "cita" }, run_id: runId, ofreciAgente: ctx.ofreciAgente };
      }
    } else if (awaiting.type === "wa_flow") {
      // Cada campo del formulario se guarda como variable del flujo, así se
      // puede usar después en un mensaje, una condición o el CRM. Sin esto,
      // el cliente rellena el formulario y lo que escribió se pierde.
      for (const [k, v] of Object.entries(opts.respuestaFormulario ?? {})) {
        if (k === "flow_token") continue;
        vars[k] = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
      }
      startId = node ? defaultNext(opts.flow, node) : undefined;
    } else if (awaiting.type === "permiso_llamada") {
      const r = opts.permisoLlamada;
      const acepto = String(r?.response ?? "").toLowerCase() === "accept";

      // Disponibles para el resto del flujo: sirven para decir «perfecto, te
      // llamamos en un rato» o para no volver a insistir.
      vars.permiso_llamada = acepto ? "si" : "no";
      vars.permiso_llamada_permanente = r?.is_permanent ? "si" : "no";
      vars.permiso_llamada_motivo = acepto ? "concedido" : "rechazado";

      const salidas = node?.data?.buttons ?? [];
      const b = salidas.find((x: any) => String(x.id ?? "").startsWith(acepto ? "si-" : "no-"));
      startId = (node && b ? buttonTarget(opts.flow, node.id, b) : undefined)
        ?? (node ? defaultNext(opts.flow, node) : undefined);
    } else if (awaiting.type === "question") {
      if (node?.data.variable) vars[node.data.variable] = opts.text;
      // El bloque de IA se queda escuchando: la siguiente pregunta vuelve a él.
      startId = node?.type === "ai" ? node.id : (node ? defaultNext(opts.flow, node) : undefined);
    } else if (awaiting.type === "buttons") {
      const t = opts.text.toLowerCase();
      const btn = (node?.data.buttons ?? []).find((b: any) => b.id === opts.text || (b.label ?? "").toLowerCase() === t);
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : (node ? defaultNext(opts.flow, node) : undefined);

      // Escribió algo que no era ninguna opción y el bloque no tiene salida
      // por defecto: antes el bot se quedaba MUDO y el lead quedaba atorado.
      // Ahora se vuelven a mostrar las opciones.
      if (!btn && !startId && node) {
        await say(ctx, "No entendí esa respuesta 🤔 Elige una de las opciones:");
        await sayButtons(ctx, node.data.text ?? "", node);
        // El recorrido sigue vivo: el lead está atorado en el mismo bloque.
        await avanzarRecorrido(opts.db, runId, 1, node.id);
        return { vars, awaiting: { nodeId: node.id, type: "buttons" }, hintEnviado: opts.flowState?.hintEnviado ?? false, run_id: runId, ofreciAgente: ctx.ofreciAgente };
      }
    }
  } else {
    startId = getStartNode(opts.flow)?.id;
  }
  // Analítica: si vamos a recorrer bloques y no hay recorrido abierto, se abre
  // uno. Cubre el arranque normal y las conversaciones que ya venían a medias
  // desde antes de que existiera esta medición.
  if (startId && !runId) runId = await abrirNuevo();

  let nextAwait = await runFrom(startId, ctx);

  // ── RED DE SEGURIDAD: EL SILENCIO NO ES UNA RESPUESTA ──────────────────────
  //
  // Un cliente escribió y el bot no contestó NADA. Pasa cuando el flujo se
  // queda sin salida: un bloque que el motor todavía no sabe ejecutar y que
  // además no tiene nada conectado después. Lo vimos en vivo — alguien probaba
  // la tienda demo, escribía «ya hice el pedido de prueba», y del otro lado no
  // pasaba absolutamente nada: ni respuesta, ni aviso a un agente, ni la
  // conversación marcada. Ese lead se pierde y nadie se entera nunca.
  //
  // Un flujo mal armado es un problema del cliente que lo armó; dejar a alguien
  // hablándole a una pared es un problema nuestro. Ante la duda, una persona.
  // Se exige `nextAwait === null` a propósito: la red se tiende solo cuando el
  // flujo TERMINÓ sin decir nada. Si el bot sigue esperando una respuesta, está
  // vivo y no hay a quién rescatar.
  // `ctx.enPausa` queda fuera a propósito: ahí el bot no se quedó mudo, se
  // quedó DORMIDO. Rescatar a alguien que está esperando su recordatorio de
  // mañana —pasándolo con un agente— sería justo lo contrario de lo que pidió
  // el flujo.
  if (nextAwait === null && !ctx.dijoAlgo && ctx.finMotivo !== "agente" && !ctx.enPausa) {
    console.error(`[flujo] turno sin respuesta: flujo=${opts.flow?.id ?? "?"} último bloque=${ctx.ultimoNodo ?? "?"}`);
    await say(ctx, "Déjame pasarte con una persona del equipo para seguir por aquí 🙌");
    await opts.db.from("conversations").update({
      status: "assigned",
      handoff_requested_at: new Date().toISOString(),
      handoff_reason: "El flujo se quedó sin salida y el cliente se quedó sin respuesta",
    }).eq("id", opts.convId);
    ctx.finMotivo = "agente";
    nextAwait = null;
  }

  // Analítica: si el bot ya no espera nada, el recorrido terminó. Llegar al
  // final del gráfico sin bloque "Cerrar el flujo" también cuenta como
  // completado: el lead sí recorrió el flujo entero.
  if (runId && nextAwait === null) {
    await cerrarRecorrido(opts.db, runId, ctx.finMotivo ?? "completado", ctx.pasos, ctx.ultimoNodo);
    runId = null;
  } else if (runId) {
    await avanzarRecorrido(opts.db, runId, ctx.pasos, ctx.ultimoNodo);
  }

  // Recordatorio de los atajos: solo la primera vez de la conversación,
  // para no repetirlo en cada mensaje.
  //
  // Y NUNCA JUSTO DESPUÉS DE PASAR CON UNA PERSONA. El bot decía «Bienvenido al
  // chat en vivo de Demandu» y un segundo después «escribe 1 para hablar con
  // una persona»: el cliente ya está esperando a esa persona. Ofrecerle lo que
  // acaba de pedir lo hace dudar de si su solicitud entró.
  const hint = ctx.atajos?.hint;
  const acabaDePasarConAlguien = ctx.finMotivo === "agente";
  if (hint?.enabled && hint?.onStart && hint?.text && !opts.flowState?.hintEnviado && !acabaDePasarConAlguien) {
    await say(ctx, hint.text);
    return { vars, awaiting: nextAwait, hintEnviado: true, run_id: runId, ofreciAgente: ctx.ofreciAgente, flow_id: ctx.flowIdNuevo };
  }
  return { vars, awaiting: nextAwait, hintEnviado: opts.flowState?.hintEnviado ?? false, run_id: runId, ofreciAgente: ctx.ofreciAgente, flow_id: ctx.flowIdNuevo };
}

// ---- selección de flujo por disparador ----
// Prioridad: (1) palabra clave (interrumpe incluso a mitad de conversación),
// (2) continuar el flujo activo, (3) lead que regresa, (4) bienvenida.

/**
 * Los flujos que de verdad pueden atender, en un orden SIEMPRE el mismo.
 *
 * DOS COSAS QUE COSTARON UN BOT MUDO EN PRODUCCIÓN (31 ago):
 *
 * 1. UN FLUJO VACÍO SE TRAGABA EL MENSAJE. Había dos flujos con la palabra
 *    clave «AI»: uno con bloques y otro sin ninguno, creado sin querer un rato
 *    antes. El motor se quedaba con el primero que coincidiera; si le tocaba el
 *    vacío, no había nada que ejecutar y el bot no contestaba nada. Un flujo
 *    sin bloques no puede atender a nadie: no debe ni competir.
 *
 * 2. NO HABÍA ORDEN. La base devuelve las filas en el orden que le apetece, así
 *    que con dos flujos empatados el bot funcionaba unas veces sí y otras no —
 *    la peor clase de fallo, porque quien lo reporta parece que se lo inventa.
 *    Ahora manda la prioridad y, en empate, el más recientemente editado: si
 *    alguien duplica un disparador, gana el que acaba de tocar.
 *
 * El mismo criterio, palabra por palabra, está en `src/lib/flow/webRuntime.ts`.
 * Hay una prueba estática que falla si los dos dejan de coincidir.
 */
function flujosQuePuedenAtender(flows: any[]): any[] {
  return (flows ?? [])
    .filter((f: any) => (f?.graph?.nodes?.length ?? 0) > 0)
    .sort(
      (a: any, b: any) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
    );
}

function chooseFlow(entrantes: any[], text: string, isReturning: boolean, state: any) {
  const flows = flujosQuePuedenAtender(entrantes);
  const t = (text || "").toLowerCase();
  for (const f of flows) {
    if (
      f.trigger_type === "keyword" &&
      Array.isArray(f.keywords) &&
      f.keywords.some((k: string) => k && t.includes(String(k).toLowerCase()))
    ) {
      return f;
    }
  }
  if (state?.awaiting && state?.flow_id) {
    const cur = flows.find((f: any) => f.id === state.flow_id);
    if (cur) return cur;
  }
  if (isReturning) {
    const r = flows.find((f: any) => f.trigger_type === "returning");
    if (r) return r;
  }
  return (
    flows.find((f: any) => f.trigger_type === "welcome") ??
    flows.find((f: any) => f.trigger_type !== "keyword") ??
    flows[0] ??
    null
  );
}

/**
 * DE QUÉ ANUNCIO VIENE ESTA PERSONA.
 *
 * Cuando alguien pulsa un anuncio de «Click to WhatsApp» en Facebook o
 * Instagram, Meta mete un objeto `referral` en el mensaje. Hasta la v36 este
 * motor NI LO MIRABA: se perdía en cada mensaje que entraba, y con él la única
 * forma de saber qué anuncio trae gente que compra.
 *
 * SE GUARDA TAMBIÉN EL OBJETO CRUDO, y esto no es por pereza. Los nombres de
 * los campos de Meta cambian y se añaden con el tiempo; si solo guardáramos
 * los cinco que hoy sabemos leer, el día que Meta añada uno útil lo habríamos
 * estado tirando durante meses sin enterarnos. Lo que se entiende se normaliza
 * para poder consultarlo; lo demás se queda por si acaso.
 */
function origenDelAnuncio(referral: any): any | null {
  if (!referral || typeof referral !== "object") return null;

  const texto = (v: any) => {
    const t = String(v ?? "").trim();
    return t ? t : null;
  };

  const anuncioId = texto(referral.source_id);
  const clid = texto(referral.ctwa_clid);
  // Basta con UNO de los dos, y por un motivo concreto: en los anuncios
  // colocados en Estados de WhatsApp, Meta OMITE `ctwa_clid` por completo
  // (está dicho así en su documentación). Exigir el clid dejaría fuera esa
  // colocación entera sin que nadie entendiera por qué.
  //
  // Sin ninguno de los dos no hay campaña que atribuir: no se guarda nada.
  if (!anuncioId && !clid) return null;

  return {
    tipo: texto(referral.source_type) ?? "ad",
    anuncio_id: anuncioId,
    titular: texto(referral.headline),
    cuerpo: texto(referral.body),
    url: texto(referral.source_url),
    ctwa_clid: clid,
    medio: texto(referral.media_type),
    // El texto que Meta pone ya escrito en el chat cuando alguien pulsa el
    // anuncio. Sirve para no volver a preguntar lo que el anuncio ya dijo.
    saludo: texto(referral.welcome_message?.text),
    imagen: texto(referral.image_url) ?? texto(referral.thumbnail_url),
    canal: "whatsapp",
    visto_en: new Date().toISOString(),
    crudo: referral,
  };
}

function json(o: any) { return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }); }

// ---- estados de entrega (difusiones) ----
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 };
async function handleStatuses(db: any, statuses: any[]) {
  for (const st of statuses) {
    const wamid = st?.id;
    const s = st?.status; // sent | delivered | read | failed
    if (!wamid || !s) continue;
    const tsAt = new Date((Number(st.timestamp) || Date.now() / 1000) * 1000).toISOString();
    if (s === "failed") {
      const err = st?.errors?.[0]?.title ?? st?.errors?.[0]?.message ?? "failed";
      await db.from("campaign_recipients").update({ status: "failed", error: err }).eq("wa_message_id", wamid);
      await db.from("drip_sends").update({ status: "failed", error: err }).eq("wa_message_id", wamid);
      continue;
    }
    if (!(s in STATUS_RANK)) continue;
    const patch: any = { status: s };
    if (s === "sent") patch.sent_at = tsAt;
    if (s === "delivered") patch.delivered_at = tsAt;
    if (s === "read") patch.read_at = tsAt;

    // Difusiones
    const { data: rec } = await db.from("campaign_recipients").select("id,status").eq("wa_message_id", wamid).maybeSingle();
    if (rec && (STATUS_RANK[s] ?? 0) > (STATUS_RANK[rec.status] ?? 0)) {
      await db.from("campaign_recipients").update(patch).eq("id", rec.id);
    }

    // Seguimientos (drips)
    const { data: dsend } = await db.from("drip_sends").select("id,status").eq("wa_message_id", wamid).maybeSingle();
    if (dsend && (STATUS_RANK[s] ?? 0) > (STATUS_RANK[dsend.status] ?? 0)) {
      await db.from("drip_sends").update(patch).eq("id", dsend.id);
    }
  }
}

/**
 * LLAMADAS DE WHATSAPP.
 *
 * Meta avisa de cada llamada por el mismo webhook que los mensajes, en
 * `value.calls`. Aquí NO se contesta ninguna llamada —el audio va por WebRTC y
 * eso necesita un servicio de medios que no tenemos—: se DEJA CONSTANCIA.
 *
 * Y eso no es poca cosa. Sin esto, un cliente llama, nadie contesta, y en la
 * Bandeja no queda ni rastro: el agente ve una conversación que se calló sola
 * y no sabe que del otro lado alguien intentó hablar. Con esto ve «📞 Llamada
 * perdida» en su sitio, entre los mensajes y con su hora.
 *
 * Los eventos que manda Meta son dos: `connect` (empieza) y `terminate`
 * (termina, con `status` y `duration`). Pueden llegar desordenados o repetidos
 * —Meta reintenta—, así que todo se resuelve por `wa_call_id` y nunca se
 * retrocede de estado.
 */
const ESTADO_DE_LLAMADA: Record<string, string> = {
  COMPLETED: "completada",
  REJECTED: "rechazada",
  FAILED: "fallida",
  MISSED: "perdida",
  NO_ANSWER: "perdida",
};

function duracionBonita(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function handleCalls(db: any, value: any) {
  const pnid = value?.metadata?.phone_number_id;
  const { data: cfg } = await db.from("whatsapp_channels").select("org_id, bot_id").eq("phone_number_id", pnid).maybeSingle();
  if (!cfg) return;

  for (const c of (value.calls ?? [])) {
    const callId = String(c?.id ?? "");
    if (!callId) continue;

    // El otro lado de la llamada: si la recibimos, es quien llama; si la
    // hacemos, es a quien llamamos.
    const entrante = String(c?.direction ?? "").toUpperCase() !== "BUSINESS_INITIATED";
    const telefono = String((entrante ? c?.from : c?.to) ?? c?.from ?? "").replace(/^\+/, "");
    if (!telefono) continue;

    const { data: contact } = await db.from("contacts")
      .upsert(
        { org_id: cfg.org_id, channel: "whatsapp", external_id: telefono, phone: telefono, country: paisDesdeTelefono(telefono) },
        { onConflict: "org_id,channel,external_id" },
      )
      .select("id").single();

    // Sin ficha de contacto no se busca conversación: un `.eq("contact_id","")`
    // no devuelve vacío, revienta la consulta entera por uuid inválido.
    const { data: conv } = contact?.id
      ? await db.from("conversations")
          .select("id").eq("org_id", cfg.org_id).eq("contact_id", contact.id).eq("channel", "whatsapp")
          .order("last_message_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null };

    const evento = String(c?.event ?? "").toLowerCase();

    if (evento === "connect") {
      await db.from("llamadas").upsert(
        {
          org_id: cfg.org_id, conversation_id: conv?.id ?? null, contact_id: contact?.id ?? null,
          wa_call_id: callId, telefono,
          direccion: entrante ? "entrante" : "saliente",
          estado: "conectada",
          inicio: c?.timestamp ? new Date(Number(c.timestamp) * 1000 || Date.parse(c.timestamp)).toISOString() : new Date().toISOString(),
          crudo: c,
        },
        { onConflict: "org_id,wa_call_id" },
      );
      continue;
    }

    if (evento !== "terminate") continue;

    const seg = Number(c?.duration ?? 0) || 0;
    const estado = ESTADO_DE_LLAMADA[String(c?.status ?? "").toUpperCase()] ?? (seg > 0 ? "completada" : "perdida");

    await db.from("llamadas").upsert(
      {
        org_id: cfg.org_id, conversation_id: conv?.id ?? null, contact_id: contact?.id ?? null,
        wa_call_id: callId, telefono,
        direccion: entrante ? "entrante" : "saliente",
        estado, fin: new Date().toISOString(), duracion_seg: seg, crudo: c,
      },
      { onConflict: "org_id,wa_call_id" },
    );

    // Y en la conversación, para que el agente lo vea donde mira siempre.
    if (conv?.id) {
      const etiqueta = estado === "completada"
        ? `📞 Llamada ${entrante ? "recibida" : "realizada"} · ${duracionBonita(seg)}`
        : estado === "rechazada" ? `📞 Llamada ${entrante ? "recibida" : "realizada"} · rechazada`
        : estado === "fallida" ? `📞 Llamada ${entrante ? "recibida" : "realizada"} · no se pudo completar`
        : `📞 Llamada ${entrante ? "perdida" : "sin respuesta"}`;

      await db.from("messages").insert({
        conversation_id: conv.id, org_id: cfg.org_id,
        direction: entrante ? "inbound" : "outbound",
        // OJO: el enum de la base es `system`, en inglés, como el resto del
        // esquema. Escribirlo en español hace que PostgREST devuelva un 400 y
        // la llamada se registre en su tabla pero NO aparezca en la Bandeja —
        // que es justo donde el agente la busca.
        sender: "system", body: etiqueta,
        payload: { llamada: { id: callId, estado, duracion_seg: seg, direccion: entrante ? "entrante" : "saliente" } },
      });
    }
  }
}

/**
 * El cliente contestó a la petición de permiso para llamarlo.
 *
 * Hay dos formas de conceder: PERMANENTE (`is_permanent`) o TEMPORAL (con
 * `expiration_timestamp`). Se guardan distinto a propósito: llamar a alguien
 * cuyo permiso caducó es exactamente lo que hace que Meta cierre un número, y
 * «permanente» y «caduca el jueves» no se pueden tratar igual.
 */
async function guardarPermisoDeLlamada(db: any, orgId: string, contactId: string | null, telefono: string, r: any) {
  const acepto = String(r?.response ?? "").toLowerCase() === "accept";
  const permanente = r?.is_permanent === true;
  const expira = r?.expiration_timestamp
    ? new Date(Number(r.expiration_timestamp) * 1000).toISOString()
    : null;

  await db.from("permisos_de_llamada").upsert(
    {
      org_id: orgId, contact_id: contactId, telefono,
      estado: acepto ? "concedido" : "rechazado",
      permanente: acepto && permanente,
      respondido_at: new Date().toISOString(),
      expira_at: acepto && !permanente ? expira : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,telefono" },
  );
}

/**
 * RETOMAR UNA CONVERSACIÓN DORMIDA.
 *
 * Lo llama el reloj de la base cuando vence una espera larga. No lleva ninguna
 * llave de servicio: lleva el TESTIGO de esa espera concreta, de un solo uso.
 * Aunque alguien adivinara la dirección, sin el testigo exacto de una fila
 * pendiente no consigue nada — y con él solo consigue lo que esa espera ya iba
 * a hacer sola un segundo después.
 */
async function retomarEspera(db: any, esperaId: string, testigo: string) {
  const { data: e } = await db.from("esperas_pendientes").select("*").eq("id", esperaId).maybeSingle();
  if (!e) return json({ ok: true, motivo: "no existe" });
  if (String(e.testigo) !== String(testigo)) {
    console.error("[espera] testigo que no cuadra para", esperaId);
    return json({ ok: false }, 403);
  }
  if (e.estado === "hecha" || e.estado === "cancelada" || e.estado === "caducada") {
    return json({ ok: true, motivo: e.estado });
  }

  const cerrar = async (estado: string, detalle?: string) => {
    await db.from("esperas_pendientes")
      .update({ estado, detalle: detalle ?? null, updated_at: new Date().toISOString() })
      .eq("id", esperaId);
  };

  const { data: conv } = await db.from("conversations")
    .select("id, org_id, bot_id, status, contact_id, flow_state").eq("id", e.conversation_id).maybeSingle();
  if (!conv) { await cerrar("cancelada", "la conversación ya no existe"); return json({ ok: true }); }

  // Si mientras dormía la tomó una persona, el bot no se mete.
  if (conv.status === "assigned") {
    await cerrar("cancelada", "la conversación la está atendiendo una persona");
    return json({ ok: true });
  }

  const { data: contacto } = await db.from("contacts").select("phone, external_id, name, wa_name").eq("id", conv.contact_id).maybeSingle();
  const telefono = contacto?.external_id ?? contacto?.phone;
  if (!telefono) { await cerrar("fallida", "el contacto no tiene teléfono"); return json({ ok: true }); }

  // ── LA VENTANA DE 24 HORAS ──────────────────────────────────────────────
  //
  // Esto es lo que hace que una espera larga sea distinta de una corta: cuando
  // el reloj vence pueden haber pasado horas, y fuera de la ventana WhatsApp
  // NO deja escribir salvo con plantilla. Mandarlo igual sería quemar el
  // intento y dejar en la Bandeja un mensaje que nunca llegó.
  const { data: ultimo } = await db.from("messages")
    .select("created_at").eq("conversation_id", conv.id).eq("direction", "inbound")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const horas = ultimo?.created_at
    ? (Date.now() - Date.parse(ultimo.created_at)) / 3600_000
    : 999;

  if (horas >= 24) {
    await cerrar("caducada", "venció la ventana de 24 h de WhatsApp: solo se podría escribir con plantilla");
    console.error(`[espera] ${esperaId} caducada: ${Math.round(horas)} h desde el último mensaje del lead`);
    return json({ ok: true, caducada: true });
  }

  const { data: cfg } = await db.from("whatsapp_channels").select("*").eq("org_id", conv.org_id).maybeSingle();
  if (!cfg) { await cerrar("fallida", "la cuenta ya no tiene WhatsApp conectado"); return json({ ok: true }); }

  const { data: flujo } = await db.from("flows").select("id, graph").eq("id", e.flow_id).maybeSingle();
  const g = flujo?.graph;
  if (!g?.nodes?.length) { await cerrar("fallida", "el flujo ya no existe"); return json({ ok: true }); }

  const { data: botRow } = conv.bot_id
    ? await db.from("bots").select("ai, shortcuts").eq("id", conv.bot_id).maybeSingle()
    : { data: null };

  // Se marca HECHA antes de mandar nada: si el envío falla a medias, es mejor
  // no volver a intentarlo y repetirle los mensajes al cliente.
  await cerrar("hecha");

  const nuevo = await handleIncoming({
    flow: { nodes: g.nodes, edges: g.edges ?? [] },
    pnid: cfg.phone_number_id, token: cfg.access_token, to: telefono,
    orgId: conv.org_id, convId: conv.id, db,
    flowState: { vars: e.vars ?? {}, hintEnviado: (conv.flow_state as any)?.hintEnviado ?? true },
    // Sin texto del cliente: no hay mensaje nuevo, es el reloj quien despierta.
    text: "", visible: "",
    botId: conv.bot_id, aiSettings: (botRow as any)?.ai ?? null,
    baseVars: e.vars ?? {}, atajos: leerAtajos((botRow as any)?.shortcuts),
    flowId: e.flow_id, numeroPropio: cfg.display_number ?? null,
    catalogId: cfg.catalog_id ?? null,
    // La clave: se retoma por el bloque apuntado, no por el principio.
    retomarEn: e.nodo_id,
  });

  await db.from("conversations")
    .update({ flow_state: { ...nuevo, flow_id: nuevo.flow_id ?? e.flow_id } })
    .eq("id", conv.id);

  return json({ ok: true, retomada: true });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Comprobación de versión: no expone nada, solo dice qué código corre.
    if (url.searchParams.has("version")) return json({ version: VERSION_MOTOR });
    // Diagnóstico de la IA. Detrás del token del webhook: no es para clientes.
    if (url.searchParams.get("diag") === VERIFY_TOKEN) return json(await diagnosticoIA());
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return json({ ok: true }); }

    // El reloj de la base viene a despertar una conversación dormida.
    if (url.searchParams.has("continuar")) {
      try {
        return await retomarEspera(admin(), String(body?.espera ?? ""), String(body?.testigo ?? ""));
      } catch (e) {
        console.error("[espera] falló al retomar:", e);
        return json({ ok: false }, 500);
      }
    }

    try {
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // 1) Estados de entrega de difusiones (sent/delivered/read/failed)
      const statuses = value?.statuses;
      if (Array.isArray(statuses) && statuses.length) {
        await handleStatuses(admin(), statuses);
        return json({ ok: true });
      }

      // 2) Llamadas (empezó / terminó). Van por su propio camino: no son
      //    mensajes y no deben mover el flujo del chatbot.
      if (Array.isArray(value?.calls) && value.calls.length) {
        await handleCalls(admin(), value);
        return json({ ok: true });
      }

      // 3) Mensaje entrante
      const msg = value?.messages?.[0];
      if (!msg) return json({ ok: true });
      const pnid = value?.metadata?.phone_number_id;
      const from = msg.from;
      const name = value?.contacts?.[0]?.profile?.name ?? null;
      // Dos lecturas del mismo mensaje:
      //  · `text`    → lo que usa el motor para saber qué botón se tocó (el id).
      //  · `visible` → lo que LEE una persona en la bandeja (el texto del botón).
      // Antes se guardaba el id, y en el chat aparecían códigos raros.
      // La respuesta de un Flujo de WhatsApp llega como `nfm_reply`, con los
      // campos del formulario dentro de `response_json` (una CADENA, no un
      // objeto: hay que interpretarla).
      let respuestaDeFormulario: Record<string, any> | null = null;
      if (msg.interactive?.type === "nfm_reply") {
        try {
          const crudo = msg.interactive?.nfm_reply?.response_json;
          respuestaDeFormulario = typeof crudo === "string" ? JSON.parse(crudo) : (crudo ?? null);
        } catch (e) {
          console.error("[wa flow] respuesta ilegible:", e);
        }
      }

      // Respuesta a la petición de permiso para llamar. Llega como un
      // interactivo más, pero no es una opción del menú: es un permiso, y de él
      // depende que llamar sea legal o sea el camino a que Meta cierre el
      // número. Por eso se reconoce aparte y se guarda antes de tocar el flujo.
      // Meta lo manda en el primer mensaje después de pulsar el anuncio. Se
      // mira SIEMPRE, no solo en el primero: si algún día lo repite en los
      // siguientes, mejor tenerlo dos veces que perderlo una.
      const origen = origenDelAnuncio(msg.referral);

      const permisoLlamada = msg.interactive?.type === "call_permission_reply"
        ? (msg.interactive?.call_permission_reply ?? null)
        : null;

      // OJO CON EL ORDEN Y CON `??`: los dos últimos casos van en UNA sola
      // expresión a propósito. Encadenarlos con `??` no funcionaría — el primero
      // devolvería "" (que no es null) y el segundo no llegaría a evaluarse
      // nunca, dejando los formularios sin reconocer.
      const text = msg.text?.body
        ?? msg.interactive?.button_reply?.id
        ?? msg.interactive?.list_reply?.id
        ?? msg.button?.text
        ?? (permisoLlamada ? "__permiso_llamada__" : respuestaDeFormulario ? "__formulario__" : "");
      const etiquetaAdjunto =
        msg.type === "image" ? "📷 Imagen"
        : msg.type === "video" ? "🎥 Video"
        : msg.type === "audio" ? "🎤 Audio"
        : msg.type === "document" ? "📎 Archivo"
        : msg.type === "location" ? "📍 Ubicación"
        : msg.type === "sticker" ? "🩷 Sticker"
        : "";
      const visible =
        msg.text?.body ??
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        (permisoLlamada
          ? (String(permisoLlamada.response ?? "").toLowerCase() === "accept"
              ? (permisoLlamada.is_permanent
                  ? "📞 Autorizó que le llamemos (sin caducidad)"
                  : "📞 Autorizó que le llamemos")
              : "📞 No autorizó que le llamemos")
          : undefined) ??
        // Lo que ve el agente en la Bandeja: lo que el cliente respondió, no
        // un "__formulario__" que no le dice nada a nadie.
        (respuestaDeFormulario
          ? "📋 Formulario completado:\n" +
            Object.entries(respuestaDeFormulario)
              .filter(([k]) => k !== "flow_token")
              .map(([k, v]) => `· ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join("\n")
          : undefined) ??
        msg.button?.text ??
        (etiquetaAdjunto || text);
      const db = admin();
      // ── ¿YA HABÍAMOS VISTO ESTE MENSAJE? ────────────────────────────────
      //
      // Meta REENVÍA el webhook si no le contestamos rápido, y cada reenvío
      // volvía a correr el flujo entero: mensajes repetidos al cliente, la cita
      // agendada dos veces, el webhook del negocio disparado dos veces y la
      // bolsa de mensajes cobrada dos veces. Lo vi en vivo probando el bloque
      // de acción.
      //
      // La comprobación es el propio INSERT: la clave primaria decide. Dos
      // reenvíos simultáneos no pueden ganar los dos, y no hay hueco entre
      // «miro si existe» y «lo escribo» por donde se cuele el segundo.
      if (msg.id) {
        const { error: repetido } = await db.from("mensajes_vistos").insert({ wa_message_id: msg.id });
        if (repetido) {
          // 23505 = clave duplicada: es un reenvío, ya lo atendimos.
          if ((repetido as any).code === "23505") return json({ ok: true, repetido: true });
          // Cualquier otro fallo NO puede dejar al cliente sin respuesta: se
          // sigue. Es mejor arriesgarse a un duplicado que a un silencio.
          console.error("[reenvios] no pude anotar el mensaje:", repetido);
        }
      }

      const { data: cfg } = await db.from("whatsapp_channels").select("*").eq("phone_number_id", pnid).maybeSingle();
      if (!cfg) return json({ ok: true });

      // Atribuir respuesta a una difusión o seguimiento reciente ("quién respondió")
      const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      const repliedPatch = { status: "replied", replied_at: new Date().toISOString() };
      try {
        await db.from("campaign_recipients").update(repliedPatch)
          .eq("org_id", cfg.org_id).eq("phone", from)
          .in("status", ["sent", "delivered", "read"]).gte("created_at", since);
      } catch { /* best-effort */ }
      try {
        await db.from("drip_sends").update(repliedPatch)
          .eq("org_id", cfg.org_id).eq("phone", from)
          .in("status", ["sent", "delivered", "read"]).gte("created_at", since);
      } catch { /* best-effort */ }

      // El nombre de WhatsApp se guarda aparte (wa_name) para NO pisar el nombre
      // que el agente haya escrito a mano en la ficha del lead.
      const { data: contact } = await db.from("contacts")
        .upsert(
          { org_id: cfg.org_id, channel: "whatsapp", external_id: from, phone: from, wa_name: name, country: paisDesdeTelefono(from) },
          { onConflict: "org_id,channel,external_id" },
        )
        .select("id, name, created_at").single();
      // Si todavía no tiene nombre propio, estrenamos con el de WhatsApp.
      if (contact && !contact.name && name) {
        await db.from("contacts").update({ name }).eq("id", contact.id);
      }

      // ¿Es la primera vez que esta persona escribe? El `upsert` no dice si
      // insertó o actualizó, así que se mira la fecha de alta: si la ficha
      // nació hace un instante, es nueva. Un margen de 10 s cubre de sobra lo
      // que tarda esta misma petición y no puede confundir a un lead de ayer.
      if (contact?.created_at && Date.now() - Date.parse(contact.created_at) < 10_000) {
        contarFuera(db, cfg.org_id, "lead.nuevo", {
          telefono: from,
          nombre: name ?? null,
          canal: "whatsapp",
          primer_mensaje: visible ?? text ?? "",
          contacto_id: contact.id,
          // Lo que hace que este lead se pueda atribuir a una campaña en el
          // CRM del cliente. Va en el mismo evento a propósito: un lead que
          // llega sin su origen ya no se puede atribuir después.
          origen: origen ?? null,
        });
      }

      // El permiso se guarda AQUÍ y no dentro del flujo, a propósito: vale
      // aunque la conversación esté con un agente, aunque el flujo se haya
      // cambiado o borrado, y aunque nadie llegue a preguntar por él. Es un
      // permiso de la persona, no un paso de un chatbot.
      if (permisoLlamada) {
        try {
          await guardarPermisoDeLlamada(db, cfg.org_id, contact?.id ?? null, from, permisoLlamada);
        } catch (e) { console.error("[llamadas] no se pudo guardar el permiso:", e); }
      }
      const nuevaConversacion = async () => {
        const ins = await db.from("conversations")
          .insert({ org_id: cfg.org_id, contact_id: contact.id, bot_id: cfg.bot_id, channel: "whatsapp", status: "open", flow_state: {} })
          .select("id, flow_state, status, last_message_at").single();
        return ins.data;
      };

      let { data: conv } = await db.from("conversations").select("id, flow_state, status, last_message_at").eq("org_id", cfg.org_id).eq("contact_id", contact.id).eq("channel", "whatsapp").order("last_message_at", { ascending: false }).limit(1).maybeSingle();

      // ── PASADAS 24 HORAS, LA CONVERSACIÓN SE CIERRA Y EMPIEZA OTRA ─────
      //
      // Antes se reanudaba donde se quedó. Quien escribió el martes y volvía
      // el viernes retomaba la pregunta del martes: si el martes había llegado
      // a un nodo de IA, el viernes le contestaba la IA a un «Hola» y su
      // bienvenida —con su imagen y sus botones— no se veía nunca más. Parecía
      // un chatbot roto y era un chatbot obedeciendo.
      //
      // El corte son 24 horas porque es la ventana de WhatsApp: pasada esa,
      // Meta ya lo considera otra conversación y al negocio solo le deja
      // escribir primero con una plantilla. Si Meta lo trata como nuevo,
      // nosotros también.
      //
      // SE CIERRA DE VERDAD, no se le vacía el estado. Así queda un hilo
      // cerrado en la Bandeja con su historia completa y nace otro limpio, que
      // es lo que un agente espera ver — y lo que hace que la analítica cuente
      // dos conversaciones y no una eterna.
      //
      // NO se cierra si la lleva una persona (`assigned`): un caso humano en
      // curso no es un flujo aparcado, y cortarlo le quitaría el hilo al agente
      // justo cuando el cliente vuelve. Al escribir el cliente se abre otra
      // ventana de 24 h y el agente puede seguir contestando.
      const VENTANA_MS = 24 * 60 * 60 * 1000;
      const ultimo = conv?.last_message_at ? Date.parse(conv.last_message_at as string) : 0;
      const dormidaDeMas = ultimo > 0 && Date.now() - ultimo > VENTANA_MS;

      if (conv && conv.status === "open" && dormidaDeMas) {
        // El recorrido abierto se cierra como abandonado: si se dejara vivo,
        // quedaría contado como "en curso" para siempre y la analítica de
        // embudos mentiría.
        await cerrarRecorrido(db, (conv.flow_state as any)?.run_id ?? null, "abandonado");
        await db.from("conversations").update({ status: "closed" }).eq("id", conv.id);
        conv = null;
      }

      if (!conv || conv.status === "closed") {
        conv = await nuevaConversacion();
      }
      await db.from("messages").insert({ conversation_id: conv.id, org_id: cfg.org_id, direction: "inbound", sender: "contact", body: visible });
      await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
      // Ajustes del chatbot: personalidad de la IA y atajos (0 / 1, etc.)
      const { data: botRow } = cfg.bot_id
        ? await db.from("bots").select("ai, shortcuts").eq("id", cfg.bot_id).maybeSingle()
        : { data: null };
      const atajos = leerAtajos((botRow as any)?.shortcuts);

      // Si la conversación ya la lleva una persona, el bot se calla —
      // PERO "reiniciar" sigue funcionando: es la salida del lead si se atoró.
      const atajoAhora = detectarAtajo(visible, atajos);
      const tomadaPorPersona = conv.status === "assigned";
      if (tomadaPorPersona && atajoAhora === "reset") {
        await db.from("conversations")
          .update({ status: "open", handoff_requested_at: null, handoff_reason: null })
          .eq("id", conv.id);
        conv.status = "open";
        // Analítica: al vaciar el estado se perdería el recorrido abierto y
        // quedaría contado como abandonado para siempre. Se cierra antes.
        await cerrarRecorrido(db, (conv.flow_state as any)?.run_id ?? null, "reiniciado");
        conv.flow_state = {};
      }

      // EL LEAD ESCRIBIÓ MIENTRAS LA CONVERSACIÓN DORMÍA.
      //
      // Retomar la espera ahora sería hablarle de algo que ya pasó: la charla
      // siguió por otro lado. Se cancela lo programado y se atiende lo que
      // acaba de decir, que es lo que cualquiera esperaría.
      try {
        await db.rpc("cancelar_esperas_de", { p_conversation_id: conv.id });
      } catch (e) { console.error("[espera] no pude cancelar las pendientes:", e); }

      // ── DE QUÉ ANUNCIO VINO ──────────────────────────────────────────────
      //
      // Se guarda AQUÍ, fuera del flujo, por lo mismo que el permiso de
      // llamada: es un dato de la persona, no un paso de un chatbot. Vale
      // aunque la conversación la lleve un agente, aunque el flujo se haya
      // borrado y aunque nadie llegue a preguntar por él.
      //
      // La base decide qué se pisa y qué no: el primer toque del contacto no
      // se sobrescribe nunca; el de la conversación sí, porque una segunda
      // venta meses después es de la segunda campaña.
      let origenPrimero: any = null;
      if (origen) {
        try {
          const { data } = await db.rpc("guardar_origen", {
            p_org_id: cfg.org_id,
            p_contact_id: contact.id,
            p_conversation_id: conv.id,
            p_origen: origen,
          });
          origenPrimero = data ?? origen;
          console.log(`[campaña] lead desde ${origen.tipo} ${origen.anuncio_id ?? "(sin id)"}`);
        } catch (e) {
          // Nunca bloquea la conversación: un fallo de atribución no puede
          // dejar a un cliente sin respuesta.
          console.error("[campaña] no pude guardar el origen:", e);
        }
      }

      if (cfg.bot_id && (conv.status !== "assigned")) {
        // ¿Lead que regresa? (tiene más de una conversación con nosotros)
        const { count: convCount } = await db
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id);
        const isReturning = (convCount ?? 1) > 1;

        // Variables listas para usar en cualquier mensaje: {{whatsappName}}, {{nombre}}, {{telefono}}…
        const nombre = (name ?? "").trim();
        // De qué campaña viene, para poder escribirlo en un mensaje
        // —«vi que vienes de nuestra promo de X»— o ramificar por ello.
        // El del contacto (primer toque) manda: es el que no cambia.
        const campana = origenPrimero ?? origen ?? null;

        const baseVars: Record<string, string> = {
          whatsappName: nombre,
          nombre,
          name: nombre,
          campana_titular: campana?.titular ?? "",
          campana_id: campana?.anuncio_id ?? "",
          campana_tipo: campana?.tipo ?? "",
          campana_url: campana?.url ?? "",
          primerNombre: nombre.split(/\s+/)[0] ?? "",
          firstName: nombre.split(/\s+/)[0] ?? "",
          telefono: from,
          phone: from,
        };

        // Todos los flujos habilitados del bot y elegir por disparador
        const { data: flowRows } = await db
          .from("flows")
          // `priority` y `updated_at` NO son adorno: son lo que hace que, con dos
          // flujos que responden al mismo disparador, gane siempre el mismo.
          .select("id, name, graph, trigger_type, keywords, enabled, priority, updated_at")
          .eq("bot_id", cfg.bot_id);
        const flows = (flowRows ?? []).filter((f: any) => f.enabled !== false);
        const state = conv.flow_state ?? {};
        const chosen = chooseFlow(flows, visible, isReturning, state);

        if (chosen) {
          const graph = chosen.graph ?? { nodes: [], edges: [] };
          const flow = { nodes: graph.nodes ?? [], edges: graph.edges ?? [] };
          if (flow.nodes.length) {
            // Si cambiamos de flujo, ese flujo arranca desde el inicio (sin arrastrar awaiting)
            // Al cambiar de flujo se arranca de cero, pero el recordatorio ya
            // enviado no se vuelve a mandar.
            // Analítica: si un disparador movió la charla a otro flujo, el
            // recorrido anterior no quedó abandonado: cambió.
            const mismoFlujo = state.flow_id === chosen.id;
            if (!mismoFlujo && state.run_id) await cerrarRecorrido(db, state.run_id, "cambio");

            const flowState = mismoFlujo ? state : { vars: state.vars ?? {}, hintEnviado: state.hintEnviado };
            const newState = await handleIncoming({
              flow, pnid, token: cfg.access_token, to: from,
              orgId: cfg.org_id, convId: conv.id, db, flowState, text, visible,
              respuestaFormulario: respuestaDeFormulario,
              permisoLlamada,
              catalogId: cfg.catalog_id ?? null,
              botId: cfg.bot_id, aiSettings: (botRow as any)?.ai ?? null, baseVars, atajos,
              flowId: chosen.id, flowName: chosen.name ?? null,
              numeroPropio: cfg.display_number ?? null,
            });
            // OJO CON EL ORDEN: si el flujo se redirigió a otro bot a mitad
            // de camino, el id bueno es el que devuelve el motor, no el que se
            // eligió al entrar. Escribir el viejo dejaría el estado apuntando a
            // un bloque de un flujo que ya no se está ejecutando, y el turno
            // siguiente no encontraría dónde retomar.
            await db.from("conversations")
              .update({ flow_state: { ...newState, flow_id: newState.flow_id ?? chosen.id } })
              .eq("id", conv.id);
          }
        }
      }
    } catch (e) {
      console.error("[whatsapp webhook]", e);
    }
    return json({ ok: true });
  }

  return new Response("ok");
});
