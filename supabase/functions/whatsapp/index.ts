import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "demandu_wa_2026";
const GRAPH = "https://graph.facebook.com/v20.0";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  return (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
}

// ---- envío a WhatsApp ----
async function waPost(pnid: string, token: string, payload: any) {
  const res = await fetch(`${GRAPH}/${pnid}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) console.error("wa send", res.status, await res.text());
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

async function say(ctx: any, body: string) {
  const text = interp(body, ctx.vars);
  if (!text) return;
  await sendText(ctx.pnid, ctx.token, ctx.to, text);
  await ctx.db.from("messages").insert({ conversation_id: ctx.convId, org_id: ctx.orgId, direction: "outbound", sender: "bot", body: text });
}
async function sayButtons(ctx: any, body: string, node: any) {
  const text = interp(body, ctx.vars);
  const buttons = node.data.buttons ?? [];
  await sendButtons(ctx.pnid, ctx.token, ctx.to, text || "Elige una opción", buttons);
  await ctx.db.from("messages").insert({ conversation_id: ctx.convId, org_id: ctx.orgId, direction: "outbound", sender: "bot", body: text || "(opciones)", payload: { buttons: buttons.map((b: any) => ({ id: b.id, label: b.label })) } });
}

async function runFrom(startId: string | undefined, ctx: any) {
  let current = startId; let guard = 0;
  while (current && guard++ < 80) {
    const node = getNode(ctx.flow, current);
    if (!node) break;
    switch (node.type) {
      case "start": current = node.data.to ?? defaultNext(ctx.flow, node); break;
      case "question": await say(ctx, node.data.text ?? ""); return { nodeId: node.id, type: "question" };
      case "buttons": await sayButtons(ctx, node.data.text ?? "", node); return { nodeId: node.id, type: "buttons" };
      case "condition": current = evalCondition(ctx.flow, node, ctx.vars); break;
      case "delay": current = defaultNext(ctx.flow, node); break;
      case "human": case "assign":
        await say(ctx, node.data.text ?? "Te comunico con un asesor, un momento 🙌");
        await ctx.db.from("conversations").update({ status: "assigned" }).eq("id", ctx.convId);
        return null;
      case "end":
        if (node.data.text) await say(ctx, node.data.text);
        await ctx.db.from("conversations").update({ status: "closed" }).eq("id", ctx.convId);
        return null;
      default:
        if (node.data.text) await say(ctx, node.data.text);
        current = defaultNext(ctx.flow, node);
    }
  }
  return null;
}

async function handleIncoming(opts: any) {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}) };
  const ctx = { flow: opts.flow, pnid: opts.pnid, token: opts.token, to: opts.to, orgId: opts.orgId, convId: opts.convId, db: opts.db, vars };
  const awaiting = opts.flowState?.awaiting;
  let startId: string | undefined;
  if (awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "question") {
      if (node?.data.variable) vars[node.data.variable] = opts.text;
      startId = node ? defaultNext(opts.flow, node) : undefined;
    } else if (awaiting.type === "buttons") {
      const t = opts.text.toLowerCase();
      const btn = (node?.data.buttons ?? []).find((b: any) => b.id === opts.text || (b.label ?? "").toLowerCase() === t);
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : (node ? defaultNext(opts.flow, node) : undefined);
    }
  } else {
    startId = getStartNode(opts.flow)?.id;
  }
  const nextAwait = await runFrom(startId, ctx);
  return { vars, awaiting: nextAwait };
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
      const text = msg.text?.body ?? msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? msg.button?.text ?? "";
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

      const { data: contact } = await db.from("contacts").upsert({ org_id: cfg.org_id, channel: "whatsapp", external_id: from, name, phone: from }, { onConflict: "org_id,channel,external_id" }).select("id").single();
      let { data: conv } = await db.from("conversations").select("id, flow_state, status").eq("org_id", cfg.org_id).eq("contact_id", contact.id).eq("channel", "whatsapp").order("last_message_at", { ascending: false }).limit(1).maybeSingle();
      if (!conv || conv.status === "closed") {
        const ins = await db.from("conversations").insert({ org_id: cfg.org_id, contact_id: contact.id, bot_id: cfg.bot_id, channel: "whatsapp", status: "open", flow_state: {} }).select("id, flow_state, status").single();
        conv = ins.data;
      }
      await db.from("messages").insert({ conversation_id: conv.id, org_id: cfg.org_id, direction: "inbound", sender: "contact", body: text });
      await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
      if (cfg.bot_id && conv.status !== "assigned") {
        // ¿Lead que regresa? (tiene más de una conversación con nosotros)
        const { count: convCount } = await db
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id);
        const isReturning = (convCount ?? 1) > 1;

        // Todos los flujos habilitados del bot y elegir por disparador
        const { data: flowRows } = await db
          .from("flows")
          .select("id, graph, trigger_type, keywords, enabled")
          .eq("bot_id", cfg.bot_id);
        const flows = (flowRows ?? []).filter((f: any) => f.enabled !== false);
        const state = conv.flow_state ?? {};
        const chosen = chooseFlow(flows, text, isReturning, state);

        if (chosen) {
          const graph = chosen.graph ?? { nodes: [], edges: [] };
          const flow = { nodes: graph.nodes ?? [], edges: graph.edges ?? [] };
          if (flow.nodes.length) {
            // Si cambiamos de flujo, ese flujo arranca desde el inicio (sin arrastrar awaiting)
            const flowState = state.flow_id === chosen.id ? state : { vars: state.vars ?? {} };
            const newState = await handleIncoming({ flow, pnid, token: cfg.access_token, to: from, orgId: cfg.org_id, convId: conv.id, db, flowState, text });
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
