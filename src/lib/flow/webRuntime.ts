import { getNode, getStartNode, defaultNext, buttonTarget } from "./engine";
import type { Flow, DemanduNode, ConditionRule, FlowButton } from "./types";
import { aiAnswer, type AiSettings } from "@/lib/ai/answer";
import { detectarAtajo, leerAtajos, type Atajos } from "./shortcuts";
import { abrirRecorrido, avanzarRecorrido, cerrarRecorrido, type MotivoFin } from "./flowRuns";
import { decidirDesvio, puenteDeVuelta, type MotivoDesvio } from "./desvio";

/**
 * Motor de conversación para canales que NO envían por una API externa
 * (hoy: el widget del sitio web). En vez de mandar el mensaje, lo va
 * acumulando y lo devuelve para que el widget lo pinte. Guarda todo en la
 * Bandeja igual que WhatsApp, así el equipo ve y contesta desde un solo lugar.
 */

export type OutMsg = { text: string; buttons?: { id: string; label: string }[] };
type Awaiting = { nodeId: string; type: "question" | "buttons" } | null;

interface Ctx {
  flow: Flow;
  orgId: string;
  conversationId: string;
  admin: any;
  vars: Record<string, string>;
  out: OutMsg[];
  botId: string;
  aiSettings: AiSettings | null;
  lastUserText: string;
  /** Analítica: bloques recorridos en este turno y cómo terminó el recorrido. */
  pasos: number;
  ultimoNodo: string | null;
  finMotivo: MotivoFin | null;
}

function interp(t: string | undefined, vars: Record<string, string>) {
  const out = (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
  // Si una variable vino vacía, no dejamos "¡Hola ! ..." ni dobles espacios.
  // (Mismo tratamiento que en el motor de WhatsApp.)
  return out
    .replace(/([,;:])\s*([!?.…])/g, "$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?…])/g, "$1")
    .trim();
}

/**
 * Textos de ejemplo que el constructor deja al soltar un bloque nuevo.
 * Si un bloque todavía los tiene, es que no se configuró: no se envían.
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

function push(ctx: Ctx, text: string, buttons?: FlowButton[]) {
  if (esEjemplo(text) && !(buttons ?? []).length) return;
  const body = interp(text, ctx.vars);
  const opts = (buttons ?? []).map((b) => ({ id: b.id, label: b.label ?? "Opción" }));
  if (!body && !opts.length) return;
  ctx.out.push(opts.length ? { text: body || "Elige una opción", buttons: opts } : { text: body });
}

function evalRule(rule: ConditionRule, vars: Record<string, string>): boolean {
  const raw = rule.attribute ? vars[rule.attribute] ?? "" : "";
  const a = String(raw).toLowerCase();
  const b = String(rule.value ?? "").toLowerCase();
  switch (rule.operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    case "greater_than": return parseFloat(raw) > parseFloat(rule.value ?? "");
    case "less_than": return parseFloat(raw) < parseFloat(rule.value ?? "");
    case "is_empty": return !raw;
    case "is_not_empty": return !!raw;
    default: return false;
  }
}

function evalCondition(flow: Flow, node: DemanduNode, vars: Record<string, string>) {
  for (const br of node.data.conditions ?? []) {
    const results = (br.rules ?? []).map((r) => evalRule(r, vars));
    const ok = br.match === "any" ? results.some(Boolean) : results.every(Boolean);
    if (ok) {
      const edge = flow.edges.find((e) => e.source === node.id && e.sourceHandle === br.id);
      if (edge) return edge.target;
    }
  }
  return flow.edges.find((e) => e.source === node.id && e.sourceHandle === "otherwise")?.target;
}

/** Últimos mensajes de la conversación, para que la IA tenga contexto. */
async function recentHistory(ctx: Ctx): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    const { data } = await ctx.admin
      .from("messages")
      .select("direction, body")
      .eq("conversation_id", ctx.conversationId)
      .order("created_at", { ascending: false })
      .limit(6);
    return ((data ?? []) as any[])
      .reverse()
      .filter((m) => m.body)
      .map((m) => ({ role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const), content: m.body }));
  } catch {
    return [];
  }
}

/**
 * Contesta con la IA una duda que el flujo no esperaba.
 * Devuelve el texto, o null si la IA no supo (o no está configurada): en ese
 * caso el motor sigue con el comportamiento de siempre en vez de soltar dos
 * mensajes de "no sé" seguidos.
 */
