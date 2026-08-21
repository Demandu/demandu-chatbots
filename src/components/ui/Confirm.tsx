"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Ventana de confirmación para acciones que no se pueden deshacer.
 * Siempre dice EXACTAMENTE qué se va a borrar, en lenguaje humano.
 */
export function Confirm({
  abierto,
  titulo,
  detalle,
  confirmar = "Sí, eliminar",
  cancelar = "Cancelar",
  peligro = true,
  onConfirmar,
  onCancelar,
  ocupado = false,
}: {
  abierto: boolean;
  titulo: string;
  detalle?: React.ReactNode;
  confirmar?: string;
  cancelar?: string;
  peligro?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  ocupado?: boolean;
}) {
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancelar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onCancelar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button type="button" aria-label="Cancelar" onClick={onCancelar} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-2xl border border-linea bg-tarjeta p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex gap-3">
          <span
            className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${
              peligro ? "bg-danger/15 text-danger" : "bg-violet/15 text-violet"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 pr-6">
            <h3 className="font-display text-base font-semibold text-ink">{titulo}</h3>
            {detalle && <div className="mt-1 text-sm text-ink-2">{detalle}</div>}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={ocupado} className="btn-soft px-4 py-2 text-sm">
            {cancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={ocupado}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
              peligro ? "bg-danger hover:brightness-110" : "bg-demandu-gradient"
            }`}
          >
            {ocupado ? "Un momento…" : confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
