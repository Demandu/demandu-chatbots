import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { LanaSays, LanaAvatar } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { AI_DEFAULTS, aiConfigured } from "@/lib/ai/answer";
import { saveAiSettings } from "./actions";
import { Sparkles, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BotAiPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("id, name, channel, ai").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, name, channel, ai").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();

  const { count: saberes } = await supabase
    .from("bot_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", params.id)
    .eq("enabled", true);

  const ai = { ...AI_DEFAULTS, ...(((bot as any).ai as any) ?? {}) };
  const lista = aiConfigured();

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />

        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Lana IA</h2>
        <p className="mb-5 text-sm text-ink-2">
          Dale personalidad a tu chatbot y deja que conteste con inteligencia cuando el guión no alcance.
        </p>

        <LanaSays className="mb-5" title="Lana · Cómo funciona">
          Un guión responde solo lo que le programaste. Con la IA encendida, cuando un cliente pregunte algo fuera del
          guión, yo busco la respuesta en tu <b className="text-ink">Entrenamiento</b> y contesto con tus datos reales.
          Si no lo sé, lo digo y ofrezco pasar con una persona — <b className="text-ink">nunca invento</b>.
        </LanaSays>

        {/* Estado */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <div className={`card-l flex items-center gap-3 p-4 ${lista ? "" : "border-warning/50 bg-warning/5"}`}>
            <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${lista ? "bg-success/15 text-[#0f9d63]" : "bg-warning/20 text-[#a06a00]"}`}>
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">{lista ? "IA disponible" : "IA no disponible aún"}</div>
              <div className="text-xs text-ink-3">
                {lista
                  ? "Tu plataforma ya puede generar respuestas."
                  : "Falta configurar el servicio de IA. Mientras tanto, el bot usará tu mensaje de respaldo."}
              </div>
            </div>
          </div>

          <Link href={`/bots/${bot.id}/training`} className="card-l flex items-center gap-3 p-4 transition hover:border-pink">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-violet/15 text-violet">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">{saberes ?? 0} temas aprendidos</div>
              <div className="text-xs text-ink-3">
                {(saberes ?? 0) === 0 ? "Todavía no sabe nada — enséñale aquí →" : "Ver o editar el entrenamiento →"}
              </div>
            </div>
          </Link>
        </div>

        <form action={saveAiSettings} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <input type="hidden" name="bot_id" value={bot.id} />

          <div className="lg:col-span-2">
            <div className="card-l p-5">
              <label className="mb-4 flex cursor-pointer items-center justify-between rounded-xl border border-[#e6e8f2] bg-[#f9fafd] px-4 py-3">
                <span>
                  <span className="block text-sm font-semibold text-ink">Responder con IA</span>
                  <span className="block text-xs text-ink-3">Se usa en los bloques “Respuesta con IA” de tus conversaciones.</span>
                </span>
                <input type="checkbox" name="enabled" defaultChecked={!!ai.enabled} className="h-5 w-5 accent-pink" />
              </label>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">¿Quién es tu asistente?</label>
                  <textarea name="persona" defaultValue={ai.persona} className="input-l min-h-[80px]" />
                  <p className="mt-1 text-[11px] text-ink-3">
                    Ej: “Eres Sofía, asistente de Pastelería La Dulce. Ayudas con pedidos y dudas de productos.”
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Tono</label>
                  <input name="style" defaultValue={ai.style} className="input-l" />
                  <p className="mt-1 text-[11px] text-ink-3">Ej: “Cálido y cercano, usa emojis con moderación. Tutea.”</p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Si no sabe la respuesta, ¿qué dice?</label>
                  <input name="fallback" defaultValue={ai.fallback} className="input-l" />
                  <p className="mt-1 text-[11px] text-ink-3">
                    Esto es lo que evita que invente cosas. También se usa si la IA no está disponible.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Largo máximo de respuesta (palabras)</label>
                  <input name="maxWords" type="number" min={20} max={300} defaultValue={ai.maxWords} className="input-l w-32" />
                  <p className="mt-1 text-[11px] text-ink-3">En chat, corto funciona mejor. 60–100 es lo ideal.</p>
                </div>
              </div>

              <button className="btn-primary mt-5">Guardar configuración</button>
            </div>
          </div>

          {/* Vista previa */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-base font-semibold text-ink">Así se comportará</h3>
              <div className="space-y-2.5 rounded-xl bg-[#f4f5fb] p-3">
                <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-demandu-gradient px-3 py-2 text-[12.5px] text-white">
                  ¿A qué hora abren los sábados?
                </div>
                <div className="flex items-end gap-2">
                  <LanaAvatar size={26} />
                  <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-[12.5px] text-ink shadow-sm">
                    {(saberes ?? 0) > 0
                      ? "Responderá con lo que cargaste en Entrenamiento."
                      : "Aún no tiene información cargada, así que respondería:"}
                  </div>
                </div>
                {(saberes ?? 0) === 0 && (
                  <div className="flex items-end gap-2">
                    <span className="w-[26px]" />
                    <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-[12.5px] italic text-ink-2 shadow-sm">
                      {ai.fallback}
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[11px] text-ink-3">
                Recuerda agregar el bloque <b className="text-ink-2">Respuesta con IA</b> en el constructor para que se
                active en la conversación.
              </p>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
