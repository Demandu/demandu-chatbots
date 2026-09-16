/**
 * CUÁNTO DURA ESTA CITA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Hasta el 16 sep 2026 la respuesta era **30 minutos**, escrita a fuego en
 * `herramientas.ts` (`durationMin: 30`). Para todos los negocios y para
 * siempre. Una clínica fetal no puede dar 30 minutos a un ultrasonido de tercer
 * trimestre y 30 a un embarazo gemelar, que necesita dos horas.
 *
 * Y el daño no acababa en la duración: los huecos se ofrecían en rejilla de 30,
 * así que el bot ofrecía las 12:00 **y las 12:30** de una cita que iba a durar
 * dos horas. El segundo hueco no existía.
 *
 * Aquí solo se decide. Nada de base ni de red: es lo que permite probarlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Servicio = {
  id: string;
  nombre: string;
  duracion_min: number;
  buffer_antes_min?: number | null;
  buffer_despues_min?: number | null;
  precio_centavos?: number | null;
  moneda?: string | null;
  activo?: boolean | null;
};

/** Los mismos topes que la base (migración 0126). */
export const MIN_MINUTOS = 5;
export const MAX_MINUTOS = 1440;
/** Lo que dura una cita cuando nadie lo dijo. Ver la 0126: antes eran 30. */
export const POR_DEFECTO_MIN = 60;

export function minutosValidos(n: unknown): boolean {
  const v = Number(n);
  return Number.isFinite(v) && Number.isInteger(v) && v >= MIN_MINUTOS && v <= MAX_MINUTOS;
}

/**
 * Cuánto ocupa de agenda, que NO es lo mismo que cuánto dura para el cliente.
 *
 * Limpiar la sala y preparar el equipo ocupan el hueco pero no son la cita. Sin
 * esto, el negocio acaba poniendo «45 minutos» en un servicio de 30 para que le
 * quepa el margen — y entonces al cliente se le dice una duración que es
 * mentira.
 */
export function minutosQueOcupa(s: Pick<Servicio, "duracion_min" | "buffer_antes_min" | "buffer_despues_min">): number {
  const base = minutosValidos(s?.duracion_min) ? Number(s.duracion_min) : POR_DEFECTO_MIN;
  const antes = Math.max(0, Number(s?.buffer_antes_min ?? 0) || 0);
  const despues = Math.max(0, Number(s?.buffer_despues_min ?? 0) || 0);
  return Math.min(MAX_MINUTOS, base + antes + despues);
}

/**
 * La duración que se usa, y de dónde salió.
 *
 * EL ORDEN IMPORTA Y ES DELIBERADO: el servicio que el cliente eligió manda
 * sobre lo que el negocio puso de fábrica, y lo del negocio manda sobre lo
 * nuestro. Nunca al revés — el valor de fábrica existe para cuando nadie
 * decidió, no para pisar a quien sí decidió.
 */
export function cuantoDura(
  servicio: Servicio | null | undefined,
  porDefectoDelNegocio: number | null | undefined,
): { minutos: number; deDonde: "servicio" | "negocio" | "plataforma" } {
  if (servicio && minutosValidos(servicio.duracion_min)) {
    return { minutos: Number(servicio.duracion_min), deDonde: "servicio" };
  }
  if (minutosValidos(porDefectoDelNegocio)) {
    return { minutos: Number(porDefectoDelNegocio), deDonde: "negocio" };
  }
  return { minutos: POR_DEFECTO_MIN, deDonde: "plataforma" };
}

/**
 * LO QUE SE CONGELA EN LA CITA.
 *
 * Misma lección que costó dinero en `pedido_lineas`: si la cita solo apuntara
 * al servicio y mañana sube el precio o cambia la duración, **el reporte del
 * mes pasado cambiaría solo**. «Cuánto facturó María en agosto» tiene que dar
 * lo mismo hoy que en diciembre.
 */
export function loQueSeCongela(
  servicio: Servicio | null | undefined,
  porDefectoDelNegocio: number | null | undefined,
): { servicio_id: string | null; servicio_nombre: string | null; duracion_min: number; precio_centavos: number | null } {
  const { minutos } = cuantoDura(servicio, porDefectoDelNegocio);
  return {
    servicio_id: servicio?.id ?? null,
    // El nombre se copia: el servicio se puede renombrar o borrar y la cita de
    // ayer tiene que seguir diciendo a qué vino la persona.
    servicio_nombre: servicio?.nombre?.trim() || null,
    duracion_min: minutos,
    precio_centavos:
      typeof servicio?.precio_centavos === "number" && servicio.precio_centavos >= 0
        ? servicio.precio_centavos
        : null,
  };
}

/**
 * Cuál de los servicios pidió, a partir de lo que escribió la persona.
 *
 * ── SE PECA DE «NO SÉ», NO DE ADIVINAR ─────────────────────────────────────
 *
 * Elegir el servicio equivocado agenda dos horas donde iban treinta minutos (o
 * al revés, y entonces la clienta llega a un hueco que no le alcanza). Devolver
 * `null` hace que el bot pregunte, que es barato. Por eso: coincidencia exacta,
 * o que el nombre del servicio esté contenido en lo que dijo; y si encajan DOS,
 * no se elige ninguno.
 */
export function servicioQuePidio(
  dicho: string | null | undefined,
  servicios: Servicio[] | null | undefined,
): Servicio | null {
  const t = normalizar(dicho);
  if (!t) return null;
  const lista = (servicios ?? []).filter((s) => s?.activo !== false && s?.nombre);

  const exacto = lista.filter((s) => normalizar(s.nombre) === t);
  if (exacto.length === 1) return exacto[0];

  const porId = lista.filter((s) => s.id && String(s.id) === String(dicho).trim());
  if (porId.length === 1) return porId[0];

  const contenidos = lista.filter((s) => {
    const n = normalizar(s.nombre);
    return n.length >= 4 && (t.includes(n) || n.includes(t));
  });
  // Dos candidatos es exactamente cuando hay que preguntar, no cuando hay que
  // tirar una moneda: «ultrasonido» encaja con seis de ellos.
  return contenidos.length === 1 ? contenidos[0] : null;
}

/** Lo que se le enseña al modelo para que elija. Sin duración no puede decidir. */
export function comoSeLosOfrezco(servicios: Servicio[] | null | undefined): string {
  const lista = (servicios ?? []).filter((s) => s?.activo !== false && s?.nombre);
  if (!lista.length) return "";
  return (
    "Servicios de este negocio (usa el nombre TAL CUAL al agendar):\n" +
    lista
      .map((s) => `- ${s.nombre} → ${cuantoDura(s, null).minutos} min`)
      .join("\n")
  );
}

/** Sin tildes, sin dobles espacios y en minúsculas: «Ultrasonido 4D» = «ultrasonido 4d». */
function normalizar(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
