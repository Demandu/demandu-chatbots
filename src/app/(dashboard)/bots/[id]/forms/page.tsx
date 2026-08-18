import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { LanaSays } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { channelOf } from "@/lib/channels";
import { syncForms, removeForm } from "./actions";
import { ClipboardList, RefreshCw, Copy } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-success/15 text-[#0f9d63]",
  DRAFT: "bg-warning/20 text-[#a06a00]",
  DEPRECATED: "bg-[#f1f2f9] text-ink-3",
  BLOCKED: "bg-danger/15 text-danger",
  THROTTLED: "bg-danger/15 text-danger",
};

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: "Publicado",
  DRAFT: "Borrador",
  DEPRECATED: "Obsoleto",
  BLOCKED: "Bloqueado",
  THROTTLED: "Limitado",
};

export default async function BotFormsPage({
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
  if (channelOf(bot.channel) !== "whatsapp") redirect(`/bots/${bot.id}`);

  const [{ data: forms }, { data: wa }] = await Promise.all([
    supabase.from("whatsapp_forms").select("*").eq("bot_id", params.id).order("updated_at", { ascending: false }),
    supabase.from("whatsapp_channels").select("bot_id").eq("bot_id", params.id).maybeSingle(),
  ]);

  const list = (forms as any[]) ?? [];
  const connected = !!wa;
  const err = searchParams?.error;

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />

        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Formularios</h2>
            <p className="mt-1 text-sm text-ink-2">
              Pantallas donde tu cliente llena varios datos de una sola vez, dentro de WhatsApp.
            </p>
          </div>
          <form action={syncForms}>
            <input type="hidden" name="bot_id" value={bot.id} />
            <button className="btn-soft" disabled={!connected}>
              <RefreshCw className="h-4 w-4" /> Sincronizar con Meta
            </button>
          </form>
        </div>

        <LanaSays className="mb-6" title="Lana · Cómo funciona">
          En vez de preguntar dato por dato, un formulario le muestra al cliente una pantalla con varios campos
          (nombre, correo, dirección…) y él llena todo de golpe. Los formularios se crean y aprueban en{" "}
          <b className="text-ink">Meta</b>; aquí los sincronizas y luego los usas en una conversación con el bloque{" "}
          <b className="text-ink">Formulario (WhatsApp Flow)</b>.
        </LanaSays>

        {err && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {err === "sin_canal"
              ? "Primero conecta el número de WhatsApp de este chatbot (pestaña Conexión)."
              : `No se pudo sincronizar: ${err}`}
          </div>
        )}
        {searchParams?.synced === "1" && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-[#0f9d63]">
            ✅ Formularios sincronizados.
          </div>
        )}
        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Este chatbot aún no tiene WhatsApp conectado. Ve a la pestaña{" "}
            <Link href={`/bots/${bot.id}/install`} className="font-semibold text-ink underline">Conexión</Link>.
          </div>
        )}

        {list.length === 0 ? (
          <div className="card-l grid place-items-center p-12 text-center">
            <ClipboardList className="mb-2 h-8 w-8 text-ink-3" />
            <p className="max-w-md text-sm text-ink-2">
              Sin formularios todavía. Créalos en tu cuenta de Meta y luego dale a{" "}
              <b className="text-ink">Sincronizar con Meta</b> para verlos aquí.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((f) => (
              <div key={f.id} className="card-l p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-violet/15 text-violet">
                      <ClipboardList className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{f.name}</div>
                      <div className="text-[11px] text-ink-3">
                        {(f.categories ?? []).length ? (f.categories ?? []).join(", ") : "Sin categoría"}
                      </div>
                    </div>
                  </div>
                  <span className={`flex-none rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[f.status] ?? "bg-[#f1f2f9] text-ink-3"}`}>
                    {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                </div>

                <div className="mt-3 rounded-lg bg-[#f4f5fb] px-2.5 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">ID para el bloque</div>
                  <div className="flex items-center gap-1.5">
                    <code className="truncate font-mono text-xs text-ink">{f.meta_flow_id}</code>
                    <Copy className="h-3 w-3 flex-none text-ink-3" />
                  </div>
                </div>

                <div className="mt-3 flex justify-end border-t border-[#e6e8f2] pt-2.5">
                  <form action={removeForm}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="bot_id" value={bot.id} />
                    <button className="text-[11px] font-semibold text-ink-3 transition hover:text-danger">
                      Quitar de la lista
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
