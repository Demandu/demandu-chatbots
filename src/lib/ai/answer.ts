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
import { armarHerramientas, ejecutarHerramienta, cumplirLoPrometido, type ContextoAgente } from "./herramientas";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * Modelo por defecto. Se puede cambiar sin tocar código con ANTHROPIC_MODEL.
 *
 * OJO AL CAMBIARLO: si el nombre no existe, la API devuelve error y el bot
 * contesta el mensaje de respaldo ("esa no me la sé") — se ve idéntico a que
 * la IA no supiera. Pasó con `claude-3-5-haiku-latest`, que quedó retirado.
 * El mismo nombre vive también en la función de WhatsApp (supabase/functions).
 */
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

export type AiSettings = {
  enabled?: boolean;
  persona?: string;
  style?: string;
  fallback?: string;
  maxWords?: number;

  // ── EL AGENTE ──────────────────────────────────────────────────────────────
  // Qué puede HACER además de hablar. Vacío = solo conversa, exactamente como
  // se comportaba antes de que existieran las herramientas.
  herramientas?: string[];
  /** Cuándo etiquetar, cuándo calificar, cuándo pasar con alguien. Lo escribe el cliente. */
  criterios?: string;
  sistemaUrl?: string;
  sistemaDescripcion?: string;
};

