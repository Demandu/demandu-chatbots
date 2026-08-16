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
  APPROVED: "bg-success/15 text-success",
  PENDING: "bg-warning/15 text-warning",
  REJECTED: "bg-danger/15 text-danger",
  PAUSED: "bg-surface-raised text-muted-2",
  DISABLED: "bg-surface-raised text-muted-2",
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
      <div className="flex-1 overflow-auto p-8">
        <BotNav botId={bot.id} channel={bot.channel} />

        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Plantillas de WhatsApp</h2>
            <p className="mt-1 text-sm text-muted">De la cuenta de WhatsApp de este bot. Se crean y aprueban en Meta; aquí las sincronizas para poder enviarlas.</p>
          </div>
          <form action={syncTemplates}>
            <input type="hidden" name="bot_id" value={bot.id} />
            <button className="btn-ghost" disabled={!connected}>
              <RefreshCw className="h-4 w-4" /> Sincronizar con Meta
            </button>
          </form>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {err === "sin_canal" ? "Primero conecta el número de WhatsApp de este bot (pestaña Conexión)." : `No se pudo sincronizar: ${err}`}
          </div>
        )}
        {searchParams?.synced === "1" && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-success">✅ Plantillas sincronizadas.</div>
        )}

        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-muted">
            Este bot aún no tiene WhatsApp conectado. Ve a la pestaña <Link href={`/bots/${bot.id}/install`} className="font-semibold text-white underline">Conexión</Link> para conectarlo.
          </div>
        )}

        {tpls.length === 0 ? (
          <div className="card grid place-items-center p-12 text-center">
            <Megaphone className="mb-2 h-8 w-8 text-muted-2" />
            <p className="text-sm text-muted-2">Sin plantillas aún. Dale a <b className="text-white">Sincronizar con Meta</b>.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted-2">
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
                  <tr key={t.id} className="border-t border-surface-border">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{t.name}</div>
                      <div className="max-w-md truncate text-xs text-muted-2">{t.body}</div>
                    </td>
                    <td className="px-4 py-3 text-muted">{t.language}</td>
                    <td className="px-4 py-3 text-muted">{t.category ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{t.variables}</td>
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
