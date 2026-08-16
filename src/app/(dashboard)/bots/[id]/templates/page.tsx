import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { createClient } from "@/lib/supabase/server";
import { syncTemplates } from "../../../campaigns/actions";
import { channelOf } from "@/lib/channels";
import { RefreshCw, Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-success/15 text-[#0f9d63]",
  PENDING: "bg-warning/20 text-[#a06a00]",
  REJECTED: "bg-danger/15 text-danger",
  PAUSED: "bg-[#f1f2f9] text-ink-3",
  DISABLED: "bg-[#f1f2f9] text-ink-3",
};

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
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />

        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Plantillas de mensajes</h2>
            <p className="mt-1 text-sm text-ink-2">De la cuenta de WhatsApp de este chatbot. Se crean y aprueban en Meta; aquí las sincronizas para poder enviarlas.</p>
          </div>
          <form action={syncTemplates}>
            <input type="hidden" name="bot_id" value={bot.id} />
            <button className="btn-soft" disabled={!connected}>
              <RefreshCw className="h-4 w-4" /> Sincronizar con Meta
            </button>
          </form>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {err === "sin_canal" ? "Primero conecta el número de WhatsApp de este chatbot (pestaña Conexión)." : `No se pudo sincronizar: ${err}`}
          </div>
        )}
        {searchParams?.synced === "1" && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-[#0f9d63]">✅ Plantillas sincronizadas.</div>
        )}

        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Este chatbot aún no tiene WhatsApp conectado. Ve a la pestaña <Link href={`/bots/${bot.id}/install`} className="font-semibold text-ink underline">Conexión</Link> para conectarlo.
          </div>
        )}

        {tpls.length === 0 ? (
          <div className="card-l grid place-items-center p-12 text-center">
            <Megaphone className="mb-2 h-8 w-8 text-ink-3" />
            <p className="text-sm text-ink-2">Sin plantillas aún. Dale a <b className="text-ink">Sincronizar con Meta</b>.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e6e8f2]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f4f5fb] text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Idioma</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Variables</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {tpls.map((t) => (
                  <tr key={t.id} className="border-t border-[#e6e8f2] bg-white">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{t.name}</div>
                      <div className="max-w-md truncate text-xs text-ink-3">{t.body}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{t.language}</td>
                    <td className="px-4 py-3 text-ink-2">{t.category ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{t.variables}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[t.status] ?? "bg-surface-raised text-muted-2"}`}>{t.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
