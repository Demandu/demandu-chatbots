/**
 * EL MAPA DEL SALÓN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Aquí solo vive la lógica del plano, sin React ni base de datos, para poder
 * probarla. La pantalla dibuja; esto decide.
 *
 * ── LA TRAMPA DE LAS UNIONES, Y POR QUÉ ESTÁ RESUELTA AQUÍ ────────────────
 *
 * `asignar.ts` exige que una unión esté marcada POR LOS DOS LADOS: si la mesa 1
 * dice que se junta con la 2 pero la 2 no dice nada de la 1, no junta nada. Es
 * a propósito — un dato a medias significa que alguien editó el mapa y se quedó
 * a mitad, y con datos a medias no se mueven muebles.
 *
 * Pero la base guarda UNA SOLA FILA por par, con el id menor primero
 * (`mesa_a < mesa_b`). Si esa fila se leyera tal cual, TODAS las uniones
 * quedarían marcadas por un solo lado y el salón entero se comportaría como si
 * ninguna mesa se pudiera juntar con ninguna. El mapa se vería perfecto y Lana
 * rechazaría a todos los grupos grandes sin que nadie entendiera por qué.
 *
 * `conUnibles` es lo que evita eso: convierte cada par en las DOS direcciones.
 * Una fila en la base, dos marcas en memoria.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Mesa } from "./asignar";

/** A cuánto se pega la mesa al soltarla. Sin rejilla, un salón queda torcido. */
export const REJILLA = 10;

/** El tamaño del plano. Las mesas no pueden salirse. */
export const LIENZO = { ancho: 1200, alto: 800 };

export type MesaEnElMapa = Mesa & {
  zona?: string | null;
  x: number; y: number; ancho: number; alto: number;
  forma?: "redonda" | "cuadrada" | "rectangular";
};

/** Un par tal como se guarda: siempre el id menor primero. */
export type Par = { mesa_a: string; mesa_b: string };

/**
 * Ordena un par para guardarlo.
 *
 * Sin esto, unir la 1 con la 2 y luego la 2 con la 1 crearía dos filas para la
 * misma unión, y «¿están unidas?» dependería de por dónde se preguntara.
 *
 * Devuelve `null` si es la misma mesa consigo misma: eso no es una unión.
 */
export function parNormalizado(a: string, b: string): Par | null {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!x || !y || x === y) return null;
  return x < y ? { mesa_a: x, mesa_b: y } : { mesa_a: y, mesa_b: x };
}

/**
 * Las mesas con sus uniones EN LAS DOS DIRECCIONES.
 *
 * Es lo que `asignar.ts` espera recibir. Ver la cabecera: sin esto, una fila
 * por par se leería como una unión a medias y no se juntaría nunca nada.
 */
export function conUnibles(
  mesas: MesaEnElMapa[] | null | undefined,
  pares: Par[] | null | undefined,
): MesaEnElMapa[] {
  const lista = (mesas ?? []).filter(Boolean);
  const existe = new Set(lista.map((m) => m.id));
  const de = new Map<string, Set<string>>();

  for (const p of pares ?? []) {
    const a = String(p?.mesa_a ?? "");
    const b = String(p?.mesa_b ?? "");
    // Un par que apunta a una mesa borrada no se marca. Dejarlo colgando haría
    // que `asignar` contara una mesa que ya no está en el salón.
    if (!existe.has(a) || !existe.has(b) || a === b) continue;
    if (!de.has(a)) de.set(a, new Set());
    if (!de.has(b)) de.set(b, new Set());
    de.get(a)!.add(b);
    de.get(b)!.add(a); // ← LAS DOS DIRECCIONES. Esta línea es la razón del archivo.
  }

  return lista.map((m) => ({ ...m, unibles: [...(de.get(m.id) ?? [])].sort() }));
}

/** Pega un número a la rejilla. */
export const aLaRejilla = (n: number, rejilla = REJILLA) =>
  Math.round((Number(n) || 0) / rejilla) * rejilla;

/**
 * Deja la mesa donde se puede: pegada a la rejilla y dentro del plano.
 *
 * SE RECORTA, NO SE RECHAZA. Arrastrar una mesa fuera del borde y que
 * desaparezca es la peor respuesta posible: el dueño cree que la borró.
 */
export function acomodar(
  m: { x: number; y: number; ancho: number; alto: number },
  lienzo = LIENZO,
): { x: number; y: number; ancho: number; alto: number } {
  const ancho = Math.max(REJILLA * 2, Math.min(aLaRejilla(m.ancho), lienzo.ancho));
  const alto = Math.max(REJILLA * 2, Math.min(aLaRejilla(m.alto), lienzo.alto));
  const x = Math.max(0, Math.min(aLaRejilla(m.x), lienzo.ancho - ancho));
  const y = Math.max(0, Math.min(aLaRejilla(m.y), lienzo.alto - alto));
  return { x, y, ancho, alto };
}

/**
 * ¿Estas dos mesas están una encima de la otra?
 *
 * No se prohíbe —hay salones con mesas pegadas, y una barra puede tocar una
 * mesa— pero la pantalla lo marca en rojo. Dos mesas superpuestas casi siempre
 * son un arrastre que se fue de las manos, y un plano que no se parece al salón
 * hace que el mesero deje de mirarlo.
 */
export function sePisan(
  a: { x: number; y: number; ancho: number; alto: number },
  b: { x: number; y: number; ancho: number; alto: number },
): boolean {
  return (
    a.x < b.x + b.ancho &&
    b.x < a.x + a.ancho &&
    a.y < b.y + b.alto &&
    b.y < a.y + a.alto
  );
}

/** Las que se están pisando, para pintarlas distinto. */
export function lasQueSePisan(mesas: MesaEnElMapa[] | null | undefined): Set<string> {
  const lista = (mesas ?? []).filter((m) => m && m.activa !== false);
  const malas = new Set<string>();
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (sePisan(lista[i], lista[j])) {
        malas.add(lista[i].id);
        malas.add(lista[j].id);
      }
    }
  }
  return malas;
}

/**
 * Un nombre que no choque con los que ya hay.
 *
 * La base tiene `unique (org_id, nombre)` porque dos «Mesa 4» en el mismo salón
 * es un fallo operativo: el mesero no sabe a cuál llevar al grupo. Si la
 * pantalla propusiera un nombre repetido, el guardado fallaría y el dueño vería
 * un error en vez de una mesa.
 */
export function nombreLibre(
  mesas: { nombre?: string | null }[] | null | undefined,
  base = "Mesa",
): string {
  const usados = new Set(
    (mesas ?? []).map((m) => String(m?.nombre ?? "").trim().toLowerCase()),
  );
  for (let i = 1; i < 500; i++) {
    const n = `${base} ${i}`;
    if (!usados.has(n.toLowerCase())) return n;
  }
  // Quinientas mesas es más restaurante del que existe, pero devolver algo
  // repetido rompería el guardado. Se desempata con la hora.
  return `${base} ${Date.now()}`;
}

/** Cuánta gente cabe en el salón, para enseñarlo arriba. */
export function aforoDelSalon(mesas: MesaEnElMapa[] | null | undefined): number {
  return (mesas ?? [])
    .filter((m) => m && m.activa !== false)
    .reduce((n, m) => n + Math.max(0, Number(m.capacidad) || 0), 0);
}
