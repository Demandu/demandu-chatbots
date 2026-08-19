import { CheckCircle2, AlertTriangle, XCircle, ListChecks } from "lucide-react";
import type { Diagnostico, Nivel } from "@/lib/integrations/metaEstado";

/**
 * "¿Por qué no salen mis mensajes?" respondido dentro de la plataforma.
 *
 * Hasta ahora, cuando Meta bloqueaba los envíos el cliente tenía que irse a
 * Business Manager a adivinar. Aquí se le dice qué pasa y qué hacer, en su
 * idioma, sin nombres de campos ni códigos de error.
 */
export function EstadoMeta({ d }: { d: Diagnostico }) {
  const marco: Record<Nivel, string> = {
    ok: "border-success/35 bg-success/5",
    aviso: "border-warning/45 bg-warning/10",
    problema: "border-danger/35 bg-danger/5",
  };

  return (
    <section className={`rounded-2xl border p-5 ${marco[d.nivel]}`}>
      <header className="flex items-start gap-2.5">
        <Icono nivel={d.nivel} />
        <h3 className="font-display text-base font-bold text-ink">{d.titular}</h3>
      </header>

      {!!d.quePuedoHacer?.length && (
        <div className="mt-4 rounded-xl border border-[#e6e8f2] bg-white p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            <ListChecks className="h-3.5 w-3.5" /> Qué hacer
          </p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-sm leading-relaxed text-ink-2 marker:font-semibold marker:text-violet">
            {d.quePuedoHacer.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}

      {!!d.puntos.length && (
        <dl className="mt-4 flex flex-col gap-2.5">
          {d.puntos.map((p) => (
            <div key={p.titulo} className="flex items-start gap-2.5">
              <Icono nivel={p.nivel} pequeno />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">{p.titulo}</dt>
                  <dd className="text-sm font-medium text-ink">{p.valor}</dd>
                </div>
                {p.detalle && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{p.detalle}</p>}
              </div>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Icono({ nivel, pequeno = false }: { nivel: Nivel; pequeno?: boolean }) {
  const c = pequeno ? "h-4 w-4 mt-0.5 flex-none" : "h-5 w-5 mt-0.5 flex-none";
  if (nivel === "ok") return <CheckCircle2 className={`${c} text-success`} />;
  if (nivel === "aviso") return <AlertTriangle className={`${c} text-[#a97c00]`} />;
  return <XCircle className={`${c} text-danger`} />;
}
