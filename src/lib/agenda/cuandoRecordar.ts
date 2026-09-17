/**
 * ¿LE TOCA RECORDATORIO A ESTA CITA?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Toda la máquina del recordatorio existía —manda la plantilla, no repite,
 * entiende «Confirmo» y «Necesito cambiarla»— menos una cosa: QUIÉN la dispara.
 * Solo salía si alguien pulsaba el botón en el calendario, así que la clínica
 * que agenda a las 11:00 no recibía nada a menos que su recepcionista se
 * acordara. Había doce tareas programadas y ninguna miraba `citas`.
 *
 * ── POR QUÉ ESTO ES UN ARCHIVO SIN IMPORTS ────────────────────────────────
 *
 * Decidir A QUIÉN se le manda es lo único que de verdad se puede equivocar, y
 * se equivoca en silencio: una cita recordada de más molesta, una recordada de
 * menos deja a alguien plantado. Aislado y sin dependencias se puede probar con
 * fechas inventadas, sin base de datos y sin Meta — que es la única forma de
 * probar los bordes: la cita que empieza en 59 minutos, la que se agendó hace
 * 3, la que ya pasó.
 *
 * ── Y POR QUÉ DEVUELVE EL MOTIVO Y NO UN `false` ──────────────────────────
 *
 * Porque el negocio va a preguntar «¿por qué a esta no le llegó?», y «no
 * tocaba» no es una respuesta. Cada «no» tiene nombre y acaba escrito donde se
 * puede leer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuánto antes sale el recordatorio. */
export const AVISO_HORAS = 24;

/**
 * Lo mínimo que tiene que faltar para que recordar sirva de algo.
 *
 * A cuarenta minutos de la cita, quien iba a ir ya va de camino y quien no iba
 * a ir ya no llega. El mensaje solo gasta un envío y la paciencia de la persona.
 */
export const MARGEN_MINIMO_MIN = 60;

/**
 * Lo que se deja reposar una cita recién agendada.
 *
 * Sin esto, quien agenda hoy para esta tarde recibe «te recordamos tu cita» dos
 * minutos después de agendarla. Se lee como un error del sistema, y lo es.
 */
export const REPOSO_MIN = 60;

/**
 * Cuántas veces se reintenta antes de rendirse.
 *
 * NO es una optimización: si la plantilla no está aprobada en Meta, TODOS los
 * envíos fallan igual, y una tarea cada diez minutos sin tope convierte eso en
 * una tormenta de rechazos contra Meta. Meta le baja la calidad al número por
 * eso, y esa calidad afecta a TODOS los mensajes del negocio, no solo a los
 * recordatorios. Rendirse a la tercera y dejarlo escrito es lo correcto.
 */
export const TOPE_INTENTOS = 3;

export type CitaParaRecordar = {
  inicio: string;
  creada_at?: string | null;
  estado?: string | null;
  recordatorio_enviado_at?: string | null;
  recordatorio_intentos?: number | null;
};

export type PorQueNo =
  | "fecha_rota"
  | "cancelada"
  | "ya_se_mando"
  | "muchos_intentos"
  | "ya_paso"
  | "ya_casi_empieza"
  | "recien_agendada"
  | "todavia_falta";

/** Lo que se escribe en la bitácora, en palabras que se puedan leer. */
export const EN_PALABRAS: Record<PorQueNo, string> = {
  fecha_rota: "la fecha de la cita no se entiende",
  cancelada: "la cita está cancelada",
  ya_se_mando: "ya se mandó el recordatorio",
  muchos_intentos: `se intentó ${TOPE_INTENTOS} veces y siempre falló`,
  ya_paso: "esa cita ya pasó",
  ya_casi_empieza: `empieza en menos de ${MARGEN_MINIMO_MIN} minutos`,
  recien_agendada: `se agendó hace menos de ${REPOSO_MIN} minutos`,
  todavia_falta: `todavía faltan más de ${AVISO_HORAS} horas`,
};

const MIN = 60_000;

function instante(v: unknown): number | null {
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : null;
}

/**
 * El motivo por el que NO se le manda, o `null` si sí le toca.
 *
 * El orden importa: se contestan primero los «no» definitivos —cancelada, ya
 * mandado, ya pasó— y al final los que son solo «todavía no». Así el motivo que
 * se apunta es el que de verdad explica la situación y no el primero que
 * casualmente encaje.
 *
 * ── `aMano`: EL BOTÓN DEL CALENDARIO NO ES LA TAREA ───────────────────────
 *
 * Cuando alguien del negocio pulsa «recordar», está eligiendo mandarlo AHORA:
 * que falten tres días, o dos horas, o que la cita se acabe de agendar, es
 * asunto suyo y no un error que haya que impedirle. Lo que NO cambia es lo que
 * protege a otra persona o al número: una cita cancelada, una ya recordada, una
 * que ya pasó y el tope de intentos siguen frenando igual.
 *
 * Es un parámetro y no una segunda función a propósito. Con dos funciones, el
 * día que cambie qué es una cita cancelada solo se acordaría una de las dos.
 */
export function porQueNoSeRecuerda(
  c: CitaParaRecordar,
  ahora: Date = new Date(),
  opciones: { aMano?: boolean } = {},
): PorQueNo | null {
  const inicio = instante(c.inicio);
  if (inicio === null) return "fecha_rota";

  if (String(c.estado ?? "").trim().toLowerCase() === "cancelada") return "cancelada";
  if (c.recordatorio_enviado_at) return "ya_se_mando";
  if (Number(c.recordatorio_intentos ?? 0) >= TOPE_INTENTOS) return "muchos_intentos";

  const t = ahora.getTime();
  const faltan = inicio - t;

  if (faltan <= 0) return "ya_paso";

  // A partir de aquí son decisiones de CUÁNDO, y quien pulsa el botón ya eligió.
  if (opciones.aMano) return null;

  if (faltan < MARGEN_MINIMO_MIN * MIN) return "ya_casi_empieza";

  /* UNA CITA RECIÉN AGENDADA SE DEJA REPOSAR. Sin fecha de alta no se puede
   * saber, y entonces NO se frena: las citas viejas de antes de esta columna no
   * la tienen, y quedarse callado con ellas para siempre sería peor. */
  const creada = instante(c.creada_at);
  if (creada !== null && t - creada < REPOSO_MIN * MIN) return "recien_agendada";

  if (faltan > AVISO_HORAS * 60 * MIN) return "todavia_falta";

  return null;
}

/** ¿Le toca ahora mismo? */
export function tocaRecordar(c: CitaParaRecordar, ahora: Date = new Date()): boolean {
  return porQueNoSeRecuerda(c, ahora) === null;
}

/**
 * La ventana que pide la tarea a la base, en ISO.
 *
 * Se calcula aquí y no en la consulta para que sea el MISMO número que usa
 * `porQueNoSeRecuerda`. Con la ventana escrita a mano en el SQL, cambiar
 * `AVISO_HORAS` dejaría la consulta trayendo unas citas y la regla descartando
 * otras — y el negocio vería recordatorios que salen a horas que nadie eligió.
 */
export function ventanaDeLaTarea(ahora: Date = new Date()): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getTime() + MARGEN_MINIMO_MIN * MIN).toISOString(),
    hasta: new Date(ahora.getTime() + AVISO_HORAS * 60 * MIN).toISOString(),
  };
}
