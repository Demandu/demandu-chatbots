import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { Send } from "lucide-react";

export const dynamic = "force-dynamic";

function pct(n: number, total: number) {
  if (!total) return "0%";
  return Math.round((n / total) * 100) + "%";
}

export default async function CampaignsRollupPage() {
  const orgId = await getCurrentOrgId();
  const sb = createClient();

  const [{ data: campaigns }, { data: bots }, { data: recips }] = await Promise.all([
    sb.from("campaigns").select("*").eq("org_id", orgId ?? "").order("created_at", { ascending: false }),
    sb.from("bots").select("id, name, channel").eq("org_id", orgId ?? ""),
    sb.from("campaign_recipients").select("campaign_id, status").eq("org_id", orgId ?? ""),
  ]);

  const camps = (campaigns as any[]) ?? [];
  const botMap: Record<string, any> = {};
  for (const b of (bots as any[]) ?? []) botMap[b.id] = b;

  const statsByCampaign: Record<string, { sent: number; delivered: number; read: number; replied: number }> = {};
  for (const r of (recips as any[]) ?? []) {
    const s = (statsByCampaign[r.campaign_id] ??= { sent: 0, delivered: 0, read: 0, replied: 0 });
    if (["sent", "delivered", "read", "replied"].includes(r.status)) s.sent++;
    if (["delivered", "read", "replied"].includes(r.status)) s.delivered++;
    if (["read", "replied"].includes(r.status)) s.read++;
    if (r.status === "replied") s.replied++;
  }

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Campañas</span>} />
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-5">
          <h2 className="font-display text-2xl font-bold text-white">Campañas de todos tus bots</h2>
          <p className="mt-1 text-sm text-muted">
            Resumen de todas las difusiones. Para <b className="text-muted-2">crear una difusión</b> o{" "}
            <b className="text-muted-2">sincronizar plantillas</b>, entra al bot (Chatbots → tu bot → Difusiones / Plantillas).
          </p>
        </div>

        {camps.length ? (
          <div className="space-y-3">
            {camps.map((c) => {
              const s = statsByCampaign[c.id] ?? { sent: 0, delivered: 0, read: 0, replied: 0 };
              const bot = c.bot_id ? botMap[c.bot_id] : null;
              return (
                <Link key={c.id} href={`/campaigns/${c.id}`} className="card block p-4 transition hover:border-pink">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-semibold text-white">{c.name}</span>
                        {bot && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-muted">
                            <ChannelIcon channel={bot.channel ?? "webchat"} className="h-3 w-3" /> {bot.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-2">Plantilla: {c.template_name ?? "—"} · {new Date(c.created_at).toLocaleDateString()}</div>
                    </div>
                    <span className="flex-none text-xs text-muted-2">{c.audience_count} destinatarios</span>
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
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="card grid place-items-center p-12 text-center">
            <Send className="mb-2 h-8 w-8 text-muted-2" />
            <p className="text-sm text-muted-2">Aún no hay difusiones. Entra a un bot → Difusiones para enviar la primera.</p>
          </div>
        )}
      </div>
    </>
  );
}
