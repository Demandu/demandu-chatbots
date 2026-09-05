/**
 * Con qué agenda trabaja el chatbot cuando hay más de una conectada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO ES PURO A PROPÓSITO: sin base de datos, sin `server-only`, sin
 * nada que importar. Es la única regla que decide dónde acaba una cita, y una
 * regla así tiene que poder probarse entera sin levantar media plataforma.
 *
 * ── POR QUÉ HACE FALTA ELEGIR ─────────────────────────────────────────────
 *
 * Antes ganaba Calendly siempre que estuviera conectado. La razón era buena
 * —quien conecta Calendly es porque su disponibilidad de verdad vive ahí, con
 * sus reglas de antelación y sus topes por día— pero dejaba fuera un caso
 * normal: el negocio que usa Google para sus reuniones internas y Calendly
 * para otra cosa, o el que conecta Calendly solo para probarlo.
 *
 * A ese negocio le cambiábamos la agenda del bot SIN AVISAR, y para volver
 * atrás tenía que desconectar Calendly entero. Cambiar el comportamiento de
 * algo que ya funcionaba, en silencio, por un clic en otra pantalla, es de las
 * cosas que hacen que un cliente deje de confiar en la plataforma.
 *
 * ── PERO SOLO SE PREGUNTA CUANDO HAY DE VERDAD UNA DECISIÓN ───────────────
 *
 * Con una sola agenda conectada no hay nada que elegir, y sacar el selector
 * igual sería inventarle al cliente una decisión que no tiene. La pantalla lo
 * enseña solo cuando están las dos.
 *
 * ── Y LA PREFERENCIA NUNCA APUNTA A UNA AGENDA DESCONECTADA ───────────────
 *
 * Es la trampa obvia de guardar una preferencia: eliges Calendly, meses
 * después lo desconectas, y queda un puntero a algo que ya no existe. Se cierra
 * por los dos lados:
 *
 *   — Al desconectar una agenda se BORRA la preferencia si apuntaba a ella
 *     (ver `disconnectIntegration`). Así el estado malo no llega a existir.
 *   — Y aun así, si llegara —una fila vieja, un arreglo a mano en la base—
 *     aquí se ignora y se usa la que sí está conectada. Un bot que deja de
 *     agendar del todo es peor para la persona que está escribiendo que un bot
 *     que agenda en la única agenda que queda.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo que el negocio eligió. `null` = que decida la plataforma. */
export type AgendaPreferida = "google" | "calendly" | null;

/** Con cuál se acaba trabajando. */
export type AgendaQueManda = "google" | "calendly" | "ninguna";

export function agendaQueManda(
  preferida: AgendaPreferida,
  conectadas: { google: boolean; calendly: boolean },
): AgendaQueManda {
  const { google, calendly } = conectadas;

  if (!google && !calendly) return "ninguna";

  // SOLO SE HONRA SI ESA AGENDA ESTÁ CONECTADA. Ver la nota de arriba: una
  // preferencia huérfana no puede dejar al bot sin agendar.
  if (preferida === "calendly" && calendly) return "calendly";
  if (preferida === "google" && google) return "google";

  // Sin elección utilizable, CALENDLY GANA. No es un desempate al azar: si
  // alguien conectó Calendly, su disponibilidad real vive ahí —antelación
  // mínima, tope de citas por día, horarios por tipo de cita— y ofrecer huecos
  // calculados sobre su Google sería ofrecer horas que su propio Calendly
  // rechazaría. Agendaríamos por encima de sus reglas.
  if (calendly) return "calendly";
  return "google";
}

/**
 * ¿Se le enseña el selector?
 *
 * Solo con las dos conectadas. Con una, la respuesta ya está decidida y
 * preguntar sobra.
 */
export function hayQueElegir(conectadas: { google: boolean; calendly: boolean }): boolean {
  return conectadas.google && conectadas.calendly;
}

/**
 * Limpia lo que venga de la base.
 *
 * Cualquier cosa que no sea exactamente `google` o `calendly` es «que decida la
 * plataforma». Vale para el `null` normal, para una cadena vacía y para lo que
 * deje ahí un arreglo a mano.
 */
export function leerPreferida(v: unknown): AgendaPreferida {
  return v === "google" || v === "calendly" ? v : null;
}
