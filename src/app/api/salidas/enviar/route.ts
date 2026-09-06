import { createAdminClient } from "@/lib/supabase/admin";
import { llamadaDeTareaProgramada } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Entrega los eventos pendientes a donde cada cliente dijo.
 *
 * Lo llama el reloj de la base cada minuto, con un ticket de un solo uso.
 *
 * POR QUÉ LOS REINTENTOS SE ESPACIAN. Un CRM que está caído no se arregla
 * porque le insistamos cada minuto: solo conseguiríamos que nos bloquee y
 * llenar su registro de errores. Se espera cada vez más —1, 5, 25 minutos, dos
 * horas, medio día— y a los seis intentos se deja. Seis intentos repartidos así
 * cubren más de un día de caída, que es de sobra para cualquier corte real.
 */
const LOTE = 50;
const MAX_INTENTOS = 6;
/** Minutos de espera antes de cada reintento. */
const ESPERAS = [1, 5, 25, 120, 720, 1440];

/** Firma el cuerpo para que quien recibe pueda comprobar que viene de nosotros. */
async function firmar(secreto: string, cuerpo: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo));
  return Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  if (!(await llamadaDeTareaProgramada(req, "salidas"))) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: pendientes } = await admin
    .from("eventos_salientes")
    .select("id, tipo, payload, intentos, salida_id, salidas(url, secreto, activa)")
    .eq("estado", "pendiente")
    .lte("proximo_at", new Date().toISOString())
    .order("proximo_at", { ascending: true })
    .limit(LOTE);

  const filas = (pendientes ?? []) as any[];
  if (!filas.length) return Response.json({ enviados: 0 });

  let enviados = 0;
  let fallidos = 0;

  for (const e of filas) {
    const destino = e.salidas;

    // La salida se apagó o se borró mientras el evento esperaba en la cola.
    // No es un fallo que haya que reintentar: ya nadie lo quiere.
    if (!destino?.activa || !destino?.url) {
      await admin.from("eventos_salientes")
        .update({ estado: "descartado", ultimo_error: "la salida ya no está activa" })
        .eq("id", e.id);
      continue;
    }

    const cuerpo = JSON.stringify({
      evento: e.tipo,
      enviado_en: new Date().toISOString(),
      datos: e.payload,
    });

    let status = 0;
    let error: string | null = null;

    try {
      const ctl = new AbortController();
      // 15 s. Detrás no hay nadie esperando, pero un destino lento no puede
      // secuestrar el lote entero y dejar sin salir a los demás.
      const reloj = setTimeout(() => ctl.abort(), 15000);
      const r = await fetch(destino.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Demandu-Evento": e.tipo,
          "X-Demandu-Firma": await firmar(destino.secreto, cuerpo),
        },
        body: cuerpo,
        signal: ctl.signal,
      });
      clearTimeout(reloj);
      status = r.status;
      if (!r.ok) error = (await r.text().catch(() => "")).slice(0, 300) || `respondió ${r.status}`;
    } catch (err: any) {
      error = err?.name === "AbortError" ? "tardó más de 15 s" : (err?.message ?? "no se pudo conectar");
    }

    const ahora = new Date().toISOString();

    if (!error) {
      enviados++;
      await admin.from("eventos_salientes")
        .update({ estado: "enviado", enviado_at: ahora, intentos: e.intentos + 1, ultimo_estado: status, ultimo_error: null })
        .eq("id", e.id);
    } else {
      fallidos++;
      const intentos = e.intentos + 1;
      const seRinde = intentos >= MAX_INTENTOS;
      const espera = ESPERAS[Math.min(intentos, ESPERAS.length) - 1] ?? 1440;
      await admin.from("eventos_salientes")
        .update({
          estado: seRinde ? "fallido" : "pendiente",
          intentos,
          ultimo_estado: status || null,
          ultimo_error: error,
          proximo_at: new Date(Date.now() + espera * 60_000).toISOString(),
        })
        .eq("id", e.id);
    }

    // En la salida se guarda SOLO lo último, para que la pantalla del cliente
    // pueda decir «tu CRM no está contestando» sin leerse la cola entera.
    await admin.from("salidas")
      .update({ ultimo_intento_at: ahora, ultimo_estado: status || null, ultimo_error: error })
      .eq("id", e.salida_id);
  }

  return Response.json({ enviados, fallidos });
}
