import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { LanaSays } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { addKnowledge, deleteKnowledge, toggleKnowledge } from "./actions";
import { BookOpen, Plus, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

const EJEMPLOS = [
  { t: "Horarios", c: "Abrimos de lunes a viernes de 9:00 a 19:00 y sábados de 10:00 a 14:00. Domingos cerrado." },
  { t: "Precios", c: "Pastel chico (8 porciones) $499. Mediano (16) $799. Grande (24) $1,150. Cupcakes: caja de 6 $180, de 12 $340." },
  { t: "Envíos", c: "Entregamos a domicilio en menos de 3 horas dentro de la ciudad. Costo $80, gratis en compras mayores a $800." },
  { t: "Formas de pago", c: "Aceptamos efectivo, tarjeta y transferencia. Para pedidos grandes pedimos 50% de anticipo." },
];

export default async function BotTrainingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();

  const { data: items } = await supabase
    .from("bot_knowledge")
    .select("*")
    .eq("bot_id", params.id)
    .order("created_at", { ascending: false });

  const list = (items as any[]) ?? [];
  const activos = list.filter((k) => k.enabled).length;

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />

        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Entrenamiento</h2>
        <p className="mb-5 text-sm text-ink-2">
          Todo lo que tu chatbot sabe de tu negocio: precios, horarios, servicios, políticas. Entre más le cuentes,
          mejor contesta.
        </p>

        <LanaSays className="mb-6" title="Lana · Cómo funciona">
          Escribe la información de tu negocio como se la explicarías a un empleado nuevo. Cuando un cliente pregunte
          algo, yo busco aquí la respuesta y contesto con <b className="text-ink">tus datos reales</b> — nunca me los
          invento. Si algo no está aquí, lo digo y ofrezco pasar la conversación a una persona.
        </LanaSays>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Alta */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-ink">Agregar información</h3>
              <form action={addKnowledge} className="space-y-3">
                <input type="hidden" name="bot_id" value={bot.id} />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Tema</label>
                  <input name="title" required className="input-l" placeholder="Horarios de atención" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">¿Qué debe saber?</label>
                  <textarea
                    name="content"
                    required
                    className="input-l min-h-[130px]"
                    placeholder="Abrimos de lunes a viernes de 9 a 19 h y sábados de 10 a 14 h. Domingos cerrado."
                  />
                </div>
                <button className="btn-primary w-full"><Plus className="h-4 w-4" /> Agregar</button>
              </form>

              {list.length === 0 && (
                <div className="mt-5 border-t border-[#e6e8f2] pt-4">
                  <p className="mb-2 text-xs font-semibold text-ink-2">¿No sabes por dónde empezar?</p>
                  <p className="text-[11px] text-ink-3">
                    Lo más útil suele ser: <b className="text-ink-2">horarios</b>, <b className="text-ink-2">precios</b>,{" "}
                    <b className="text-ink-2">envíos</b> y <b className="text-ink-2">formas de pago</b>. Puedes copiar
                    los ejemplos de la derecha y adaptarlos.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Lo que ya sabe</h3>
              {list.length > 0 && <span className="text-xs text-ink-3">{list.length} temas · {activos} activos</span>}
            </div>

            {list.length === 0 ? (
              <div className="card-l p-6">
                <div className="mb-4 flex items-center gap-2 text-ink-2">
                  <BookOpen className="h-5 w-5" />
                  <span className="text-sm">Todavía no sabe nada de tu negocio. Estos son ejemplos de lo que puedes cargar:</span>
                </div>
                <div className="space-y-2.5">
                  {EJEMPLOS.map((e) => (
                    <div key={e.t} className="rounded-xl border border-dashed border-[#d7d9e8] bg-[#f9fafd] p-3">
                      <div className="text-sm font-semibold text-ink">{e.t}</div>
                      <div className="mt-0.5 text-xs text-ink-2">{e.c}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {list.map((k) => (
                  <div key={k.id} className={`card-l p-4 ${k.enabled ? "" : "opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-ink">{k.title}</h4>
                          {!k.enabled && (
                            <span className="rounded-md bg-[#f1f2f9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                              Desactivado
                            </span>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{k.content}</p>
                      </div>
                      <div className="flex flex-none items-center gap-2">
                        <form action={toggleKnowledge}>
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="bot_id" value={bot.id} />
                          <input type="hidden" name="enabled" value={String(!!k.enabled)} />
                          <button className="btn-soft px-3 py-1.5 text-xs">{k.enabled ? "Desactivar" : "Activar"}</button>
                        </form>
                        <form action={deleteKnowledge}>
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="bot_id" value={bot.id} />
                          <button className="text-ink-3 transition hover:text-danger" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-4 text-xs text-ink-3">
              Para que el chatbot use esta información, activa la IA en la pestaña{" "}
              <Link href={`/bots/${bot.id}/ai`} className="font-semibold text-pink hover:underline">Lana IA</Link>{" "}
              y agrega un bloque de <b className="text-ink-2">Respuesta con IA</b> en tu conversación.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
