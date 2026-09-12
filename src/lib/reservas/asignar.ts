/**
 * QUÉ MESA LE TOCA A ESTE GRUPO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Aquí solo vive la DECISIÓN, sin base de datos, para poder probarla de verdad.
 * Quien pregunta es el motor de WhatsApp, la pantalla del salón y Lana.
 *
 * Esta es la pieza que decide si el módulo de Reservas vale algo. Un mapa bonito
 * no lo salva: lo que el restaurante compra es «no me sobrevendas el sábado».
 *
 * ── LO QUE NO HACE, Y ES A PROPÓSITO ──────────────────────────────────────
 *
 * No optimiza el llenado del salón. No intenta adivinar cuánta gente va a
 * llegar después para guardarles sitio. Eso es un problema de horizonte infinito
 * —el espacio de estados explota con cada asiento— y una IA que «optimiza» y se
 * equivoca deja a alguien de pie en la puerta un sábado.
 *
 * Hace algo más humilde y que se puede defender delante del dueño: **de lo que
 * está libre AHORA, dale lo más justo.** Es lo que hace un maître, y se explica
 * en una frase.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Mesa = {
  id: string;
  nombre: string;
  capacidad: number;
  /** Ids de las mesas con las que ESTA se puede juntar. Simétrico. */
  unibles?: string[] | null;
  activa?: boolean | null;
};

export type Asignacion =
  | { ok: true; mesas: Mesa[]; capacidad: number; sobran: number }
  | { ok: false; motivo: MotivoNo };

export type MotivoNo =
  /** El salón no tiene ninguna mesa (o ninguna activa). */
  | "sin_mesas"
  /** Nadie o un número imposible. */
  | "personas_invalidas"
  /** Hay mesas, pero todas ocupadas en ese turno. */
  | "todo_ocupado"
  /** Queda sitio, pero no del tamaño que hace falta. */
  | "no_caben"
  /** Caben juntando más mesas de las que se permite de una vez. */
  | "grupo_demasiado_grande";

/**
 * CUÁNTAS MESAS SE PUEDEN JUNTAR DE UNA VEZ.
 *
 * Tres. No es una limitación técnica: es que juntar cuatro mesas en un salón
 * real significa mover sillas, bloquear un pasillo y, muchas veces, pedirle
 * permiso al de al lado. Un grupo que necesita más de tres mesas es una
 * conversación con el restaurante, no un cálculo.
 *
 * Y además acota el problema: las combinaciones crecen como las palas de una
 * baraja, y un salón de cuarenta mesas con combinaciones de seis serían
 * millones de posibilidades por cada «¿tienen mesa para el sábado?».
 */
export const MAX_MESAS_JUNTAS = 3;

/** Hasta cuántas personas decide sola. Por encima, lo ve una persona. */
export const GRUPO_GRANDE = 12;

/**
 * ¿Se pueden juntar TODAS estas mesas entre sí?
 *
 * Se exige que CADA PAR esté marcado como unible, no solo que haya una cadena.
 * Con una cadena, marcar 1-2 y 2-3 dejaría juntar la 1 con la 3 — que en un
 * salón real puede significar dos mesas en esquinas opuestas con la 2 en medio
 * sirviendo a otra gente. El dueño marca pares porque sabe qué pares caben.
 */
export function sePuedenJuntar(mesas: Mesa[]): boolean {
  if (mesas.length <= 1) return true;
  for (let i = 0; i < mesas.length; i++) {
    for (let j = i + 1; j < mesas.length; j++) {
      const a = mesas[i];
      const b = mesas[j];
      const aConB = (a.unibles ?? []).includes(b.id);
      const bConA = (b.unibles ?? []).includes(a.id);
      // Se exigen LAS DOS DIRECCIONES. Si solo una está marcada, es un dato a
      // medias —alguien editó el mapa y se quedó a mitad— y juntar mesas por un
      // dato a medias es exactamente lo que no se puede hacer.
      if (!aConB || !bConA) return false;
    }
  }
  return true;
}

/** La suma de asientos de un conjunto. */
export function capacidadDe(mesas: Mesa[]): number {
  return mesas.reduce((n, m) => n + Math.max(0, Number(m.capacidad) || 0), 0);
}

/**
 * LA MEJOR OPCIÓN DE LAS QUE CABEN.
 *
 * Se ordena por, en este orden:
 *
 *   1. MENOS SILLAS DE SOBRA. Sentar a dos personas en la mesa de ocho es
 *      regalar la única mesa donde cabía el grupo que llama diez minutos
 *      después. Es el error que más dinero cuesta y el más fácil de evitar.
 *   2. MENOS MESAS. Una mesa de seis es mejor que dos de tres juntas: no hay
 *      que mover nada y el grupo no come partido por una pata.
 *   3. EL NOMBRE. No aporta nada al negocio — está para que la respuesta sea
 *      SIEMPRE la misma con los mismos datos. Sin esto, dos mesas empatadas se
 *      alternarían según el orden en que la base las devolvió, y un fallo que
 *      solo pasa a veces no se puede reproducir ni arreglar.
 */
function mejorQue(a: Mesa[], b: Mesa[], personas: number): boolean {
  const sobranA = capacidadDe(a) - personas;
  const sobranB = capacidadDe(b) - personas;
  if (sobranA !== sobranB) return sobranA < sobranB;
  if (a.length !== b.length) return a.length < b.length;
  return nombreDe(a) < nombreDe(b);
}