async function responderDuda(ctx: Ctx): Promise<string | null> {
  const settings: AiSettings = { ...(ctx.aiSettings ?? {}) };
  try {
    const respuesta = await aiAnswer({
      admin: ctx.admin,
      botId: ctx.botId,
      orgId: ctx.orgId,
      question: ctx.lastUserText,
      settings,
      history: await recentHistory(ctx),
    });
    const limpio = (respuesta ?? "").trim();
    if (!limpio) return null;
    // Si la IA devolvió su mensaje de respaldo, es que no supo: no aporta.
    const respaldo = (settings.fallback ?? "").trim();
    if (respaldo && limpio === respaldo) return null;
    return limpio;
  } catch {
    return null;
  }
}

async function runFrom(startId: string | undefined, ctx: Ctx): Promise<Awaiting> {
  let current = startId;
  let guard = 0;
  while (current && guard++ < 80) {
    const node = getNode(ctx.flow, current);
    if (!node) break;
    // Analítica: cada bloque que se pisa cuenta como un paso del recorrido.
    ctx.pasos++;
    ctx.ultimoNodo = node.id;
    switch (node.type) {
      case "start":
        current = node.data.to ?? defaultNext(ctx.flow, node);
        break;
      case "question":
        push(ctx, node.data.text ?? "");
        return { nodeId: node.id, type: "question" };
      case "buttons":
        push(ctx, node.data.text ?? "", node.data.buttons);
        return { nodeId: node.id, type: "buttons" };
      case "condition":
        current = evalCondition(ctx.flow, node, ctx.vars);
        break;
      case "delay":
        current = defaultNext(ctx.flow, node);
        break;
      case "human":
      case "assign":
        push(ctx, node.data.text ?? "Te comunico con un asesor, un momento 🙌");
        await ctx.admin.from("conversations").update({ status: "assigned" }).eq("id", ctx.conversationId);
        ctx.finMotivo = "agente";
        return null;
      case "end":
        if (node.data.text) push(ctx, node.data.text);
        await ctx.admin.from("conversations").update({ status: "closed" }).eq("id", ctx.conversationId);
        ctx.finMotivo = "completado";
        return null;
      case "media":
        if (node.data.mediaUrl) push(ctx, node.data.mediaUrl);
        if (node.data.caption) push(ctx, node.data.caption);
        current = defaultNext(ctx.flow, node);
        break;
      case "ai": {
        // Responde con IA usando la info del negocio (Bot Training).
        // Si no hay pregunta todavía, muestra el texto del nodo y espera.
        if (!ctx.lastUserText) {
          if (node.data.text) push(ctx, node.data.text);
          return { nodeId: node.id, type: "question" };
        }
        const settings: AiSettings = {
          ...(ctx.aiSettings ?? {}),
          ...(node.data.systemPrompt ? { persona: node.data.systemPrompt } : {}),
        };
        const answer = await aiAnswer({
          admin: ctx.admin,
          botId: ctx.botId,
          orgId: ctx.orgId,
          question: ctx.lastUserText,
          settings,
          history: await recentHistory(ctx),
        });
        push(ctx, answer);
        // El nodo de IA se queda escuchando: la siguiente pregunta vuelve aquí.
        return { nodeId: node.id, type: "question" };
      }
      default:
        if (node.data.text) push(ctx, node.data.text);
        current = defaultNext(ctx.flow, node);
    }
  }
  return null;
}

