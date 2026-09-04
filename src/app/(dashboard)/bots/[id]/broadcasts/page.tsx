import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { createClient } from "@/lib/supabase/server";
import { sendCampaign } from "../../../campaigns/actions";
import { channelOf } from "@/lib/channels";
import { Send } from "lucide-react";

export const dynamic = "force-dynamic";

function pct(n: number, total: number) {
  if (!total) return "0%";
  return Math.round((n / total) * 100) + "%";
}

export default async function BotBroadcastsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string; tag?: string };
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

  const [{ data: wa }, { data: templates }, { data: campaigns }] = await Promise.all([
    supabase.from("whatsapp_channels").select("bot_id").eq("bot_id", params.id).maybeSingle(),
    supabase.from("whatsapp_templates").select("id, name, language, status").eq("bot_id", params.id).eq("status", "APPROVED"),
    supabase.from("campaigns").select("*").eq("bot_id", params.id).order("created_at", { ascending: false }),
  ]);

  const connected = !!wa;
  const approved = (templates as any[]) ?? [];
  const camps = (campaigns as any[]) ?? [];

  // Estadísticas por campaña
  let statsByCampaign: Record<string, { sent: number; delivered: number; read: number; replied: number; failed: number }> = {};
  if (camps.length) {
    const ids = camps.map((c) => c.id);
    const { data: recips } = await supabase.from("campaign_recipients").select("campaign_id, status").in("campaign_id", ids);
    for (const r of (recips as any[]) ?? []) {
      const s = (statsByCampaign[r.campaign_id] ??= { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
      if (r.status === "failed") s.failed++;
      if (["sent", "delivered", "read", "replied"].includes(r.status)) s.sent++;
      if (["delivered", "read", "replied"].includes(r.status)) s.delivered++;
      if (["read", "replied"].includes(r.status)) s.read++;
      if (r.status === "replied") s.replied++;
    }
  }

  const err = searchParams?.error;
  const ERR: Record<string, string> = {
    sin_canal: "Este bot no tiene WhatsApp conectado (pestaña Conexión).",
    sin_plantilla: "Elige una plantilla válida.",
    sin_audiencia:
      "No hay a quién mandarle: con esa etiqueta no queda ningún contacto de WhatsApp que no se haya dado de baja.",
    no_campaign: "No se pudo crear la difusión. Inténtalo otra vez.",
  };

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Envíos masivos</h2>
        <p className="mb-5 text-sm text-ink-2">Envía plantillas aprobadas a tus contactos desde este chatbot y mide entrega, lectura y respuesta.</p>

        {err && <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">{ERR[err] ?? `No se pudo: ${err}`}</div>}
        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Conecta WhatsApp para este chatbot en la pestaña <Link href={`/bots/${bot.id}/install`} className="font-semibold text-ink underline">Conexión</Link>.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Composer */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-ink">Nuevo envío</h3>
              <form action={sendCampaign} className="space-y-3">
                <input type="hidden" name="bot_id" value={bot.id} />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre</label>
                  <input name="name" required className="input-l" placeholder="Promo de mayo" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Plantilla (aprobada)</label>
                  <select name="template_id" required className="input-l" disabled={!approved.length}>
                    <option value="">— elige una plantilla —</option>
                    {approved.map((t) => (<option key={t.id} value={t.id}>{t.name} ({t.language})</option>))}
                  </select>
                  {!approved.length && <p className="mt-1 text-[11px] text-ink-3">No hay plantillas aprobadas. Sincroniza en la pestaña Plantillas.</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Etiqueta (opcional)</label>
                  <input
                    name="tag"
                    // LLEGA PUESTA DESDE EL PANEL DE LA TIENDA. Ahí se acaba de
                    // etiquetar a un grupo de gente concreta —los que no
                    // pagaron, los nuevos del mes— y escribir la etiqueta otra
                    // vez a mano es donde se equivoca uno y le manda la
                    // plantilla a toda la base de contactos.
                    defaultValue={searchParams?.tag ?? ""}
                    className="input-l"
                    placeholder="Vacío = todos los contactos de WhatsApp"
                  />
                </div>
                <button className="btn-primary w-full" disabled={!connected || !approved.length}>
                  <Send className="h-4 w-4" /> Enviar difusión
                </button>
              </form>
            </div>
          </div>

          {/* Lista con embudo */}
          <div className="lg:col-span-2">
            <h3 className="mb-3 font-display text-lg font-semibold text-ink">Envíos realizados</h3>
            {camps.length ? (
              <div className="space-y-3">
                {camps.map((c) => {
                  const s = statsByCampaign[c.id] ?? { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
                  return (
                    <Link key={c.id} href={`/campaigns/${c.id}`} className="card-l block p-4 transition hover:border-pink">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="font-display font-semibold text-ink">{c.name}</div>
                          <div className="text-xs text-ink-3">Plantilla: {c.template_name ?? "—"} · {new Date(c.created_at).toLocaleDateString()}</div>
                        </div>
                        <span className="text-xs text-ink-3">{c.audience_count} destinatarios</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        {[
                          { k: "Enviados", v: s.sent, c: "text-ink" },
                          { k: "Entregados", v: s.delivered, c: "text-sky-600", p: pct(s.delivered, s.sent) },
                          { k: "Leídos", v: s.read, c: "text-exito", p: pct(s.read, s.sent) },
                          { k: "Respondieron", v: s.replied, c: "text-pink", p: pct(s.replied, s.sent) },
                        ].map((m) => (
                          <div key={m.k} className="rounded-xl bg-suave py-2">
                            <div className={`text-lg font-bold ${m.c}`}>{m.v}</div>
                            <div className="text-[10px] uppercase tracking-wide text-ink-3">{m.k}{m.p ? ` · ${m.p}` : ""}</div>
                          </div>
                        ))}
                      </div>
                      {s.failed > 0 && <div className="mt-2 text-[11px] text-danger">{s.failed} fallidos</div>}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="card-l grid place-items-center p-12 text-center">
                <Send className="mb-2 h-8 w-8 text-ink-3" />
                <p className="text-sm text-ink-2">Aún no has hecho envíos desde este chatbot.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