const nombreDe = (mesas: Mesa[]) =>
  mesas.map((m) => String(m.nombre ?? m.id)).sort().join("|");

/**
 * ¿Qué mesa le doy a un grupo de N personas?
 *
 * @param mesas     Todas las del salón.
 * @param ocupadas  Ids de las que ya están tomadas EN ESA FECHA Y TURNO.
 * @param personas  Cuántos vienen.
 *
 * Devuelve la mejor combinación libre, o por qué no hay. El motivo importa
 * tanto como el sí: «no caben» y «todo ocupado» se le contestan distinto a
 * quien está escribiendo por WhatsApp.
 */
export function queMesaLeDoy(opts: {
  mesas: Mesa[] | null | undefined;
  ocupadas?: Iterable<string> | null;
  personas: number;
  maxJuntas?: number;
  grupoGrande?: number;
}): Asignacion {
  const personas = Math.floor(Number(opts.personas));
  if (!Number.isFinite(personas) || personas <= 0) {
    return { ok: false, motivo: "personas_invalidas" };
  }

  const grande = Number(opts.grupoGrande ?? GRUPO_GRANDE);
  if (personas > grande) return { ok: false, motivo: "grupo_demasiado_grande" };

  const todas = (opts.mesas ?? []).filter(
    (m) => m && m.activa !== false && (Number(m.capacidad) || 0) > 0,
  );
  if (!todas.length) return { ok: false, motivo: "sin_mesas" };

  const tomadas = new Set(opts.ocupadas ?? []);
  const libres = todas.filter((m) => !tomadas.has(m.id));
  if (!libres.length) return { ok: false, motivo: "todo_ocupado" };

  const maxJuntas = Math.max(1, Math.floor(Number(opts.maxJuntas ?? MAX_MESAS_JUNTAS)));

  let mejor: Mesa[] | null = null;
  /* AQUÍ NO SE VUELVE A COMPROBAR SI SE PUEDEN JUNTAR, y no es un olvido: la
   * poda de `combinar` ya descarta cualquier conjunto que no sea unible antes
   * de construirlo, así que esa comprobación no podía fallar nunca. Un candado
   * que no puede fallar no está protegiendo nada y hace creer que sí. */
  const mirar = (combo: Mesa[]) => {
    if (capacidadDe(combo) < personas) return;
    if (!mejor || mejorQue(combo, mejor, personas)) mejor = combo;
  };

  /* Una sola mesa primero, y luego combinaciones. Se recorren TODAS las de
   * hasta `maxJuntas` y se elige la mejor — no se corta en la primera que
   * quepa. Quedarse con la primera daría la mesa de ocho a un grupo de dos
   * solo por estar antes en la lista. */
  const combinar = (desde: number, actual: Mesa[]) => {
    if (actual.length) mirar(actual);
    if (actual.length >= maxJuntas) return;
    for (let i = desde; i < libres.length; i++) {
      // Se poda pronto: si esta mesa no se puede juntar con las que ya llevo,
      // ninguna combinación que la incluya va a servir.
      const siguiente = [...actual, libres[i]];
      if (siguiente.length > 1 && !sePuedenJuntar(siguiente)) continue;
      combinar(i + 1, siguiente);
    }
  };
  combinar(0, []);

  if (!mejor) {
    // Hay sitio libre, pero no del tamaño que hace falta. Es distinto de «todo
    // ocupado» y se contesta distinto: aquí sí puede haber otro turno que sirva.
    return { ok: false, motivo: "no_caben" };
  }

  const elegidas = mejor as Mesa[];
  return {
    ok: true,
    mesas: elegidas,
    capacidad: capacidadDe(elegidas),
    sobran: capacidadDe(elegidas) - personas,
  };
}

/**
 * Lo que Lana le dice a la persona cuando no hay sitio.
 *
 * SE DEVUELVE TEXTO Y NO UN CÓDIGO porque quien lo va a leer es alguien
 * esperando respuesta un viernes por la noche. «no_caben» no es una respuesta.
 *
 * Y NUNCA INVENTA UNA DISCULPA GENÉRICA: cada motivo dice algo distinto y
 * accionable, porque «lo siento, no hay» hace que la persona se vaya, y
 * «para ese turno no, ¿te va el de las 9:30?» la mantiene.
 */
export function comoLoDigo(motivo: MotivoNo, personas: number): string {
  switch (motivo) {
    case "todo_ocupado":
      return "Ese turno está completo. Ofrécele otro turno del mismo día o el día siguiente.";
    case "no_caben":
      return `Queda sitio, pero ninguna mesa para ${personas}. Ofrécele otro turno, y dile que para ese hay disponibilidad de menos personas.`;
    case "grupo_demasiado_grande":
      return `Un grupo de ${personas} lo coordina el restaurante. NO confirmes nada: dile que alguien del equipo le escribe para organizarlo.`;
    case "sin_mesas":
      return "Este restaurante todavía no tiene el salón configurado. NO confirmes nada; avisa de que alguien le escribe.";
    case "personas_invalidas":
      return "Pregúntale para cuántas personas es la reserva.";
  }
}
