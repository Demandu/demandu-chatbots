/**
 * Qué acaba de pasar en Instagram.
 *
 * ARCHIVO PURO A PROPÓSITO: no toca la base, no llama a Meta, no importa nada.
 * Recibe el JSON del webhook y devuelve una lista de cosas entendidas. Así se
 * puede probar de verdad — con los ejemplos textuales de la documentación de
 * Meta — en vez de comprobar que el código «menciona» los campos correctos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE HAY QUE ENTENDER DE INSTAGRAM, Y QUE NO SE PARECE A WHATSAPP:
 *
 * Un mismo webhook entrega DOS FORMAS distintas (verificado contra la
 * documentación de Meta el 1 sep 2026):
 *
 *   entry[].messaging[]  → mensajes directos, RESPUESTAS A HISTORIAS
 *                          (`message.reply_to.story`) y adjuntos.
 *   entry[].changes[]    → COMENTARIOS (`field: "comments"`), comentarios en
 *                          vivo y menciones.
 *
 * Y el `entry[].id` NO es quien escribe: es la cuenta de Instagram del NEGOCIO.
 * Es la llave con la que se averigua de qué cliente de la plataforma se trata.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoEvento =
  | "dm"
  | "respuesta_historia"
  | "mencion_historia"
  | "comentario"
  | "comentario_vivo"
  | "mencion";

export type EventoInstagram = {
  tipo: TipoEvento;
  /** La cuenta de Instagram DEL NEGOCIO. Con esto se sabe de qué cliente es. */
  cuentaNegocio: string;
  /** Quién escribe. En un comentario puede no venir el id, pero sí el usuario. */
  de: string | null;
  usuario: string | null;
  texto: string;
  /**
   * Si tocó un botón rápido, lo que ese botón llevaba dentro.
   *
   * VA APARTE DEL TEXTO A PROPÓSITO, igual que en WhatsApp. Instagram manda las
   * dos cosas: `text` con la ETIQUETA que leyó la persona y `quick_reply.payload`
   * con el IDENTIFICADOR de la opción. El motor necesita el identificador para
   * saber por dónde sigue el flujo; la Bandeja necesita la etiqueta, porque un
   * uuid en el historial no le dice nada a nadie.
   */
  respuestaRapida?: string;
  /** Id del mensaje o del comentario: sirve para no atender dos veces. */
  id: string | null;
  /** Solo en comentarios: la llave para responder (en público o en privado). */
  comentarioId?: string;
  /** Solo en comentarios: en qué publicación o reel se comentó. */
  mediaId?: string;
  /** `FEED`, `REELS`, `STORY`… tal cual lo manda Meta. */
  tipoDeMedia?: string;
  /** Solo en respuestas a historias: a qué historia contestó. */
  historiaId?: string;
  adjuntos?: { tipo: string; url: string }[];
  cuando: number | null;
};

const texto = (v: unknown) => String(v ?? "").trim();

/**
 * Traduce el JSON de Meta a una lista de cosas que la plataforma entiende.
 *
 * Devuelve una LISTA porque un solo webhook puede traer varios eventos, y
 * porque lo que no se entiende simplemente no sale — nunca revienta. Un campo
 * nuevo de Meta no puede tumbar el webhook de un cliente: se ignora y ya.
 */
