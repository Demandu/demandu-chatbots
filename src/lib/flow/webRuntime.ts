import { getNode, getStartNode, defaultNext, buttonTarget } from "./engine";
import type { Flow, DemanduNode, ConditionRule, FlowButton } from "./types";

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
}

function interp(t: string | undefined, vars: Record<string, string>) {
  return (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
}

function push(ctx: Ctx, text: string, buttons?: FlowButton[]) {
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
}): Promise<{ vars: Record<string, string>; awaiting: Awaiting; out: OutMsg[] }> {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}) };
  const ctx: Ctx = {
    flow: opts.flow,
    orgId: opts.orgId,
    conversationId: opts.conversationId,
    admin: opts.admin,
    vars,
    out: [],
  };

  const awaiting = opts.flowState?.awaiting as Awaiting;
  let startId: string | undefined;

  if (!opts.isStart && awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "question") {
      if (node?.data.variable) vars[node.data.variable] = opts.text;
      startId = node ? defaultNext(opts.flow, node) : undefined;
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

  const nextAwait = await runFrom(startId, ctx);

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

  return { vars, awaiting: nextAwait, out: ctx.out };
}
