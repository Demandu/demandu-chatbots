"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { borrarPlantilla } from "@/app/(dashboard)/bots/[id]/templates/acciones";

/**
 * Borrar una plantilla, con confirmación.
 *
 * SE PREGUNTA SIEMPRE porque esto no se deshace: borrarla en Meta significa
 * volver a esperar la revisión si el cliente se arrepiente, y cualquier envío
 * programado que la use deja de funcionar. Un clic de más vale menos que eso.
 */
export function BorrarPlantilla({
  botId,
  nombre,
  metaId,
}: {
  botId: string;
  nombre: string;
  metaId: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  const borrar = () =>
    empezar(async () => {
      const r = await borrarPlantilla(botId, nombre, metaId);
      if (r.ok) {
        setAbierto(false);
        router.refresh();
      } else setError(r.error ?? "No se pudo borrar.");
    });

  return (
    <>
      <button
        onClick={() => { setError(null); setAbierto(true); }}
        className="rounded-lg p-1.5 text-ink-3 transition hover:bg-danger/10 hover:text-danger"
        aria-label={`Borrar la plantilla ${nombre}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !ocupado && setAbierto(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-linea bg-tarjeta p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-semibold text-ink">¿Borrar «{nombre}»?</h3>
            <p className="mt-1.5 text-sm leading-snug text-ink-2">
              Se borra también en Meta. Si vuelves a necesitarla habrá que crearla de nuevo y
              esperar otra vez la revisión. Los envíos que la usen dejarán de funcionar.
            </p>
            {error && <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAbierto(false)} disabled={ocupado} className="btn-soft">Cancelar</button>
              <button
                onClick={borrar}
                disabled={ocupado}
                className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
                {ocupado ? "Borrando…" : "Sí, borrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
