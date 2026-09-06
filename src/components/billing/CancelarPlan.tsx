"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";

/**
 * Cancelar el plan, sin fricción y sin trucos.
 *
 * DECISIÓN DE PRODUCTO: nada de esconder el botón, ni de encuestas de salida
 * obligatorias, ni de "llámanos para cancelar". Un cliente atrapado no se
 * queda: se va enojado y lo cuenta. Uno que sale fácil vuelve.
 *
 * La confirmación NO existe para disuadirlo. Existe para decirle tres cosas
 * que necesita saber y que casi nadie le dice: hasta cuándo sigue funcionando,
 * que no se le va a cobrar otra vez, y que sus datos no se borran.
 */
export function CancelarPlan({
  cancelaAlTerminar,
  hasta,
}: {
  cancelaAlTerminar: boolean;
  hasta: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();

  const fecha = hasta
    ? new Date(hasta).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const llamar = (reactivar: boolean) =>
    empezar(async () => {
      setError(null);
      try {
        const r = await fetch("/api/billing/cancelar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactivar }),
        });
        const j = await r.json();
        if (!r.ok) { setError(j?.error ?? "No se pudo."); return; }
        setAbierto(false);
        router.refresh();
      } catch {
        setError("No pudimos conectar. Inténtalo otra vez.");
      }
    });

  // Ya canceló: lo único que toca ofrecerle es volver.
  if (cancelaAlTerminar) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => llamar(true)} disabled={ocupado} className="btn-primary disabled:opacity-60">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
          {ocupado ? "Un momento…" : "Reactivar mi plan"}
        </button>
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setAbierto(true); }}
        className="text-xs font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
      >
        Cancelar mi plan
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !ocupado && setAbierto(false)}>
          <div className="w-full max-w-md rounded-2xl border border-linea bg-tarjeta p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-semibold text-ink">¿Cancelar tu plan?</h3>

            <div className="mt-3 space-y-2 text-sm leading-snug text-ink-2">
              <p>
                {fecha ? (
                  <>Tu cuenta sigue funcionando normal hasta el <b className="text-ink">{fecha}</b>, que es hasta donde ya pagaste.</>
                ) : (
                  <>Tu cuenta sigue funcionando hasta que termine el periodo que ya pagaste.</>
                )}
              </p>
              <p>Después de esa fecha <b className="text-ink">no se te vuelve a cobrar</b>. No hay penalización ni cargo por salir.</p>
              <p>
                Tus chatbots, conversaciones y contactos <b className="text-ink">se quedan aquí</b>. Si vuelves, están donde
                los dejaste.
              </p>
              <p className="text-ink-3">Y si te arrepientes antes de esa fecha, lo reactivas con un clic.</p>
            </div>

            {error && (
              <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button onClick={() => setAbierto(false)} disabled={ocupado} className="btn-soft">
                Mejor me quedo
              </button>
              <button
                onClick={() => llamar(false)}
                disabled={ocupado}
                className="inline-flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-60"
              >
                {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
                {ocupado ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
