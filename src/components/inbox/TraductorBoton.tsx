"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, Check, Loader2, X } from "lucide-react";
import { IDIOMAS, idiomaPorCodigo } from "@/lib/idiomas";

/**
 * Botón de traducción de la conversación. Al elegir un idioma, cada burbuja
 * muestra debajo su traducción — el original nunca se pierde.
 */
export function TraductorBoton({
  idioma,
  cargando,
  onElegir,
  onApagar,
}: {
  idioma: string | null;
  cargando: boolean;
  onElegir: (code: string) => void;
  onApagar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const activo = idiomaPorCodigo(idioma);
  const filtrados = IDIOMAS.filter((i) =>
    !busca ? true : i.nombre.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <div ref={caja} className="relative flex-none">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title={activo ? `Traduciendo a ${activo.nombre}` : "Traducir conversación"}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition ${
          activo
            ? "border-violet bg-violet/15 text-white"
            : "border-surface-border bg-surface-raised text-muted hover:text-white"
        }`}
      >
        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
        {activo ? (
          <span className="flex items-center gap-1">
            {activo.bandera} <span className="hidden sm:inline">{activo.nombre}</span>
          </span>
        ) : (
          <span className="hidden sm:inline">Traducir</span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
          <div className="border-b border-surface-border p-2">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar idioma…"
              className="w-full rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-white placeholder:text-muted-2 focus:outline-none"
            />
          </div>

          {activo && (
            <button
              type="button"
              onClick={() => {
                onApagar();
                setAbierto(false);
              }}
              className="flex w-full items-center gap-2 border-b border-surface-border px-3 py-2 text-left text-sm text-danger transition hover:bg-danger/10"
            >
              <X className="h-4 w-4" /> Quitar traducción
            </button>
          )}

          <div className="max-h-64 overflow-y-auto">
            {filtrados.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-muted-2">Sin resultados.</p>
            )}
            {filtrados.map((i) => (
              <button
                key={i.code}
                type="button"
                onClick={() => {
                  onElegir(i.code);
                  setAbierto(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-raised ${
                  idioma === i.code ? "text-white" : "text-muted hover:text-white"
                }`}
              >
                <span className="text-base leading-none">{i.bandera}</span>
                <span className="flex-1">{i.nombre}</span>
                {idioma === i.code && <Check className="h-4 w-4 text-violet" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
