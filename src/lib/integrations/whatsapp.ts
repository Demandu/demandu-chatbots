import crypto from "crypto";
import type { FlowButton } from "@/lib/flow/types";

const GRAPH = "https://graph.facebook.com/v20.0";

/** Verifica la firma X-Hub-Signature-256 del webhook con el App Secret. */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // si no hay secret configurado, no bloquea (best-effort)
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function post(phoneNumberId: string, token: string, payload: any) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) {
    console.error("[whatsapp] send failed", res.status, await res.text());
  }
  return res.ok;
}

export function sendText(phoneNumberId: string, token: string, to: string, body: string) {
  return post(phoneNumberId, token, { to, type: "text", text: { body: body.slice(0, 4096), preview_url: true } });
}

/** Botones interactivos (máx 3). Para más de 3 opciones usa una lista. */
export function sendButtons(
  phoneNumberId: string,
  token: string,
  to: string,
  body: string,
  buttons: FlowButton[]
) {
  const opts = buttons.slice(0, 10);
  if (opts.length <= 3) {
    return post(phoneNumberId, token, {
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: (body || "Elige una opción").slice(0, 1024) },
        action: {
          buttons: opts.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: (b.label || "Opción").slice(0, 20) },
          })),
        },
      },
    });
  }
  // Lista (hasta 10 filas)
  return post(phoneNumberId, token, {
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: (body || "Elige una opción").slice(0, 1024) },
      action: {
        button: "Ver opciones",
        sections: [
          {
            title: "Opciones",
            rows: opts.map((b) => ({ id: b.id, title: (b.label || "Opción").slice(0, 24) })),
          },
        ],
      },
    },
  });
}
