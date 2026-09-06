import "server-only";
import {
  ajustesQueMandan, tiendaQueManda,
  type FilaDeAgente, type AjustesDeIA,
} from "./agenteAjustes";

/**
 * Qué agente usa cada chatbot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN AGENTE PUEDE SERVIR A VARIOS BOTS, y ese es el motivo de que exista la
 * tabla. Un negocio con WhatsApp, Instagram y web tiene tres chatbots y UNA
 * forma de hablar; antes escribía el mismo prompt tres veces y el día que
 * cambiaba su horario lo cambiaba en tres sitios — o se le quedaba uno viejo,
 * que siempre era el que nadie miraba.
 *
 * ── PERO EL CLIENTE NO TIENE POR QUÉ ENTERARSE ────────────────────────────
 *
 * Un chatbot nuevo nace con su propio agente y el negocio edita la
 * personalidad donde la editaba siempre. La palabra «agente» solo aparece
 * cuando le sirve de algo: cuando quiere que otro canal hable igual. Obligar a
 * un dueño de panadería a crear primero un agente, luego un chatbot y luego
 * enlazarlos es pedirle que entienda nuestra arquitectura para poder vender
 * pan.
 *
 * ── Y SI NO HAY AGENTE, NO PASA NADA ──────────────────────────────────────
 *
 * Se cae a `bots.ai`, que sigue ahí con los datos intactos. Esa red es lo que
 * permite publicar esto sin jugarse los chatbots que están vendiendo hoy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AgenteDelBot = {
  /** Los ajustes que entiende el motor, listos para `{...AI_DEFAULTS, ...esto}`. */
  ajustes: AjustesDeIA;
  /** La tienda que eligió el agente, o nulo para decidir como siempre. */
  tiendaId: string | null;
  /** Nulo cuando se está usando el respaldo de `bots.ai`. */
  agenteId: string | null;
  nombre: string | null;
};

/** Las columnas del agente, en un solo sitio para que no se separen. */
export const COLUMNAS_DE_AGENTE =
  "id, nombre, ia_encendida, prompt, tono, respaldo, max_palabras, herramientas, " +
  "criterios, sistema_url, sistema_descripcion, ia_de_respaldo, tienda_id";

/**
 * El agente de este bot, con su respaldo.
 *
 * Recibe la fila del bot que quien llama YA TIENE —no la vuelve a pedir— para
 * no gastar un viaje a la base en cada mensaje. Si el bot trae `agente_id`, se
 * pide el agente; si no, se usa su `ai` de siempre.
 */
export async function agenteDelBot(
  admin: any,
  bot: { id?: string; ai?: unknown; agente_id?: string | null } | null | undefined,
): Promise<AgenteDelBot> {
  const sinAgente = (): AgenteDelBot => ({
    ajustes: ajustesQueMandan(null, bot?.ai),
    tiendaId: null,
    agenteId: null,
    nombre: null,
  });

  const id = String(bot?.agente_id ?? "").trim();
  if (!id) return sinAgente();

  try {
    const { data } = await admin
      .from("agentes")
      .select(COLUMNAS_DE_AGENTE)
      .eq("id", id)
      .maybeSingle();

    // EL BOT APUNTA A UN AGENTE QUE YA NO ESTÁ. No puede quedarse mudo: se usa
    // su configuración de siempre. La clave foránea lo pone a nulo al borrar,
    // así que esto solo pasa con una carrera o un arreglo a mano — pero pasa.
    if (!data) return sinAgente();

    const fila = data as FilaDeAgente;
    return {
      ajustes: ajustesQueMandan(fila, bot?.ai),
      tiendaId: tiendaQueManda(fila),
      agenteId: String(fila.id ?? "") || null,
      nombre: fila.nombre ?? null,
    };
  } catch (e: any) {
    // Que la base tenga un mal minuto no puede dejar sin IA a un cliente. Se
    // apunta y se sigue con lo de siempre.
    console.error("[agentes] no pude leer el agente, sigo con bots.ai:", e?.message ?? e);
    return sinAgente();
  }
}
