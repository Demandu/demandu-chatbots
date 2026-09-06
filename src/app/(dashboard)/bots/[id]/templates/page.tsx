import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { createClient } from "@/lib/supabase/server";
import { syncTemplates } from "../../../campaigns/actions";
import { channelOf } from "@/lib/channels";
import { RefreshCw, Megaphone, Plus } from "lucide-react";
import { ESTADOS, IDIOMAS, CATEGORIAS, motivoRechazo } from "@/lib/whatsapp/plantillas";
import { BorrarPlantilla } from "@/components/templates/BorrarPlantilla";

export const dynamic = "force-dynamic";

const nombreIdioma = (c: string) => IDIOMAS.find((i) => i.codigo === c)?.nombre ?? c;
const nombreCategoria = (c?: string | null) =>
  CATEGORIAS.find((x) => x.valor === c)?.titulo ?? c ?? "—";

export default async function BotTemplatesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { synced?: string; error?: string };
}) {
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
  // Feature solo de WhatsApp: si el canal no lo soporta, de vuelta al bot.
  if (channelOf(bot.channel) !== "whatsapp") redirect(`/bots/${bot.id}`);

  const [{ data: templates }, { data: wa }] = await Promise.all([
    supabase.from("whatsapp_templates").select("*").eq("bot_id", params.id).order("updated_at", { ascending: false }),
    supabase.from("whatsapp_channels").select("bot_id").eq("bot_id", params.id).maybeSingle(),
  ]);
  const connected = !!wa;
  const tpls = (templates as any[]) ?? [];
  const err = searchParams?.error;

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Plantillas de mensajes</h2>
            <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-2">
              Es el único mensaje que WhatsApp deja enviar a alguien que lleva más de 24 horas sin
              escribirte. Meta las revisa antes de aprobarlas. Demandu no te cobra por ellas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={syncTemplates}>
              <input type="hidden" name="bot_id" value={bot.id} />
              <button className="btn-soft" disabled={!connected}>
                <RefreshCw className="h-4 w-4" /> Traer las de Meta
              </button>
            </form>
            <Link href={`/bots/${bot.id}/templates/crear`} className="btn-primary">
              <Plus className="h-4 w-4" /> Crear plantilla
            </Link>
          </div>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {err === "sin_canal" ? "Primero conecta el número de WhatsApp de este chatbot (pestaña Conexión)." : `No se pudo sincronizar: ${err}`}
          </div>
        )}
        {searchParams?.synced === "1" && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">✅ Plantillas sincronizadas.</div>
        )}

        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Este chatbot aún no tiene WhatsApp conectado. Ve a la pestaña <Link href={`/bots/${bot.id}/install`} className="font-semibold text-ink underline">Conexión</Link> para conectarlo.
          </div>
        )}

        {tpls.length === 0 ? (
          <div className="card-l grid place-items-center p-12 text-center">
            <Megaphone className="mb-2 h-8 w-8 text-ink-3" />
            <p className="max-w-sm text-sm leading-snug text-ink-2">
              Todavía no tienes plantillas. Crea la primera aquí, o trae las que ya tuvieras
              creadas en Meta.
            </p>
            <Link href={`/bots/${bot.id}/templates/crear`} className="btn-primary mt-4">
              <Plus className="h-4 w-4" /> Crear mi primera plantilla
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-linea">
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Idioma</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Datos que cambian</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tpls.map((t) => {
                  const estado = ESTADOS[t.status] ?? { texto: t.status, clase: "bg-suave text-ink-3" };
                  const porQue = t.status === "REJECTED" ? motivoRechazo(t.rejected_reason) : null;
                  return (
                    <tr key={t.id} className="border-t border-linea bg-tarjeta align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{t.name}</div>
                        <div className="max-w-md truncate text-xs text-ink-3">{t.body}</div>
                        {porQue && <div className="mt-1 max-w-md text-xs leading-snug text-danger">{porQue}</div>}
                      </td>
                      <td className="px-4 py-3 text-ink-2">{nombreIdioma(t.language)}</td>
                      <td className="px-4 py-3 text-ink-2">{nombreCategoria(t.category)}</td>
                      <td className="px-4 py-3 text-ink-2">{t.variables}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${estado.clase}`}>
                          {estado.texto}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {connected && <BorrarPlantilla botId={bot!.id} nombre={t.name} metaId={t.meta_id ?? null} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
