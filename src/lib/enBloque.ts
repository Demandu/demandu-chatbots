/**
 * ACCIONES EN BLOQUE: asignar, etiquetar, mover de etapa y cerrar varias a la vez.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 3 OCT 2026. «Quiero seleccionar varios contactos y asignarlos de un clic a un
 * agente, o a una etapa del embudo». Hasta hoy Contactos tenía casillas pero
 * solo para BORRAR, y la Bandeja cambiaba responsable, etiqueta y etapa de una
 * en una.
 *
 * Aquí solo vive lo que se puede probar sin base de datos: cómo se mezclan las
 * etiquetas, cómo se parte una lista larga y qué frase se le enseña a la
 * persona al terminar. Lo que toca la base está en
 * `src/app/(dashboard)/enBloque.ts`.
 *
 * ── LO QUE SE DECIDIÓ CON ALEX ──────────────────────────────────────────────
 *
 *   · El responsable NO es del contacto: es de su CONVERSACIÓN y de su tarjeta
 *     del Embudo. «Asignar un contacto a Ana» desde Contactos = asignarle sus
 *     conversaciones ABIERTAS y su tarjeta abierta. Las cerradas no se tocan.
 *
 *   · Etiqueta y etapa son cosas distintas. La etiqueta vive en el contacto
 *     (`contacts.tags`). La etapa es la columna del Embudo y vive en la
 *     conversación (`state_id`) Y en la tarjeta (`opportunities.stage_id`):
 *     se mueven las dos o el tablero se queda quieto (ver `InboxClient.setState`).
 *
 *   · Cerrar conversaciones NO cierra la tarjeta (regla 3 del embudo,
 *     `crm-embudo-implementacion.md`).
 *
 *   · El aviso al terminar cuenta lo que la BASE devolvió, no lo que se pidió.
 *     Si a tres no se les pudo hacer nada, se dice cuántos y por qué.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Tope por operación. Con más, la pantalla espera demasiado y es fácil
 *  equivocarse de selección sin darse cuenta. */
export const MAX_EN_BLOQUE = 500;

/**
 * Qué se seleccionó.
 *
 * `oportunidades` son las TARJETAS del tablero del Embudo (3 oct 2026). Es una
 * variante más, no un camino aparte: la etapa se escribe en la tarjeta y en su
 * conversación igual que desde la Bandeja, y así la regla de «se escriben las
 * dos» vive en un solo sitio. Duplicarla era garantizar que un día divergieran.
 */
export type TipoSeleccion = "contactos" | "conversaciones" | "oportunidades";

/**
 * Las etiquetas nuevas de un contacto, o `null` si no cambia nada.
 *
 * Devolver `null` cuando no cambia es lo que evita escribir de balde: cada
 * escritura en `contacts` vuelve a calificar al lead y puede mandar la fila a
 * Google Sheets o a Zoho. Etiquetar a 200 que ya tenían la etiqueta no debe
 * disparar 200 envíos.
 *
 * Se respeta el orden que ya tenía y lo nuevo va al final. Si una etiqueta
 * está a la vez en «poner» y en «quitar», gana quitar: es la opción prudente.
 */
export function mezclarEtiquetas(
  actuales: string[] | null | undefined,
  poner: string[],
  quitar: string[],
): string[] | null {
  const antes = (actuales ?? []).filter((t) => typeof t === "string" && t.length > 0);
  const fuera = new Set(quitar);
  const resultado: string[] = [];
  const vistos = new Set<string>();
  for (const t of antes) {
    if (fuera.has(t) || vistos.has(t)) continue;
    vistos.add(t);
    resultado.push(t);
  }
  for (const t of poner) {
    if (!t || fuera.has(t) || vistos.has(t)) continue;
    vistos.add(t);
    resultado.push(t);
  }
  const igual =
    resultado.length === antes.length && resultado.every((t, i) => t === antes[i]);
  return igual ? null : resultado;
}

/** Parte una lista en trozos. PostgREST manda los `in (...)` en la URL, y 500
 *  identificadores (~18 KB) es más de lo que algunos proxies aceptan. */
