/**
 * QUÉ CONTESTÓ LA PERSONA AL RECORDATORIO DE SU CITA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RESPUESTA LA LEE ESTO, NO LA IA. Y no es un capricho de arquitectura: si
 * una cita queda confirmada porque un modelo interpretó «ahí estaré», el negocio
 * se organiza sobre una interpretación. Aquí se decide con reglas que se pueden
 * leer, probar y discutir.
 *
 * Es la misma línea que el resto de la plataforma: los hechos —que hay dinero,
 * que hay una cita, que alguien confirmó— los afirma el sistema mirando la base.
 * La IA conversa.
 *
 * ── SE ESPERA UN BOTÓN, PERO LA GENTE ESCRIBE ─────────────────────────────
 *
 * La plantilla lleva dos botones y Meta los devuelve como texto exacto
 * («Confirmo», «Necesito cambiarla»). Con eso bastaría. Pero medio mundo
 * contesta escribiendo —«si», «ahí estaré», «no puedo ese día»—, y no entender
 * eso deja al negocio creyendo que nadie confirma.
 *
 * ── ANTE LA DUDA, NO SE DECIDE ────────────────────────────────────────────
 *
 * `null` significa «esto no es una respuesta al recordatorio», y entonces el
 * mensaje sigue su camino normal: flujo, agente o IA. Equivocarse hacia el
 * silencio cuesta que el negocio pregunte; equivocarse hacia «confirmada»
 * cuesta que se reserve una hora para alguien que dijo que no podía.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Respuesta = "confirma" | "cambia";

/** El texto EXACTO de los botones de la plantilla. Cambiarlo aquí no basta:
 *  la plantilla vive aprobada en la cuenta de Meta de cada cliente. */
export const BOTON_CONFIRMA = "Confirmo";
export const BOTON_CAMBIA = "Necesito cambiarla";

/** Se quitan tildes y signos para que «sí», «si» y «SI!» sean lo mismo. */
function pelado(t: string | null | undefined): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lo que NO se puede confundir: cambiar o cancelar gana siempre que aparezca.
 *
 * «Sí, pero necesito cambiarla» lleva un «sí» dentro. Mirar primero lo que
 * confirma dejaría esa cita en pie y a alguien esperando en la puerta. Ante dos
 * señales, manda la que dice que algo no va a pasar.
 */
const CAMBIA = [
  /\bnecesito cambiarla\b/,
  /\b(cambiar|cambio|mover|reagendar|posponer|aplazar)\b/,
  /\b(cancelar|cancelo|anular|no voy|no podre|no puedo|no me queda|no llego)\b/,
  /\botro (dia|horario|momento)\b/,
];

/**
 * Lo que confirma. Corto a propósito: son respuestas a una pregunta cerrada,
 * no conversación. Cuanto más ancho, más citas confirmadas que nadie confirmó.
 */
const CONFIRMA = [
  /^confirmo$/,
  /\bconfirm(o|ado|ada|amos)\b/,
  /^(si|si señor|si claro|claro|dale|listo|perfecto|de acuerdo|va|ok|okey|okay)$/,
  /^(ahi|alli) (estare|nos vemos)$/,
  /\bahi estare\b/,
  /\bcuenta conmigo\b/,
  /\bnos vemos\b/,
];

/**
 * ¿Esto es una respuesta al recordatorio, y qué dice?
 *
 * Devuelve `null` cuando no lo es — y entonces el mensaje sigue su camino
 * normal. Ver la cabecera.
 */
export function queQuisoDecir(texto: string | null | undefined): Respuesta | null {
  const t = pelado(texto);
  if (!t) return null;

  // UN MENSAJE LARGO NO ES UNA RESPUESTA A UN BOTÓN. Quien escribe un párrafo
  // está contando algo, y merece que lo lea el bot entero y no esta regla.
  if (t.split(" ").length > 8) return null;

  if (CAMBIA.some((r) => r.test(t))) return "cambia";
  if (CONFIRMA.some((r) => r.test(t))) return "confirma";
  return null;
}

/**
 * El texto del recordatorio, para la plantilla de Meta.
 *
 * Los huecos van en el mismo orden que en la plantilla aprobada: si aquí se
 * cambia el orden, Meta manda el mensaje con el nombre donde va la hora y no
 * avisa de nada.
 */
export function valoresDelRecordatorio(v: {
  nombre?: string | null;
  negocio: string;
  cuando: string;
}): string[] {
  return [
    String(v.nombre ?? "").trim() || "Hola",
    String(v.negocio ?? "").trim(),
    String(v.cuando ?? "").trim(),
  ];
}

/** Cómo se lee la cita en el chat y en la Bandeja: «el jueves 11 a las 3:00 p.m.» */
export function cuandoEnPalabras(inicioISO: string, zona: string): string {
  const d = new Date(inicioISO);
  if (isNaN(d.getTime())) return "";
  try {
    const dia = new Intl.DateTimeFormat("es-MX", {
      timeZone: zona || "UTC", weekday: "long", day: "numeric", month: "long",
    }).format(d);
    const hora = new Intl.DateTimeFormat("es-MX", {
      timeZone: zona || "UTC", hour: "numeric", minute: "2-digit",
    }).format(d);
    return `el ${dia} a las ${hora}`;
  } catch {
    return "";
  }
}
