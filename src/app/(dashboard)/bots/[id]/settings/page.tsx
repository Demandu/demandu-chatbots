import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { createClient } from "@/lib/supabase/server";
import { setBotStatus, deleteBot, renameBot } from "../../actions";
import { guardarAtajos } from "./actions";
import { ShortcutsForm } from "@/components/bots/ShortcutsForm";
import { leerAtajos } from "@/lib/flow/shortcuts";

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
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />
        <h2 className="mb-5 font-display text-2xl font-bold text-ink">Ajustes del chatbot</h2>

        {/* Atajos: lo que el cliente final puede escribir en cualquier momento */}
        <section className="mb-8">
          <h3 className="font-display text-lg font-semibold text-ink">Atajos para tu cliente</h3>
          <p className="mb-4 mt-0.5 max-w-2xl text-sm text-ink-2">
            Palabras o números que tu cliente puede escribir en cualquier momento de la conversación, aunque el bot le
            esté preguntando otra cosa. Sirven para que nadie se quede atorado.
          </p>
          <ShortcutsForm botId={bot.id} inicial={leerAtajos((bot as any).shortcuts)} action={guardarAtajos} />
        </section>

        <h3 className="mb-3 font-display text-lg font-semibold text-ink">General</h3>
        <div className="max-w-2xl space-y-4">
          {/* Canal */}
          <div className="card-l flex items-center justify-between p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Canal</div>
              <div className="mt-1 font-semibold text-ink">{CHANNEL_LABEL[channel] ?? "Sitio web"}</div>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#e6e8f2] bg-white">
              <ChannelIcon channel={channel} className="h-6 w-6" />
            </span>
          </div>

          {/* Nombre */}
          <div className="card-l p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Nombre del chatbot</div>
            <form action={renameBot} className="flex items-center gap-2">
              <input type="hidden" name="id" value={bot.id} />
              <input name="name" defaultValue={bot.name} className="input-l flex-1" />
              <button className="btn-soft">Guardar</button>
            </form>
          </div>

          {/* Estado */}
          <div className="card-l flex items-center justify-between p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Estado</div>
              <div className="mt-1">
                <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${published ? "bg-success/15 text-[#0f9d63]" : "bg-warning/20 text-[#a06a00]"}`}>
                  {published ? "Publicado" : "Borrador"}
                </span>
              </div>
            </div>
            <form action={setBotStatus}>
              <input type="hidden" name="id" value={bot.id} />
              <input type="hidden" name="status" value={published ? "draft" : "published"} />
              <button className="btn-primary">{published ? "Pasar a borrador" : "Publicar chatbot"}</button>
            </form>
          </div>

          {/* Zona peligrosa */}
          <div className="rounded-2xl border border-danger/40 bg-danger/5 p-5">
            <div className="text-sm font-semibold text-ink">Eliminar chatbot</div>
            <p className="mt-1 text-xs text-ink-3">Se borran el chatbot y todas sus conversaciones. Esta acción no se puede deshacer.</p>
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