/** Elige el flujo por disparador (misma prioridad que WhatsApp). */
export function chooseWebFlow(flows: any[], text: string, isReturning: boolean, state: any) {
  const t = (text || "").toLowerCase();
  for (const f of flows) {
    if (
      f.trigger_type === "keyword" &&
      Array.isArray(f.keywords) &&
      f.keywords.some((k: string) => k && t.includes(String(k).toLowerCase()))
    ) return f;
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
 * Guarda en la Bandeja lo que contestó el bot.
 *
 * OJO: `payload` es NOT NULL con default '{}' — nunca mandar null aquí,
 * porque invalida el insert completo y el bot "contesta" sin quedar registrado.
 */
async function guardarSalida(ctx: Ctx, opts: { admin: any; conversationId: string; orgId: string }) {
  if (!ctx.out.length) return;
  const { error } = await opts.admin.from("messages").insert(
    ctx.out.map((m) => ({
      conversation_id: opts.conversationId,
      org_id: opts.orgId,
      direction: "outbound",
      sender: "bot",
      body: m.text,
      payload: m.buttons ? { buttons: m.buttons } : {},
    })),
  );
  if (error) console.error("[webchat] no se guardaron los mensajes del bot:", error.message);
}

export async function runWebFlow(opts: {
  flow: Flow;
  orgId: string;
  conversationId: string;
  admin: any;
  flowState: any;
  text: string;
  isStart?: boolean;
  botId: string;
  aiSettings?: AiSettings | null;
  /** Atajos configurados en el chatbot (0 = reiniciar, 1 = persona, etc.) */
  atajos?: any;
  /** Que la IA conteste cuando el cliente se sale del flujo. */
  iaDeRespaldo?: boolean;
  /** Analítica: nombre del flujo, para que el histórico no quede anónimo. */
  flowName?: string | null;
}): Promise<{
  vars: Record<string, string>;
  awaiting: Awaiting;
  out: OutMsg[];
  hintEnviado?: boolean;
  /** Recorrido abierto (null si terminó). Se guarda en flow_state. */
  runId?: string | null;
  /**
   * El flujo llegó al final y ya no espera nada. Se guarda para que el
   * siguiente mensaje NO reinicie el flujo desde el saludo: sin esto el bot
   * repite el mismo mensaje una y otra vez.
   */
  terminado?: boolean;
}> {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}) };
  const ctx: Ctx = {
    flow: opts.flow,
    orgId: opts.orgId,
    conversationId: opts.conversationId,
    admin: opts.admin,
    vars,
    out: [],
    botId: opts.botId,
    aiSettings: opts.aiSettings ?? null,
    lastUserText: opts.isStart ? "" : (opts.text ?? ""),
    pasos: 0,
    ultimoNodo: null,
    finMotivo: null,
  };

  // Analítica: el recorrido que venía abierto de turnos anteriores.
  let runId: string | null = (opts.flowState?.run_id as string) ?? null;
  const abrirNuevo = () =>
    abrirRecorrido(opts.admin, {
      orgId: opts.orgId,
      conversationId: opts.conversationId,
      botId: opts.botId,
      flowId: opts.flow.id ?? null,
      flowName: opts.flowName ?? null,
      channel: "webchat",
    });

  const atajos: Atajos = leerAtajos(opts.atajos);

  // ── Atajos: mandan sobre cualquier otra cosa del flujo ──────────────────────
  // No cortamos aquí: seguimos hasta el bloque que guarda los mensajes en la
  // Bandeja, para que la respuesta del atajo también quede registrada.
  const atajo = opts.isStart ? null : detectarAtajo(opts.text ?? "", atajos);
  if (atajo === "agent") {
    push(ctx, atajos.agent.reply);
    await opts.admin
      .from("conversations")
      .update({
        status: "assigned",
        handoff_requested_at: new Date().toISOString(),
        handoff_reason: "El lead pidió hablar con una persona",
        unread: 1,
      })
      .eq("id", opts.conversationId);
    // Analítica: el recorrido termina aquí, se lo lleva una persona.
    await cerrarRecorrido(opts.admin, runId, "agente");
    runId = null;
  } else if (atajo === "reset") {
    push(ctx, atajos.reset.reply);
    // Analítica: se cierra el recorrido anterior y empieza uno nuevo, para no
    // contar como "un recorrido larguísimo" lo que en realidad fueron dos.
    await cerrarRecorrido(opts.admin, runId, "reiniciado");
    runId = null;
  }

  const awaiting = opts.flowState?.awaiting as Awaiting;
  const nodoEsperado = awaiting?.nodeId ? getNode(opts.flow, awaiting.nodeId) : null;
  const yaTermino = !!opts.flowState?.terminado;

  // ── ¿El cliente se salió del flujo? ─────────────────────────────────────────
  // La gente no habla en guiones. Si escribió algo que el flujo no esperaba,
  // contesta la IA y el flujo NO se mueve: se queda esperando donde estaba,
  // así que en cuanto responda lo que se le pidió, sigue como si nada.
  const textoBoton = (opts.text ?? "").toLowerCase();
  const botonQueCoincide =
    awaiting?.type === "buttons"
      ? (nodoEsperado?.data.buttons ?? []).find(
          (b) => b.id === opts.text || (b.label ?? "").toLowerCase() === textoBoton,
        )
      : undefined;

  const desvio: MotivoDesvio =
    atajo
      ? null
      : decidirDesvio({
          esperando: awaiting,
          capturaDato: !!nodoEsperado?.data.variable && nodoEsperado?.type !== "ai",
          coincidioBoton: !!botonQueCoincide,
          tieneSalidaPorDefecto:
            awaiting?.type === "buttons" && !!nodoEsperado
              ? !!defaultNext(opts.flow, nodoEsperado)
              : false,
          flujoTerminado: yaTermino,
          esInicio: !!opts.isStart,
          texto: opts.text ?? "",
          iaDeRespaldo: opts.iaDeRespaldo !== false,
        });

  if (desvio) {
    const respuesta = await responderDuda(ctx);
    if (respuesta) {
      push(ctx, respuesta);
      const puente = puenteDeVuelta(desvio);
      if (puente) push(ctx, puente);
      // Se vuelve a mostrar lo que el flujo estaba pidiendo, para no dejar a
      // la persona sin saber cómo seguir.
      if (nodoEsperado && awaiting?.type === "buttons") {
        push(ctx, nodoEsperado.data.text ?? "", nodoEsperado.data.buttons);
      } else if (nodoEsperado && awaiting?.type === "question") {
        push(ctx, nodoEsperado.data.text ?? "");
      }
      await guardarSalida(ctx, opts);
      await avanzarRecorrido(opts.admin, runId, 1, nodoEsperado?.id ?? null);
      return {
        vars,
        awaiting,                       // el flujo NO se mueve
        out: ctx.out,
        hintEnviado: !!opts.flowState?.hintEnviado,
        runId,
        terminado: yaTermino,
      };
    }
    // La IA no supo. Si el flujo ya había terminado, mejor callar que repetir
    // el saludo; si estaba esperando algo, cae al comportamiento de siempre.
    if (desvio === "flujo_terminado") {
      const respaldo = (ctx.aiSettings?.fallback ?? "").trim();
      if (respaldo) push(ctx, respaldo);
      await guardarSalida(ctx, opts);
      return {
        vars, awaiting: null, out: ctx.out,
        hintEnviado: !!opts.flowState?.hintEnviado, runId, terminado: true,
      };
    }
  }

  let startId: string | undefined;

  if (atajo === "agent") {
    // El bot deja de conducir: ahora contesta una persona.
    startId = undefined;
  } else if (atajo === "reset") {
    startId = getStartNode(opts.flow)?.id;
  } else if (!opts.isStart && awaiting?.nodeId) {
    const node = nodoEsperado;
    if (awaiting.type === "question") {
      // Un nodo de IA se queda escuchando: cada pregunta vuelve a entrar en él.
      if (node?.type === "ai") {
        startId = node.id;
      } else {
        if (node?.data.variable) vars[node.data.variable] = opts.text;
        startId = node ? defaultNext(opts.flow, node) : undefined;
      }
    } else if (awaiting.type === "buttons") {
      const btn = botonQueCoincide;
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : node ? defaultNext(opts.flow, node) : undefined;

      // Escribió algo que no era ninguna opción y el bloque no tiene salida
      // por defecto: antes el bot se quedaba MUDO y el lead quedaba atorado.
      // (Con la IA de respaldo encendida esto casi no se alcanza.)
      if (!btn && !startId && node) {
        push(ctx, "No entendí esa respuesta 🤔 Elige una de las opciones:");
        push(ctx, node.data.text ?? "", node.data.buttons);
        await guardarSalida(ctx, opts);
        // El recorrido sigue vivo: el lead está atorado en el mismo bloque.
        await avanzarRecorrido(opts.admin, runId, 1, node.id);
        return {
          vars,
          awaiting: { nodeId: node.id, type: "buttons" },
          out: ctx.out,
          hintEnviado: !!opts.flowState?.hintEnviado,
          runId,
        };
      }
    }
  } else if (!opts.isStart && yaTermino && opts.iaDeRespaldo !== false) {
    // El flujo terminó, la IA no supo contestar y no hay nada que esperar:
    // reiniciarlo repetiría el saludo. Mejor no hacer nada.
    startId = undefined;
  } else {
    startId = getStartNode(opts.flow)?.id;
  }

  // Analítica: si vamos a recorrer bloques y no hay recorrido abierto, se abre
  // uno. Cubre tanto el arranque normal como las conversaciones que ya venían
  // a medias desde antes de que existiera esta medición.
  if (startId && !runId) runId = await abrirNuevo();

  const nextAwait = atajo === "agent" ? null : await runFrom(startId, ctx);

  // Recordatorio de los atajos: una sola vez por conversación.
  let hintEnviado = !!opts.flowState?.hintEnviado;
  if (!hintEnviado && ctx.out.length && atajos.hint.enabled && atajos.hint.onStart && atajos.hint.text && atajo !== "agent") {
    push(ctx, atajos.hint.text);
    hintEnviado = true;
  }

  await guardarSalida(ctx, opts);

  // Analítica: si el bot ya no espera nada, el recorrido terminó.
  // Sin bloque "Cerrar el flujo" pero habiendo llegado al final del gráfico
  // también cuenta como completado: el lead sí recorrió el flujo entero.
  if (runId && nextAwait === null && atajo !== "agent") {
    await cerrarRecorrido(opts.admin, runId, ctx.finMotivo ?? "completado", ctx.pasos, ctx.ultimoNodo);
    runId = null;
  } else if (runId) {
    await avanzarRecorrido(opts.admin, runId, ctx.pasos, ctx.ultimoNodo);
  }

  return { vars, awaiting: nextAwait, out: ctx.out, hintEnviado, runId, terminado: nextAwait === null };
}
