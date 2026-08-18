import Link from "next/link";
import { fmtMetric, type Usage } from "@/lib/billing/usage";
import { MessageSquare, Sparkles, BookOpen, Users, Bot } from "lucide-react";

const ICONS: Record<string, any> = {
  messages: MessageSquare,
  ai: Sparkles,
  storage: BookOpen,
  agents: Users,
  bots: Bot,
};

const TINTS: Record<string, string> = {
  messages: "bg-sky-500/15 text-sky-600",
  ai: "bg-pink/15 text-pink",
  storage: "bg-violet/15 text-violet",
  agents: "bg-success/15 text-[#0f9d63]",
  bots: "bg-warning/20 text-[#a06a00]",
};

function periodo(u: Usage) {
  if (!u.periodStart) return "este mes";
  try {
    const d = new Date(u.periodStart);
    return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  } catch {
    return "este mes";
  }
}

/**
 * Panel de consumo del plan. Se muestra en Inicio para que el cliente
 * sepa siempre en qué va, sin sorpresas al facturar.
 */
export function UsagePanel({ usage, compact = false }: { usage: Usage; compact?: boolean }) {
  if (!usage.metrics.length) return null;

  return (
    <div className="card-l p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">Tu consumo de {periodo(usage)}</h3>
          <p className="text-xs text-ink-3">
            Plan <b className="text-ink-2">{usage.planName}</b> · se reinicia el día 1 de cada mes
          </p>
        </div>
        <Link href="/settings/plan" className="text-xs font-semibold text-pink hover:underline">
          Ver plan y complementos →
        </Link>
      </div>

      {usage.anyOver && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          Llegaste al límite en algo de tu plan. Amplía para que tus chatbots sigan trabajando sin cortes.
        </div>
      )}
      {!usage.anyOver && usage.anyNear && (
        <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-ink-2">
          Te estás acercando al límite de tu plan. Considera ampliarlo antes de que se agote.
        </div>
      )}

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-5"}`}>
        {usage.metrics.map((m) => {
          const Icon = ICONS[m.key] ?? MessageSquare;
          const sinLimite = m.limit <= 0;
          return (
            <div key={m.key} className="rounded-xl border border-[#e6e8f2] bg-[#f9fafd] p-3.5" title={m.help}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${TINTS[m.key] ?? ""}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  {m.label}
                </span>
              </div>

              <div className="font-display text-lg font-bold text-ink">
                {fmtMetric(m, m.used)}
                {!sinLimite && (
                  <span className="text-xs font-medium text-ink-3"> / {fmtMetric(m, m.limit)}</span>
                )}
              </div>

              {sinLimite ? (
                <div className="mt-2 text-[11px] text-ink-3">Sin límite</div>
              ) : (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6e8f2]">
                    <span
                      className={`block h-full rounded-full transition-all ${
                        m.over ? "bg-danger" : m.near ? "bg-warning" : "bg-demandu-gradient"
                      }`}
                      style={{ width: `${Math.max(2, m.pct)}%` }}
                    />
                  </div>
                  <div className={`mt-1 text-[11px] ${m.over ? "font-semibold text-danger" : "text-ink-3"}`}>
                    {m.over ? "Límite alcanzado" : `${m.pct}% usado`}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-ink-3">
        Los <b className="text-ink-2">mensajes enviados</b> son los que salen de tu chatbot o de tu equipo. Lo que te
        escriben tus clientes no consume tu paquete. El costo de las plantillas de WhatsApp lo cobra Meta
        directamente a tu cuenta — Demandu no le agrega ningún cargo.
      </p>
    </div>
  );
}
