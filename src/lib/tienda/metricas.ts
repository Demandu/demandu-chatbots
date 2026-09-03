/**
 * Lo que este cliente vale, contado desde sus pedidos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SON NÚMEROS PARA DECIDIR EN TRES SEGUNDOS, no un informe. La pregunta que se
 * hace quien tiene el chat abierto es siempre la misma: ¿a quién estoy
 * atendiendo? Alguien que compra cada semana y alguien que probó una vez
 * merecen respuestas distintas, y hoy eso solo lo sabe quien se acuerde.
 *
 * LOS CANCELADOS NO SUMAN DINERO PERO SÍ SE CUENTAN. Meterlos en el gasto
 * infla el ticket y hace parecer bueno a quien no lo es; esconderlos del todo
 * oculta justo al que cancela la mitad de lo que pide.
 *
 * TODO EN CENTAVOS ENTEROS, como el resto de la tienda.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type LineaDePedido = { nombre: string; cantidad: number; precio: number };

export type PedidoDeCliente = {
  created_at: string;
  estado: string;
  total: number;
  lineas?: LineaDePedido[];
};

export type Favorito = { nombre: string; unidades: number; veces: number };

export type MetricasCliente = {
  pedidos: number;
  entregados: number;
  cancelados: number;
  /** Centavos, sin contar cancelados. */
  gastado: number;
  /** Centavos. Promedio de lo que gasta cada vez que pide. */
  ticket: number;
  primera: string | null;
  ultima: string | null;
  /** Pidió más de una vez: es la diferencia entre un curioso y un cliente. */
  volvio: boolean;
  /** Días promedio entre pedidos. `null` si solo hay uno: no hay intervalo. */
  frecuencia: number | null;
  favoritos: Favorito[];
};

export const SIN_COMPRAS: MetricasCliente = {
  pedidos: 0,
  entregados: 0,
  cancelados: 0,
  gastado: 0,
  ticket: 0,
  primera: null,
  ultima: null,
  volvio: false,
  frecuencia: null,
  favoritos: [],
};

export function metricasDeCliente(pedidos: PedidoDeCliente[]): MetricasCliente {
  const todos = (Array.isArray(pedidos) ? pedidos : []).filter(
    (p) => p && Number.isFinite(Date.parse(String(p.created_at))),
  );
  if (!todos.length) return { ...SIN_COMPRAS };

  const cancelados = todos.filter((p) => p.estado === "cancelado");
  const buenos = todos.filter((p) => p.estado !== "cancelado");
  const entregados = buenos.filter((p) => p.estado === "entregado").length;

  const fechas = buenos
    .map((p) => Date.parse(String(p.created_at)))
    .sort((a, b) => a - b);

  const gastado = buenos.reduce((s, p) => s + Math.max(0, Math.round(Number(p.total) || 0)), 0);

  // POR PEDIDO, NO POR MES: el ticket es «cuánto se gasta cada vez que viene»,
  // y dividir por el tiempo lo convierte en otra cosa que se parece pero no
  // sirve para lo mismo.
  const ticket = buenos.length ? Math.round(gastado / buenos.length) : 0;

  // El promedio entre la primera y la última compra. Con un solo pedido no hay
  // intervalo que medir, y decir «cada 0 días» sería mentir con un número.
  const frecuencia =
    fechas.length >= 2
      ? Math.max(1, Math.round((fechas[fechas.length - 1] - fechas[0]) / (fechas.length - 1) / 86_400_000))
      : null;

  // Favorito = lo que más se ha llevado, contando unidades. En segundo lugar,
  // en cuántos pedidos distintos aparece: dos sacos en una compra no es lo
  // mismo que un saco en dos meses seguidos.
  const cuenta = new Map<string, Favorito>();
  for (const p of buenos) {
    const vistos = new Set<string>();
    for (const l of p.lineas ?? []) {
      const nombre = String(l?.nombre ?? "").trim();
      if (!nombre) continue;
      const unidades = Math.max(0, Math.floor(Number(l?.cantidad) || 0));
      const actual = cuenta.get(nombre) ?? { nombre, unidades: 0, veces: 0 };
      actual.unidades += unidades;
      if (!vistos.has(nombre)) {
        actual.veces += 1;
        vistos.add(nombre);
      }
      cuenta.set(nombre, actual);
    }
  }

  const favoritos = [...cuenta.values()]
    .sort((a, b) => b.unidades - a.unidades || b.veces - a.veces || a.nombre.localeCompare(b.nombre))
    .slice(0, 5);

  return {
    pedidos: todos.length,
    entregados,
    cancelados: cancelados.length,
    gastado,
    ticket,
    primera: fechas.length ? new Date(fechas[0]).toISOString() : null,
    ultima: fechas.length ? new Date(fechas[fechas.length - 1]).toISOString() : null,
    volvio: buenos.length >= 2,
    frecuencia,
    favoritos,
  };
}

/**
 * Cómo se dice la frecuencia en voz alta.
 *
 * «Cada 31 días» no se lee, se calcula. Quien mira la ficha necesita saber si
 * este cliente es de todas las semanas o de una vez al año.
 */
export function comoFrecuencia(dias: number | null): string {
  if (dias === null) return "";
  if (dias <= 2) return "casi a diario";
  if (dias <= 10) return "cada semana";
  if (dias <= 20) return "cada dos semanas";
  if (dias <= 45) return "cada mes";
  if (dias <= 120) return "cada dos o tres meses";
  return "muy de vez en cuando";
}
