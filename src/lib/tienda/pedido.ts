/**
 * El carrito y el pedido que sale por WhatsApp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO EL DINERO AQUÍ ES ENTERO, EN CENTAVOS. Un carrito con coma flotante
 * acaba con un centavo de diferencia entre lo que suma la pantalla y lo que
 * dice el mensaje — y el cliente lo ve. Es de las cosas que más rápido tumban
 * la confianza en una tienda.
 *
 * EL MENSAJE SE ARMA AQUÍ Y NO EN LA PANTALLA porque es el documento del
 * pedido: es lo que el negocio va a leer para preparar y cobrar. Separado se
 * puede probar con los casos que de verdad pasan —opciones con recargo, tres
 * unidades, una nota larga— en vez de confiar en que se vea bien.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { comoDinero, type GrupoVariedad } from "./variedades";
import type { PreguntaPedido } from "./config";

export type LineaCarrito = {
  /** Identifica la línea: el mismo producto con otras opciones es OTRA línea. */
  clave: string;
  producto_id: string;
  nombre: string;
  /** Precio base del producto, en centavos. */
  precio: number;
  cantidad: number;
  /** Las opciones elegidas, en el orden en que se preguntaron. */
  elegidas: { grupo: string; texto: string; recargo: number }[];
  nota: string;
};

/**
 * La clave de una línea.
 *
 * DOS VECES EL MISMO PRODUCTO CON DISTINTAS OPCIONES SON DOS LÍNEAS. Si se
 * juntaran por el id del producto, pedir una pizza con piña y otra sin piña
 * daría «2 pizzas» y una de las dos saldría mal.
 */
export function claveDeLinea(
  productoId: string,
  elegidas: { grupo: string; texto: string }[],
  nota: string,
): string {
  const partes = (elegidas ?? []).map((e) => `${e.grupo}=${e.texto}`).sort();
  return [productoId, partes.join("|"), (nota ?? "").trim()].join("::");
}

/** Lo que cuesta UNA unidad de esta línea: el producto más sus recargos. */
export function precioUnitario(l: LineaCarrito): number {
  const extra = (l.elegidas ?? []).reduce((s, e) => s + (Number(e.recargo) || 0), 0);
  return Math.max(0, Math.round(l.precio) + extra);
}

/** Lo que cuesta la línea entera. */
export function totalDeLinea(l: LineaCarrito): number {
  return precioUnitario(l) * Math.max(0, Math.round(l.cantidad) || 0);
}

export function totalDelCarrito(lineas: LineaCarrito[]): number {
  return (lineas ?? []).reduce((s, l) => s + totalDeLinea(l), 0);
}

export function cuantasUnidades(lineas: LineaCarrito[]): number {
  return (lineas ?? []).reduce((s, l) => s + Math.max(0, Math.round(l.cantidad) || 0), 0);
}

/**
 * ¿Están contestadas todas las opciones obligatorias de un producto?
 *
 * SE COMPRUEBA ANTES DE AGREGAR AL CARRITO. Un pedido al que le falta el
 * tamaño obliga al negocio a llamar al cliente, y esa llamada es donde se
 * pierden los pedidos pequeños: no contestan y no se prepara nada.
 *
 * «Elige una» siempre es obligatoria: si el producto tiene tamaños, alguno
 * hay que llevarse. «Elige las que quiera» nunca lo es. «Cantidad exacta»
 * exige justo esa cantidad, ni una más.
 */
export function faltaElegir(
  grupos: GrupoVariedad[],
  elegidas: { grupo: string; texto: string }[],
): string[] {
  const falta: string[] = [];
  for (const g of grupos ?? []) {
    const cuantas = (elegidas ?? []).filter((e) => e.grupo === g.nombre).length;
    if (g.modo === "una" && cuantas !== 1) falta.push(g.nombre);
    else if (g.modo === "hasta_completar" && cuantas !== (g.cantidad ?? 0)) falta.push(g.nombre);
  }
  return falta;
}

/**
 * El mensaje del pedido.
 *
 * VA EN TEXTO PLANO Y SIN ADORNOS porque acaba en WhatsApp, donde el negocio
 * lo lee en un teléfono, a veces con prisa y con las manos ocupadas. Cada
 * línea es un renglón que se puede tachar mientras se prepara.
 *
 * EL TOTAL VA AL FINAL Y SIEMPRE, aunque el carrito tenga una sola cosa: es
 * el número que se cobra, y buscarlo sumando de cabeza es como se cobra mal.
 */
export function textoDelPedido({
  tienda,
  lineas,
  respuestas,
  preguntas,
  moneda,
}: {
  tienda: string;
  lineas: LineaCarrito[];
  /** Lo que contestó el cliente, por id de pregunta. */
  respuestas: Record<string, string>;
  preguntas: PreguntaPedido[];
  moneda: string;
}): string {
  const partes: string[] = [];
  partes.push(`*Pedido — ${tienda}*`);
  partes.push("");

  for (const l of lineas ?? []) {
    const cant = Math.max(0, Math.round(l.cantidad) || 0);
    if (cant === 0) continue;
    partes.push(`• ${cant} × ${l.nombre} — ${comoDinero(totalDeLinea(l), moneda)}`);
    for (const e of l.elegidas ?? []) {
      // El recargo se enseña junto a la opción: así el negocio puede explicarle
      // al cliente de dónde sale el total sin tener que reconstruirlo.
      partes.push(`   ${e.grupo}: ${e.texto}${e.recargo ? ` (+${comoDinero(e.recargo, moneda)})` : ""}`);
    }
    if (l.nota?.trim()) partes.push(`   Nota: ${l.nota.trim()}`);
  }

  partes.push("");
  partes.push(`*Total: ${comoDinero(totalDelCarrito(lineas), moneda)}*`);

  const contestadas = (preguntas ?? [])
    .map((p) => ({ etiqueta: p.etiqueta, valor: (respuestas?.[p.id] ?? "").trim() }))
    .filter((r) => r.valor);

  if (contestadas.length) {
    partes.push("");
    for (const r of contestadas) partes.push(`${r.etiqueta}: ${r.valor}`);
  }

  return partes.join("\n");
}

/**
 * El enlace de WhatsApp con el pedido dentro.
 *
 * SE CODIFICA ENTERO. Un pedido lleva saltos de línea, acentos, almohadillas y
 * signos de más; sin codificar, el mensaje llega cortado por la mitad — y lo
 * que se corta es justamente el final, donde está el total y la dirección.
 */
export function enlaceDeWhatsapp(numero: string, texto: string): string {
  const limpio = String(numero ?? "").replace(/\D/g, "");
  return `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
}

/** Lo que falta contestar del formulario, con el nombre que ve el cliente. */
export function faltaContestar(
  preguntas: PreguntaPedido[],
  respuestas: Record<string, string>,
): string[] {
  return (preguntas ?? [])
    .filter((p) => p.obligatoria && !(respuestas?.[p.id] ?? "").trim())
    .map((p) => p.etiqueta);
}
