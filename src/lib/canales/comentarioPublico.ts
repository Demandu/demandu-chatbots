/**
 * QUÉ SE CONTESTA, A LA VISTA DE TODOS, DEBAJO DE UN COMENTARIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA QUE ARREGLA. Hasta hoy la respuesta pública era UN TEXTO FIJO:
 * el negocio escribía «¡Te lo mandé por privado! 💌» y eso salía debajo de
 * TODOS los comentarios, dijeran lo que dijeran. Alguien pregunta «¿cuánto
 * cuesta?» y otro escribe «qué bonito» — y los dos reciben la misma frase.
 *
 * Eso es exactamente lo que hace que un negocio parezca un robot. Y es raro,
 * porque la IA ya está conectada: contesta los mensajes directos entendiendo
 * lo que le dicen. Lo único que faltaba era dejarla hablar también arriba.
 *
 * ── TRES MODOS, Y NINGUNO ES UNA TRAMPA ───────────────────────────────────
 *
 *   ia     · Lana lee el comentario y contesta a lo que preguntaron.
 *   texto  · La frase de siempre, igual para todos. Sigue sirviendo para el
 *            clásico «comenta PROMO y te mando el enlace».
 *   no     · No se contesta en público. Solo el privado.
 *
 * ── POR QUÉ EL MODO POR DEFECTO ES `texto` Y NO `ia` ──────────────────────
 *
 * Porque es lo que hacen HOY los flujos que ya existen. Un cliente que tiene
 * su promoción funcionando no puede despertarse con la IA improvisando debajo
 * de sus publicaciones porque nosotros cambiamos el valor por defecto. Lo
 * nuevo se elige; no se hereda.
 *
 * ── LO QUE NUNCA SE PUBLICA ───────────────────────────────────────────────
 *
 * El mensaje de respaldo de la IA («esa no me la sé todavía 🙈») está escrito
 * para una conversación privada, donde se puede pedir ayuda a una persona.
 * Debajo de una publicación lo lee todo el mundo y deja al negocio como si no
 * supiera de lo suyo. Si la IA no tiene la respuesta, el comentario se queda
 * SIN contestar y el privado sale igual: callarse en público es mejor que
 * quedar mal en público.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ModoPublico = "no" | "ia" | "texto";

/** Lo que se ofrece en la barra del flujo. El orden es el de la pantalla. */
export const MODOS_PUBLICOS: { valor: ModoPublico; label: string; desc: string }[] = [
  {
    valor: "ia",
    label: "Que conteste Lana",
    desc: "Lee el comentario y contesta a lo que preguntaron, con la información de tu negocio.",
  },
  {
    valor: "texto",
    label: "Siempre el mismo texto",
    desc: "La misma frase debajo de todos los comentarios. Útil para «comenta PROMO y te lo mando».",
  },
  {
    valor: "no",
    label: "No contestar en público",
    desc: "Solo le escribes por privado. En el comentario no aparece nada.",
  },
];

/**
 * En qué modo está este flujo.
 *
 * SIN COLUMNA, `texto`. Los flujos de antes de la 0108 no tienen el campo y
 * tienen que seguir comportándose exactamente igual que ayer.
 */
export function modoDeRespuestaPublica(
  flujo: { respuesta_publica_modo?: string | null } | null | undefined,
): ModoPublico {
  const v = String(flujo?.respuesta_publica_modo ?? "texto");
  return v === "ia" || v === "no" ? v : "texto";
}

/**
 * Máximo de caracteres de una respuesta pública.
 *
 * Instagram admite 2.200, así que esto NO es un límite suyo: es criterio. Un
 * párrafo largo debajo de un comentario no lo lee nadie y se ve a la legua que
 * lo escribió una máquina. La conversación de verdad va en el privado.
 */
export const MAX_PUBLICO = 280;

/**
 * Deja el texto como para publicarlo debajo de un comentario.
 *
 * UNA SOLA LÍNEA. Los saltos de línea en un comentario de Instagram se ven
 * como un muro; y los asteriscos y almohadillas del markdown salen literales
 * —el comentario no los interpreta— y parecen un error del sistema.
 *
 * Se corta por la última frase que quepa entera, no a media palabra: un
 * comentario público cortado con «…» a mitad de una cifra da peor impresión
 * que uno más corto.
 */
export function limpiarParaComentario(texto: string | null | undefined, max = MAX_PUBLICO): string {
  const plano = String(texto ?? "")
    .replace(/[*_#`>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plano.length <= max) return plano;

  const recorte = plano.slice(0, max);
  const corte = Math.max(recorte.lastIndexOf(". "), recorte.lastIndexOf("! "), recorte.lastIndexOf("? "));
  // Solo se respeta la frase si deja algo con sentido; si no, se corta por
  // palabra antes que devolver dos palabras sueltas.
  if (corte > max * 0.5) return recorte.slice(0, corte + 1).trim();

  const espacio = recorte.lastIndexOf(" ");
  return (espacio > 0 ? recorte.slice(0, espacio) : recorte).trim();
}

/**
 * ¿Esto se puede publicar?
 *
 * Vacío no, obviamente. Y el mensaje de respaldo de la IA TAMPOCO, por lo que
 * está explicado arriba: es un texto de conversación privada. Se compara sin
 * distinguir mayúsculas ni espacios de sobra porque el negocio lo escribe a
 * mano en sus ajustes y casi nunca coincide carácter a carácter.
 */
export function sePuedePublicar(texto: string | null | undefined, respaldo?: string | null): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;

  const r = String(respaldo ?? "").trim();
  if (!r) return true;

  const igual = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  return igual(t) !== igual(r);
}

/**
 * Lo que se le pide a la IA para contestar en público.
 *
 * NO ES LA MISMA PREGUNTA QUE EN EL PRIVADO, y por eso está escrita aparte.
 * Un comentario público tiene tres diferencias que importan:
 *
 *   1. Lo lee todo el mundo, no solo quien preguntó. Los datos personales no
 *      se piden ahí ni de broma.
 *   2. Es cortísimo. Dos líneas como mucho.
 *   3. Si además va a salir un privado, el comentario tiene que decirlo — es
 *      lo que hace que la persona abra el mensaje y siga la conversación.
 *
 * Va como pregunta —no como ajuste del sistema— a propósito: así el negocio
 * conserva su forma de hablar, su persona y su información, que es lo que ya
 * tiene configurado y no queremos duplicar aquí.
 */
export function preguntaParaElComentario(v: {
  texto: string | null | undefined;
  usuario?: string | null;
  habraPrivado?: boolean;
}): string {
  const comentario = String(v.texto ?? "").trim();
  const quien = String(v.usuario ?? "").trim();

  return [
    "Alguien comentó en una publicación del negocio en Instagram.",
    quien ? `Comentó @${quien}.` : "",
    `Comentario: «${comentario}»`,
    "",
    "Escribe la respuesta que se va a publicar DEBAJO de ese comentario, a la vista de todo el mundo:",
    "- Contesta a lo que preguntaron, con la información del negocio. Si no la tienes, no te la inventes.",
    "- Una o dos líneas como mucho. Es un comentario, no un chat.",
    "- No pidas datos personales (teléfono, correo, dirección): lo lee cualquiera.",
    v.habraPrivado
      ? "- Termina diciendo que le escribes por privado con el detalle."
      : "- No digas que le escribes por privado.",
    "- Escribe solo el texto del comentario, sin comillas ni explicaciones.",
  ]
    .filter(Boolean)
    .join("\n");
}
