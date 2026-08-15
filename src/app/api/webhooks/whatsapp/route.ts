import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook de WhatsApp Cloud API (Meta).
 * GET  → verificación del webhook (hub.challenge).
 * POST → recepción de mensajes entrantes.
 *
 * Configura en Meta: Callback URL = https://TU-DOMINIO/api/webhooks/whatsapp
 *                    Verify Token  = WHATSAPP_VERIFY_TOKEN
 */

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (message) {
      const from = message.from as string; // wa_id del contacto
      const text = message.text?.body as string | undefined;
      const buttonReply =
        message.interactive?.button_reply?.title ??
        message.button?.text;

      // TODO:
      // 1) upsert contact (org_id, channel='whatsapp', external_id=from)
      // 2) upsert conversation abierta
      // 3) guardar message (inbound)
      // 4) avanzar el motor de flujo con { text | buttonReply } y responder
      //    vía Graph API (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)
      console.log("[whatsapp] inbound", { from, text, buttonReply });
    }
  } catch (e) {
    console.error("[whatsapp] error", e);
  }

  // Meta requiere 200 rápido para no reintentar.
  return NextResponse.json({ received: true });
}
