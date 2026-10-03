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

export type TipoSeleccion = "contactos" | "conversaciones";

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
export function partesEtapa(r: { etapa: string; conversaciones: number; tarjetas: number; sinNada: number }): Parte[] {
  const out: Parte[] = [];
  if (r.conversaciones > 0 || r.tarjetas > 0) {
    const k = r.conversaciones > 0 && r.tarjetas > 0 ? "etapaAmbas" : r.conversaciones > 0 ? "etapaConv" : "etapaTarjetas";
    out.push({ k, v: { etapa: r.etapa, c: r.conversaciones, t: r.tarjetas } });
  } else {
    out.push({ k: "etapaNada", v: { etapa: r.etapa } });
  }
  if (r.sinNada > 0) out.push({ k: "sinNada", v: { n: r.sinNada } });
  return out;
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