export const AI_DEFAULTS: Required<AiSettings> = {
  // ENCENDIDA salvo que el cliente la apague a propósito. Un chatbot nuevo
  // nace con un bloque "Respuesta con IA" en su flujo de bienvenida; si el
  // valor por defecto fuera `false`, ese bloque estaría muerto el primer día
  // y el cliente pensaría que la plataforma no sirve.
  enabled: true,
  persona: "Eres Lana, la asistente virtual del negocio. Ayudas a los clientes con amabilidad y vas al grano.",
  style: "Cercano y profesional. Tutea al cliente.",
  fallback: "Esa no me la sé todavía 🙈 ¿Quieres que te comunique con una persona del equipo?",
  maxWords: 80,
  // Sin herramientas por defecto: un chatbot que nadie configuró como agente
  // solo debe conversar. Encender esto por defecto sería que un bot empezara a
  // etiquetar contactos y a agendar citas sin que su dueño lo pidiera.
  herramientas: [],
  criterios: "",
  sistemaUrl: "",
  sistemaDescripcion: "",
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
  orgId: string,
  limit = 5,
): Promise<{ title: string; content: string }[]> {
  const q = (question ?? "").trim();
  // AISLAMIENTO: sin organización Y chatbot no se busca nada. Nunca.
  if (!q || !botId || !orgId) return [];

  // 1) Por significado
  try {
    const vector = await embedQuery(q);
    if (vector) {
      const { data, error } = await admin.rpc("match_bot_knowledge", {
        p_org_id: orgId,
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

  // 2) Por palabras, ordenado por relevancia (ver la migración 0054).
  //
  // La versión anterior pedía que TODAS las palabras de la pregunta cayeran en
  // el mismo fragmento —una pregunta de verdad casi nunca cumple eso—, no
  // encontraba nada, y un respaldo mandaba «los 5 primeros fragmentos» sin
  // relación con lo preguntado. Con contexto que no viene al caso, un modelo no
  // se calla: rellena. Ese respaldo se quitó a propósito.
  try {
    const { data, error } = await admin.rpc("buscar_conocimiento", {
      p_org_id: orgId,
      p_bot_id: botId,
      p_pregunta: q,
      p_limit: limit,
    });
    if (!error && data?.length) {
      return (data as any[]).map((d) => ({ title: d.title, content: d.content }));
    }
  } catch {
    /* sin contexto */
  }

  // Sin nada parecido a la pregunta se devuelve vacío: la IA dirá que no lo
  // sabe y ofrecerá una persona, que es la respuesta honesta.
  return [];
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
    // El widget y WhatsApp muestran texto plano: los asteriscos de markdown
    // salen literales y se ven como un error. Mejor pedirlo que limpiarlo.
    "- Escribe en texto plano. Nada de markdown: sin **negritas**, sin # títulos, sin viñetas con guiones.",
  ].join("\n");
}

/**
 * Genera la respuesta. Devuelve el texto que el bot debe enviar.
 * Nunca lanza excepción.
 */
export async function aiAnswer(opts: {
  admin: any;
  botId: string;
  orgId: string;
  question: string;
  settings?: AiSettings | null;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Las pruebas desde el panel no se cobran: pasan `logUsage: false`. */
  logUsage?: boolean;
  /**
   * Solo para la prueba del panel, que ve el dueño del negocio.
   * Cuando la API falla, en vez del mensaje de respaldo devuelve el motivo
   * real. Sin esto, una llave vencida o un modelo retirado se ven exactamente
   * igual que "no tengo esa información" y nadie se entera de que está roto.
   * NUNCA se activa en una conversación con un cliente.
   */
  diagnostico?: boolean;
  /**
   * La conversación real, para que el agente pueda ACTUAR: agendar, etiquetar,
   * guardar datos, pasar con una persona.
   *
   * Sin esto —la prueba del panel, por ejemplo— el agente solo conversa aunque
   * el cliente tenga herramientas activadas. Es a propósito: una herramienta
   * escribe en la ficha de alguien, y una prueba no debe dejar rastro en los
   * datos del negocio.
   */
  agente?: ContextoAgente;
}): Promise<string> {
  const ai: Required<AiSettings> = { ...AI_DEFAULTS, ...(opts.settings ?? {}) };

  // EL INTERRUPTOR, y este es el único lugar donde se revisa. Todo lo que
  // consume IA pasa por aquí — el bloque "Respuesta con IA" del flujo, el
  // desvío cuando el cliente se sale del guion, y la prueba del panel — así
  // que un solo `if` cubre los dos canales sin poder desincronizarse.
  //
  // Apagada NO se llama a la API: no se gasta ni se registra consumo. Ese es
  // el punto — antes el interruptor se guardaba pero nadie lo leía, y un
  // cliente que la apagaba seguía gastando IA sin saberlo.
  if (ai.enabled === false) {
    return opts.diagnostico
      ? "⚠️ La IA está apagada para este chatbot. Enciéndela con el interruptor «Responder con IA»."
      : ai.fallback;
  }

  /* ── ¿SU PLAN INCLUYE LA IA? ─────────────────────────────────────────
   *
   * VA AQUÍ Y NO EN LA PANTALLA. Una pantalla apagada no impide nada: la
   * acción se puede llamar por debajo. El freno tiene que estar donde se gasta
   * el dinero, que es la línea de abajo.
   *
   * Y VA DESPUÉS DEL INTERRUPTOR DEL CHATBOT, antes de la llave: son dos «no»
   * distintos y el de más arriba manda.
   *
   * LO PREGUNTA LA BASE. Junta el plan, los complementos contratados y lo que
   * la cuenta conserva por encima de su plan; calcularlo aquí sería tenerlo
   * escrito dos veces y acabar con la pantalla diciendo una cosa y el motor
   * haciendo otra.
   *
   * AL NO TENERLA, EL BOT NO SE CALLA: sigue con sus flujos y sus botones y
   * solo deja de pensar respuestas nuevas. Degradar es mejor que cortar.
   */
  if (!(await orgConIA(opts.admin, opts.orgId))) {
    return opts.diagnostico
      ? "⚠️ Tu plan no incluye Lana IA. Puedes activarla desde Configuración → Mi plan."
      : ai.fallback;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("[ai] ANTHROPIC_API_KEY no configurada — usando respuesta de respaldo");
    return opts.diagnostico ? "⚠️ Falta configurar la llave de IA en el servidor." : ai.fallback;
  }

  // El conocimiento SIEMPRE se acota a la organización y al chatbot.
  const knowledge = await findKnowledge(opts.admin, opts.botId, opts.question, opts.orgId);

  const messages: any[] = [
    ...(opts.history ?? []).slice(-6),
    { role: "user" as const, content: opts.question },
  ];

  // ── LAS HERRAMIENTAS ────────────────────────────────────────────────────────
  //
  // Si el cliente no activó ninguna —o si no hay conversación real donde
  // actuar— `tools` va vacío y esto se comporta EXACTAMENTE como antes: una
  // llamada y devuelve texto. Nadie que no haya pedido un agente nota nada.
  const { tools, contexto } = opts.agente
    ? await armarHerramientas(opts.agente, ai)
    : { tools: [] as any[], contexto: "" };
  const system = contexto
    ? `${buildSystem(ai, knowledge)}\n\n${contexto}`
    : buildSystem(ai, knowledge);

  // Un modelo puede quedarse pidiendo herramientas en bucle. Cuatro vueltas
  // cubren de sobra «mira horarios → agenda → confirma» y cortan el bucle.
  // El mismo número que en el motor de WhatsApp.
  const MAX_VUELTAS = 4;

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const cuerpo: any = {
        model: DEFAULT_MODEL,
        max_tokens: 400,
        system,
        messages,
      };
      if (tools.length) cuerpo.tools = tools;

      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(cuerpo),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[ai] error de la API:", res.status, detail.slice(0, 200));
        return opts.diagnostico ? explicarFallo(res.status, detail) : ai.fallback;
      }

      const j = await res.json();
      const bloques = (j?.content ?? []) as any[];
      const text = bloques
        .filter((c: any) => c?.type === "text")
        .map((c: any) => c.text)
        .join("\n")
        .trim();

      // Registra el consumo de IA para el panel y la facturación.
      // SE COBRA POR VUELTA, no por respuesta: si no, un agente que llama tres
      // herramientas costaría el triple y se facturaría como uno.
      // Best-effort: si falla, la conversación no se ve afectada.
      if (opts.logUsage !== false) {
        try {
          await opts.admin.from("usage_events").insert({
            org_id: opts.orgId,
            bot_id: opts.botId,
            kind: "ai_message",
            quantity: 1,
          });
        } catch { /* no bloquea la respuesta */ }
      }

      const pedidas = bloques.filter((c: any) => c?.type === "tool_use");
      if (j?.stop_reason !== "tool_use" || !pedidas.length || !opts.agente) {
        // Si prometió una persona y no la llamó, se cumple igual.
        if (opts.agente) await cumplirLoPrometido(opts.agente, text, tools);
        return text || ai.fallback;
      }

      // Se ejecuta lo que pidió y se le devuelve el resultado para que siga.
      messages.push({ role: "assistant", content: bloques });
      const resultados: any[] = [];
      for (const p of pedidas) {
        console.log(`[agente] usa ${p.name}`, JSON.stringify(p.input ?? {}).slice(0, 200));
        resultados.push({
          type: "tool_result",
          tool_use_id: p.id,
          content: await ejecutarHerramienta(opts.agente, ai, p.name, p.input ?? {}),
        });
      }
      messages.push({ role: "user", content: resultados });

      // Si la herramienta pasó la charla a una persona, no hay más que hablar.
      if (opts.agente.pasoAHumano) {
        return text || "En un momento te atiende una persona del equipo 🙌";
      }
    }

    console.error("[agente] se agotaron las vueltas sin una respuesta final");
    return ai.fallback;
  } catch (e: any) {
    console.error("[ai] fallo de red:", e?.message ?? e);
    return opts.diagnostico
      ? "⚠️ No se pudo conectar con el servicio de IA. Vuelve a intentar en un minuto."
      : ai.fallback;
  }
}

