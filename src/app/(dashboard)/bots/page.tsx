import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { createBot, deleteBot, importBot } from "./actions";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { BotCardName } from "@/components/BotCardName";
import { CreateBotButton } from "@/components/CreateBotButton";
import { Upload } from "lucide-react";

export const dynamic = "force-dynamic";

const CHANNEL_CARDS = [
  { channel: "whatsapp", label: "WhatsApp", desc: "Cloud API · el más usado", color: "#25D366" },
  { channel: "instagram", label: "Instagram", desc: "DM, historias y comentarios", color: "#E1306C" },
  { channel: "messenger", label: "Messenger", desc: "Facebook Messenger", color: "#0084FF" },
  { channel: "webchat", label: "Sitio web", desc: "Widget para tu página", color: "#6E42FF" },
];

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "Web",
};

export default async function BotsPage() {
  const { data } = await createClient()
    .from("bots")
    .select("*")
    .order("created_at", { ascending: false });
  const bots = (data ?? []) as any[];

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Constructor · Mis bots</span>} />
      <div className="flex-1 overflow-auto p-8">
        {/* ── Conectar a un canal ── */}
        <h2 className="font-display text-2xl font-bold text-white">Crea un bot para tu canal</h2>
        <p className="mb-5 mt-1 text-muted">
          Elige el canal: cada uno abre el Constructor con los componentes específicos de esa plataforma.
        </p>

        <div className="mb-10 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {CHANNEL_CARDS.map((c) => (
            <form action={createBot} key={c.channel}>
              <input type="hidden" name="channel" value={c.channel} />
              <CreateBotButton>
                {/* Sustituye este tile por tu imagen: <img src="/canales/whatsapp.png" .../> */}
                <span
                  className="grid h-14 w-14 place-items-center rounded-2xl"
                  style={{ background: `${c.color}1f` }}
                >
                  <ChannelIcon channel={c.channel} className="h-8 w-8" />
                </span>
                <div>
                  <div className="font-display text-base font-semibold text-white">{c.label}</div>
                  <div className="text-xs text-muted-2">{c.desc}</div>
                </div>
              </CreateBotButton>
            </form>
          ))}
        </div>

        {/* ── Mis bots ── */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">Mis bots</h3>
            <p className="mt-0.5 text-sm text-muted-2">Diseña, prueba y publica tus flujos conversacionales.</p>
          </div>
          <form action={importBot} className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-2.5 py-2">
            <select
              name="channel"
              defaultValue="whatsapp"
              title="Canal del bot importado"
              className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-xs font-semibold text-white"
            >
              {CHANNEL_CARDS.map((c) => (
                <option key={c.channel} value={c.channel}>{c.label}</option>
              ))}
            </select>
            <input
              type="file"
              name="file"
              accept="application/json,.json"
              required
              className="max-w-[170px] text-xs text-muted-2 file:mr-2 file:rounded-lg file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-surface-card"
            />
            <button className="btn-ghost whitespace-nowrap">
              <Upload className="h-4 w-4" /> Importar JSON
            </button>
          </form>
        </div>

        {bots.length === 0 ? (
          <div className="card grid place-items-center p-12 text-center">
            <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink/20 to-violet/20 text-2xl">🤖</div>
            <h3 className="font-display text-lg font-semibold text-white">Aún no tienes bots</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-2">Elige un canal arriba para crear tu primer bot y abrir el Constructor.</p>
          </div>
        ) : (
          <div className="grid max-w-5xl grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {bots.map((b) => (
              <div key={b.id} className="card group relative p-5 transition hover:border-pink">
                <div className="mb-3 flex items-center justify-between pr-6">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-semibold text-muted">
                    <ChannelIcon channel={b.channel ?? "webchat"} className="h-3.5 w-3.5" />
                    {CHANNEL_LABEL[b.channel ?? "webchat"] ?? "Web"}
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      b.status === "published" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                    }`}
                  >
                    {b.status === "published" ? "Publicado" : "Borrador"}
                  </span>
                </div>
                <BotCardName botId={b.id} initialName={b.name} />
                <Link href={`/bots/${b.id}`} className="mt-1 block text-sm text-muted-2 transition hover:text-white">
                  Abrir bot y flujos →
                </Link>
                <form action={deleteBot} className="absolute right-4 top-4 opacity-0 transition group-hover:opacity-100">
                  <input type="hidden" name="id" value={b.id} />
                  <button className="text-muted-2 transition hover:text-danger" title="Eliminar bot">✕</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
