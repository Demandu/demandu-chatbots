import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 };

// Etiqueta humana por destinatario
function label(status: string) {
  switch (status) {
    case "replied": return { t: "Respondió", c: "bg-pink/15 text-pink" };
    case "read": return { t: "Leído (sin responder)", c: "bg-success/15 text-[#0f9d63]" };
    case "delivered": return { t: "Entregado (no leído)", c: "bg-sky-500/15 text-sky-600" };
    case "sent": return { t: "Enviado", c: "bg-[#f1f2f9] text-ink-2" };
    case "failed": return { t: "Falló", c: "bg-danger/15 text-danger" };
    default: return { t: "En cola", c: "bg-[#f1f2f9] text-ink-3" };
  }
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export default async function CampaignDetail({ params }: { params: { id: string } }) {
  const orgId = await getCurrentOrgId();
  const sb = createClient();

  const [{ data: campaign }, { data: recipients }] = await Promise.all([
    sb.from("campaigns").select("*").eq("id", params.id).maybeSingle(),
    sb.from("campaign_recipients").select("*").eq("campaign_id", params.id).order("created_at", { ascending: true }),
  ]);
  if (!campaign) notFound();

  const recs = (recipients as any[]) ?? [];
  const funnel = { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
  for (const r of recs) {
    if (r.status === "failed") { funnel.failed++; continue; }
    const rk = RANK[r.status] ?? 0;
    if (rk >= 1) funnel.sent++;
    if (rk >= 2) funnel.delivered++;
    if (rk >= 3) funnel.read++;
    if (rk >= 4) funnel.replied++;
  }
  const base = funnel.sent || recs.length || 1;
  const pctOf = (n: number) => Math.round((n / base) * 100) + "%";

  // Orden: los más avanzados primero (respondieron → leídos → entregados → enviados → fallidos)
  const sorted = [...recs].sort((a, b) => (RANK[b.status] ?? -1) - (RANK[a.status] ?? -1));

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Campañas / {(campaign as any).name}</span>} />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-8 text-ink">
        <Link href="/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Volver a Envíos
        </Link>

        <h2 className="font-display text-2xl font-bold text-ink">{(campaign as any).name}</h2>
        <p className="mt-1 text-sm text-ink-3">
          Plantilla: <b className="text-ink-2">{(campaign as any).template_name ?? "—"}</b> ·{" "}
          {(campaign as any).audience_count} destinatarios · {new Date((campaign as any).created_at).toLocaleString()}
        </p>

        {/* Embudo */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "Enviados", v: funnel.sent, c: "text-ink" },
            { k: "Entregados", v: funnel.delivered, c: "text-sky-600", p: pctOf(funnel.delivered) },
            { k: "Leídos", v: funnel.read, c: "text-[#0f9d63]", p: pctOf(funnel.read) },
            { k: "Respondieron", v: funnel.replied, c: "text-pink", p: pctOf(funnel.replied) },
          ].map((m) => (
            <div key={m.k} className="card-l p-4 text-center">
              <div className={`text-2xl font-bold ${m.c}`}>{m.v}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-3">{m.k}{m.p ? ` · ${m.p}` : ""}</div>
            </div>
          ))}
        </div>
        {funnel.failed > 0 && <p className="mt-2 text-sm text-danger">{funnel.failed} mensajes fallidos</p>}

        {/* Lista por destinatario */}
        <h3 className="mb-3 mt-8 font-display text-lg font-semibold text-ink">Detalle por contacto</h3>
        <div className="overflow-hidden rounded-2xl border border-[#e6e8f2]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f4f5fb] text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Entregado</th>
                <th className="px-4 py-3">Leído</th>
                <th className="px-4 py-3">Respondió</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const l = label(r.status);
                return (
                  <tr key={r.id} className="border-t border-[#e6e8f2] bg-white">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{r.name || r.phone}</div>
                      <div className="text-xs text-ink-3">{r.phone}</div>
                      {r.error && <div className="text-[11px] text-danger">{r.error}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${l.c}`}>{l.t}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-2">{fmt(r.delivered_at)}</td>
                    <td className="px-4 py-3 text-xs text-ink-2">{fmt(r.read_at)}</td>
                    <td className="px-4 py-3 text-xs text-ink-2">{fmt(r.replied_at)}</td>
                  </tr>
                );
              })}
              {!sorted.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-3">Sin destinatarios.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          "Leído (sin responder)" = lo abrió pero no contestó (lo que llamarías "ignoró"). Los tiempos de entregado/leído se llenan conforme Meta manda los estados.
        </p>
      </div>
    </>
  );
}
