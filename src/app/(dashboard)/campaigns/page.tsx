import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { RefreshCw, Send, Megaphone } from "lucide-react";
import { syncTemplates, sendCampaign } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-success/15 text-success",
  PENDING: "bg-warning/15 text-warning",
  REJECTED: "bg-danger/15 text-danger",
  PAUSED: "bg-surface-raised text-muted-2",
  DISABLED: "bg-surface-raised text-muted-2",
};

function pct(n: number, total: number) {
  if (!total) return "0%";
  return Math.round((n / total) * 100) + "%";
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { tab?: string; synced?: string; error?: string };
}) {
  const tab = searchParams?.tab === "plantillas" ? "plantillas" : "difusion";
  const orgId = await getCurrentOrgId();
  const sb = createClient();

  const [{ data: wa }, { data: templates }, { data: campaigns }, { data: recips }] = await Promise.all([
    sb.from("whatsapp_channels").select("display_number, phone_number_id, waba_id").eq("org_id", orgId ?? "").maybeSingle(),
    sb.from("whatsapp_templates").select("*").eq("org_id", orgId ?? "").order("updated_at", { ascending: false }),
    sb.from("campaigns").select("*").eq("org_id", orgId ?? "").order("created_at", { ascending: false }),
    sb.from("campaign_recipients").select("campaign_id, status").eq("org_id", orgId ?? ""),
  ]);

  const connected = !!wa;
  const tpls = (templates as any[]) ?? [];
  const approved = tpls.filter((t) => t.status === "APPROVED");

  // Embudo por campaña
  const statsByCampaign: Record<string, { total: number; sent: number; delivered: number; read: number; replied: number; failed: number }> = {};
  for (const r of (recips as any[]) ?? []) {
    const s = (statsByCampaign[r.campaign_id] ??= { total: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
    s.total++;
    if (r.status === "failed") s.failed++;
    // el embudo es acumulativo: quien leyó también fue entregado y enviado
    if (["sent", "delivered", "read", "replied"].includes(r.status)) s.sent++;
    if (["delivered", "read", "replied"].includes(r.status)) s.delivered++;
    if (["read", "replied"].includes(r.status)) s.read++;
    if (r.status === "replied") s.replied++;
  }

  const err = searchParams?.error;
  const ERR_LABEL: Record<string, string> = {
    sin_canal: "Primero conecta un número de WhatsApp en Integraciones.",
    sin_plantilla: "Elige una plantilla válida.",
    red: "Error de red al hablar con Meta.",
  };

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Campañas</span>} />
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Campañas de WhatsApp</h2>
            <p className="mt-1 text-sm text-muted">
              Envía plantillas aprobadas a tus contactos y mide entrega, lectura y respuesta.
            </p>
          </div>
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
              <ChannelIcon channel="whatsapp" className="h-3.5 w-3.5" /> {(wa as any).display_number ?? "Conectado"}
            </span>
          ) : (
            <Link href="/settings/integrations" className="rounded-xl bg-demandu-gradient px-3 py-2 text-xs font-semibold text-white">
              Conectar WhatsApp
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-5 inline-flex gap-1 rounded-xl border border-surface-border bg-surface p-1">
          <Link
            href="/campaigns?tab=difusion"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === "difusion" ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"}`}
          >
            Difusión
          </Link>
          <Link
            href="/campaigns?tab=plantillas"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === "plantillas" ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"}`}
          >
            Plantillas
          </Link>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {ERR_LABEL[err] ?? `No se pudo completar: ${err}`}
          </div>
        )}
        {searchParams?.synced === "1" && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-success">
            ✅ Plantillas sincronizadas desde Meta.
          </div>
        )}

        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-muted">
            Para sincronizar plantillas y enviar difusiones necesitas <b className="text-white">conectar un número de WhatsApp</b> primero (en Integraciones o desde el constructor de un bot de WhatsApp).
          </div>
        )}

        {tab === "plantillas" ? (
          /* ─────────── PLANTILLAS ─────────── */
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-white">Plantillas ({tpls.length})</h3>
              <form action={syncTemplates}>
                <button className="btn-ghost" disabled={!connected}>
                  <RefreshCw className="h-4 w-4" /> Sincronizar con Meta
                </button>
              </form>
            </div>
            {tpls.length === 0 ? (
              <div className="card grid place-items-center p-12 text-center">
                <Megaphone className="mb-2 h-8 w-8 text-muted-2" />
                <p className="text-sm text-muted-2">Aún no hay plantillas. Dale a <b className="text-white">Sincronizar con Meta</b> para traer las de tu WABA.</p>
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
                          <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[t.status] ?? "bg-surface-raised text-muted-2"}`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-2">
              Las plantillas se crean y aprueban en Meta (WhatsApp Manager). Aquí las sincronizas para poder enviarlas. La creación de plantillas desde la plataforma viene en el siguiente paso.
            </p>
          </div>
        ) : (
          /* ─────────── DIFUSIÓN ─────────── */
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Composer */}
            <div className="lg:col-span-1">
              <div className="card p-5">
                <h3 className="mb-3 font-display text-lg font-semibold text-white">Nueva difusión</h3>
                <form action={sendCampaign} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Nombre de la difusión</label>
                    <input name="name" required className="input" placeholder="Promo de mayo" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Plantilla (aprobada)</label>
                    <select name="template_id" required className="input" disabled={!approved.length}>
                      <option value="">— elige una plantilla —</option>
                      {approved.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                      ))}
                    </select>
                    {!approved.length && (
                      <p className="mt-1 text-[11px] text-muted-2">No hay plantillas aprobadas. Sincroniza en la pestaña Plantillas.</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-muted">Etiqueta (opcional)</label>
                    <input name="tag" className="input" placeholder="Deja vacío para todos los contactos de WhatsApp" />
                    <p className="mt-1 text-[11px] text-muted-2">Si escribes una etiqueta, solo se envía a los contactos con esa etiqueta.</p>
                  </div>
                  <button className="btn-primary w-full" disabled={!connected || !approved.length}>
                    <Send className="h-4 w-4" /> Enviar difusión
                  </button>
                  <p className="text-[11px] text-muted-2">
                    Solo se envía a contactos de WhatsApp que no se hayan dado de baja. Si una plantilla tiene variable, se usa el nombre del contacto en {"{{1}}"}.
                  </p>
                </form>
              </div>
            </div>

            {/* Lista de campañas con embudo */}
            <div className="lg:col-span-2">
              <h3 className="mb-3 font-display text-lg font-semibold text-white">Difusiones enviadas</h3>
              {(campaigns as any[])?.length ? (
                <div className="space-y-3">
                  {(campaigns as any[]).map((c) => {
                    const s = statsByCampaign[c.id] ?? { total: c.audience_count, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
                    return (
                      <Link key={c.id} href={`/campaigns/${c.id}`} className="card block p-4 transition hover:border-pink">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <div className="font-display font-semibold text-white">{c.name}</div>
                            <div className="text-xs text-muted-2">Plantilla: {c.template_name ?? "—"} · {new Date(c.created_at).toLocaleDateString()}</div>
                          </div>
                          <span className="text-xs text-muted-2">{c.audience_count} destinatarios</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {[
                            { k: "Enviados", v: s.sent, c: "text-white" },
                            { k: "Entregados", v: s.delivered, c: "text-sky-300", p: pct(s.delivered, s.sent) },
                            { k: "Leídos", v: s.read, c: "text-success", p: pct(s.read, s.sent) },
                            { k: "Respondieron", v: s.replied, c: "text-pink", p: pct(s.replied, s.sent) },
                          ].map((m) => (
                            <div key={m.k} className="rounded-xl bg-surface-raised py-2">
                              <div className={`text-lg font-bold ${m.c}`}>{m.v}</div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-2">{m.k}{m.p ? ` · ${m.p}` : ""}</div>
                            </div>
                          ))}
                        </div>
                        {s.failed > 0 && <div className="mt-2 text-[11px] text-danger">{s.failed} fallidos</div>}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="card grid place-items-center p-12 text-center">
                  <Send className="mb-2 h-8 w-8 text-muted-2" />
                  <p className="text-sm text-muted-2">Aún no has enviado difusiones. Crea una con el formulario de la izquierda.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
