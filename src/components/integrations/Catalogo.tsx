"use client";

import { useState, useTransition } from "react";
import { Check, Bell } from "lucide-react";
import { integracionesPorCategoria, type Integracion } from "@/lib/integraciones";
import { avisarme } from "@/app/(dashboard)/settings/integrations/interes";

/**
 * El catálogo de integraciones.
 *
 * ENSEÑA LO QUE NO EXISTE, PERO LO DICE. La alternativa era no mostrar nada
 * hasta tenerlo todo construido, y entonces el cliente no sabe siquiera que va
 * a existir. La otra alternativa —enseñarlas como si funcionaran— es lo que
 * hace la competencia y es peor que no tenerlas: cuando el cliente descubre que
 * no funciona, deja de creerse también las que sí.
 *
 * El botón "Avísame" no es un adorno: es lo que decide en qué orden se
 * construyen. Cuántos clientes pidieron cada una vale más que nuestra intuición.
 */
export function Catalogo({ pedidas }: { pedidas: string[] }) {
  const [apuntadas, setApuntadas] = useState<Set<string>>(new Set(pedidas));
  const grupos = integracionesPorCategoria();

  return (
    <div className="space-y-7">
      {grupos.map((g) => (
        <section key={g.categoria}>
          <h3 className="mb-3 font-display text-base font-semibold text-ink">{g.categoria}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((i) => (
              <Tarjeta
                key={i.clave}
                item={i}
                apuntada={apuntadas.has(i.clave)}
                onApuntada={() => setApuntadas((s) => new Set(s).add(i.clave))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Tarjeta({
  item,
  apuntada,
  onApuntada,
}: {
  item: Integracion;
  apuntada: boolean;
  onApuntada: () => void;
}) {
  const [guardando, empezar] = useTransition();
  const [error, setError] = useState("");

  const pedir = () =>
    empezar(async () => {
      const r = await avisarme(item.clave);
      if (r.ok) onApuntada();
      else setError(r.error ?? "No se pudo apuntar.");
    });

  return (
    <div className="flex flex-col rounded-2xl border border-linea bg-tarjeta p-4">
      <div className="flex items-start gap-3">
        {/* Placa con el color real de la marca. Ver la nota en
            `src/lib/integraciones.ts` sobre por qué no es el logo dibujado. */}
        <span
          className="grid h-11 w-11 flex-none place-items-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: item.color }}
          aria-hidden="true"
        >
          {item.sigla}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-ink">{item.nombre}</h4>
            {item.estado === "disponible" ? (
              <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">
                Disponible
              </span>
            ) : (
              <span className="rounded-full border border-linea bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                Próximamente
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-snug text-ink-3">{item.descripcion}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {item.estado === "disponible" ? (
          <span className="text-xs font-semibold text-success">Se conecta más abajo ↓</span>
        ) : apuntada ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <Check className="h-3.5 w-3.5 text-success" /> Te avisamos en cuanto esté
          </span>
        ) : (
          <button
            onClick={pedir}
            disabled={guardando}
            className="inline-flex items-center gap-1.5 rounded-xl border border-linea px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-suave-2 disabled:opacity-60"
          >
            <Bell className="h-3.5 w-3.5" /> {guardando ? "Apuntando…" : "Avísame cuando esté"}
          </button>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
