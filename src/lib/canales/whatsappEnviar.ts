/**
 * Enviar por WhatsApp desde el panel.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO Y NO SE REUTILIZA EL MOTOR: el motor vive en una
 * función de Supabase escrita en Deno, y desde el panel (Node) no se puede
 * importar. Duplicar estas cuarenta líneas es más honesto que montar una
 * llamada entre servicios para mandar un texto.
 *
 * SI SE TOCAN LOS MOTIVOS DE ERROR, hay que tocarlos también en
 * `supabase/functions/whatsapp/index.ts`. Son los mismos códigos de Meta y el
 * cliente no entendería que la misma falla se explique distinto según quién
 * mandó el mensaje.
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export type ResultadoEnvio = { ok: boolean; error?: string; code?: number };

/** El texto que Meta devuelve es para desarrolladores; esto es para el cliente. */
export function motivoMeta(code: number, mensaje: string): string {
  switch (code) {
    case 131037:
      return "Meta todavía no aprueba el nombre para mostrar de tu número. Hasta que lo apruebe, WhatsApp no deja enviar mensajes.";
    case 131047:
      return "Pasaron más de 24 horas desde el último mensaje del cliente. Para retomar hay que enviarle una plantilla aprobada.";
    case 131026:
      return "Ese número no puede recibir mensajes de WhatsApp.";
    case 131051:
      return "Ese tipo de mensaje no está permitido en este número.";
    case 131056:
      return "Demasiados mensajes seguidos a este número. Meta pidió esperar un momento.";
    case 190:
    case 401:
      return "La conexión con Meta caducó. Hay que volver a conectar el número.";
    case 133010:
      return "El número no está registrado en WhatsApp Business.";
    default:
      return mensaje || "WhatsApp no aceptó el mensaje.";
  }
}

async function waPost(pnid: string, token: string, payload: any): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(`${GRAPH}/${pnid}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    if (res.ok) return { ok: true };

    const cuerpo = await res.text().catch(() => "");
    console.error("[wa envío]", res.status, cuerpo.slice(0, 300));
    let code = res.status;
    let mensaje = "";
    try {
      const j = JSON.parse(cuerpo);
      code = j?.error?.code ?? code;
      mensaje = j?.error?.message ?? "";
    } catch { /* la respuesta no era JSON */ }
    return { ok: false, code, error: motivoMeta(code, mensaje) };
  } catch (e) {
    console.error("[wa envío] red:", e);
    return { ok: false, error: "No se pudo conectar con WhatsApp." };
  }
}

export function enviarTexto(pnid: string, token: string, to: string, body: string) {
  return waPost(pnid, token, { to, type: "text", text: { body: body.slice(0, 4096) } });
}

/**
 * Manda un archivo. El tipo se decide por el MIME real, no por la extensión:
 * un cliente puede renombrar un .pdf a .jpg y WhatsApp rechazaría el envío
 * entero por incoherente.
 */
export function enviarArchivo(
  pnid: string, token: string, to: string,
  url: string, tipo: string, nombre: string, caption?: string,
) {
  const cap = (caption ?? "").slice(0, 1024);
  if (tipo.startsWith("image/")) {
    return waPost(pnid, token, { to, type: "image", image: { link: url, ...(cap ? { caption: cap } : {}) } });
  }
  if (tipo.startsWith("video/")) {
    return waPost(pnid, token, { to, type: "video", video: { link: url, ...(cap ? { caption: cap } : {}) } });
  }
  if (tipo.startsWith("audio/")) {
    return waPost(pnid, token, { to, type: "audio", audio: { link: url } });
  }
  return waPost(pnid, token, {
    to, type: "document",
    document: { link: url, filename: nombre, ...(cap ? { caption: cap } : {}) },
  });
}
