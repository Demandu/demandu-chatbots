import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "demandu_wa_2026";
const GRAPH = "https://graph.facebook.com/v20.0";

/**
 * Sube este número al tocar el archivo. Sirve para comprobar que lo que corre
 * en producción es lo mismo que está en el repo (`GET ?version`).
 */
const VERSION_MOTOR = "22";

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

  // 2) Por palabras clave (español)
  try {
    const { data, error } = await db.from("bot_knowledge")
      .select("title, content").eq("org_id", orgId).eq("bot_id", botId).eq("enabled", true)
      .textSearch("search", q, { type: "websearch", config: "spanish" }).limit(limit);
    if (!error && data?.length) return data;
  } catch { /* seguimos al respaldo */ }

  // 3) Respaldo: los primeros fragmentos, para que haya algo de contexto
  try {
    const { data } = await db.from("bot_knowledge")
      .select("title, content").eq("org_id", orgId).eq("bot_id", botId).eq("enabled", true)
      .order("created_at", { ascending: true }).limit(limit);
    return data ?? [];
  } catch { return []; }
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

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        // Debe coincidir con src/lib/ai/answer.ts. Si el nombre no existe, la
        // API falla y el bot contesta "esa no me la sé" sin que se note.
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5",
        max_tokens: 400,
        system,
        messages: [...history, { role: "user", content: pregunta }],
      }),
    });
    if (!res.ok) {
      console.error("[ai]", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return ai.fallback;
    }
    const j = await res.json();
    const text = (j?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n").trim();
    if (text) {
      // Registra el consumo para el panel y la facturación (best-effort).
      try {
        await ctx.db.from("usage_events").insert({ org_id: ctx.orgId, bot_id: ctx.botId, kind: "ai_message", quantity: 1 });
      } catch { /* no bloquea la respuesta */ }
    }
    return text || ai.fallback;
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
async function registrar(ctx: any, body: string, envio: ResultadoEnvio, extra: any = {}) {
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
    return await r.json();
  } catch (e) {
    console.error("[agenda] no contestó:", e);
    return null;
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
    const porque = r?.conectado === false
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
    return true;
  }

  ctx.vars.cita_ok = "false";
  ctx.vars.cita_error = r?.error ?? "No se pudo agendar.";
  // El motivo se le dice al lead tal cual viene: «ese horario acaba de
  // ocuparse» es accionable, «error 502» no lo es.
  await say(ctx, r?.error || "No pude agendar esa hora 😕 Intentemos con otra.");
  return false;
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

async function sayFlujo(ctx: any, node: any) {
  const d = node.data ?? {};
  const flowId = String(d.waFlowId ?? "").trim();
  if (!flowId) {
    console.error("[wa flow] el bloque no tiene id de flujo");
    return;
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

  const interactive: any = {
    type: "flow",
    body: { text: interp(d.waBody || d.text || "Toca el botón de abajo 👇", ctx.vars).slice(0, 1024) },
    action: { name: "flow", parameters: parametros },
  };
  if (d.waFooter) interactive.footer = { text: String(d.waFooter).slice(0, 60) };
  if (d.waHeader) interactive.header = { type: "text", text: String(d.waHeader).slice(0, 60) };

  const envio = await waPost(ctx.pnid, ctx.token, { to: ctx.to, type: "interactive", interactive });
  await registrar(ctx, `📋 ${d.waFlowCta || "Formulario"}`, envio, { flow_id: flowId, screen });
  if (!envio?.ok) console.error("[wa flow] Meta rechazó el envío:", JSON.stringify(envio));
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
    if (!node) break;
    // Analítica: cada bloque que se pisa cuenta como un paso del recorrido.
    ctx.pasos = (ctx.pasos ?? 0) + 1;
    ctx.ultimoNodo = node.id;
    switch (node.type) {
      case "start": current = node.data.to ?? defaultNext(ctx.flow, node); break;
      case "question": await say(ctx, node.data.text ?? ""); return { nodeId: node.id, type: "question" };
      case "buttons": await sayButtons(ctx, node.data.text ?? "", node); return { nodeId: node.id, type: "buttons" };
      case "condition": current = evalCondition(ctx.flow, node, ctx.vars); break;
      case "delay": current = defaultNext(ctx.flow, node); break;

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
        ctx.finMotivo = "agente";
        return null;
      case "calendar": {
        const espera = await sayCalendario(ctx, node);
        if (espera) return espera;
        // No había horarios: se sigue por la salida del bloque, que en un flujo
        // bien armado lleva a una persona.
        current = defaultNext(ctx.flow, node);
        break;
      }

      case "api":
        current = await llamarApi(ctx, node);
        break;

      case "whatsapp_flow":
        await sayFlujo(ctx, node);
        // Se queda esperando a que el cliente termine el formulario: el
        // siguiente bloque corre cuando llegue su respuesta.
        return { nodeId: node.id, type: "wa_flow" };

      case "end":
        if (node.data.text) await say(ctx, node.data.text);
        await ctx.db.from("conversations").update({ status: "closed" }).eq("id", ctx.convId);
        ctx.finMotivo = "completado";
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
  if (awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "cita") {
      // El id del botón ES la hora en ISO: así no hay que guardar la lista de
      // horarios en ninguna parte ni preocuparse de que caduque.
      const ok = node ? await agendarElegido(ctx, node, opts.text) : false;
      startId = node ? defaultNext(opts.flow, node) : undefined;
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

  const nextAwait = await runFrom(startId, ctx);

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
  const hint = ctx.atajos?.hint;
  if (hint?.enabled && hint?.onStart && hint?.text && !opts.flowState?.hintEnviado) {
    await say(ctx, hint.text);
    return { vars, awaiting: nextAwait, hintEnviado: true, run_id: runId, ofreciAgente: ctx.ofreciAgente };
  }
  return { vars, awaiting: nextAwait, hintEnviado: opts.flowState?.hintEnviado ?? false, run_id: runId, ofreciAgente: ctx.ofreciAgente };
}

// ---- selección de flujo por disparador ----
// Prioridad: (1) palabra clave (interrumpe incluso a mitad de conversación),
// (2) continuar el flujo activo, (3) lead que regresa, (4) bienvenida.
function chooseFlow(flows: any[], text: string, isReturning: boolean, state: any) {
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
    try {
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // 1) Estados de entrega de difusiones (sent/delivered/read/failed)
      const statuses = value?.statuses;
      if (Array.isArray(statuses) && statuses.length) {
        await handleStatuses(admin(), statuses);
        return json({ ok: true });
      }

      // 2) Mensaje entrante
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

      const text = msg.text?.body ?? msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? msg.button?.text ?? (respuestaDeFormulario ? "__formulario__" : "");
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
        .select("id, name").single();
      // Si todavía no tiene nombre propio, estrenamos con el de WhatsApp.
      if (contact && !contact.name && name) {
        await db.from("contacts").update({ name }).eq("id", contact.id);
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

      if (cfg.bot_id && (conv.status !== "assigned")) {
        // ¿Lead que regresa? (tiene más de una conversación con nosotros)
        const { count: convCount } = await db
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id);
        const isReturning = (convCount ?? 1) > 1;

        // Variables listas para usar en cualquier mensaje: {{whatsappName}}, {{nombre}}, {{telefono}}…
        const nombre = (name ?? "").trim();
        const baseVars: Record<string, string> = {
          whatsappName: nombre,
          nombre,
          name: nombre,
          primerNombre: nombre.split(/\s+/)[0] ?? "",
          firstName: nombre.split(/\s+/)[0] ?? "",
          telefono: from,
          phone: from,
        };

        // Todos los flujos habilitados del bot y elegir por disparador
        const { data: flowRows } = await db
          .from("flows")
          .select("id, name, graph, trigger_type, keywords, enabled")
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
              botId: cfg.bot_id, aiSettings: (botRow as any)?.ai ?? null, baseVars, atajos,
              flowId: chosen.id, flowName: chosen.name ?? null,
              numeroPropio: cfg.display_number ?? null,
            });
            await db.from("conversations").update({ flow_state: { ...newState, flow_id: chosen.id } }).eq("id", conv.id);
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
