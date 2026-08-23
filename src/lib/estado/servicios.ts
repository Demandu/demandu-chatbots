import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿Están vivos los servicios de los que depende la plataforma?
 *
 * LA REGLA QUE ORDENA TODO ESTE ARCHIVO: **«no pude medirlo» nunca se pinta
 * de verde.** Un tablero de salud que ante la duda dice que todo está bien es
 * peor que no tener tablero, porque da tranquilidad falsa. Por eso `ok` puede
 * ser `true`, `false` o `null`, y `null` se enseña en gris con su motivo.
 *
 * Cada comprobación es barata y con reloj: si un servicio se está muriendo,
 * lo típico no es que conteste un error — es que no conteste. Sin límite de
 * tiempo, la revisión entera se quedaría colgada del más lento.
 */

const LIMITE_MS = 8000;

export type Chequeo = {
  servicio: string;
  /** true = bien · false = caído · null = no se pudo medir */
  ok: boolean | null;
  latencia_ms: number | null;
  detalle: string;
};

/** Qué es cada servicio, en cristiano, para la pantalla. */
export const QUE_ES: Record<string, string> = {
  "base-de-datos": "Donde viven las conversaciones, los contactos y todo lo demás. Si falla, no funciona nada.",
  "motor-whatsapp": "El programa que recibe y contesta los mensajes de WhatsApp. Si falla, los bots se quedan mudos.",
  "plataforma-web": "El panel que usan los clientes. Si falla, no pueden entrar — pero los bots siguen contestando.",
  "meta-whatsapp": "La API de Meta. Si falla, no salen ni entran mensajes de WhatsApp, y no es cosa nuestra.",
  "inteligencia-artificial": "Anthropic, quien piensa las respuestas de Lana. Si falla, los bots contestan con su mensaje de respaldo.",
  "cobros-stripe": "Los cobros. Si falla, nadie puede contratar ni ampliar — lo ya cobrado no se toca.",
};

async function medir(
  servicio: string,
  fn: (señal: AbortSignal) => Promise<{ ok: boolean; detalle: string }>,
): Promise<Chequeo> {
  const ctl = new AbortController();
  const reloj = setTimeout(() => ctl.abort(), LIMITE_MS);
  const t0 = Date.now();
  try {
    const r = await fn(ctl.signal);
    return { servicio, ok: r.ok, latencia_ms: Date.now() - t0, detalle: r.detalle };
  } catch (e: any) {
    const tardo = e?.name === "AbortError";
    return {
      servicio,
      ok: tardo ? false : null,
      latencia_ms: Date.now() - t0,
      // Que tarde más de 8 segundos SÍ es estar caído para quien lo usa.
      // Que reviente por otra causa puede ser culpa nuestra: eso es «no sé».
      detalle: tardo ? `No contestó en ${LIMITE_MS / 1000} s` : e?.message ?? "No se pudo comprobar",
    };
  }
}

