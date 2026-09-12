/**
 * LOS TURNOS DEL SALÓN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE SISTEMA ES NUESTRO, ENTERO. No hay Google Calendar ni Calendly detrás: el
 * salón, los turnos y las reservas viven en nuestras tablas. Un restaurante que
 * no conecta nada tiene reservas completas desde el primer día.
 *
 * Aquí solo vive la decisión, sin base de datos, para poder probarla.
 *
 * ── POR QUÉ TURNOS Y NO HORA LIBRE ────────────────────────────────────────
 *
 * El restaurante define sus turnos —7:00pm, 9:30pm— y la mesa se ocupa el turno
 * entero. Es como opera de verdad un restaurante de reserva, y hace que «¿está
 * libre?» tenga respuesta exacta en vez de depender de cuánto va a durar una
 * cena, que nadie sabe.
 *
 * ── LA HORA ES LA DEL RESTAURANTE, NUNCA LA DEL SERVIDOR ──────────────────
 *
 * Un turno de las 7 de la tarde en Panamá es medianoche en UTC. Comparado
 * contra el reloj del servidor, el turno de esta noche parecería el de mañana —
 * o al revés, se ofrecería uno que ya pasó. Todo lo que compara horas aquí
 * recibe la zona del negocio y no la adivina.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Turno = {
  id: string;
  nombre: string;
  /** "19:00" o "19:00:00", como lo devuelve Postgres. */
  hora: string;
  /** Qué días existe. 0 = domingo, 6 = sábado. */
  dias?: number[] | null;
  duracion_min?: number | null;
  confirma_sola?: boolean | null;
  activo?: boolean | null;
  orden?: number | null;
};

