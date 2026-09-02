/**
 * Enviar por Instagram.
 *
 * TRES FORMAS DE CONTESTAR, Y NO SON INTERCAMBIABLES. Esto es lo que hace que
 * Instagram no sea «WhatsApp con otro logo»:
 *
 *   1. Mensaje directo         → la conversación normal.
 *   2. Respuesta PÚBLICA       → cuelga debajo del comentario, la ve todo el
 *      al comentario             mundo. Sirve para quedar bien, no para vender.
 *   3. Respuesta PRIVADA       → abre un DM con quien comentó. ES LA QUE HACE
 *      al comentario             la magia del «comenta PRECIO y te lo mando»,
 *                                y la que Meta limita de verdad.
 *
 * LA REGLA DURA (verificada en la documentación de Meta, 1 sep 2026): a un
 * comentario se le manda UNA sola respuesta privada, dentro de los 7 días
 * siguientes. El segundo intento lo rechaza Meta. Por eso el turno se pide a la
 * base ANTES de enviar — ver `tomar_turno_respuesta_privada` en la migración
 * 0068. Aquí no se decide eso: aquí solo se envía.
 *
 * SI SE TOCAN LOS MOTIVOS DE ERROR hay que mirar también
 * `src/lib/canales/whatsappEnviar.ts`. Son la misma Graph API y varios códigos
 * se repiten; lo que NO se puede es explicar la misma falla distinto según el
 * canal.
 */

/**
 * EL ANFITRIÓN ES `graph.instagram.com`, con el token de la CUENTA.
 *
 * No es intercambiable con `graph.facebook.com`: cada camino de Meta tiene el
 * suyo, y usar el equivocado devuelve un error de permisos que hace perder
 * horas buscando un permiso que no falta. Aquí se usa «Instagram API con inicio
 * de sesión de Instagram» —el cliente entra con su cuenta, sin página de
 * Facebook; el porqué está en la cabecera de
 * `src/lib/integrations/instagram.ts`— y por tanto este anfitrión.
 *
 * EL ID QUE SE PASA A ESTAS FUNCIONES es el de la CUENTA PROFESIONAL, no el que
 * devuelve el canje del código. Son dos identificadores distintos; cuál es cuál
 * está explicado en `conectarConCodigo`.
 */
const GRAPH = "https://graph.instagram.com/v23.0";

export type ResultadoEnvio = { ok: boolean; error?: string; code?: number };

/**
 * El texto que devuelve Meta es para programadores. Esto es lo que lee alguien
 * que vende zapatos y solo quiere saber por qué su cliente no recibió nada.
 */
export function motivoInstagram(code: number, mensaje: string): string {
  switch (code) {
    case 10:
      // El más común de todos en Instagram, y el más confuso: no es que falte
      // un permiso técnico, es que la persona no ha escrito nunca o pasaron
      // más de 24 h y el negocio no puede iniciar la charla.
      return "Instagram no deja escribir primero a esta persona. Solo se le puede contestar dentro de las 24 horas siguientes a su último mensaje.";
    case 100:
      return "Instagram rechazó los datos del envío. Si era una respuesta a un comentario, lo más probable es que ese comentario ya no exista.";
    case 190:
    case 401:
      return "La conexión con Instagram caducó. Hay que volver a conectar la cuenta.";
    case 200:
    case 3:
      return "A esta app le falta el permiso de Instagram para mandar mensajes. Se pide en la revisión de Meta.";
    case 613:
      return "Demasiados envíos seguidos. Instagram pidió esperar un momento.";
    case 551:
      return "Esta persona bloqueó los mensajes del negocio en Instagram.";
    case 2534014:
      // Este es el que castiga la regla de la respuesta privada.
      return "Ese comentario ya recibió una respuesta privada, o pasaron más de 7 días. Instagram solo permite una.";
    default:
      return mensaje || "Instagram no aceptó el mensaje.";
  }
}

async function igPost(ruta: string, token: string, cuerpo: any): Promise<ResultadoEnvio> {
  try {
    const res = await fetch(`${GRAPH}/${ruta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (res.ok) return { ok: true };

    const texto = await res.text().catch(() => "");
    // El token NUNCA va al registro: iría a parar a los logs de Netlify, que
    // ve más gente de la que debería ver un token de página.
    console.error("[ig envío]", res.status, texto.slice(0, 300));
    let code = res.status;
    let mensaje = "";
    try {
      const j = JSON.parse(texto);
      code = j?.error?.code ?? code;
      mensaje = j?.error?.error_user_msg ?? j?.error?.message ?? "";
    } catch { /* la respuesta no era JSON */ }
    return { ok: false, code, error: motivoInstagram(code, mensaje) };
  } catch (e) {
    console.error("[ig envío] red:", e);
    return { ok: false, error: "No se pudo conectar con Instagram." };
  }
}

/** Un mensaje directo normal, dentro de la ventana de 24 h. */
export function enviarDm(igUserId: string, token: string, destinatario: string, texto: string) {
  return igPost(`${igUserId}/messages`, token, {
    recipient: { id: destinatario },
    // 1000 caracteres es el tope de Instagram, muy por debajo de WhatsApp.
    // Cortar aquí es preferible a que Meta rechace el mensaje entero.
    message: { text: texto.slice(0, 1000) },
  });
}

/** Manda una imagen o un vídeo por DM, por enlace. */
export function enviarAdjuntoDm(
  igUserId: string, token: string, destinatario: string, url: string, tipo: string,
) {
  const clase = tipo.startsWith("video/") ? "video" : tipo.startsWith("audio/") ? "audio" : "image";
  return igPost(`${igUserId}/messages`, token, {
    recipient: { id: destinatario },
    message: { attachment: { type: clase, payload: { url, is_reusable: true } } },
  });
}

/**
 * Respuesta PÚBLICA: cuelga debajo del comentario y la ve cualquiera.
 *
 * No tiene el límite de una sola vez ni el de 24 h — es contenido, no un
 * mensaje. Pero tampoco abre conversación: para eso está la privada.
 */
export function responderComentario(comentarioId: string, token: string, texto: string) {
  return igPost(`${comentarioId}/replies`, token, { message: texto.slice(0, 1000) });
}

/**
 * Respuesta PRIVADA a un comentario: abre el DM.
 *
 * ANTES DE LLAMAR A ESTO hay que haber ganado el turno en la base. Meta solo
 * permite una por comentario y no avisa dos veces: el segundo intento se
 * pierde, y con él la única oportunidad de hablar con ese lead.
 *
 * Fíjate en que el destinatario NO es la persona, es el COMENTARIO. Instagram
 * no da el id del usuario hasta que contesta; el comentario es la llave.
 */
export function responderEnPrivado(
  igUserId: string, token: string, comentarioId: string, texto: string,
) {
  return igPost(`${igUserId}/messages`, token, {
    recipient: { comment_id: comentarioId },
    message: { text: texto.slice(0, 1000) },
  });
}

/**
 * El nombre de quien escribe, para que la Bandeja no muestre un número largo.
 *
 * Va aparte y nunca lanza: que no se sepa el nombre no puede impedir que el
 * mensaje entre. Un contacto llamado «Instagram» es feo; perder la
 * conversación es grave.
 */
export async function perfilDeInstagram(
  igsid: string, token: string,
): Promise<{ nombre: string | null; usuario: string | null }> {
  try {
    const res = await fetch(
      `${GRAPH}/${igsid}?fields=name,username&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { nombre: null, usuario: null };
    const j = await res.json();
    return { nombre: j?.name ?? null, usuario: j?.username ?? null };
  } catch {
    return { nombre: null, usuario: null };
  }
}
