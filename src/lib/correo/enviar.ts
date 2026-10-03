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
 *
 * ── 3 OCT 2026: SI ESTÁ GOOGLE, SALE POR GOOGLE ───────────────────────────
 *
 * Postmark nunca funcionó: los registros de `envios.demandu.tech` no se
 * pegaron en Wix y los 7 correos que intentó mandar fallaron todos (ver
 * `los-correos-de-supabase-y-el-remitente-1-oct-2026.md`). Los de Supabase ya
 * salen por Google Workspace y llegan. Así que si en Netlify están
 * `SMTP_USUARIO` y `SMTP_CLAVE`, este correo sale por el mismo camino.
 *
 * EL PRECIO, DICHO: con Google el remitente es el dominio raíz
 * (`@demandu.tech`), justo lo que el subdominio evitaba. Con decenas de
 * correos al mes el riesgo es teórico; la señal para volver a un subdominio
 * es pasar de ~100 al mes o la primera queja de spam. Quitar las dos
 * variables vuelve a Postmark sin tocar código.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Envio = { ok: true; id: string } | { ok: false; error: string };

const API = "https://api.postmarkapp.com/email";

/** El remitente de Postmark. Se dice aquí una vez para que no puedan discrepar dos sitios. */
export const REMITENTE =
  (process.env.CORREO_REMITENTE ?? "Demandu <no-reply@envios.demandu.tech>").trim();

/** Las dos llaves de Google, o nada si falta cualquiera de las dos. */
function cuentaDeGoogle(): { usuario: string; clave: string } | null {
  const usuario = (process.env.SMTP_USUARIO ?? "").trim();
  // Google enseña la contraseña de aplicación en cuatro grupos con espacios;
  // quien la pega suele copiarlos. Con espacios Google la rechaza.
  const clave = (process.env.SMTP_CLAVE ?? "").replace(/\s+/g, "");
  return usuario && clave ? { usuario, clave } : null;
}

/** Por dónde va a salir el correo ahora mismo. Lo enseña la pantalla de correos. */
export function salida(): { proveedor: "google" | "postmark" | "ninguno"; remitente: string } {
  const g = cuentaDeGoogle();
  // Google SOLO deja mandar como la propia cuenta (o un alias verificado en
  // ella). Un «From» distinto lo reescribe o lo rechaza: por eso el remitente
  // sale del usuario, no de `CORREO_REMITENTE`, que es el de Postmark.
  if (g) return { proveedor: "google", remitente: `Demandu <${g.usuario}>` };
  if ((process.env.POSTMARK_TOKEN ?? "").trim()) return { proveedor: "postmark", remitente: REMITENTE };
  return { proveedor: "ninguno", remitente: REMITENTE };
}

async function porGoogle(
  g: { usuario: string; clave: string },
  v: { para: string; correo: Correo; responderA?: string },
): Promise<Envio> {
  try {
    // SE CARGA AQUÍ DENTRO Y NO ARRIBA. Las pruebas importan este archivo para
    // leer `REMITENTE` sin tener `node_modules`; arriba, eso las rompería.
    const nodemailer = (await import("nodemailer")).default;
    const transporte = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: g.usuario, pass: g.clave },
      // Con tope, como Postmark: una tarea programada no puede quedarse colgada.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    const info = await transporte.sendMail({
      from: `Demandu <${g.usuario}>`,
      to: v.para,
      subject: v.correo.asunto,
      html: v.correo.html,
      text: v.correo.texto,
      ...(v.responderA ? { replyTo: v.responderA } : {}),
    });
    // Google acepta o lanza. Si dice que aceptó pero rechazó al destinatario,
    // eso NO es «enviado».
    if (info.rejected?.length) return { ok: false, error: `Google rechazó ${String(info.rejected[0])}.` };
    return { ok: true, id: String(info.messageId ?? "google") };
  } catch (e: any) {
    // EL MENSAJE DE GOOGLE, TAL CUAL Y EN CORTO. «Invalid login» (clave mal
    // pegada) y «Daily user sending limit exceeded» son dos arreglos distintos.
    console.error("[correo] Google no lo aceptó:", e?.message ?? e);
    return { ok: false, error: `Google: ${String(e?.response ?? e?.message ?? "no contestó").slice(0, 280)}` };
  }
}

export async function enviarCorreo(v: {
  para: string;
  correo: Correo;
  /** Para agrupar en Postmark: «bienvenida», «superadmin»… */
  etiqueta?: string;
  /** A dónde contesta el cliente si le da a Responder. */
  responderA?: string;
}): Promise<Envio> {
  const para = String(v.para ?? "").trim();
  if (!para) return { ok: false, error: "No hay a quién mandárselo." };

  const google = cuentaDeGoogle();
  if (google) return porGoogle(google, { para, correo: v.correo, responderA: v.responderA });

  const token = (process.env.POSTMARK_TOKEN ?? "").trim();
  if (!token) {
    return { ok: false, error: "No hay por dónde mandarlo: faltan SMTP_USUARIO y SMTP_CLAVE (Google) en Netlify." };
  }

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