export function leerEventos(cuerpo: any): EventoInstagram[] {
  const fuera: EventoInstagram[] = [];
  if (!cuerpo || cuerpo.object !== "instagram") return fuera;

  for (const entry of cuerpo.entry ?? []) {
    const cuentaNegocio = texto(entry?.id);
    if (!cuentaNegocio) continue;

    // ── Camino 1: mensajería ────────────────────────────────────────────────
    for (const m of entry?.messaging ?? []) {
      const msg = m?.message;
      if (!msg) continue;

      // EL ECO ES LO PRIMERO QUE SE DESCARTA, Y ES LO MÁS IMPORTANTE DE ESTE
      // ARCHIVO. Instagram devuelve por el webhook los mensajes que manda el
      // propio negocio, marcados `is_echo`. Sin esta línea el bot se lee a sí
      // mismo, se contesta, se vuelve a leer… y no para. No es una hipótesis:
      // es el error clásico de toda integración de Messenger.
      if (msg.is_echo) continue;

      // Una reacción o un acuse de lectura no son un mensaje: no hay nada que
      // contestar y tratarlos como texto haría que el bot respondiera a un
      // corazón.
      if (m?.reaction || m?.read || m?.delivery) continue;

      const adjuntos = (msg.attachments ?? [])
        .map((a: any) => ({ tipo: texto(a?.type), url: texto(a?.payload?.url) }))
        .filter((a: any) => a.tipo || a.url);

      const base = {
        cuentaNegocio,
        de: texto(m?.sender?.id) || null,
        usuario: null,
        texto: texto(msg.text),
        ...(texto(msg?.quick_reply?.payload)
          ? { respuestaRapida: texto(msg.quick_reply.payload) }
          : {}),
        id: texto(msg.mid) || null,
        cuando: typeof m?.timestamp === "number" ? m.timestamp : null,
        ...(adjuntos.length ? { adjuntos } : {}),
      };

      // Una MENCIÓN EN HISTORIA llega como un mensaje con un adjunto de tipo
      // `story_mention`. Se mira antes que la respuesta a historia porque
      // Meta manda las dos cosas con forma parecida y la mención no trae
      // texto: confundirlas dejaría entrar un mensaje vacío.
      if (adjuntos.some((a: any) => a.tipo === "story_mention")) {
        fuera.push({ ...base, tipo: "mencion_historia" });
        continue;
      }

      // Una RESPUESTA A HISTORIA es un DM que además dice a qué historia
      // contesta. Distinguirla importa: quien contesta a una historia está
      // reaccionando a algo concreto que el negocio publicó, y el flujo puede
      // arrancar por ahí.
      const historia = msg?.reply_to?.story;
      if (historia) {
        fuera.push({ ...base, tipo: "respuesta_historia", historiaId: texto(historia.id) || undefined });
        continue;
      }

      // Un mensaje sin texto y sin adjuntos no es nada que contestar.
      if (!base.texto && !adjuntos.length) continue;

      fuera.push({ ...base, tipo: "dm" });
    }

    // ── Camino 2: cambios (comentarios y menciones) ─────────────────────────
    //
    // SE ACEPTAN LAS DOS FORMAS. La documentación de Meta muestra el comentario
    // unas veces dentro de `changes[]` y otras con `field`/`value` colgando
    // directamente del `entry`. En vez de apostar por una, se leen las dos: el
    // día que Meta cambie de opinión, esto sigue funcionando.
    const cambios = [
      ...(entry?.changes ?? []),
      ...(entry?.field ? [{ field: entry.field, value: entry.value }] : []),
    ];

    for (const c of cambios) {
      const campo = texto(c?.field);
      const v = c?.value ?? {};

      if (campo === "comments" || campo === "live_comments") {
        const comentarioId = texto(v.id);
        if (!comentarioId) continue;

        // UN COMENTARIO DEL PROPIO NEGOCIO NO SE ATIENDE. Cuando el bot
        // responde en público a un comentario, esa respuesta vuelve por el
        // webhook como un comentario más. Sin esto se responde a sí mismo,
        // en público, delante de todos los seguidores del cliente.
        if (texto(v?.from?.id) === cuentaNegocio) continue;

        fuera.push({
          tipo: campo === "live_comments" ? "comentario_vivo" : "comentario",
          cuentaNegocio,
          de: texto(v?.from?.id) || null,
          usuario: texto(v?.from?.username) || null,
          texto: texto(v.text),
          id: comentarioId,
          comentarioId,
          mediaId: texto(v?.media?.id) || undefined,
          tipoDeMedia: texto(v?.media?.media_product_type) || undefined,
          cuando: null,
        });
        continue;
      }

      if (campo === "mentions") {
        fuera.push({
          tipo: "mencion",
          cuentaNegocio,
          de: null,
          usuario: null,
          texto: texto(v.text),
          // Una mención puede venir en un comentario o en un pie de foto. Si
          // hay comentario, ese id es el que sirve para contestar.
          id: texto(v.comment_id) || texto(v.media_id) || null,
          comentarioId: texto(v.comment_id) || undefined,
          mediaId: texto(v.media_id) || undefined,
          cuando: null,
        });
      }
    }
  }

  return fuera;
}

/**
 * ¿Este evento puede abrir una conversación en la Bandeja?
 *
 * Un comentario NO abre conversación por sí solo: hasta que la persona no
 * contesta al DM, Instagram no da forma de escribirle más de una vez. Meterlo
 * en la Bandeja como una charla normal haría que el equipo intentara responder
 * a alguien que no puede recibir.
 */
export function abreConversacion(e: EventoInstagram): boolean {
  return e.tipo === "dm" || e.tipo === "respuesta_historia" || e.tipo === "mencion_historia";
}

/**
 * El texto con el que se decide qué flujo atiende.
 *
 * Una mención en historia no trae texto ninguno, y aun así el cliente quiere
 * que dispare algo («te menciono y me mandas el catálogo»). Se le da una
 * palabra estable para que se pueda escribir un disparador contra ella, en vez
 * de dejar al motor con la cadena vacía.
 */
export function textoParaElFlujo(e: EventoInstagram): string {
  if (e.texto) return e.texto;
  if (e.tipo === "mencion_historia") return "me mencionó en una historia";
  if (e.tipo === "respuesta_historia") return "respondió a una historia";
  return "";
}
