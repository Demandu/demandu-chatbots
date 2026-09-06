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

export type ResultadoEnvio = {
  ok: boolean;
  error?: string;
  code?: number;
  /**
   * El identificador que da Meta al aceptar el mensaje (`wamid.…`).
   *
   * Es la ÚNICA forma de casar después el aviso de entrega: Meta dice si el
   * mensaje llegó, falló o se leyó por el webhook de estados, y ese aviso solo
   * trae este identificador. Sin guardarlo, un fallo posterior no se puede
   * atribuir a ningún mensaje y desaparece.
   */
  wamid?: string;
};

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
    if (res.ok) {
      // SE GUARDA EL IDENTIFICADOR QUE DEVUELVE META, y no es un detalle.
      //
      // Que Meta conteste 200 significa «lo acepto», NO «llegó». La entrega
      // real la avisa después por el webhook de estados, y ese aviso viene
      // identificado por este `wamid`. Sin guardarlo no hay forma de casar el
      // aviso con el mensaje, y un fallo posterior se pierde: la Bandeja
      // seguiría enseñando «enviado» para siempre.
      //
      // Pasó exactamente eso con la primera plantilla enviada desde la Bandeja:
      // Meta la aceptó, no llegó nunca, y en pantalla figuraba como enviada.
      const j = await res.json().catch(() => ({} as any));
      const wamid = j?.messages?.[0]?.id;
      return wamid ? { ok: true, wamid: String(wamid) } : { ok: true };
    }

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
 * Un texto con UN botón que abre un enlace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO ES ADORNO: es la diferencia entre recuperar una venta y perderla. Un cobro
 * que no se completó termina en un mensaje donde lo único que importa es volver
 * a intentarlo, y un botón grande se pulsa; una dirección suelta en medio de un
 * párrafo, no.
 *
 * SI EL BOTÓN FALLA, VA EL TEXTO. Los mensajes interactivos dependen de que el
 * número los tenga habilitados, y eso no se sabe hasta que Meta contesta. Que
 * el cliente no reciba NADA porque el botón no se pudo pintar sería cambiar una
 * mejora por una avería, así que se reintenta con el enlace dentro del texto —
 * que WhatsApp convierte en enlace igual.
 *
 * FUERA DE LAS 24 HORAS NO SE REINTENTA. Ahí el problema no es el botón: es que
 * no se puede escribir de ninguna forma, y repetir el envío solo gasta otro
 * intento para recibir el mismo rechazo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function enviarConBoton(
  pnid: string, token: string, to: string,
  body: string, boton: string, url: string,
): Promise<ResultadoEnvio> {
  const conBoton = await waPost(pnid, token, {
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: body.slice(0, 1024) },
      action: {
        name: "cta_url",
        // Meta corta a 20 caracteres sin avisar y deja el botón a medias.
        parameters: { display_text: boton.slice(0, 20), url },
      },
    },
  });

  if (conBoton.ok) return conBoton;
  if (conBoton.code === 131047) return conBoton;

  console.error("[wa botón] no se pudo, va como texto:", conBoton.code, conBoton.error);
  return enviarTexto(pnid, token, to, `${body}\n\n${url}`);
}

/**
 * Manda una plantilla aprobada.
 *
 * ES LA ÚNICA FORMA DE REABRIR UNA CONVERSACIÓN. Pasadas 24 horas desde el
 * último mensaje de la persona, WhatsApp no deja escribirle texto libre: la
 * plantilla aprobada es la puerta, y sin ella el lead queda incomunicado para
 * siempre.
 *
 * LOS VALORES VAN EN ORDEN y tienen que ser EXACTAMENTE tantos como {{1}},
 * {{2}}… tenga el cuerpo aprobado. Si sobran o faltan, Meta rechaza el envío
 * entero con un error que no dice cuál falta. Quien llama a esto ya lo
 * comprobó contra la plantilla guardada; aquí solo se manda.
 *
 * Un salto de línea dentro de un valor también hace que Meta lo rechace, así
 * que se aplanan: es preferible un texto en una línea a un mensaje no enviado.
 */
export function enviarPlantilla(
  pnid: string, token: string, to: string,
  nombre: string, idioma: string, valores: string[],
  /**
   * Lo que va al final de la dirección del botón, cuando la plantilla tiene un
   * botón de enlace con hueco.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * NO ES LA DIRECCIÓN ENTERA, ES SOLO EL TROZO QUE FALTA. Meta guarda la
   * plantilla con la dirección fija más un `{{1}}` al final —por ejemplo
   * `https://store.demandu.tech/{{1}}`— y en el envío solo se manda lo que va
   * en ese hueco. Mandar la dirección completa da un botón con la dirección
   * repetida dos veces, que no lleva a ningún sitio.
   *
   * SIN ESTO, UNA PLANTILLA CON BOTÓN NO SALE. Meta rechaza el envío entero
   * con «number of parameters does not match» — un mensaje que hace revisar el
   * cuerpo, que no era el problema.
   * ─────────────────────────────────────────────────────────────────────────
   */
  colaDelBoton?: string,
) {
  const template: any = { name: nombre, language: { code: idioma || "es" } };
  const componentes: any[] = [];

  const limpios = (valores ?? []).map((v) => String(v ?? "").replace(/\s*\n\s*/g, " ").trim());
  if (limpios.length) {
    componentes.push({
      type: "body",
      parameters: limpios.map((v) => ({ type: "text", text: v })),
    });
  }

  const cola = String(colaDelBoton ?? "").trim();
  if (cola) {
    componentes.push({
      type: "button",
      sub_type: "url",
      // El índice del botón, en texto. Es el primero y hoy solo hay uno; si
      // algún día hay dos, este número tiene que salir de la plantilla.
      index: "0",
      parameters: [{ type: "text", text: cola }],
    });
  }

  if (componentes.length) template.components = componentes;
  return waPost(pnid, token, { to, type: "template", template });
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
