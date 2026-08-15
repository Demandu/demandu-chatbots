import { Topbar } from "@/components/Topbar";

const KPIS = [
  { k: "Conversaciones", v: "1,248", d: "▲ 23% vs. mes anterior" },
  { k: "Tasa de respuesta", v: "98%", d: "▲ atención 24/7" },
  { k: "Leads calificados", v: "312", d: "▲ 18%" },
  { k: "Ventas asistidas", v: "$184k", d: "▲ 31%" },
  { k: "Tiempo 1ª resp.", v: "1.2s", d: "▼ vs 4h humano" },
  { k: "CSAT", v: "4.8", d: "▲ clientes felices" },
];

const RECENT = [
  { icon: "💬", t: "Conversación #4821 · WhatsApp", d: "Lana calificó el lead y agendó una cita para mañana 10:00.", tag: "Ganada" },
  { icon: "📸", t: "Conversación #4820 · Instagram", d: "Cliente preguntó por precios; el flujo envió catálogo y cerró venta." },
  { icon: "🧑‍💼", t: "Conversación #4817 · Web Chat", d: "Escalada a asesor humano — caso de soporte técnico." },
];

export default function DashboardPage() {
  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Panel de resultados</span>} />
      <div className="flex-1 overflow-auto p-8">
        <h2 className="font-display text-2xl font-bold text-white">Panel de resultados</h2>
        <p className="mb-6 mt-1 max-w-xl text-muted">
          Cada conversación es una oportunidad. Aquí ves cómo se convierten en resultados para tu negocio.
        </p>

        <div className="mb-7 grid max-w-3xl grid-cols-2 gap-3.5 md:grid-cols-3">
          {KPIS.map((k) => (
            <div key={k.k} className="card p-4">
              <div className="text-xs font-semibold text-muted-2">{k.k}</div>
              <div className="mt-1 font-display text-[26px] font-bold text-white">{k.v}</div>
              <div className="mt-0.5 text-xs font-semibold text-success">{k.d}</div>
            </div>
          ))}
        </div>

        <div className="flex max-w-4xl flex-col gap-2.5">
          {RECENT.map((r) => (
            <div key={r.t} className="card flex items-center gap-3 px-4 py-3.5">
              <div className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-gradient-to-br from-pink/20 to-violet/20 text-base">
                {r.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{r.t}</div>
                <div className="text-xs text-muted-2">{r.d}</div>
              </div>
              {r.tag && (
                <span className="ml-auto rounded-md bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
                  {r.tag}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
