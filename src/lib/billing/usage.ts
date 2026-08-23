/**
 * Consumo del mes en curso de una organización: mensajes enviados, respuestas
 * de IA, espacio de entrenamiento, agentes y chatbots — cada uno con el límite
 * de su plan más los complementos contratados.
 */

export type Metric = {
  key: string;
  label: string;
  help: string;
  used: number;
  limit: number;
  pct: number;
  /** Formatea el valor para mostrarlo (números o tamaño) */
  format: "number" | "bytes";
  over: boolean;
  near: boolean;
};

export type Usage = {
  periodStart: string;
  periodEnd: string;
  planCode: string;
  planName: string;
  metrics: Metric[];
  /** Cuántas de las respuestas del mes las generó la IA (solo informativo). */
  aiAnswers: number;
  anyOver: boolean;
  anyNear: boolean;
};

export function fmtBytes(b: number): string {
  if (!b || b < 0) return "0 MB";
  const mb = b / (1024 * 1024);
  if (mb < 0.1) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function fmtNumber(n: number): string {
  return (n ?? 0).toLocaleString("es-MX");
}

export function fmtMetric(m: Metric, v: number): string {
  return m.format === "bytes" ? fmtBytes(v) : fmtNumber(v);
}

function metric(
  key: string,
  label: string,
  help: string,
  used: number,
  limit: number,
  format: "number" | "bytes" = "number",
): Metric {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return {
    key, label, help, used, limit, pct, format,
    over: limit > 0 && used >= limit,
    near: limit > 0 && pct >= 85 && used < limit,
  };
}

const EMPTY: Usage = {
  periodStart: "", periodEnd: "", planCode: "", planName: "—",
  metrics: [], aiAnswers: 0, anyOver: false, anyNear: false,
};

/** Lee el consumo del mes. Nunca lanza excepción. */
export async function getUsage(supabase: any, orgId: string | null): Promise<Usage> {
  if (!orgId) return EMPTY;

  try {
    const { data, error } = await supabase.rpc("org_usage", { p_org: orgId });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return EMPTY;

    const metrics: Metric[] = [
      // UNA SOLA BOLSA, A PROPÓSITO.
      //
      // Hubo dos intentos peores antes de este. Primero una respuesta de IA
      // costaba 3 mensajes: el paquete se vaciaba tres veces más rápido y
      // nadie sabía por qué. Después fueron dos contadores separados: honesto,
      // pero una respuesta de IA descontaba de los dos y se leía como cobro
      // doble.
      //
      // La cuenta dice que ninguno de los dos hacía falta: aunque un cliente
      // usara el 100% de su plan en IA, el costo se queda entre el 14% y el
      // 19% de lo que paga. El límite de IA protegía un margen que no estaba
      // en riesgo, a cambio de un concepto que nadie entiende. Fuera.
      //
      // La IA usada sigue midiéndose (`aiAnswers`) y se ve en el panel interno
      // por cliente — pero como dato, no como límite para el cliente.
      metric(
        "messages",
        "Mensajes enviados",
        "Cada mensaje que sale de tu chatbot o de tu equipo. Lo que te escriben tus clientes no cuenta: recibir es gratis.",
        Number(row.messages_used ?? 0),
        Number(row.messages_limit ?? 0),
      ),
      metric(
        "storage",
        "Entrenamiento",
        "Espacio que ocupa la información que le has enseñado a tus chatbots.",
        Number(row.storage_used ?? 0),
        Number(row.storage_limit ?? 0),
        "bytes",
      ),
      metric(
        "agents",
        "Agentes",
        "Personas de tu equipo que pueden atender conversaciones.",
        Number(row.agents_used ?? 0),
        Number(row.agents_limit ?? 0),
      ),
      metric(
        "bots",
        "Chatbots",
        "Chatbots creados en tu cuenta.",
        Number(row.bots_used ?? 0),
        Number(row.bots_limit ?? 0),
      ),
    ];

    return {
      periodStart: row.period_start ?? "",
      periodEnd: row.period_end ?? "",
      planCode: row.plan_code ?? "",
      planName: row.plan_name ?? "—",
      metrics,
      aiAnswers: Number(row.ai_used ?? 0),
      anyOver: metrics.some((m) => m.over),
      anyNear: metrics.some((m) => m.near),
    };
  } catch {
    return EMPTY;
  }
}

/** Complementos contratados por la organización, para mostrarlos en el panel. */
export async function getAddons(
  supabase: any,
  orgId: string | null,
): Promise<{ name: string; quantity: number; price: number; unit: string }[]> {
  if (!orgId) return [];
  try {
    const { data } = await supabase
      .from("org_addons")
      .select("quantity, addons(name, price, unit)")
      .eq("org_id", orgId)
      .eq("active", true);

    return ((data as any[]) ?? []).map((r) => ({
      name: r.addons?.name ?? "Complemento",
      quantity: Number(r.quantity ?? 1),
      price: Number(r.addons?.price ?? 0),
      unit: r.addons?.unit ?? "",
    }));
  } catch {
    return [];
  }
}
