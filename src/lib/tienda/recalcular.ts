/**
 * Recalcular el pedido contra el catálogo, en el servidor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA ES LA PIEZA QUE IMPIDE QUE TE ROBEN.
 *
 * El escaparate es una página pública: cualquiera puede abrir la consola del
 * navegador y mandar lo que quiera. Si el servidor se creyera el precio que
 * llega, alguien pediría un saco de sesenta dólares por un centavo — y el
 * negocio se enteraría al preparar el pedido, cuando ya lo tiene empacado.
 *
 * Así que del navegador se cree UNA SOLA COSA: qué productos, qué opciones y
 * cuántas unidades. Todos los precios se vuelven a leer de la base.
 *
 * Y LO QUE NO CUADRA SE CAE, no se ajusta. Un producto que ya no existe, una
 * opción que ese producto no tiene, un recargo que no coincide: fuera. Aceptar
 * a medias es peor que rechazar, porque deja un pedido que parece válido.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { GrupoVariedad } from "./variedades";

/** Lo que manda el navegador. Nada de esto se cree sin comprobar. */
export type LineaPedida = {
  producto_id: string;
  cantidad: number;
  /** Solo el nombre del grupo y el texto: el recargo lo pone el servidor. */
  elegidas: { grupo: string; texto: string }[];
  nota?: string;
};

/** Lo que el catálogo dice de verdad. */
export type ProductoDelCatalogo = {
  id: string;
  nombre: string;
  precio: number;
  oculto: boolean;
  stock: number | null;
  variedades: GrupoVariedad[];
};

export type LineaValidada = {
  producto_id: string;
  nombre: string;
  /** Unitario, ya con los recargos de verdad. En centavos. */
  precio: number;
  cantidad: number;
  elegidas: { grupo: string; texto: string; recargo: number }[];
  nota: string;
};

export type Recalculo = {
  lineas: LineaValidada[];
  total: number;
  /** Lo que se cayó y por qué, para poder decírselo a alguien. */
  rechazos: string[];
};

/** Como mucho noventa y nueve de lo mismo: más es un dedo pegado a la tecla. */
const MAX_POR_LINEA = 99;

export function recalcularPedido(
  catalogo: ProductoDelCatalogo[],
  pedidas: LineaPedida[],
): Recalculo {
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const lineas: LineaValidada[] = [];
  const rechazos: string[] = [];

  for (const l of Array.isArray(pedidas) ? pedidas : []) {
    const p = porId.get(String(l?.producto_id ?? ""));
    if (!p) {
      rechazos.push("Un producto del pedido ya no está en la tienda.");
      continue;
    }
    // Oculto es «para el público no existe»: si se cuela en un pedido, es que
    // alguien guardó el enlace o manipuló la petición.
    if (p.oculto) {
      rechazos.push(`«${p.nombre}» ya no está disponible.`);
      continue;
    }
    if (p.stock === 0) {
      rechazos.push(`«${p.nombre}» está agotado.`);
      continue;
    }

    const cantidad = Math.floor(Number(l?.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      rechazos.push(`La cantidad de «${p.nombre}» no se entiende.`);
      continue;
    }
    const cantidadFinal = Math.min(cantidad, MAX_POR_LINEA);

    // Nunca vender más de lo que hay. `null` = el negocio no lleva control.
    if (p.stock !== null && cantidadFinal > p.stock) {
      rechazos.push(`De «${p.nombre}» solo quedan ${p.stock}.`);
      continue;
    }

    // LAS OPCIONES SE BUSCAN EN EL PRODUCTO. Una que no exista se descarta con
    // su recargo: así, inventarse «Salmón {0.00}» no abarata nada.
    const elegidas: { grupo: string; texto: string; recargo: number }[] = [];
    let opcionInvalida = false;

    for (const e of Array.isArray(l?.elegidas) ? l.elegidas : []) {
      const grupo = (p.variedades ?? []).find((g) => g.nombre === e?.grupo);
      const opcion = grupo?.opciones?.find((o) => o.texto === e?.texto);
      if (!grupo || !opcion) {
        opcionInvalida = true;
        break;
      }
      elegidas.push({ grupo: grupo.nombre, texto: opcion.texto, recargo: opcion.recargo });
    }

    if (opcionInvalida) {
      rechazos.push(`Las opciones de «${p.nombre}» ya no son válidas.`);
      continue;
    }

    // Y LO OBLIGATORIO SIGUE SIENDO OBLIGATORIO aquí, no solo en la pantalla.
    // Un pedido al que le falta el tamaño obliga a llamar al cliente, y esa
    // llamada es donde se pierden los pedidos pequeños.
    const falta = (p.variedades ?? []).filter((g) => {
      const cuantas = elegidas.filter((e) => e.grupo === g.nombre).length;
      if (g.modo === "una") return cuantas !== 1;
      if (g.modo === "hasta_completar") return cuantas !== (g.cantidad ?? 0);
      return false;
    });
    if (falta.length) {
      rechazos.push(`Falta elegir ${falta.map((g) => g.nombre).join(" y ")} en «${p.nombre}».`);
      continue;
    }

    const recargo = elegidas.reduce((s, e) => s + e.recargo, 0);
    lineas.push({
      producto_id: p.id,
      nombre: p.nombre,
      precio: Math.max(0, Math.round(p.precio) + recargo),
      cantidad: cantidadFinal,
      elegidas,
      nota: String(l?.nota ?? "").trim().slice(0, 300),
    });
  }

  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  return { lineas, total, rechazos };
}