/** Los minutos desde medianoche de un "HH:MM". `null` si no se entiende. */
export function enMinutos(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * «19:00» → «7:00 p.m.» Lo que se le dice a la persona por WhatsApp.
 *
 * SE LLAMA `horaEnPalabras` Y NO `comoSeLee` porque ese nombre ya es de
 * `zonaHoraria.ts`. Segunda colisión en este mismo archivo: la primera fue con
 * `comoLoDigo` de `asignar.ts`. Cuando un módulo nuevo choca dos veces con
 * nombres que ya existen, el que tiene que ponerse específico es el nuevo.
 */
export function horaEnPalabras(hora: string | null | undefined): string {
  const t = enMinutos(hora);
  if (t === null) return "";
  const h24 = Math.floor(t / 60);
  const min = t % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${h24 < 12 ? "a.m." : "p.m."}`;
}

/**
 * Qué día de la semana es una fecha, EN LA ZONA DEL NEGOCIO.
 *
 * `new Date("2026-09-15").getDay()` da el día en la zona del servidor, y en UTC
 * una fecha sin hora es medianoche: para cualquier país al oeste de Greenwich
 * eso es el día ANTERIOR. Un restaurante en Panamá vería los turnos del domingo
 * un lunes.
 */
export function diaDeLaSemana(fecha: string, zona: string): number | null {
  const f = String(fecha ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  try {
    // Se ancla al mediodía: así ningún cambio de horario de verano —que ocurre
    // de madrugada— puede empujar la fecha al día de al lado.
    const d = new Date(`${f}T12:00:00Z`);
    const nombre = new Intl.DateTimeFormat("en-US", {
      timeZone: zona || "UTC",
      weekday: "short",
    }).format(d);
    const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dias[nombre] ?? null;
  } catch {
    return null;
  }
}

/** El instante exacto en que empieza un turno de una fecha, en la zona dada. */
export function cuandoEmpieza(
  fecha: string,
  hora: string,
  zona: string,
): Date | null {
  const f = String(fecha ?? "").trim();
  const min = enMinutos(hora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || min === null) return null;
  try {
    const hh = String(Math.floor(min / 60)).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    /* El desfase de la zona se mide EN ESA FECHA, no hoy: entre septiembre y
     * enero puede cambiar una hora, y usar el desfase de hoy correría todas las
     * reservas del invierno. */
    const tentativa = new Date(`${f}T${hh}:${mm}:00Z`);
    const comoSeVe = new Intl.DateTimeFormat("en-US", {
      timeZone: zona || "UTC",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(tentativa);
    const p: Record<string, string> = {};
    for (const x of comoSeVe) p[x.type] = x.value;
    const comoUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second),
    );
    const desfase = comoUTC - tentativa.getTime();
    return new Date(tentativa.getTime() - desfase);
  } catch {
    return null;
  }
}

/**
 * ¿Este turno ya pasó?
 *
 * Ofrecer el turno de las 7 a las 9 de la noche es la forma más rápida de que
 * alguien llegue a un restaurante donde no lo esperan.
 */
export function yaPaso(
  fecha: string,
  hora: string,
  zona: string,
  ahora: number = Date.now(),
): boolean {
  const empieza = cuandoEmpieza(fecha, hora, zona);
  // Sin poder calcularlo NO se descarta: quedarse sin turnos que ofrecer por no
  // saber la hora es peor que ofrecer uno de más, que el restaurante ve y
  // corrige. Un error visible se arregla; uno silencioso, no.
  if (!empieza) return false;
  return empieza.getTime() <= ahora;
}

/**
 * Los turnos que se pueden ofrecer para una fecha.
 *
 * Se filtra por: activo, que exista ese día de la semana, y que no haya pasado.
 * Ordenados por hora, que es como los lee una persona.
 */
export function turnosDelDia(
  turnos: Turno[] | null | undefined,
  fecha: string,
  zona: string,
  ahora: number = Date.now(),
): Turno[] {
  const dia = diaDeLaSemana(fecha, zona);
  if (dia === null) return [];

  return (turnos ?? [])
    .filter((t) => t && t.activo !== false)
    .filter((t) => enMinutos(t.hora) !== null)
    // Sin días marcados el turno NO existe ningún día. Tratar la lista vacía
    // como «todos» haría que un turno a medio configurar empezara a aceptar
    // reservas el día que alguien desmarcara el último día por error.
    .filter((t) => (t.dias ?? []).includes(dia))
    .filter((t) => !yaPaso(fecha, t.hora, zona, ahora))
    .sort((a, b) => (enMinutos(a.hora)! - enMinutos(b.hora)!) || a.nombre.localeCompare(b.nombre));
}

/**
 * ¿Lana puede cerrar esta reserva sin que la vea una persona?
 *
 * Es por TURNO y no por restaurante porque el riesgo no es del negocio: es de
 * la hora pico. El martes a las 7 se puede cerrar solo; el sábado a las 9, no.
 *
 * ANTE LA DUDA, NO. Un turno sin configurar no confirma solo: que una reserva
 * se quede esperando a que alguien la mire es un retraso; que se confirme sola
 * una que no cabía es un grupo de pie en la puerta.
 */
export function confirmaSola(turno: Turno | null | undefined): boolean {
  return turno?.confirma_sola === true;
}

/**
 * Cómo se le nombra un turno a la persona: «Primer turno · 7:00 p.m.»
 *
 * SE LLAMA `nombreDelTurno` Y NO `comoLoDigo` a propósito: `asignar.ts` ya tiene
 * un `comoLoDigo` que explica por qué no hay mesa. Dos funciones distintas con
 * el mismo nombre en el mismo módulo es exactamente lo que tumbó el motor de
 * WhatsApp el 8 de septiembre con dos `AFIRMACIONES`.
 */
export function nombreDelTurno(turno: Turno | null | undefined): string {
  const nombre = String(turno?.nombre ?? "").trim();
  const hora = horaEnPalabras(turno?.hora);
  if (nombre && hora) return `${nombre} · ${hora}`;
  return hora || nombre;
}

/** Los días en palabras, para la pantalla: «lun, mar, mié». */
export const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function diasEnPalabras(dias: number[] | null | undefined): string {
  const d = [...new Set((dias ?? []).filter((n) => n >= 0 && n <= 6))].sort();
  if (!d.length) return "ningún día";
  if (d.length === 7) return "todos los días";
  return d.map((n) => DIAS_CORTOS[n]).join(", ");
}
