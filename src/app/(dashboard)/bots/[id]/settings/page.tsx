import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { createClient } from "@/lib/supabase/server";
import { setBotStatus, deleteBot, renameBot } from "../../actions";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "Sitio web",
};

export default async function BotSettingsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
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

  const channel = (bot.channel as string) ?? "webchat";
  const published = bot.status === "published";

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="flex-1 overflow-auto p-8">
        <BotNav botId={bot.id} channel={bot.channel} />
        <h2 className="mb-5 font-display text-2xl font-bold text-white">Ajustes del bot</h2>

        <div className="max-w-2xl space-y-4">
          {/* Canal */}
          <div className="card flex items-center justify-between p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-2">Canal</div>
              <div className="mt-1 font-semibold text-white">{CHANNEL_LABEL[channel] ?? "Web"}</div>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white">
              <ChannelIcon channel={channel} className="h-6 w-6" />
            </span>
          </div>

          {/* Nombre */}
          <div className="card p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-2">Nombre del bot</div>
            <form action={renameBot} className="flex items-center gap-2">
              <input type="hidden" name="id" value={bot.id} />
              <input name="name" defaultValue={bot.name} className="input flex-1" />
              <button className="btn-ghost">Guardar</button>
            </form>
          </div>

          {/* Estado */}
          <div className="card flex items-center justify-between p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-2">Estado</div>
              <div className="mt-1">
                <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${published ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                  {published ? "Publicado" : "Borrador"}
                </span>
              </div>
            </div>
            <form action={setBotStatus}>
              <input type="hidden" name="id" value={bot.id} />
              <input type="hidden" name="status" value={published ? "draft" : "published"} />
              <button className="btn-primary">{published ? "Pasar a borrador" : "Publicar bot"}</button>
            </form>
          </div>

          {/* Zona peligrosa */}
          <div className="rounded-2xl border border-danger/40 bg-danger/5 p-5">
            <div className="text-sm font-semibold text-white">Eliminar bot</div>
            <p className="mt-1 text-xs text-muted-2">Se borran el bot y todos sus flujos. Esta acción no se puede deshacer.</p>
            <form action={deleteBot} className="mt-3">
              <input type="hidden" name="id" value={bot.id} />
              <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                Eliminar este bot
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
