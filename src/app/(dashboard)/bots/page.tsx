import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { deleteBot, importBot } from "./actions";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { BotCardName } from "@/components/BotCardName";
import { LanaAvatar } from "@/components/Lana";
import { Upload, ArrowRight, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const CHANNEL_CARDS = [
  { channel: "whatsapp", label: "WhatsApp", desc: "El canal más usado por tus clientes", color: "#25D366" },
  { channel: "instagram", label: "Instagram", desc: "Mensajes directos y comentarios", color: "#E1306C" },
  { channel: "messenger", label: "Messenger", desc: "Facebook Messenger", color: "#0084FF" },
  { channel: "webchat", label: "Sitio web", desc: "Una burbuja de chat en tu página", color: "#6E42FF" },
];

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "Sitio web",
};

export default async function BotsPage() {
  const { data } = await createClient()
    .from("bots")
    .select("*")
    .order("created_at", { ascending: false });
  const bots = (data ?? []) as any[];

  const byChannel: Record<string, any[]> = {};
  for (const b of bots) {
    const ch = (b.channel as string) ?? "webchat";
    (byChannel[ch] ??= []).push(b);
  }
  const count = (ch: string) => byChannel[ch]?.length ?? 0;

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Chatbots</span>} />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-8 text-ink">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Chatbots</h1>
            <p className="mt-1 text-ink-2">
              {bots.length === 0
                ? "Aún no tienes chatbots. Elige abajo dónde quieres atender y crea el primero."
                : <>Tienes <b className="text-ink">{bots.length}</b> chatbot{bots.length === 1 ? "" : "s"}. Cada uno atiende un canal y puede tener varias conversaciones automáticas.</>}
            </p>
          </div>
          <Link href="/bots/new" className="btn-primary flex-none">
            <Plus className="h-4 w-4" /> Crear chatbot
          </Link>
        </div>

        {/* Elegir canal = crear chatbot (con el asistente de Lana) */}
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Crear un chatbot — elige dónde va a atender</p>
        <div className="mb-10 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {CHANNEL_CARDS.map((c) => (
            <Link
              key={c.channel}
              href={`/bots/new?channel=${c.channel}`}
              className="card-l group relative flex w-full flex-col items-start gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:border-pink"
            >
              <div className="flex w-full items-center justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `${c.color}1f` }}>
                  <ChannelIcon channel={c.channel} className="h-8 w-8" />
                </span>
                {count(c.channel) > 0 && (
                  <span className="rounded-full bg-[#f1f2f9] px-2.5 py-1 text-xs font-bold text-ink-2">{count(c.channel)}</span>
                )}
              </div>
              <div>
                <div className="font-display text-base font-semibold text-ink">{c.label}</div>
                <div className="text-xs text-ink-3">
                  {count(c.channel) === 0 ? c.desc : `${count(c.channel)} chatbot${count(c.channel) === 1 ? "" : "s"}`}
                </div>
              </div>
              <span className="mt-0.5 text-xs font-semibold text-pink opacity-0 transition group-hover:opacity-100">Crear aquí →</span>
            </Link>
          ))}
        </div>

        {/* Lista agrupada por canal, o estado vacío con Lana */}
        {bots.length === 0 ? (
          <div className="card-l flex flex-col items-center gap-3 p-10 text-center">
            <LanaAvatar size={72} />
            <h3 className="font-display text-lg font-semibold text-ink">Creemos tu primer chatbot 🩷</h3>
            <p className="max-w-sm text-sm text-ink-2">
              Soy Lana y te acompaño paso a paso. Elige el canal donde atiendes a tus clientes (WhatsApp es el
              más usado) y en unos minutos tendrás tu chatbot listo.
            </p>
            <Link href="/bots/new" className="btn-primary mt-1">
              <Plus className="h-4 w-4" /> Crear mi primer chatbot
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {CHANNEL_CARDS.filter((c) => count(c.channel) > 0).map((c) => (
              <section key={c.channel}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${c.color}1f` }}>
                    <ChannelIcon channel={c.channel} className="h-4 w-4" />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-ink">{c.label}</h3>
                  <span className="rounded-full bg-[#f1f2f9] px-2 py-0.5 text-xs font-bold text-ink-2">{count(c.channel)}</span>
                </div>
                <div className="grid max-w-6xl grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                  {byChannel[c.channel].map((b) => (
                    <div key={b.id} className="card-l group relative p-5 transition hover:border-pink">
                      <div className="mb-3 flex items-center justify-between pr-6">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f1f2f9] px-2.5 py-1 text-xs font-semibold text-ink-2">
                          <ChannelIcon channel={b.channel ?? "webchat"} className="h-3.5 w-3.5" />
                          {CHANNEL_LABEL[b.channel ?? "webchat"] ?? "Sitio web"}
                        </span>
                        <span
                          className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                            b.status === "published" ? "bg-success/15 text-success" : "bg-warning/20 text-[#a06a00]"
                          }`}
                        >
                          {b.status === "published" ? "Publicado" : "Borrador"}
                        </span>
                      </div>
                      <BotCardName botId={b.id} initialName={b.name} />
                      <Link href={`/bots/${b.id}`} className="mt-1 inline-flex items-center gap-1 text-sm text-ink-3 transition hover:text-pink">
                        Abrir chatbot <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <form action={deleteBot} className="absolute right-4 top-4 opacity-0 transition group-hover:opacity-100">
                        <input type="hidden" name="id" value={b.id} />
                        <button className="text-ink-3 transition hover:text-danger" title="Eliminar chatbot">✕</button>
                      </form>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Importar (discreto, para quien migra desde otra herramienta) */}
        <details className="mt-10 max-w-xl text-sm">
          <summary className="cursor-pointer text-ink-3 transition hover:text-ink-2">¿Migras desde otra herramienta? Importar un chatbot (.json)</summary>
          <form action={importBot} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[#d7d9e8] bg-white p-3">
            <select name="channel" defaultValue="whatsapp" title="Canal del chatbot importado" className="rounded-lg border border-[#e2e4f0] bg-white px-2 py-1.5 text-xs font-semibold text-ink">
              {CHANNEL_CARDS.map((c) => (<option key={c.channel} value={c.channel}>{c.label}</option>))}
            </select>
            <input type="file" name="file" accept="application/json,.json" required className="max-w-[160px] text-xs text-ink-3 file:mr-2 file:rounded-lg file:border-0 file:bg-[#f1f2f9] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink" />
            <button className="btn-soft"><Upload className="h-4 w-4" /> Importar</button>
          </form>
        </details>
      </div>
    </>
  );
}
