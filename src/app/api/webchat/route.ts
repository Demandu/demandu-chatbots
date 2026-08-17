import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWebFlow, chooseWebFlow } from "@/lib/flow/webRuntime";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

/**
 * Endpoint PÚBLICO del widget de chat web.
 * Lo llama `public/widget.js` desde el sitio del cliente, por eso lleva CORS.
 * El bot se identifica por su UUID (no adivinable) y solo se exponen los
 * mensajes del bot — nunca datos de la organización.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const DEFAULT_WIDGET = {
  color: "#6E42FF",
  position: "right",
  title: "¿Podemos ayudarte?",
  subtitle: "Normalmente respondemos al instante",
  greeting: "",
  launcher: "Chatea con nosotros",
};

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const botId = String(body?.botId ?? "");
  const sessionId = String(body?.sessionId ?? "");
  const text = String(body?.text ?? "");
  const isStart = !!body?.start;

  if (!botId || !sessionId) return json({ error: "missing_params" }, 400);

  const admin = createAdminClient();

  const { data: bot } = await admin
    .from("bots")
    .select("id, org_id, name, channel, widget")
    .eq("id", botId)
    .maybeSingle();

  if (!bot || bot.channel !== "webchat") return json({ error: "bot_not_found" }, 404);

  const widget = { ...DEFAULT_WIDGET, ...((bot.widget as any) ?? {}) };

  try {
    // Contacto anónimo del navegador (identificado por su sessionId)
    const { data: contact } = await admin
      .from("contacts")
      .upsert(
        { org_id: bot.org_id, channel: "webchat", external_id: sessionId, name: "Visitante web" },
        { onConflict: "org_id,channel,external_id" },
      )
      .select("id")
      .single();

    if (!contact) return json({ error: "contact_error" }, 500);

    // Conversación abierta más reciente (o una nueva)
    let { data: conv } = await admin
      .from("conversations")
      .select("id, flow_state, status")
      .eq("org_id", bot.org_id)
      .eq("contact_id", contact.id)
      .eq("channel", "webchat")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv || conv.status === "closed") {
      const ins = await admin
        .from("conversations")
        .insert({
          org_id: bot.org_id,
          contact_id: contact.id,
          bot_id: bot.id,
          channel: "webchat",
          status: "open",
          flow_state: {},
        })
        .select("id, flow_state, status")
        .single();
      conv = ins.data as any;
    }
    if (!conv) return json({ error: "conversation_error" }, 500);

    // Mensaje del visitante
    if (!isStart && text) {
      await admin.from("messages").insert({
        conversation_id: conv.id,
        org_id: bot.org_id,
        direction: "inbound",
        sender: "contact",
        body: text,
      });
    }
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

    // Si un humano tomó el chat, el bot no interrumpe
    if (conv.status === "assigned") {
      return json({ sessionId, widget, messages: [], handedOff: true });
    }

    // ¿Visitante que regresa?
    const { count: convCount } = await admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id);
    const isReturning = (convCount ?? 1) > 1;

    const { data: flowRows } = await admin
      .from("flows")
      .select("id, graph, trigger_type, keywords, enabled")
      .eq("bot_id", bot.id);

    const flows = (flowRows ?? []).filter((f: any) => f.enabled !== false);
    const state = (conv.flow_state as any) ?? {};
    const chosen = chooseWebFlow(flows, text, isReturning, state);

    if (!chosen) return json({ sessionId, widget, messages: [] });

    const graph = (chosen.graph as any) ?? { nodes: [], edges: [] };
    const flow = { id: chosen.id, name: "", nodes: graph.nodes ?? [], edges: graph.edges ?? [] } as Flow;
    if (!flow.nodes.length) return json({ sessionId, widget, messages: [] });

    const flowState = state.flow_id === chosen.id ? state : { vars: state.vars ?? {} };
    const result = await runWebFlow({
      flow,
      orgId: bot.org_id,
      conversationId: conv.id,
      admin,
      flowState,
      text,
      isStart,
    });

    await admin
      .from("conversations")
      .update({ flow_state: { vars: result.vars, awaiting: result.awaiting, flow_id: chosen.id } })
      .eq("id", conv.id);

    return json({ sessionId, widget, messages: result.out });
  } catch (e) {
    console.error("[webchat]", e);
    return json({ error: "server_error" }, 500);
  }
}
