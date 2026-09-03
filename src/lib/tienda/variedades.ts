/**
 * Las variedades de un producto, tal y como se escriben en la hoja.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE FORMATO NO SE INVENTÓ AQUÍ. Viene de las tiendas que ya funcionan con
 * clientes reales, y se copia tal cual para que migrar sea reescribir cero:
 *
 *     Pollo, Salmón {2.50}, Res {5}
 *
 * Una lista separada por comas donde, entre llaves, va el RECARGO de esa
 * opción. Sin llaves, no cuesta más.
 *
 * POR QUÉ SE ANALIZA AQUÍ Y NO EN LA PANTALLA: esto decide cuánto se le cobra
 * a una persona. Un fallo aquí no es un texto mal puesto, es dinero mal
 * cobrado. Separándolo en una función pura se puede probar con los casos raros
 * de verdad —comas dentro del nombre, decimales con coma, llaves vacías— en vez
 * de confiar en que la pantalla los pinte bien.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Opcion = {
  texto: string;
  /** EN CENTAVOS. Nunca coma flotante: 0.1 + 0.2 no da 0.3. */
  recargo: number;
};

export type ModoVariedad = "una" | "varias" | "hasta_completar";

export type GrupoVariedad = {
  nombre: string;
  modo: ModoVariedad;
  /** Solo con `hasta_completar`: cuántas hay que elegir en total. */
  cantidad?: number;
  opciones: Opcion[];
};

/**
 * Un precio escrito por una persona, en centavos.
 *
 * ACEPTA COMA Y PUNTO porque en Panamá y en media Latinoamérica se escriben las
 * dos («2,50» y «2.50»), y quien llena la hoja no tiene por qué saber cuál
 * espera el programa. Rechazar «2,50» habría convertido un recargo de dos
 * cincuenta en cero — cobrando de menos sin que nadie se entere.
 *
 * SE REDONDEA AL CENTAVO. `2.505` no existe como dinero.
 */
export function aCentavos(texto: string | number | null | undefined): number {
  if (typeof texto === "number") {
    return Number.isFinite(texto) ? Math.round(texto * 100) : 0;
  }
  const limpio = String(texto ?? "")
    .trim()
    // Fuera símbolos de moneda y espacios: «B/. 2.50», «$2.50», «2.50 USD».
    .replace(/[^\d.,-]/g, "");
  if (!limpio) return 0;

  // MILES vs DECIMALES. «1,600.00» son mil seiscientos, no uno coma seis.
  // Si hay punto Y coma, manda el ÚLTIMO como separador decimal y el otro es
  // de miles. Con uno solo, se decide por cuántos dígitos lleva detrás: dos o
  // menos es decimal; tres es separador de miles («1,600»).
  const iPunto = limpio.lastIndexOf(".");
  const iComa = limpio.lastIndexOf(",");
  let normalizado: string;

  if (iPunto >= 0 && iComa >= 0) {
    const dec = Math.max(iPunto, iComa);
    normalizado = limpio.slice(0, dec).replace(/[.,]/g, "") + "." + limpio.slice(dec + 1);
  } else if (iPunto >= 0 || iComa >= 0) {
    const i = Math.max(iPunto, iComa);
    const detras = limpio.length - i - 1;

    // CON UN SOLO SEPARADOR Y TRES DÍGITOS DETRÁS HAY QUE DECIDIR, y los dos
    // casos existen: «1,600» son mil seiscientos y «2.505» son dos con medio
    // mal escritos. No hay forma de saberlo por el número, así que se decide
    // por el SÍMBOLO, siguiendo la convención de Panamá y del dólar:
    //
    //   coma  + 3 dígitos → separador de MILES   (1,600 = 1600)
    //   punto + 3 dígitos → DECIMALES de más     (2.505 = 2.51, redondeado)
    //
    // Lo descubrió una prueba: antes «2.505» se convertía en 2.505 dólares,
    // o sea cobrar dos mil quinientos por algo de dos con medio.
    const esMiles = detras === 3 && i === iComa;
    normalizado = esMiles
      ? limpio.replace(/[.,]/g, "")
      : limpio.slice(0, i).replace(/[.,]/g, "") + "." + limpio.slice(i + 1);
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Analiza una lista de opciones con sus recargos.
 *
 *   "Pollo, Salmón {2.50}, Res {5}"
 *   → [{texto:"Pollo",recargo:0},{texto:"Salmón",recargo:250},{texto:"Res",recargo:500}]
 *
 * UNA OPCIÓN SIN NOMBRE SE DESCARTA. Una coma de más al final —«Pollo, Salmón,»—
 * es el error de tecleo más común de todos, y pintaría un botón vacío que el
 * cliente puede pulsar sin saber qué está eligiendo.
 */
export function leerOpciones(texto: string | null | undefined): Opcion[] {
  const crudo = String(texto ?? "").trim();
  if (!crudo) return [];

  return crudo
    .split(",")
    .map((parte) => {
      const m = parte.match(/^([^{}]*)\{([^{}]*)\}\s*$/);
      if (m) {
        // Llaves vacías (`Salmón {}`) valen como «sin recargo»: quien las dejó
        // así estaba escribiendo, no cobrando.
        return { texto: m[1].trim(), recargo: aCentavos(m[2]) };
      }
      // Llave sin cerrar o basura suelta: se queda el texto y NO se cobra nada.
      // Cobrar de más por un error de tecleo es mucho peor que no cobrarlo.
      return { texto: parte.replace(/[{}]/g, "").trim(), recargo: 0 };
    })
    .filter((o) => o.texto.length > 0);
}

/** Lo que la hoja escribe en la columna «Modo». */
export function leerModo(texto: string | null | undefined): ModoVariedad {
  const t = String(texto ?? "").trim().toLowerCase();
  if (t.includes("completar")) return "hasta_completar";
  if (t.includes("varias") || t.includes("multiple") || t.includes("múltiple")) return "varias";
  return "una";
}

/**
 * Cuánto suma al precio lo que el cliente eligió.
 *
 * SE SUMA EN CENTAVOS, ENTEROS, y por eso todo lo de arriba trabaja así. El
 * total de un carrito con decimales en coma flotante acaba con un centavo de
 * diferencia, y el cliente lo ve.
 */
export function recargoDe(grupos: GrupoVariedad[], elegidas: string[]): number {
  const escogidas = new Set(elegidas);
  let total = 0;
  for (const g of grupos ?? []) {
    for (const o of g.opciones ?? []) {
      if (escogidas.has(o.texto)) total += Number(o.recargo) || 0;
    }
  }
  return total;
}

/** Centavos → lo que lee una persona. */
export function comoDinero(centavos: number, moneda = "$"): string {
  const n = Math.round(Number(centavos) || 0);
  const signo = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${signo}${moneda}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
