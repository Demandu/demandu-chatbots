/**
 * Respuesta con IA usando la información del negocio (Bot Training).
 *
 * Diseño a prueba de fallos: si no hay llave de IA configurada, o la API
 * falla, NUNCA revienta la conversación — devuelve el mensaje de respaldo
 * que el cliente configuró. El chat sigue vivo pase lo que pase.
 *
 * La búsqueda de conocimiento usa full-text search en español de Postgres,
 * así que funciona sin depender de ningún servicio de embeddings.
 */

import { embedQuery } from "./ingest";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";

export type AiSettings = {
  enabled?: boolean;
  persona?: string;
  style?: string;
  fallback?: string;
  maxWords?: number;
};

export const AI_DEFAULTS: Required<AiSettings> = {
  enabled: false,
  persona: "Eres Lana, la asistente virtual del negocio. Ayudas a los clientes con amabilidad y vas al grano.",
  style: "Cercano y profesional. Tutea al cliente.",
  fallback: "Esa no me la sé todavía 🙈 ¿Quieres que te comunique con una persona del equipo?",
  maxWords: 80,
};

/** ¿Está configurada la IA a nivel plataforma? (sin exponer la llave) */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Trae los fragmentos de conocimiento más relevantes para la pregunta.
 * Estrategia en cascada:
 *   1) Búsqueda por SIGNIFICADO (embeddings) — entiende sinónimos y frases.
 *   2) Búsqueda por PALABRAS CLAVE (full-text español) — sin llaves externas.
 *   3) Los primeros fragmentos, para que al menos haya contexto.
 */
export async function findKnowledge(
  admin: any,
  botId: string,
  question: string,
  limit = 5,
): Promise<{ title: string; content: string }[]> {
  const q = (question ?? "").trim();
  if (!q) return [];

  // 1) Por significado
  try {
    const vector = await embedQuery(q);
    if (vector) {
      const { data, error } = await admin.rpc("match_bot_knowledge", {
        p_bot_id: botId,
        p_embedding: vector,
        p_limit: limit,
      });
      if (!error && data?.length) {
        return (data as any[]).map((d) => ({ title: d.title, content: d.content }));
      }
    }
  } catch {
    /* seguimos a palabras clave */
  }

  // 2) Por palabras clave
  try {
    const { data, error } = await admin
      .from("bot_knowledge")
      .select("title, content")
      .eq("bot_id", botId)
      .eq("enabled", true)
      .textSearch("search", q, { type: "websearch", config: "spanish" })
      .limit(limit);

    if (!error && data?.length) return data;
  } catch {
    /* seguimos al respaldo */
  }

  // Respaldo: si la búsqueda por relevancia no encontró nada, mandamos
  // los primeros fragmentos para que la IA al menos tenga contexto.
  try {
    const { data } = await admin
      .from("bot_knowledge")
      .select("title, content")
      .eq("bot_id", botId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
}

function buildSystem(ai: Required<AiSettings>, knowledge: { title: string; content: string }[]) {
  const kb = knowledge.length
    ? knowledge.map((k, i) => `[${i + 1}] ${k.title}\n${k.content}`).join("\n\n")
    : "(todavía no hay información cargada del negocio)";

  return [
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
  ].join("\n");
}

/**
 * Genera la respuesta. Devuelve el texto que el bot debe enviar.
 * Nunca lanza excepción.
 */
export async function aiAnswer(opts: {
  admin: any;
  botId: string;
  question: string;
  settings?: AiSettings | null;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const ai: Required<AiSettings> = { ...AI_DEFAULTS, ...(opts.settings ?? {}) };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("[ai] ANTHROPIC_API_KEY no configurada — usando respuesta de respaldo");
    return ai.fallback;
  }

  const knowledge = await findKnowledge(opts.admin, opts.botId, opts.question);

  const messages = [
    ...(opts.history ?? []).slice(-6),
    { role: "user" as const, content: opts.question },
  ];

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 400,
        system: buildSystem(ai, knowledge),
        messages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[ai] error de la API:", res.status, detail.slice(0, 200));
      return ai.fallback;
    }

    const j = await res.json();
    const text = (j?.content ?? [])
      .filter((c: any) => c?.type === "text")
      .map((c: any) => c.text)
      .join("\n")
      .trim();

    return text || ai.fallback;
  } catch (e: any) {
    console.error("[ai] fallo de red:", e?.message ?? e);
    return ai.fallback;
  }
}
