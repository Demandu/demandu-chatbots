import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { createFlow, deleteFlow } from "../actions";
import { BotNav } from "@/components/builder/BotNav";
import { FlowToggle } from "@/components/builder/FlowToggle";
import { Plus, Pencil, MessageSquareText } from "lucide-react";

export const dynamic = "force-dynamic";

const TRIGGER_META: Record<string, { label: string; badge: string; desc: string }> = {
  welcome: { label: "Bienvenida / inicio", badge: "bg-success/15 text-success", desc: "Arranca cuando alguien escribe por primera vez o inicia conversación." },
  keyword: { label: "Palabras clave", badge: "bg-sky-500/15 text-sky-300", desc: "Se activa si el mensaje del cliente contiene alguna de las palabras." },
  returning: { label: "Leads que regresan", badge: "bg-pink/15 text-pink", desc: "Se activa cuando un contacto que ya te había escrito vuelve a escribir." },
};
// Orden: bienvenida, palabras clave, leads que regresan
const TRIGGER_ORDER: Record<string, number> = { welcome: 0, keyword: 1, returning: 2 };

const WA_SELECT = "bot_id, display_number, phone_number_id";

export default async function BotPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // Carga resiliente del bot (evita 404 falso por parpadeo de sesión)
  let { data: bot } = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();

  const [{ data: flows }, { data: wa }] = await Promise.all([
    supabase.from("flows").select("id, name, trigger_type, keywords, enabled, updated_at").eq("bot_id", params.id),
    supabase.from("whatsapp_channels").select(WA_SELECT).eq("bot_id", params.id).maybeSingle(),
  ]);

  const list = ((flows as any[]) ?? []).sort(
    (a, b) => (TRIGGER_ORDER[a.trigger_type] ?? 9) - (TRIGGER_ORDER[b.trigger_type] ?? 9),
  );

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="flex-1 overflow-auto p-8">
        <BotNav botId={bot.id} />
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-display text-2xl font-bold text-white">Flujos del bot</h2>
        </div>
        <p className="mb-6 text-sm text-muted">
          Un bot puede tener muchos flujos. Cada uno se activa con su <b className="text-muted-2">disparador</b>: la
          bienvenida arranca conversaciones nuevas, las palabras clave responden a lo que escribe el cliente, y el de
          leads que regresan atiende a quienes ya te habían escrito.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Lista de flujos */}
          <div className="lg:col-span-2">
            {list.length === 0 ? (
              <div className="card grid place-items-center p-12 text-center">
                <MessageSquareText className="mb-2 h-8 w-8 text-muted-2" />
                <p className="text-sm text-muted-2">Este bot aún no tiene flujos. Crea el primero con el panel de la derecha.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {list.map((f) => {
                  const meta = TRIGGER_META[f.trigger_type] ?? TRIGGER_META.welcome;
                  return (
                    <div key={f.id} className="card group relative p-5 transition hover:border-pink">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <FlowToggle flowId={f.id} enabled={f.enabled !== false} />
                            <h3 className="font-display text-lg font-semibold text-white">{f.name}</h3>
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>{meta.label}</span>
                            {!f.enabled && <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">Pausado</span>}
                          </div>
                          {f.trigger_type === "keyword" && (
                            <p className="mt-1 text-xs text-muted-2">
                              Palabras: {f.keywords?.length ? f.keywords.map((k: string) => `"${k}"`).join(", ") : <span className="text-warning">sin palabras aún</span>}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-2">{meta.desc}</p>
                        </div>
                        <Link href={`/bots/${bot.id}/flows/${f.id}`} className="flex-none rounded-xl bg-demandu-gradient px-3 py-2 text-xs font-semibold text-white">
                          <span className="inline-flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editar flujo</span>
                        </Link>
                      </div>
                      <form action={deleteFlow} className="absolute bottom-3 right-4 opacity-0 transition group-hover:opacity-100">
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <button className="text-[11px] font-semibold text-muted-2 transition hover:text-danger" title="Eliminar flujo">Eliminar</button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Crear flujo */}
          <div className="lg:col-span-1">
            <div className="card p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-white">Nuevo flujo</h3>
              <form action={createFlow} className="space-y-3">
                <input type="hidden" name="bot_id" value={bot.id} />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Nombre</label>
                  <input name="name" className="input" placeholder="Ej. Menú principal" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Disparador</label>
                  <select name="trigger_type" className="input" defaultValue="welcome">
                    <option value="welcome">Bienvenida / inicio</option>
                    <option value="keyword">Palabras clave</option>
                    <option value="returning">Leads que regresan</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Palabras clave (solo si aplica)</label>
                  <input name="keywords" className="input" placeholder="precio, cotización, soporte" />
                  <p className="mt-1 text-[11px] text-muted-2">Sepáralas por coma. Solo se usan con el disparador "Palabras clave".</p>
                </div>
                <button className="btn-primary w-full">
                  <Plus className="h-4 w-4" /> Crear flujo
                </button>
              </form>
              <p className="mt-3 text-[11px] text-muted-2">
                Consejo: ten un flujo de <b className="text-muted">Bienvenida</b> siempre. Los de palabras clave interrumpen para responder temas puntuales; el de leads que regresan saluda distinto a quien ya te conocía.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
