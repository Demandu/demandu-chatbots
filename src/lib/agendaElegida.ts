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

  // ── SIN ELECCIÓN, GANA LO QUE YA ESTABA FUNCIONANDO ──────────────────────
  //
  // ESTA REGLA ERA AL REVÉS Y ROMPIÓ UNA CUENTA DE VERDAD. El razonamiento
  // original sonaba bien: quien conecta Calendly es porque su disponibilidad
  // real vive ahí, así que Calendly ganaba siempre que estuviera conectado.
  //
  // Lo que pasó de verdad: un negocio con Google conectado y su bloque
  // «Agendar cita» apuntando a su calendario de Google conectó Calendly para
  // probarlo. En ese instante el bloque cambió de agenda solo. Su bloque
  // seguía diciendo «Revisa los horarios disponibles en Google Calendar»,
  // pero el motor ya preguntaba a Calendly — y como el valor guardado era un
  // ID de Google, Calendly no devolvía nada. El bot dejó de agendar y empezó
  // a pasar a las personas con un humano.
  //
  // Ningún error a la vista. Un clic en una pantalla de ajustes rompió la
  // función principal del bot en otra.
  //
  // LA REGLA BUENA, Y POR QUÉ ES ESTA:
  //
  // Google solo puede estar conectado en una cuenta que YA lo estaba usando —
  // era la única agenda que existía antes de que hubiera Calendly. Así que
  // «con las dos y sin elegir, manda Google» significa exactamente «nadie
  // cambia de agenda sin pedirlo». Y quien conecta Calendly solo tiene que
  // pulsar un botón que la pantalla le está enseñando.
  //
  // El daño de equivocarse no es simétrico: cambiar solo rompe citas de
  // clientes reales y no avisa; no cambiar cuesta un clic bien señalizado.
  if (google) return "google";
  return "calendly";
}

/**
 * ¿Este valor es de verdad un tipo de evento de Calendly?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL BLOQUE «AGENDAR CITA» GUARDA UN SOLO CAMPO para las dos agendas, y esa
 * decisión —tomada para que nadie tuviera que reconfigurar sus flujos al
 * cambiar de proveedor— es la que rompió una cuenta en producción.
 *
 * En Google ese campo es un correo o un id largo acabado en
 * `@group.calendar.google.com`. En Calendly es una URL de su API. Pasarle a
 * Calendly el valor de Google no da un error entendible: da CERO HORARIOS, que
 * se parece muchísimo a «no hay huecos esta semana».
 *
 * Así que se comprueba antes de usarlo. Lo que no tiene forma de tipo de
 * evento de Calendly SE IGNORA, y se cae al primer tipo activo de la cuenta —
 * que es lo mismo que pasa cuando el campo está vacío. Peor que agendar en el
 * tipo de cita equivocado solo hay una cosa: no agendar y no decir por qué.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function tipoDeEventoDeCalendly(valor: unknown): string | null {
  const v = String(valor ?? "").trim();
  return /^https:\/\/api\.calendly\.com\/event_types\/[A-Za-z0-9-]+$/.test(v) ? v : null;
}

/** Lo que puede elegir un bloque «Agendar cita». */
export type EleccionDelBloque = "cuenta" | "google" | "calendly";

/**
 * Qué agenda usa ESTE bloque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL BLOQUE PUEDE ELEGIR, DESPUÉS DE HABER DICHO QUE NO
 *
 * El argumento en contra era «la agenda es del negocio, no del bloque». Suena
 * bien y es falso: EL BLOQUE YA GUARDABA CONFIGURACIÓN DEL PROVEEDOR — ese
 * `calendarId` es un calendario de Google. La elección de proveedor ya era por
 * bloque; lo único que pasaba es que era invisible y vivía en un campo
 * compartido con Calendly.
 *
 * Y eso es exactamente lo que rompió una cuenta en producción: al conectar
 * Calendly, el valor de Google se le mandó a Calendly como tipo de evento.
 *
 * Con la elección al lado de su propia configuración, ese fallo no puede
 * repetirse: quien elige Google escoge de sus calendarios de Google, y quien
 * elige Calendly escoge de sus tipos de cita. Nunca hay un campo que signifique
 * dos cosas — y son dos campos distintos, así que ni al cambiar de proveedor se
 * pisan.
 *
 * ── «CUENTA» ES EL VALOR DE FÁBRICA, Y ESO SALVA EL ARGUMENTO BUENO ───────
 *
 * Lo único que valía de la objeción original era el riesgo del flujo olvidado:
 * un bloque de hace seis meses agendando donde ya nadie mira. Con «cuenta» por
 * defecto, un bloque que nadie tocó SIGUE A LA CUENTA, así que cambiar la
 * agenda en Ajustes mueve todos los bloques que no pidieron otra cosa. Solo se
 * queda quieto el que alguien fijó a propósito.
 *
 * Y el selector de Ajustes no sobra: es lo que usan las herramientas de la IA
 * (`ver_horarios`, `agendar_cita`), que no tienen bloque donde elegir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function agendaDelBloque(
  eleccion: EleccionDelBloque | null | undefined,
  preferidaDeLaCuenta: AgendaPreferida,
  conectadas: { google: boolean; calendly: boolean },
): AgendaQueManda {
  // SOLO SI ESA AGENDA ESTÁ CONECTADA, igual que con la preferencia de la
  // cuenta: un bloque que apunta a una agenda desconectada no puede dejar al
  // bot sin agendar, se cae a lo que la cuenta tenga.
  if (eleccion === "google" && conectadas.google) return "google";
  if (eleccion === "calendly" && conectadas.calendly) return "calendly";
  return agendaQueManda(preferidaDeLaCuenta, conectadas);
}

/** Cualquier cosa rara guardada en el bloque se lee como «la de la cuenta». */
export function leerEleccionDelBloque(v: unknown): EleccionDelBloque {
  return v === "google" || v === "calendly" ? v : "cuenta";
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
