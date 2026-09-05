/**
 * De la fila de un agente a los ajustes que entiende el motor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHIVO PURO, SIN UN SOLO IMPORT. Es la regla que decide con qué personalidad
 * contesta el bot, y eso tiene que poder probarse sin base de datos.
 *
 * ── LO QUE NO SE PUSO NO SE MANDA, Y ESE ES TODO EL CUIDADO DE AQUÍ ───────
 *
 * Todo el motor hace `{ ...AI_DEFAULTS, ...ajustes }`. En JavaScript, una clave
 * PRESENTE con valor `undefined` PISA IGUAL que una con valor:
 *
 *     { ...{ a: 1 }, ...{ a: undefined } }   →   { a: undefined }
 *
 * Así que copiar el agente entero —con sus nulos— borraría todos los valores
 * por defecto: el bot se quedaría sin personalidad, sin tono y sin mensaje de
 * respaldo, y contestaría con cadenas vacías. No lanza, no avisa: contesta
 * vacío, que es la peor forma de fallar.
 *
 * Por eso las claves se añaden UNA A UNA y solo si el agente tiene algo. Nulo
 * significa «no lo puso», y lo rellena el valor por defecto del código, como
 * ha sido siempre.
 *
 * ── Y POR ESO LOS VALORES POR DEFECTO SE QUEDAN EN EL CÓDIGO ──────────────
 *
 * Si al crear un agente se copiaran ahí los valores por defecto, quedarían
 * CONGELADOS: el día que se mejore el texto de respaldo, los agentes de hoy
 * seguirían con el viejo y nadie sabría por qué.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** La fila de `agentes`, tal cual sale de la base. */
export type FilaDeAgente = {
  id?: string | null;
  nombre?: string | null;
  ia_encendida?: boolean | null;
  prompt?: string | null;
  tono?: string | null;
  respaldo?: string | null;
  max_palabras?: number | null;
  herramientas?: string[] | null;
  criterios?: string | null;
  sistema_url?: string | null;
  sistema_descripcion?: string | null;
  ia_de_respaldo?: boolean | null;
  tienda_id?: string | null;
};

/** Lo que el motor espera, con las claves que había en `bots.ai`. */
export type AjustesDeIA = {
  enabled?: boolean;
  persona?: string;
  style?: string;
  fallback?: string;
  maxWords?: number;
  herramientas?: string[];
  criterios?: string;
  sistemaUrl?: string;
  sistemaDescripcion?: string;
  fallback_flujo?: boolean;
};

/** Traduce la fila del agente. Las claves vacías NO viajan (ver arriba). */
export function comoAjustes(a: FilaDeAgente | null | undefined): AjustesDeIA {
  const o: AjustesDeIA = {};
  if (!a) return o;

  if (a.ia_encendida !== null && a.ia_encendida !== undefined) o.enabled = a.ia_encendida;
  if (a.ia_de_respaldo !== null && a.ia_de_respaldo !== undefined) o.fallback_flujo = a.ia_de_respaldo;
  if (a.prompt !== null && a.prompt !== undefined) o.persona = a.prompt;
  if (a.tono !== null && a.tono !== undefined) o.style = a.tono;
  if (a.respaldo !== null && a.respaldo !== undefined) o.fallback = a.respaldo;
  if (a.criterios !== null && a.criterios !== undefined) o.criterios = a.criterios;
  if (a.sistema_url !== null && a.sistema_url !== undefined) o.sistemaUrl = a.sistema_url;
  if (a.sistema_descripcion !== null && a.sistema_descripcion !== undefined) {
    o.sistemaDescripcion = a.sistema_descripcion;
  }
  // `max_palabras` puede venir como texto desde la base según el cliente. Un
  // `maxWords` que no es número recorta a cero palabras y el bot enmudece.
  if (a.max_palabras !== null && a.max_palabras !== undefined) {
    const n = Number(a.max_palabras);
    if (Number.isFinite(n) && n > 0) o.maxWords = n;
  }
  if (Array.isArray(a.herramientas)) o.herramientas = a.herramientas;

  return o;
}

/**
 * Con qué ajustes contesta este bot.
 *
 * ── LA CAÍDA A `bots.ai` NO ES PROVISIONAL: ES LA RED ─────────────────────
 *
 * Si el bot no tiene agente —porque se borró, porque el arrastre no lo alcanzó,
 * porque alguien tocó la base a mano— el bot NO se queda mudo: usa la
 * configuración de siempre, que sigue ahí intacta.
 *
 * Esa red es lo que permite publicar este cambio sin jugarse los chatbots que
 * están vendiendo hoy. Se quita cuando lleve semanas en vivo, no antes.
 */
export function ajustesQueMandan(
  agente: FilaDeAgente | null | undefined,
  aiDelBot: unknown,
): AjustesDeIA {
  if (agente) return comoAjustes(agente);
  return (aiDelBot && typeof aiDelBot === "object" ? aiDelBot : {}) as AjustesDeIA;
}

/**
 * Con qué tienda trabaja.
 *
 * La elegida en el agente MANDA; si no eligió, se sigue con lo de siempre —la
 * tienda enlazada al bot, y con empate la primera por nombre—. Nulo aquí
 * significa «que decida como decidía antes», así que esto no cambia el
 * comportamiento de nadie hasta que alguien elija.
 */
export function tiendaQueManda(agente: FilaDeAgente | null | undefined): string | null {
  const t = agente?.tienda_id;
  return typeof t === "string" && t.trim() ? t : null;
}