export function enTrozos<T>(lista: T[], tam = 100): T[][] {
  const n = Math.max(1, Math.floor(tam));
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

/** Quita repetidos y vacíos de una lista de ids que llega del navegador. */
export function idsLimpios(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return Array.from(new Set(ids.filter((x): x is string => typeof x === "string" && uuid.test(x))));
}

/**
 * LO QUE SE LE DICE A LA PERSONA AL TERMINAR — como CLAVES, no como frases.
 *
 * La acción corre en el servidor y la persona puede tener el panel en inglés o
 * portugués. Si el servidor devolviera la frase hecha, saldría siempre en
 * español. Devuelve trozos `{ k, v }` y la barra los traduce con
 * `useTranslations("enBloque")` (espacio `enBloque.res` en `messages/*.json`).
 * Los plurales los resuelve ICU en el diccionario, no aquí.
 */
export type Parte = { k: string; v?: Record<string, string | number> };

/** Lo que pasó al asignar. */
export function partesAsignar(r: {
  agente: string;
  conversaciones: number;
  tarjetas: number;
  /** Contactos sin conversación abierta NI tarjeta abierta: no había qué asignar. */
  sinNada: number;
  /** Conversaciones que la base dejó con otro responsable (o no dejó tocar). */
  noQuedaron: number;
}): Parte[] {
  const out: Parte[] = [];
  if (r.conversaciones > 0 && r.tarjetas > 0) {
    out.push({ k: "asignadoAmbas", v: { agente: r.agente, c: r.conversaciones, t: r.tarjetas } });
  } else if (r.conversaciones > 0) {
    out.push({ k: "asignadoConv", v: { agente: r.agente, c: r.conversaciones } });
  } else if (r.tarjetas > 0) {
    out.push({ k: "asignadoTarjetas", v: { agente: r.agente, t: r.tarjetas } });
  } else {
    out.push({ k: "asignadoNada", v: { agente: r.agente } });
  }
  if (r.sinNada > 0) out.push({ k: "sinNada", v: { n: r.sinNada } });
  if (r.noQuedaron > 0) out.push({ k: "noQuedaron", v: { n: r.noQuedaron } });
  return out;
}

/** Lo que pasó al etiquetar. Los nombres de etiqueta van tal cual: son del cliente. */
export function partesEtiquetas(r: { cambiados: number; yaEstaban: number; fallaron: number; poner: string[]; quitar: string[] }): Parte[] {
  const out: Parte[] = [];
  const poner = r.poner.join(", ");
  const quitar = r.quitar.join(", ");
  if (r.cambiados > 0) {
    if (r.poner.length && r.quitar.length) out.push({ k: "etiquetasPusoQuito", v: { poner, quitar, n: r.cambiados } });
    else if (r.poner.length) out.push({ k: "etiquetasPuso", v: { poner, n: r.cambiados } });
    else out.push({ k: "etiquetasQuito", v: { quitar, n: r.cambiados } });
    if (r.yaEstaban > 0) out.push({ k: "yaEstaban", v: { n: r.yaEstaban } });
  } else if (r.fallaron === 0) {
    out.push({ k: "nadaQueCambiar" });
  }
  if (r.fallaron > 0) out.push({ k: "etiquetasFallaron", v: { n: r.fallaron } });
  return out;
}

/** Lo que pasó al mover de etapa. */
export function partesEtapa(r: {
  etapa: string;
  conversaciones: number;
  tarjetas: number;
  sinNada: number;
  /** Las que ya estaban en esa etapa: no se les escribió nada. */
  yaEstaban?: number;
}): Parte[] {
  const out: Parte[] = [];
  if (r.conversaciones > 0 || r.tarjetas > 0) {
    const k = r.conversaciones > 0 && r.tarjetas > 0 ? "etapaAmbas" : r.conversaciones > 0 ? "etapaConv" : "etapaTarjetas";
    out.push({ k, v: { etapa: r.etapa, c: r.conversaciones, t: r.tarjetas } });
  } else if (!r.yaEstaban) {
    out.push({ k: "etapaNada", v: { etapa: r.etapa } });
  }
  if (r.yaEstaban && r.yaEstaban > 0) out.push({ k: "etapaYaEstaban", v: { n: r.yaEstaban } });
  if (r.sinNada > 0) out.push({ k: "sinNada", v: { n: r.sinNada } });
  return out;
}

/**
 * LO QUE DE VERDAD HAY QUE ESCRIBIR: a quien ya está en esa etapa, nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * No es una optimización. Cambiar la etapa de una tarjeta dispara, en cadena:
 * `crm_estado_desde_etapa` (estado y fecha de cierre), `crm_etapa_a_conversacion`,
 * `crm_registrar_evento` (una fila de historial) y `crm_etiqueta_de_etapa`, que
 * le pone al CONTACTO una etiqueta con el nombre de la etapa — y escribir en el
 * contacto vuelve a calificarlo y lo encola para Google Sheets.
 *
 * Mover a «Cotizando» 40 tarjetas de las que 30 ya estaban ahí dejaría 30 filas
 * de historial que dicen que algo cambió cuando no cambió nada, y 30 filas de
 * más en la cola de Sheets. El historial del embudo es lo que después mide
 * cuánto tarda una venta en cada etapa: ensuciarlo lo vuelve inútil.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function soloLasQueCambian<T>(
  filas: T[],
  etapaDe: (f: T) => string | null | undefined,
  destino: string,
): { cambian: T[]; yaEstaban: number } {
  const a = String(destino ?? "");
  const cambian: T[] = [];
  let yaEstaban = 0;
  for (const f of filas) {
    if (String(etapaDe(f) ?? "") === a && a !== "") yaEstaban++;
    else cambian.push(f);
  }
  return { cambian, yaEstaban };
}

/**
 * El `sort` de una tarjeta que llega en bloque: al final de la columna destino.
 *
 * Arrastrar UNA tarjeta calcula el punto medio entre sus dos vecinas
 * (`crm_mover_tarjeta`). En bloque no hay vecinas que elegir: cuarenta tarjetas
 * no se sueltan en un hueco. Van al final, que es donde se mira lo que acaba de
 * entrar. Comparten el mismo `sort` a propósito — el orden entre ellas no lo
 * decidió nadie, y fingir uno sería inventarse una prioridad.
 */
export function sortAlFinal(maxDeLaColumna: number | null | undefined, ahora: Date = new Date()): number {
  const porDefecto = Math.floor(ahora.getTime() / 1000);
  if (maxDeLaColumna === null || maxDeLaColumna === undefined) return porDefecto;
  const max = Number(maxDeLaColumna);
  if (!Number.isFinite(max)) return porDefecto;
  return max + 1;
}

/**
 * «Marcar las 50 visibles · de 320».
 *
 * EL TABLERO SOLO TRAE 50 POR COLUMNA. Un botón que dijera «marcar todas»
 * marcaría 50 y el usuario creería que marcó 320 — y después movería 50
 * pensando que movió todo, sin forma de saber qué quedó atrás. Decir el número
 * de las dos cosas es lo único honesto que se puede hacer sin traerse la
 * columna entera.
 */
export type EtiquetaDeColumna =
  | { clave: "marcarTodas"; n: number }
  | { clave: "marcarVisiblesDeTotal"; n: number; total: number };

export function comoSeMarcaLaColumna(
  visibles: number,
  total: number | null | undefined,
): EtiquetaDeColumna {
  const v = Math.max(0, Math.floor(Number(visibles) || 0));
  const t = Math.floor(Number(total) || 0);
  return t > v ? { clave: "marcarVisiblesDeTotal", n: v, total: t } : { clave: "marcarTodas", n: v };
}

/**
 * El aviso antes de mover a una etapa que CIERRA la venta.
 *
 * Soltar una tarjeta en «Ganada» o «Perdida» no es moverla de sitio: el
 * disparador le pone el estado y la fecha de cierre. En bloque eso cierra
 * cuarenta ventas de una vez, y deshacerlo es volver a mover cuarenta tarjetas
 * a mano. Se pregunta con el número delante.
 */
export type Resultado = "ganado" | "perdido" | "abierto";

export function cierraLaVenta(outcome: string | null | undefined): boolean {
  return outcome === "ganado" || outcome === "perdido";
}

export function avisoDeCierre(r: {
  cuantas: number;
  etapa: string;
  outcome: string | null | undefined;
}): Parte | null {
  if (!cierraLaVenta(r.outcome)) return null;
  return {
    k: r.outcome === "ganado" ? "confirmarGanadas" : "confirmarPerdidas",
    v: { n: Math.max(0, Math.floor(r.cuantas)), etapa: r.etapa },
  };
}

/** Lo que pasó al cerrar. Siempre recuerda que la tarjeta no se mueve. */
export function partesCerrar(r: { cerradas: number; yaCerradas: number; sinNada: number }): Parte[] {
  const out: Parte[] = [];
  out.push(r.cerradas > 0 ? { k: "cerradas", v: { n: r.cerradas } } : { k: "nadaQueCerrar" });
  if (r.yaCerradas > 0) out.push({ k: "yaCerradas", v: { n: r.yaCerradas } });
  if (r.sinNada > 0) out.push({ k: "sinAbiertas", v: { n: r.sinNada } });
  out.push({ k: "tarjetasSiguen" });
  return out;
}

/**
 * Las etapas en el orden en que se ven en el Embudo: primero por embudo, luego
 * por su posición dentro de él. Con un solo embudo es simplemente `sort`.
 */
export function ordenarEtapas<
  T extends { sort?: number | null; pipeline?: { name?: string | null; sort?: number | null } | null },
>(etapas: T[]): T[] {
  return [...etapas].sort((a, b) => {
    const pa = a.pipeline?.sort ?? 0;
    const pb = b.pipeline?.sort ?? 0;
    if (pa !== pb) return pa - pb;
    const na = a.pipeline?.name ?? "";
    const nb = b.pipeline?.name ?? "";
    if (na !== nb) return na.localeCompare(nb);
    return (a.sort ?? 0) - (b.sort ?? 0);
  });
}