/**
 * Traduce el error de la API a algo que el dueño del negocio pueda accionar.
 * Solo se muestra en la prueba del panel, nunca a un cliente final.
 */
function explicarFallo(status: number, detail: string): string {
  const d = (detail ?? "").toLowerCase();
  if (status === 401 || status === 403) {
    return "⚠️ La llave de IA no es válida o fue revocada. Genera una nueva y vuelve a guardarla.";
  }
  if (status === 400 && (d.includes("model") || d.includes("not_found"))) {
    return "⚠️ El modelo de IA configurado ya no existe. Hay que actualizarlo (variable ANTHROPIC_MODEL).";
  }
  if (status === 404) {
    return "⚠️ El modelo de IA configurado ya no existe. Hay que actualizarlo (variable ANTHROPIC_MODEL).";
  }
  if (status === 429) {
    return "⚠️ Se alcanzó el límite de la cuenta de IA. Revisa el saldo o espera unos minutos.";
  }
  if (status >= 500) {
    return "⚠️ El servicio de IA está fallando ahora mismo. No es tu configuración; intenta más tarde.";
  }
  return `⚠️ La IA respondió con un error (${status}). Revisa la configuración de la llave.`;
}

/**
 * ¿La cuenta tiene la IA encendida por su plan, un complemento o por conservarla?
 *
 * ANTE LA DUDA, SÍ. Es al revés que en las pantallas, y es deliberado: si la
 * base no contesta, dejar sin respuesta al cliente de un negocio que SÍ paga la
 * IA es mucho peor que unos centavos de más. El freno existe para el que no la
 * compró, no para castigar un mal minuto de la base.
 */
async function orgConIA(admin: any, orgId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("org_puede", { p_org_id: orgId, p_clave: "ia" });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