/** Corre todas las comprobaciones a la vez. Nunca lanza. */
export async function revisarServicios(origen: string): Promise<Chequeo[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const verify = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
  const anthropic = process.env.ANTHROPIC_API_KEY ?? "";
  const stripe = process.env.STRIPE_SECRET_KEY ?? "";
  const metaToken = process.env.WHATSAPP_ACCESS_TOKEN ?? "";

  return Promise.all([
    // Una consulta de verdad, no un `select 1`: lo que importa no es que el
    // servidor conteste, es que la tabla que usamos todo el día se lea.
    medir("base-de-datos", async () => {
      const { error } = await createAdminClient()
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .limit(1);
      return error ? { ok: false, detalle: error.message } : { ok: true, detalle: "Responde con normalidad" };
    }),

    medir("motor-whatsapp", async (señal) => {
      if (!supabaseUrl) return { ok: false, detalle: "Falta la dirección del proyecto" };
      const r = await fetch(`${supabaseUrl}/functions/v1/whatsapp?version`, { signal: señal, cache: "no-store" });
      if (!r.ok) return { ok: false, detalle: `Contestó ${r.status}` };
      const j = await r.json().catch(() => ({}));
      return { ok: true, detalle: `Versión ${j?.version ?? "?"} en línea` };
    }),

    medir("plataforma-web", async (señal) => {
      // Se comprueba contra sí misma. No es tautológico: si esto se está
      // ejecutando, el servidor vive — lo que se mide es si el sitio publicado
      // responde de verdad, que es lo que ve un cliente.
      const r = await fetch(`${origen}/api/salud`, { signal: señal, cache: "no-store" });
      return r.ok ? { ok: true, detalle: "El sitio responde" } : { ok: false, detalle: `Contestó ${r.status}` };
    }),

    medir("meta-whatsapp", async (señal) => {
      // NO HACE FALTA CONFIGURAR NINGÚN TOKEN PARA ESTO.
      //
      // Meta no tiene un punto público que diga «estoy bien»: todo pide
      // credencial. La tentación es meter un token de plataforma en una
      // variable de entorno — un secreto más que rotar, que caduca, y que un
      // día caduca sin que nadie se entere y hace que el tablero mienta.
      //
      // Se usa el token de un cliente que YA está conectado. Si ese token
      // sirve, Meta está en pie; y si el mensaje de error es de credencial en
      // vez de caída, también nos interesa saberlo — significa que a ese
      // cliente se le venció la conexión.
      const token =
        metaToken ||
        (await createAdminClient()
          .from("whatsapp_channels")
          .select("access_token")
          .not("access_token", "is", null)
          .limit(1)
          .maybeSingle()
          .then((r: any) => r?.data?.access_token ?? ""));

      if (!token) return { ok: null as any, detalle: "Todavía no hay ningún WhatsApp conectado que comprobar" };

      const r = await fetch("https://graph.facebook.com/v21.0/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: señal,
        cache: "no-store",
      });
      if (r.ok) return { ok: true, detalle: "La API de Meta responde" };
      const j = await r.json().catch(() => ({}));
      return { ok: false, detalle: j?.error?.message ?? `Contestó ${r.status}` };
    }),

    medir("inteligencia-artificial", async (señal) => {
      const key = anthropic.trim();
      if (!key) return { ok: null as any, detalle: "No hay llave de Anthropic en este entorno" };
      // El mínimo que existe: un token de respuesta. Comprobar de verdad que
      // la llave sirve cuesta una fracción de centavo; suponerlo cuesta una
      // noche entera, y ya nos pasó.
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
          max_tokens: 1,
          messages: [{ role: "user", content: "hola" }],
        }),
        signal: señal,
        cache: "no-store",
      });
      if (r.ok) return { ok: true, detalle: "La llave funciona y el modelo responde" };
      const j = await r.json().catch(() => ({}));
      return { ok: false, detalle: j?.error?.message ?? `Contestó ${r.status}` };
    }),

    medir("cobros-stripe", async (señal) => {
      if (!stripe) return { ok: null as any, detalle: "No hay llave de Stripe en este entorno" };
      const r = await fetch("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${stripe}` },
        signal: señal,
        cache: "no-store",
      });
      if (r.ok) return { ok: true, detalle: "La cuenta de Stripe responde" };
      const j = await r.json().catch(() => ({}));
      return { ok: false, detalle: j?.error?.message ?? `Contestó ${r.status}` };
    }),
  ]);
}

/** Guarda el resultado. Cada servicio ocupa una fila que se pisa. */
export async function guardarChequeos(chequeos: Chequeo[]): Promise<void> {
  const admin = createAdminClient();
  const ahora = new Date().toISOString();
  await admin.from("estado_servicios").upsert(
    chequeos.map((c) => ({ ...c, medido_at: ahora })),
    { onConflict: "servicio" },
  );
}
