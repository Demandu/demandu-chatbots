/**
 * Cómo se contacta al equipo de Demandu.
 *
 * EN UN SOLO SITIO A PROPÓSITO. Estos datos salen en varias pantallas y en los
 * mensajes de error del cobro. Repartidos por el código, el día que cambie el
 * número quedaría alguno viejo — y un teléfono viejo en la pantalla de "hablar
 * con ventas" es un cliente que se pierde sin que nadie se entere.
 */

export const VENTAS = {
  correo: "contacto@demandu.tech",
  /** Internacional, sin «+» ni espacios: es lo que espera wa.me */
  whatsapp: "50762381138",
  /** Cómo se le enseña a una persona. */
  whatsappVisible: "+507 6238-1138",
} as const;

/** Un enlace de WhatsApp con el mensaje ya escrito. */
export function linkWhatsApp(mensaje: string): string {
  return `https://wa.me/${VENTAS.whatsapp}?text=${encodeURIComponent(mensaje)}`;
}

/** Un enlace de correo con el asunto ya puesto. */
export function linkCorreo(asunto: string, cuerpo?: string): string {
  const partes = [`subject=${encodeURIComponent(asunto)}`];
  if (cuerpo) partes.push(`body=${encodeURIComponent(cuerpo)}`);
  return `mailto:${VENTAS.correo}?${partes.join("&")}`;
}

/**
 * La frase que se usa cuando algo hay que resolverlo hablando con el equipo.
 * Se repite en varios errores del cobro; tenerla aquí evita que cada uno diga
 * una cosa distinta.
 */
export const HABLA_CON_NOSOTROS =
  `Escríbenos por WhatsApp al ${VENTAS.whatsappVisible} o a ${VENTAS.correo} y te lo armamos.`;
