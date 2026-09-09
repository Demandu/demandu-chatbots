/**
 * EL MES, EN CUADRÍCULA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Una lista contesta «qué tengo pendiente». Una cuadrícula contesta «cómo está
 * mi semana», que es la pregunta que se hace alguien que vende su tiempo: dónde
 * hay huecos, qué día está lleno, si el jueves cabe una más.
 *
 * ── TODO SE DECIDE AQUÍ Y NO EN LA PANTALLA ───────────────────────────────
 *
 * Qué días entran, en qué celda cae cada cita y cuántas se enseñan antes de
 * «+2 más». La pantalla solo pinta lo que salga de aquí. Así se puede probar
 * sin navegador — y los fallos de calendario son de los que no se ven mirando:
 * un mes que empieza en domingo, uno de 31 días, el cambio de hora.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ConHora = { inicio: string };

export type Celda<T> = {
  /** El día, como «2026-09-14». Vacío en los huecos de relleno. */
  dia: string;
  /** Del mes que se está mirando, o de los de al lado (se pintan apagados). */
  delMes: boolean;
  citas: T[];
};

/**
 * Reparte las citas en las celdas del mes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CUADRÍCULA EMPIEZA EN LUNES, y eso no es estética: en Latinoamérica la
 * semana laboral empieza el lunes, y un calendario que arranca en domingo parte
 * el fin de semana en dos y se lee mal para trabajar.
 *
 * Siempre salen SEMANAS COMPLETAS, rellenando con los días de los meses de al
 * lado. Sin eso, la cuadrícula cambia de alto cada mes y la pantalla salta.
 *
 * ── EL DÍA SE SACA EN LA ZONA DEL NEGOCIO, NO EN LA DEL SERVIDOR ──────────
 *
 * Una cita a las 8 de la noche en Panamá es del día siguiente en UTC. Si el día
 * se calculara con `toISOString()`, media agenda de la tarde aparecería un día
 * corrida — y solo para las citas de la tarde, que es como se tarda una semana
 * en encontrar el fallo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function mesEnCuadricula<T extends ConHora>(
  anio: number,
  mes: number, // 1-12, como lo dice una persona
  citas: T[] | null | undefined,
  zona: string,
): Celda<T>[] {
  const dias = diasDelMes(anio, mes);

  // Se reparten por día ANTES de montar la cuadrícula: así una cita fuera del
  // mes simplemente no encuentra celda, en vez de colarse en la primera.
  const porDia = new Map<string, T[]>();
  for (const c of citas ?? []) {
    const d = diaEnZona(c?.inicio, zona);
    if (!d) continue;
    (porDia.get(d) ?? porDia.set(d, []).get(d)!).push(c);
  }
  for (const lista of porDia.values()) lista.sort((a, b) => a.inicio.localeCompare(b.inicio));

  return dias.map((d) => ({
    dia: d.dia,
    delMes: d.delMes,
    citas: porDia.get(d.dia) ?? [],
  }));
}

/** Los días que se pintan: el mes entero más el relleno hasta semanas completas. */
function diasDelMes(anio: number, mes: number): { dia: string; delMes: boolean }[] {
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  // getUTCDay: 0 = domingo. Se convierte a «cuántos días desde el lunes».
  const desdeElLunes = (primero.getUTCDay() + 6) % 7;

  const salida: { dia: string; delMes: boolean }[] = [];
  const arranque = new Date(primero.getTime() - desdeElLunes * 86400000);

  // 6 semanas cubren cualquier mes, incluido uno de 31 días que empieza en
  // domingo. Se corta al terminar la semana que contiene el último día: sin
  // eso, algunos meses pintan una fila entera vacía al final.
  for (let i = 0; i < 42; i++) {
    const d = new Date(arranque.getTime() + i * 86400000);
    const delMes = d.getUTCMonth() === mes - 1 && d.getUTCFullYear() === anio;
    salida.push({ dia: d.toISOString().slice(0, 10), delMes });
    if (i % 7 === 6) {
      const finDeSemana = new Date(arranque.getTime() + (i + 1) * 86400000);
      const yaPaso = finDeSemana.getUTCMonth() !== mes - 1 || finDeSemana.getUTCFullYear() !== anio;
      if (yaPaso && i >= 27) break;
    }
  }
  return salida;
}

/**
 * El día al que pertenece una hora, visto desde la zona del negocio.
 *
 * Se usa `en-CA` porque da la fecha ya en «AAAA-MM-DD», que es la forma en la
 * que se compara sin ambigüedad. Con una zona inválida se cae a UTC en vez de
 * reventar: la agenda corrida un día es un fallo; la pantalla en blanco, dos.
 */
export function diaEnZona(iso: string | null | undefined, zona: string): string | null {
  const t = String(iso ?? "").trim();
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zona || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** El mes anterior y el siguiente, para las flechas. */
export function mesVecino(anio: number, mes: number, salto: -1 | 1): { anio: number; mes: number } {
  const m = mes + salto;
  if (m < 1) return { anio: anio - 1, mes: 12 };
  if (m > 12) return { anio: anio + 1, mes: 1 };
  return { anio, mes: m };
}
