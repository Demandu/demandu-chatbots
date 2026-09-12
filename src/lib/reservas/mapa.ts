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

/**
 * EL TAMAÑO DE UNA MESA SEGÚN CUÁNTA GENTE CABE.
 *
 * Una mesa de dos y una de diez no se dibujan iguales. Si todas midieran lo
 * mismo, el plano dejaría de parecerse al salón y el encargado tendría que leer
 * el número de cada una para entender qué está mirando — que es justo lo que un
 * plano existe para evitar.
 *
 * Las rectangulares crecen a lo largo, como en la vida real: una mesa de diez
 * es una tabla larga, no un cuadrado enorme.
 */
export function tamanoPorCapacidad(
  capacidad: number,
  forma: "redonda" | "cuadrada" | "rectangular" = "redonda",
): { ancho: number; alto: number } {
  const p = Math.max(1, Math.min(40, Math.round(Number(capacidad) || 2)));
  // De 2 personas → 60px; de 10 → 120px. Sube despacio a propósito: si creciera
  // en proporción, una mesa de 20 ocuparía media pantalla.
  const lado = aLaRejilla(Math.min(140, 50 + p * 7));
  if (forma === "rectangular") {
    return { ancho: aLaRejilla(Math.min(240, 60 + p * 14)), alto: aLaRejilla(Math.max(50, lado * 0.6)) };
  }
  return { ancho: lado, alto: lado };
}

/** Cuánto aire se deja entre mesas al colocarlas de golpe. */
const AIRE = 20;

/**
 * UNA TANDA DE MESAS IGUALES, COLOCADAS SOLAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Seis mesas de dos, redondas» en un clic. Ponerlas de una en una y arrastrar
 * cada una es tedioso, y lo tedioso no se hace: un dueño que abandona a mitad
 * deja el salón a medias, y un salón a medias hace que Lana rechace reservas
 * que sí cabían.
 *
 * ── NO SE PONEN ENCIMA DE LAS QUE YA HAY ──────────────────────────────────
 *
 * Se busca hueco recorriendo el plano. Soltar veinte mesas encima de las que ya
 * estaban dejaría todo en rojo y el dueño tendría que desenredarlo a mano — más
 * trabajo del que se le ahorró.
 *
 * ── SI NO CABEN TODAS, SE PONEN LAS QUE CABEN ─────────────────────────────
 *
 * Y quien llama avisa cuántas entraron. Apilarlas fuera del plano sería crear
 * mesas invisibles: existirían para Lana y no para el dueño, que es la peor
 * clase de fallo — el que no se ve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function tandaDeMesas(opts: {
  cuantas: number;
  capacidad: number;
  forma?: "redonda" | "cuadrada" | "rectangular";
  zona?: string | null;
  yaHay?: { nombre?: string | null; x: number; y: number; ancho: number; alto: number }[] | null;
  base?: string;
  lienzo?: { ancho: number; alto: number };
}): {
  nombre: string; capacidad: number; forma: string; zona: string | null;
  x: number; y: number; ancho: number; alto: number;
}[] {
  const cuantas = Math.max(0, Math.min(60, Math.floor(Number(opts.cuantas) || 0)));

  /* LA CAPACIDAD NO SE CORRIGE, SE RECHAZA. Antes se forzaba a 1 con un
   * `Math.max`, así que pedir «tres mesas de 0 personas» creaba tres mesas de
   * una persona que nadie pidió. Un dato inventado en silencio es peor que un
   * error: el dueño se encuentra mesas que no puso y no sabe de dónde salieron. */
  const capacidad = Math.round(Number(opts.capacidad));
  if (!cuantas) return [];
  if (!Number.isFinite(capacidad) || capacidad < 1 || capacidad > 40) return [];

  const forma = opts.forma ?? "redonda";
  const lienzo = opts.lienzo ?? LIENZO;
  const { ancho, alto } = tamanoPorCapacidad(capacidad, forma);

  const existentes = (opts.yaHay ?? []).filter(Boolean);
  const ocupado = existentes.map((m) => ({ x: m.x, y: m.y, ancho: m.ancho, alto: m.alto }));
  // Los nombres ya usados se van sumando sobre la marcha: sin esto, la tanda
  // entera se llamaría igual y el `unique (org_id, nombre)` la rechazaría.
  const usados = existentes.map((m) => ({ nombre: m.nombre }));

  const salida = [];
  const pasoX = ancho + AIRE;
  const pasoY = alto + AIRE;

  for (let n = 0; n < cuantas; n++) {
    let puesta = false;
    for (let y = AIRE; y + alto <= lienzo.alto && !puesta; y += pasoY) {
      for (let x = AIRE; x + ancho <= lienzo.ancho && !puesta; x += pasoX) {
        const sitio = acomodar({ x, y, ancho, alto }, lienzo);
        if (ocupado.some((o) => sePisan(sitio, o))) continue;

        const nombre = nombreLibre(usados, opts.base ?? "Mesa");
        usados.push({ nombre });
        ocupado.push(sitio);
        salida.push({
          nombre, capacidad, forma,
          zona: String(opts.zona ?? "").trim() || null,
          ...sitio,
        });
        puesta = true;
      }
    }
    /* SALIDA TEMPRANA, NO UN CANDADO — y conviene no confundirlo. Quien impide
     * apilar mesas es el `continue` de arriba, que descarta cada hueco ocupado.
     * Esto solo deja de intentarlo: si una mesa no encontró sitio, la siguiente
     * tampoco va a encontrarlo (mismo tamaño, mismos huecos), así que seguir
     * sería recorrer el plano entero para nada. */
    if (!puesta) break;
  }

  return salida;
}
