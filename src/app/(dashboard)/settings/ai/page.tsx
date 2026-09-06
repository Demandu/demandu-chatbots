import Link from "next/link";
import { Sparkles, BookOpen, Power } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/permisos-server";
import { LanaSays } from "@/components/Lana";
import { LoQueNoSupo, type Pregunta } from "@/components/settings/LoQueNoSupo";
import { AI_DEFAULTS } from "@/lib/ai/answer";

export const dynamic = "force-dynamic";

/**
 * Lana IA.
 *
 * POR QUÉ EXISTE Y POR QUÉ ES ESTO Y NO OTRA COSA: el menú tenía "Lana IA"
 * apuntando aquí y aquí no había nada — daba 404. Lo fácil era quitar el
 * enlace; lo correcto era preguntarse qué merece un sitio fijo en el menú
 * principal, que es espacio caro. "El índice de mis chatbots" no lo merece:
 * eso ya está en Chatbots.
 *
 * Lo que sí lo merece es esto: **las preguntas que tus clientes hicieron y tu
 * bot no supo contestar**. Antes se perdían sin que nadie se enterara. Cada una
 * es una venta que se escapó y, a la vez, la lista exacta de lo que hay que
 * enseñarle. Es de las pocas pantallas que un dueño abre cada semana por
 * voluntad propia.
 *
 * Y no hizo falta construir nada por debajo: se deduce de lo que ya estaba
 * guardado. Ver la migración `0031_lo_que_no_supo`.
 */
export default async function LanaIAPage() {
  await exigir("ia");

  const supabase = createClient();
  const [{ data: sinRespuesta }, { data: botsData }] = await Promise.all([
    supabase.rpc("lo_que_no_supo", { p_dias: 30 }),
    supabase.from("bots").select("id, name, channel, ai").order("created_at"),
  ]);

  const preguntas = (sinRespuesta ?? []) as Pregunta[];
  const bots = (botsData ?? []) as { id: string; name: string; channel: string; ai: any }[];

  // El conocimiento se cuenta por chatbot: es el dato que de verdad dice si la
  // IA de ese bot sabe algo del negocio o va a contestar con evasivas.
  const conteos = new Map<string, number>();
  if (bots.length) {
    const { data: saberes } = await supabase
      .from("bot_knowledge")
      .select("bot_id")
      .eq("enabled", true)
      .in("bot_id", bots.map((b) => b.id));
    for (const s of (saberes ?? []) as { bot_id: string }[]) {
      conteos.set(s.bot_id, (conteos.get(s.bot_id) ?? 0) + 1);
    }
  }

  const pendientes = preguntas.filter((p) => !p.ya_lo_sabe).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Lo que no supo responder</h2>
            <p className="text-sm text-ink-3">Últimos 30 días, lo más preguntado primero.</p>
          </div>
          {pendientes > 0 && (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-ink">
              {pendientes} sin enseñar
            </span>
          )}
        </div>

        <LoQueNoSupo preguntas={preguntas} />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold text-ink">La IA de cada chatbot</h2>
          <LanaSays>
            Cada chatbot tiene <b>su propia</b> personalidad y su propio conocimiento, y nunca se
            mezclan entre sí.
          </LanaSays>
        </div>

        {bots.length === 0 ? (
          <div className="rounded-2xl border border-linea bg-tarjeta p-8 text-center">
            <p className="text-sm text-ink-2">Todavía no tienes ningún chatbot.</p>
            <Link href="/bots" className="btn-primary mt-4 inline-flex">
              Crear el primero
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {bots.map((b) => {
              const ai = { ...AI_DEFAULTS, ...(b.ai ?? {}) };
              const apagada = ai.enabled === false;
              const saberes = conteos.get(b.id) ?? 0;

              return (
                <div key={b.id} className="rounded-2xl border border-linea bg-tarjeta p-4">
                  <div className="flex items-start gap-3">
                    <span className="rounded-xl bg-pink/10 p-2 text-pink">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{b.name}</p>
                      <p className="text-xs capitalize text-ink-3">{b.channel}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        apagada
                          ? "border-linea text-ink-3"
                          : "border-success/40 bg-success/10 text-success"
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {apagada ? "IA apagada" : "IA encendida"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        saberes === 0
                          ? "border-warning/40 bg-warning/10 text-ink"
                          : "border-linea text-ink-2"
                      }`}
                    >
                      <BookOpen className="h-3 w-3" />
                      {saberes === 0
                        ? "sin conocimiento"
                        : `${saberes} ${saberes === 1 ? "cosa que sabe" : "cosas que sabe"}`}
                    </span>
                  </div>

                  {/* Sin conocimiento la IA contesta con evasivas y el cliente
                      cree que "no funciona". Decirlo aquí ahorra esa charla. */}
                  {saberes === 0 && !apagada && (
                    <p className="mt-2.5 text-[11px] leading-snug text-ink-3">
                      Sin nada que sepa del negocio va a contestar que no sabe casi todo. Empieza por
                      Entrenamiento.
                    </p>
                  )}

                  <div className="mt-4 flex gap-2">
                    <Link
                      href={`/bots/${b.id}/ai`}
                      className="flex-1 rounded-xl border border-pink/35 bg-gradient-to-r from-pink/20 to-violet/20 px-3 py-2 text-center text-sm font-semibold text-ink transition hover:opacity-90"
                    >
                      Ajustar su IA
                    </Link>
                    <Link
                      href={`/bots/${b.id}/training`}
                      className="rounded-xl border border-linea px-3 py-2 text-sm font-semibold text-ink-2 transition hover:bg-suave-2"
                    >
                      Entrenamiento
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
