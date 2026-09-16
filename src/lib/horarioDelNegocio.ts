/**
 * CONTAR EL HORARIO DEL NEGOCIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El bot sabía buscar HUECOS LIBRES (`ver_horarios`) pero no sabía contestar
 * «¿a qué hora abren?». Así que esa respuesta salía de donde hubiera caído: del
 * entrenamiento, de una web importada hace dos meses, o de lo que el modelo
 * considerara verosímil.
 *
 * Eso es una SEGUNDA COPIA de la verdad. El negocio cambia su horario en
 * Configuración → Horario laboral, nadie reimporta la web, y el bot **dice** un
 * horario y **ofrece** otro. Visto en producción en una clínica.
 *
 * Aquí solo se redacta. Los datos salen de `organizations.business_hours`, que
 * es la misma fuente que usa la agenda para calcular huecos: una sola verdad,
 * dos consumidores.
 *
 * SIN UN SOLO IMPORT, como el resto de piezas puras de esta plataforma: lo usan
 * la web, el motor de WhatsApp (que no puede importar de `src/`) y las pruebas.
 * Por eso el aviso de la zona ENTRA POR PARÁMETRO en vez de calcularse aquí —
 * quien llama ya lo tiene.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DiaDeHorario = { open?: string; close?: string; enabled?: boolean };
export type HorarioSemanal = Record<string, DiaDeHorario | undefined>;

/** El orden de la semana como se lee en español, no como viene el objeto. */
const SEMANA: { clave: string; nombre: string }[] = [
  { clave: "mon", nombre: "lunes" },
  { clave: "tue", nombre: "martes" },
  { clave: "wed", nombre: "miércoles" },
  { clave: "thu", nombre: "jueves" },
  { clave: "fri", nombre: "viernes" },
  { clave: "sat", nombre: "sábado" },
  { clave: "sun", nombre: "domingo" },
];

const hhmm = (v: unknown): string | null => {
  const t = String(v ?? "").trim();
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? (t.length === 4 ? `0${t}` : t) : null;
};

/** Un día abierto, con sus horas válidas. `null` si está cerrado o mal puesto. */
function diaAbierto(d: DiaDeHorario | undefined): { open: string; close: string } | null {
  if (!d || d.enabled === false) return null;
  const open = hhmm(d.open);
  const close = hhmm(d.close);
  if (!open || !close) return null;
  // Abrir a las 18:00 y cerrar a las 09:00 es un dato roto, no un horario
  // nocturno: los horarios que cruzan medianoche no se pueden expresar con
  // este formato, así que decirlo sería inventárselo.
  if (close <= open) return null;
  return { open, close };
}

/**
 * Agrupa días seguidos con el MISMO horario.
 *
 * «Lunes a viernes de 09:00 a 18:00» en vez de cinco renglones idénticos.
 * Nadie lee cinco renglones idénticos, y por WhatsApp menos.
 */
export function agruparDias(horario: HorarioSemanal | null | undefined): {
  dias: string;
  open: string;
  close: string;
}[] {
  const bloques: { dias: string; open: string; close: string }[] = [];
  let actual: { desde: string; hasta: string; open: string; close: string } | null = null;

  for (const { clave, nombre } of SEMANA) {
    const d = diaAbierto(horario?.[clave]);
    if (!d) {
      if (actual) {
        bloques.push(cerrar(actual));
        actual = null;
      }
      continue;
    }
    if (actual && actual.open === d.open && actual.close === d.close) {
      actual.hasta = nombre;
    } else {
      if (actual) bloques.push(cerrar(actual));
      actual = { desde: nombre, hasta: nombre, open: d.open, close: d.close };
    }
  }
  if (actual) bloques.push(cerrar(actual));
  return bloques;

  function cerrar(a: { desde: string; hasta: string; open: string; close: string }) {
    return {
      dias: a.desde === a.hasta ? a.desde : `${a.desde} a ${a.hasta}`,
      open: a.open,
      close: a.close,
    };
  }
}

/**
 * El horario, escrito para que el bot lo diga tal cual.
 *
 * DEVUELVE CADENA VACÍA CUANDO NO HAY NADA QUE DECIR, y quien llama tiene que
 * notarlo. Devolver «cerrado toda la semana» porque el negocio todavía no
 * configuró su horario sería la peor respuesta posible: espanta al cliente con
 * un dato que nadie puso.
 */
export function comoSeCuentaElHorario(
  horario: HorarioSemanal | null | undefined,
  /** «(hora de Panamá)» o cadena vacía. Sale de `deQueHoraHablamos`. */
  avisoDeZona?: string | null,
): string {
  const bloques = agruparDias(horario);
  if (!bloques.length) return "";

  const lineas = bloques.map((b) => `${b.dias}: de ${b.open} a ${b.close}`);

  // Los días que NO aparecen están cerrados, y decirlo evita la repregunta.
  const abiertos = new Set(
    SEMANA.filter(({ clave }) => diaAbierto(horario?.[clave])).map((x) => x.nombre),
  );
  const cerrados = SEMANA.filter((x) => !abiertos.has(x.nombre)).map((x) => x.nombre);

  /* SI QUIEN PREGUNTA ESTÁ EN OTRO HUSO, SE DICE DE QUÉ HORA HABLAMOS. Mismo
   * motivo que en los huecos de la agenda: el mismo número significa dos cosas
   * distintas y nadie lo aclaraba. Ver `hayQueDecirLaZona`. */
  const zona = String(avisoDeZona ?? "").trim();

  return (
    lineas.join("\n") +
    (cerrados.length ? `\nCerrado: ${cerrados.join(", ")}.` : "") +
    (zona ? `\n(Horario del negocio, ${zona.replace(/^\s*\(/, "").replace(/\)\s*$/, "")}.)` : "")
  );
}

/** Lo que el bot contesta cuando el negocio no ha puesto su horario. */
export const SIN_HORARIO =
  "Este negocio todavía no tiene su horario configurado. NO te lo inventes: dile que no lo tienes " +
  "a la mano y ofrécele pasarlo con una persona del equipo.";

/** ¿Está abierto AHORA? Para «¿están abiertos?», que es la otra mitad de la pregunta. */
export function abiertoAhora(
  horario: HorarioSemanal | null | undefined,
  zonaDelNegocio: string | null | undefined,
  ahora: Date = new Date(),
): boolean | null {
  if (!agruparDias(horario).length) return null;
  const z = String(zonaDelNegocio ?? "").trim();
  if (!z) return null;

  try {
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: z, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(ahora);
    const dia = String(partes.find((p) => p.type === "weekday")?.value ?? "").toLowerCase().slice(0, 3);
    const h = partes.find((p) => p.type === "hour")?.value ?? "";
    const m = partes.find((p) => p.type === "minute")?.value ?? "";
    const reloj = `${h}:${m}`;

    const d = diaAbierto(horario?.[dia]);
    if (!d) return false;
    return reloj >= d.open && reloj < d.close;
  } catch {
    // Zona inválida: mejor no afirmar nada que afirmar mal.
    return null;
  }
}
