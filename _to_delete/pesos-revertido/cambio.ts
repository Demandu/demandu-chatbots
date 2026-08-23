/**
 * Equivalencia en moneda local — SOLO PARA MOSTRAR.
 *
 * DECISIÓN DE NEGOCIO, no de código: Demandu cobra en dólares. Punto.
 *
 * Poner precios fijos en pesos suena más cercano y es una trampa: todos los
 * costos de la plataforma (Anthropic, Supabase, Netlify, Meta) son en dólares.
 * Con un precio fijo en pesos, cada movimiento del tipo de cambio se come el
 * margen — y la única salida sería subirle el precio a gente que ya está
 * pagando, que es la peor conversación que existe.
 *
 * Así que el precio es en dólares y al lado va un "≈ $X MXN" de referencia,
 * marcado como aproximado. El cliente entiende de qué tamaño es el gasto, y
 * el número que manda sigue siendo uno solo.
 */

/** Pasados estos días, el tipo de cambio ya no es de fiar. */
const DIAS_ANTES_DE_CALLARSE = 7;

export type TipoDeCambio = {
  moneda: string;
  valor: number;
  actualizado_at: string;
  /** Días desde la última actualización. */
  antiguedad: number;
};

/**
 * Lee el tipo de cambio guardado.
 *
 * Devuelve `null` si no hay, si falla, o si está viejo. ES A PROPÓSITO:
 * en una pantalla de precios, **no enseñar nada es mejor que enseñar un
 * número equivocado**. Un cliente que no ve pesos abre la calculadora; un
 * cliente que ve pesos mal siente que le mintieron.
 */
export async function leerTipoDeCambio(
  supabase: any,
  moneda = "MXN",
): Promise<TipoDeCambio | null> {
  try {
    const { data } = await supabase
      .from("tipos_de_cambio")
      .select("moneda, valor, actualizado_at")
      .eq("moneda", moneda)
      .maybeSingle();

    if (!data?.valor) return null;

    const dias = (Date.now() - Date.parse(data.actualizado_at)) / 86_400_000;
    if (!Number.isFinite(dias) || dias > DIAS_ANTES_DE_CALLARSE) return null;

    return { ...data, valor: Number(data.valor), antiguedad: Math.floor(dias) };
  } catch {
    return null;
  }
}

/**
 * Convierte y redondea a algo que se lea como un precio.
 *
 * Redondear importa: "≈ $1,092.35 MXN" parece un cobro exacto y no lo es.
 * "≈ $1,100 MXN" se lee como lo que es, una referencia.
 */
export function enPesos(usd: number, tc: TipoDeCambio | null): string | null {
  if (!tc || !Number.isFinite(usd) || usd <= 0) return null;
  const bruto = usd * tc.valor;
  const paso = bruto >= 2000 ? 100 : bruto >= 500 ? 50 : 10;
  const redondo = Math.round(bruto / paso) * paso;
  return `$${redondo.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}
