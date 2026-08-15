import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySignature } from "@/lib/integrations/whatsapp";
import { handleIncoming } from "@/lib/flow/runtime";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

/** Verificación del webhook (Meta lo llama una vez al suscribir). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** Recepción de mensajes entrantes de WhatsApp. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("bad signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return NextResponse.json({ ok: true }); // estados de entrega, etc.

    const phoneNumberId = value?.metadata?.phone_number_id as string;
    const from = msg.from as string; // wa_id del contacto
    const profileName = value?.contacts?.[0]?.profile?.name ?? null;
    const text =
      msg.text?.body ??
      msg.interactive?.button_reply?.id ??
      msg.interactive?.list_reply?.id ??
      msg.button?.text ??
      "";

    const admin = createAdminClient();
    const { data: cfg } = await admin
      .from("whatsapp_channels")
      .select("*")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (!cfg) return NextResponse.json({ ok: true });

    // Contacto (upsert)
    const { data: contact } = await admin
      .from("contacts")
      .upsert(
        { org_id: cfg.org_id, channel: "whatsapp", external_id: from, name: profileName, phone: from },
        { onConflict: "org_id,channel,external_id" }
      )
      .select("id")
      .single();

    // Conversación abierta más reciente (o nueva si no hay / está cerrada)
    let { data: conv } = await admin
      .from("conversations")
      .select("id, flow_state, status")
      .eq("org_id", cfg.org_id)
      .eq("contact_id", contact!.id)
      .eq("channel", "whatsapp")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv || conv.status === "closed") {
      const ins = await admin
        .from("conversations")
        .insert({
          org_id: cfg.org_id,
          contact_id: contact!.id,
          bot_id: cfg.bot_id,
          channel: "whatsapp",
          status: "open",
          flow_state: {},
        })
        .select("id, flow_state, status")
        .single();
      conv = ins.data;
    }

    // Registra el mensaje entrante
    await admin.from("messages").insert({
      conversation_id: conv!.id,
      org_id: cfg.org_id,
      direction: "inbound",
      sender: "contact",
      body: text,
    });
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conv!.id);

    // Corre el bot (salvo que un humano ya tomó la conversación)
    if (cfg.bot_id && conv!.status !== "assigned") {
      const { data: flowRow } = await admin
        .from("flows")
        .select("graph")
        .eq("bot_id", cfg.bot_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const graph = (flowRow?.graph as any) ?? { nodes: [], edges: [] };
      const flow: Flow = { id: "live", name: "live", nodes: graph.nodes ?? [], edges: graph.edges ?? [] };
      if (flow.nodes.length) {
        const newState = await handleIncoming({
          flow,
          phoneNumberId,
          token: cfg.access_token,
          to: from,
          orgId: cfg.org_id,
          conversationId: conv!.id,
          admin,
          flowState: conv!.flow_state ?? {},
          text,
        });
        await admin.from("conversations").update({ flow_state: newState }).eq("id", conv!.id);
      }
    }
  } catch (e) {
    console.error("[whatsapp webhook]", e);
  }

  return NextResponse.json({ ok: true });
}
