/**
 * Facturas de un cliente, leídas de Stripe.
 *
 * POR QUÉ NO LAS GUARDAMOS NOSOTROS. La factura la emite Stripe y es el
 * documento bueno: tiene su numeración correlativa, su PDF y su enlace
 * permanente. Copiarla a nuestra base sería tener dos verdades — y la nuestra
 * se desincronizaría el primer día que alguien emita una nota de crédito
 * desde el panel de Stripe.
 *
 * Aquí solo se leen para enseñarlas, y se puede pedir que Stripe reenvíe el
 * correo. Nada se guarda.
 */

const API = "https://api.stripe.com/v1";

export type Factura = {
  id: string;
  numero: string | null;
  fecha: string;
  /** En dólares, ya convertido de centavos. */
  total: number;
  moneda: string;
  estado: string;
  pdf: string | null;
  enlace: string | null;
  /** Qué la originó: renovación, alta, cambio de plan… tal como lo dice Stripe. */
  motivo: string | null;
};

export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

async function stripe(path: string, method = "GET"): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe no está configurado en este entorno.");

  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? `Stripe respondió ${res.status}`);
  return j;
}

const ESTADOS: Record<string, string> = {
  paid: "Pagada",
  open: "Pendiente de pago",
  draft: "Borrador",
  uncollectible: "Incobrable",
  void: "Anulada",
};

/** El estado en cristiano. Si Stripe inventa uno nuevo, se enseña tal cual
 *  en vez de mentir con un "Pagada" por defecto. */
export function estadoDeFactura(s: string): string {
  return ESTADOS[s] ?? s;
}

/**
 * Las facturas de un cliente, de la más nueva a la más vieja.
 *
 * Nunca lanza: un fallo de Stripe no puede tumbar la ficha del cliente, donde
 * además se enseña su consumo y su estado. Devuelve el error para poder
 * escribirlo en pantalla — esto solo lo ve el equipo de Demandu, así que aquí
 * el mensaje real de Stripe ayuda y no filtra nada.
 */
export async function listarFacturas(
  customerId: string | null | undefined,
  limite = 24,
): Promise<Resultado<Factura[]>> {
  if (!customerId) return { ok: true, datos: [] };

  try {
    const j = await stripe(`/invoices?customer=${encodeURIComponent(customerId)}&limit=${limite}`);
    const datos: Factura[] = ((j?.data as any[]) ?? []).map((f) => ({
      id: f.id,
      numero: f.number ?? null,
      fecha: new Date((f.created ?? 0) * 1000).toISOString(),
      // Stripe trabaja en centavos. Dividir aquí, una sola vez, evita que
      // alguien más adelante enseñe "5900 USD" sin darse cuenta.
      total: Number(f.total ?? 0) / 100,
      moneda: String(f.currency ?? "usd").toUpperCase(),
      estado: String(f.status ?? ""),
      pdf: f.invoice_pdf ?? null,
      enlace: f.hosted_invoice_url ?? null,
      motivo: f.billing_reason ?? null,
    }));
    return { ok: true, datos };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudieron leer las facturas." };
  }
}

/**
 * Pide a Stripe que le reenvíe la factura por correo al cliente.
 *
 * Stripe ya las manda solo en cada cobro. Esto es para cuando alguien llama
 * diciendo "no me llegó": casi siempre está en su spam, pero discutirlo sale
 * más caro que volver a mandarla.
 *
 * En una factura ya pagada, el correo no menciona el pago — lo dice la
 * documentación de Stripe. Conviene saberlo antes de que un cliente pregunte
 * por qué su factura pagada parece pendiente.
 */
export async function reenviarFactura(id: string): Promise<Resultado<null>> {
  if (!id.startsWith("in_")) return { ok: false, error: "Ese no es un identificador de factura." };
  try {
    await stripe(`/invoices/${encodeURIComponent(id)}/send`, "POST");
    return { ok: true, datos: null };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Stripe no la pudo enviar." };
  }
}
