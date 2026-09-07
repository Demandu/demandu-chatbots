import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Correo } from "./plantillas";

/**
 * MANDAR UN CORREO. La única puerta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ POSTMARK Y NO RESEND, QUE ERA EL PLAN.
 *
 * Resend exige un registro MX en el subdominio de envío, y **Wix no admite MX
 * en subdominios**. Lo dice el propio Resend al intentar añadir el dominio:
 * «you can't verify your domain for Resend if your DNS is managed by Wix».
 *
 * La alternativa era mover el DNS de `demandu.tech` a otro proveedor — pero por
 * ahí cuelgan el sitio de Wix Y el correo de Google Workspace de toda la
 * empresa. Mover los nameservers de un dominio vivo para ahorrarse un cambio de
 * proveedor de correo es cambiar un problema pequeño por uno grande.
 *
 * Postmark verifica con un TXT y un CNAME. Ningún MX. El DNS se queda donde
 * está.
 *
 * ── EL REMITENTE ES UN SUBDOMINIO, Y ESO NO ES UN DETALLE ─────────────────
 *
 * `no-reply@envios.demandu.tech`, no `@demandu.tech`. Si un cliente marca como
 * spam un correo de la plataforma, el golpe se lo lleva el subdominio. La
 * reputación del dominio raíz es la que hace que lleguen los correos que
 * escribe una persona desde Google Workspace, y esas dos no deben tocarse.
 *
 * ── SI NO HAY LLAVE, SE DICE ──────────────────────────────────────────────
 *
 * No se lanza una excepción ni se devuelve `ok`. Devolver `ok` sin haber
 * mandado nada es lo peor que puede hacer esta función: quien llama apunta
 * «enviado», el cliente nunca lo recibe, y no queda ni rastro de por qué.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Envio = { ok: true; id: string } | { ok: false; error: string };

const API = "https://api.postmarkapp.com/email";

/** El remitente. Se dice aquí una vez para que no puedan discrepar dos sitios. */
export const REMITENTE =
  (process.env.CORREO_REMITENTE ?? "Demandu <no-reply@envios.demandu.tech>").trim();

export async function enviarCorreo(v: {
  para: string;
  correo: Correo;
  /** Para agrupar en Postmark: «bienvenida», «superadmin»… */
  etiqueta?: string;
  /** A dónde contesta el cliente si le da a Responder. */
  responderA?: string;
}): Promise<Envio> {
  const token = (process.env.POSTMARK_TOKEN ?? "").trim();
  if (!token) return { ok: false, error: "Falta la llave de Postmark (POSTMARK_TOKEN)." };

  const para = String(v.para ?? "").trim();
  if (!para) return { ok: false, error: "No hay a quién mandárselo." };

  try {
    // CON TOPE DE TIEMPO. Sin esto, un Postmark lento deja colgada la petición
    // que lo llamó — y una de ellas es una tarea programada que corre sola.
    const r = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: REMITENTE,
        To: para,
        Subject: v.correo.asunto,
        HtmlBody: v.correo.html,
        // EL TEXTO PLANO NO SOBRA. Hay clientes de correo que solo leen esa
        // parte, y los filtros de spam desconfían de un correo que solo trae
        // HTML. Cuesta cuatro líneas y mejora que llegue.
        TextBody: v.correo.texto,
        MessageStream: "outbound",
        ...(v.etiqueta ? { Tag: v.etiqueta } : {}),
        ...(v.responderA ? { ReplyTo: v.responderA } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    const cuerpo = (await r.json().catch(() => null)) as
      | { MessageID?: string; Message?: string; ErrorCode?: number }
      | null;

    if (!r.ok || !cuerpo?.MessageID) {
      // SE ENSEÑA EL MENSAJE DE POSTMARK TAL CUAL. «No se pudo enviar» borra la
      // única pista que hay: su error dice si el dominio no está verificado, si
      // la dirección está en la lista de rebotes o si la llave es de otro
      // servidor — tres arreglos distintos.
      const motivo = cuerpo?.Message ?? `Postmark contestó ${r.status}`;
      return { ok: false, error: String(motivo).slice(0, 300) };
    }

    return { ok: true, id: String(cuerpo.MessageID) };
  } catch (e) {
    console.error("[correo] no se pudo hablar con Postmark:", e);
    return { ok: false, error: "No se pudo hablar con el servidor de correo." };
  }
}

/**
 * Mandar y dejarlo apuntado, en ese orden.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE APUNTA SIEMPRE, SALGA O NO SALGA. Es la misma regla que los avisos de
 * pedido, y por el mismo motivo: cuando alguien diga «no me llegó nada», la
 * respuesta no puede ser «pues debería». Aquí queda si salió, cuándo, a quién y
 * —si falló— qué dijo Postmark.
 *
 * Y EL APUNTE NO PUEDE TUMBAR EL ENVÍO. Si la base falla al escribir la fila,
 * el correo ya está en la calle: devolver error haría que quien llama lo
 * reintentara y el cliente recibiría el mismo mensaje dos veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function enviarYApuntar(
  sb: SupabaseClient,
  v: {
    para: string;
    correo: Correo;
    etiqueta: string;
    orgId?: string | null;
    responderA?: string;
    /** Quién lo mandó, cuando fue una persona y no una tarea. */
    quien?: string | null;
  },
): Promise<Envio> {
  const r = await enviarCorreo({ para: v.para, correo: v.correo, etiqueta: v.etiqueta, responderA: v.responderA });

  try {
    await sb.from("correos_enviados").insert({
      org_id: v.orgId ?? null,
      para: v.para,
      asunto: v.correo.asunto,
      etiqueta: v.etiqueta,
      enviado: r.ok,
      proveedor_id: r.ok ? r.id : null,
      error: r.ok ? null : r.error,
      enviado_por: v.quien ?? null,
    });
  } catch (e) {
    console.error("[correo] salió pero no pude apuntarlo:", e);
  }

  return r;
}
