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
  agents: "bg-success/15 text-exito",
  bots: "bg-warning/20 text-aviso",
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

      {/* EL AVISO TIENE QUE DECIR QUÉ SE ACABÓ Y QUÉ PASA POR ESO.
          Antes decía siempre lo mismo —«Amplía para que tus chatbots sigan
          trabajando sin cortes»— aunque lo agotado fueran las licencias de
          agente, que no paran ningún chatbot. Un cliente con 3 de 3 agentes
          veía una alarma roja avisándole de un corte que no iba a ocurrir.
          Una alarma que exagera se aprende a ignorar, y el día que sí se
          acaben los mensajes ya nadie la lee. */}
      {(() => {
        const agotadas = usage.metrics.filter((m) => m.over);
        const cerca = usage.metrics.filter((m) => m.near);
        if (!agotadas.length && !cerca.length) return null;

        // Solo quedarse sin MENSAJES corta la atención. Lo demás estorba, pero
        // el bot sigue contestando — y decirlo así evita el susto de balde.
        const sinMensajes = agotadas.some((m) => m.key === "messages");
        const lista = (ms: typeof usage.metrics) =>
          ms.map((m) => m.label.toLowerCase()).join(" y ");

        if (agotadas.length) {
          return (
            <div
              className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
                sinMensajes ? "border-danger/40 bg-danger/10 text-danger" : "border-warning/50 bg-warning/10 text-ink-2"
              }`}
            >
              {sinMensajes ? (
                <>
                  <b>Se te acabaron los mensajes del mes.</b> Tus chatbots dejarán de responder hasta que
                  amplíes o empiece el mes siguiente.
                </>
              ) : (
                <>
                  Llegaste al límite de <b className="text-ink">{lista(agotadas)}</b>. Tus chatbots siguen
                  respondiendo con normalidad — esto solo te impide agregar más.
                </>
              )}
            </div>
          );
        }

        return (
          <div className="mb-4 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-ink-2">
            Te estás acercando al límite de <b className="text-ink">{lista(cerca)}</b>. Buen momento para
            ampliar, sin prisa.
          </div>
        );
      })()}

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-5"}`}>
        {usage.metrics.map((m) => {
          const Icon = ICONS[m.key] ?? MessageSquare;
          const sinLimite = m.limit <= 0;
          return (
            <div key={m.key} className="rounded-xl border border-linea bg-tarjeta-2 p-3.5" title={m.help}>
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
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-suave-2">
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

      {/* La explicación va SIEMPRE debajo, no escondida en un globo al pasar
          el mouse: en el celular no hay mouse, y es justo donde la mayoría de
          nuestros clientes mira su consumo.

          UN SOLO CONCEPTO. Todo lo que se cuenta es "mensajes que salen". La
          IA no es otra moneda: va incluida. Cualquier segundo contador se lee
          como cobro doble, por muy bien explicado que esté. */}
      <div className="mt-4 space-y-2 rounded-xl border border-linea bg-suave p-3.5 text-[11px] leading-relaxed text-ink-2">
        <p>
          <b className="text-ink">Se cuenta cada mensaje que sale</b> de tu chatbot o de tu equipo.
          Lo que te escriben tus clientes <b className="text-ink">no cuenta</b>: recibir siempre es gratis.
        </p>
        <p>
          <b className="text-ink">La inteligencia artificial va incluida.</b> Da igual si la respuesta la pensó
          Lana o si fue un botón de tu menú: cuenta como 1 mensaje, igual. No hay créditos aparte que se te
          puedan acabar.
        </p>
        {usage.aiAnswers > 0 && (
          <p className="rounded-lg bg-tarjeta px-2.5 py-1.5">
            Este mes, <b className="text-ink">{usage.aiAnswers.toLocaleString("es-MX")}</b> de tus mensajes los
            pensó Lana con inteligencia artificial. Es solo un dato: ya están contados arriba.
          </p>
        )}
        <p className="text-ink-3">
          El contador se reinicia el día 1 de cada mes. Si se te acaban, puedes comprar más sin cambiar de plan.
        </p>
        <p className="text-ink-3">
          El costo de los mensajes de WhatsApp te lo cobra Meta directamente a ti, con su propia tarifa.
          Demandu no le agrega ningún cargo.
        </p>
      </div>
    </div>
  );
}
