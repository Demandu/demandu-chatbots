/**
 * Las fechas del hilo de la Bandeja.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIVE FUERA DEL COMPONENTE PARA PODER PROBARSE SOLO, que es la única forma de
 * tener confianza en algo que solo se equivoca en los bordes: a medianoche, el
 * último día del mes, el 31 de diciembre, y cuando el que mira está en otro
 * país que el negocio.
 *
 * ── LA HORA ES LA DE QUIEN MIRA, Y ES UNA DECISIÓN ────────────────────────
 *
 * No se pasa `timeZone` a propósito: el navegador usa la suya. El agente de
 * Ciudad de México ve la hora de allá y el de Panamá la de allá, para el MISMO
 * mensaje. Cada uno razona en la hora en la que vive —«esto entró a las 5 de la
 * tarde» significa su tarde— y nadie convierte nada de cabeza mientras atiende.
 *
 * ── Y POR ESO LOS DÍAS NO SE PUEDEN COMPARAR EN UTC ───────────────────────
 *
 * A las 7 de la tarde en México ya es el día siguiente en Londres. Comparando
 * en UTC, el separador diría «Hoy» encima de un mensaje de ayer — y al revés,
 * partiría en dos una tarde que para quien mira fue un solo día. Por eso
 * `claveDeDia` usa las partes LOCALES (`getFullYear`, `getMonth`, `getDate`) y
 * nunca `toISOString`, que siempre devuelve UTC.
 *
 * `es-MX` en los formatos es solo el IDIOMA (a. m./p. m., los nombres de los
 * días). No mueve la hora ni un minuto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** El día de un instante, en la zona de quien mira. Para comparar, no para leer. */
export function claveDeDia(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** ¿Estos dos instantes cayeron el mismo día para quien mira? */
export function mismoDia(a: string | Date, b: string | Date): boolean {
  const ka = claveDeDia(a);
  return !!ka && ka === claveDeDia(b);
}

/**
 * El rótulo que separa un día del siguiente dentro del hilo.
 *
 * SIN ESTO, UNA CONVERSACIÓN DE TRES SEMANAS ES UN MURO DE «05:20 p. m.» sin
 * forma de saber de qué día es ninguno. Es lo primero que se busca el día que
 * haya que defender un «me contestaron tarde».
 *
 * El año solo aparece si no es el de ahora: «viernes, 3 de octubre» se lee
 * mejor que «viernes, 3 de octubre de 2026» cuando es obvio de qué año se
 * habla, y el que importa —el de hace dos años— sí lo lleva.
 */
export function separadorDeDia(iso: string | Date, ahora: Date = new Date()): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const clave = claveDeDia(d);
  if (clave === claveDeDia(ahora)) return "Hoy";
  if (clave === claveDeDia(new Date(ahora.getTime() - 86_400_000))) return "Ayer";

  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(d.getFullYear() !== ahora.getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * Fecha y hora completas, para enseñarlas al pasar el ratón por la hora.
 *
 * CON SEGUNDOS, y no es un capricho: el día que haya que discutir un tiempo de
 * respuesta con un cliente, los minutos redondos no bastan.
 */
export function fechaLarga(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
