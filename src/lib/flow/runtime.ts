import { getNode, getStartNode, defaultNext, buttonTarget } from "./engine";
import type { Flow, DemanduNode, ConditionRule } from "./types";
import { sendText, sendButtons } from "@/lib/integrations/whatsapp";

/**
 * Motor de ejecución del flujo en el servidor (para el webhook de WhatsApp).
 * Avanza el flujo, envía mensajes por la Cloud API, los registra en la Bandeja
 * y devuelve el nuevo `flow_state` (nodo en espera + variables).
 */

type Awaiting = { nodeId: string; type: "question" | "buttons" } | null;

interface RunCtx {
  flow: Flow;
  phoneNumberId: string;
  token: string;
  to: string;
  orgId: string;
  conversationId: string;
  admin: any;
  vars: Record<string, string>;
}

function interp(t: string | undefined, vars: Record<string, string>) {
  return (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
}

async function say(ctx: RunCtx, body: string) {
  const text = interp(body, ctx.vars);
  if (!text) return;
  await sendText(ctx.phoneNumberId, ctx.token, ctx.to, text);
  await ctx.admin.from("messages").insert({
    conversation_id: ctx.conversationId,
    org_id: ctx.orgId,
    direction: "outbound",
    sender: "bot",
    body: text,
  });
}

async function sayButtons(ctx: RunCtx, body: string, node: DemanduNode) {
  const text = interp(body, ctx.vars);
  const buttons = node.data.buttons ?? [];
  await sendButtons(ctx.phoneNumberId, ctx.token, ctx.to, text || "Elige una opción", buttons);
  await ctx.admin.from("messages").insert({
    conversation_id: ctx.conversationId,
    org_id: ctx.orgId,
    direction: "outbound",
    sender: "bot",
    body: text || "(opciones)",
    payload: { buttons: buttons.map((b) => ({ id: b.id, label: b.label })) },
  });
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

function evalCondition(flow: Flow, node: DemanduNode, vars: Record<string, string>): string | undefined {
  for (const br of node.data.conditions ?? []) {
    const results = (br.rules ?? []).map((r) => evalRule(r, vars));
    const ok = br.match === "any" ? results.some(Boolean) : results.every(Boolean);
    if (ok) {
      const edge = flow.edges.find((e) => e.source === node.id && e.sourceHandle === br.id);
      if (edge) return edge.target;
    }
  }
  const other = flow.edges.find((e) => e.source === node.id && e.sourceHandle === "otherwise");
  return other?.target;
}

/** Avanza desde un nodo hasta que se necesita input del usuario o se termina. */
async function runFrom(startId: string | undefined, ctx: RunCtx): Promise<Awaiting> {
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
        await say(ctx, node.data.text ?? "");
        return { nodeId: node.id, type: "question" };
      case "buttons":
        await sayButtons(ctx, node.data.text ?? "", node);
        return { nodeId: node.id, type: "buttons" };
      case "condition":
        current = evalCondition(ctx.flow, node, ctx.vars);
        break;
      case "delay":
        current = defaultNext(ctx.flow, node); // sin espera real en el webhook
        break;
      case "human":
      case "assign":
        await say(ctx, node.data.text ?? "Te comunico con un asesor, un momento 🙌");
        await ctx.admin.from("conversations").update({ status: "assigned" }).eq("id", ctx.conversationId);
        return null; // detiene el bot; lo toma un humano
      case "end":
        if (node.data.text) await say(ctx, node.data.text);
        await ctx.admin.from("conversations").update({ status: "closed" }).eq("id", ctx.conversationId);
        return null;
      default:
        // message, media, ai, action, api, calendar, tags, redirect, comercio…
        if (node.data.text) await say(ctx, node.data.text);
        current = defaultNext(ctx.flow, node);
    }
  }
  return null;
}

export async function handleIncoming(opts: {
  flow: Flow;
  phoneNumberId: string;
  token: string;
  to: string;
  orgId: string;
  conversationId: string;
  admin: any;
  flowState: any;
  text: string;
}): Promise<{ vars: Record<string, string>; awaiting: Awaiting }> {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}) };
  const ctx: RunCtx = {
    flow: opts.flow,
    phoneNumberId: opts.phoneNumberId,
    token: opts.token,
    to: opts.to,
    orgId: opts.orgId,
    conversationId: opts.conversationId,
    admin: opts.admin,
    vars,
  };

  const awaiting = opts.flowState?.awaiting as Awaiting;
  let startId: string | undefined;

  if (awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "question") {
      if (node?.data.variable) vars[node.data.variable] = opts.text;
      startId = node ? defaultNext(opts.flow, node) : undefined;
    } else if (awaiting.type === "buttons") {
      const t = opts.text.toLowerCase();
      const btn = (node?.data.buttons ?? []).find(
        (b) => b.id === opts.text || (b.label ?? "").toLowerCase() === t
      );
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : node ? defaultNext(opts.flow, node) : undefined;
    }
  } else {
    startId = getStartNode(opts.flow)?.id;
  }

  const nextAwait = await runFrom(startId, ctx);
  return { vars, awaiting: nextAwait };
}
