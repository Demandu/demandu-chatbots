import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Plus } from "lucide-react";

const BOTS = [
  { id: "sample-sales", name: "Flujo de Ventas · Tienda Demo", channel: "WhatsApp", status: "Publicado", convos: "1,248" },
  { id: "support", name: "Soporte 24/7", channel: "Web Chat", status: "Borrador", convos: "—" },
  { id: "booking", name: "Agenda de citas", channel: "Instagram", status: "Borrador", convos: "—" },
];

export default function BotsPage() {
  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Constructor · Mis bots</span>} />
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Mis bots</h2>
            <p className="mt-1 text-muted">Diseña, prueba y publica tus flujos conversacionales.</p>
          </div>
          <button className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo bot
          </button>
        </div>

        <div className="grid max-w-4xl grid-cols-1 gap-3.5 md:grid-cols-2">
          {BOTS.map((b) => (
            <Link key={b.id} href={`/bots/${b.id}`} className="card p-5 transition hover:border-pink">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-semibold text-muted">
                  {b.channel}
                </span>
                <span
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    b.status === "Publicado" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                  }`}
                >
                  {b.status}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold text-white">{b.name}</h3>
              <p className="mt-1 text-sm text-muted-2">{b.convos} conversaciones</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
