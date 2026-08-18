import { getNode, getStartNode, defaultNext, buttonTarget } from "./engine";
import type { Flow, DemanduNode, ConditionRule, FlowButton } from "./types";
import { aiAnswer, type AiSettings } from "@/lib/ai/answer";
import { detectarAtajo, leerAtajos, type Atajos } from "./shortcuts";

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
}

function interp(t: string | undefined, vars: Record<string, string>) {
  return (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
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

async function runFrom(startId: string | undefined, ctx: Ctx): Promise<Awaiting> {
  let current = startId;
  let guard = 0;
  while (current && guard++ < 80) {
    const node = getNode(ctx.flow, current);
    if (!node) break;
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
        return null;
      case "end":
        if (node.data.text) push(ctx, node.data.text);
        await ctx.admin.from("conversations").update({ status: "closed" }).eq("id", ctx.conversationId);
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
}): Promise<{ vars: Record<string, string>; awaiting: Awaiting; out: OutMsg[]; hintEnviado?: boolean }> {
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
  };

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
  } else if (atajo === "reset") {
    push(ctx, atajos.reset.reply);
  }

  const awaiting = opts.flowState?.awaiting as Awaiting;
  let startId: string | undefined;

  if (atajo === "agent") {
    // El bot deja de conducir: ahora contesta una persona.
    startId = undefined;
  } else if (atajo === "reset") {
    startId = getStartNode(opts.flow)?.id;
  } else if (!opts.isStart && awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "question") {
      // Un nodo de IA se queda escuchando: cada pregunta vuelve a entrar en él.
      if (node?.type === "ai") {
        startId = node.id;
      } else {
        if (node?.data.variable) vars[node.data.variable] = opts.text;
        startId = node ? defaultNext(opts.flow, node) : undefined;
      }
    } else if (awaiting.type === "buttons") {
      const t = (opts.text ?? "").toLowerCase();
      const btn = (node?.data.buttons ?? []).find(
        (b) => b.id === opts.text || (b.label ?? "").toLowerCase() === t,
      );
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : node ? defaultNext(opts.flow, node) : undefined;
    }
  } else {
    startId = getStartNode(opts.flow)?.id;
  }

  const nextAwait = atajo === "agent" ? null : await runFrom(startId, ctx);

  // Recordatorio de los atajos: una sola vez por conversación.
  let hintEnviado = !!opts.flowState?.hintEnviado;
  if (!hintEnviado && atajos.hint.enabled && atajos.hint.onStart && atajos.hint.text && atajo !== "agent") {
    push(ctx, atajos.hint.text);
    hintEnviado = true;
  }

  // Guarda las respuestas del bot en la Bandeja.
  // OJO: `payload` es NOT NULL con default '{}' — nunca mandar null aquí,
  // porque invalida el insert completo y el bot "contesta" sin quedar registrado.
  if (ctx.out.length) {
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

  return { vars, awaiting: nextAwait, out: ctx.out, hintEnviado };
}
