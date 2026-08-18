"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Zap, Search, Settings2, CornerDownLeft } from "lucide-react";
import { filtrar, type RespuestaRapida } from "@/lib/quickReplies";

/**
 * Selector de respuestas rápidas para el chat en vivo.
 *
 * Se abre con el botón ⚡ o escribiendo "/" en el mensaje. Al elegir una,
 * el texto entra en el cuadro de escritura (no se envía solo), así el agente
 * puede retocarlo antes de mandarlo.
 */
export function RespuestasRapidas({
  respuestas,
  abierto,
  busqueda,
  onAbrir,
  onCerrar,
  onElegir,
}: {
  respuestas: RespuestaRapida[];
  abierto: boolean;
  /** Lo que se escribió después de la "/" en el cuadro de mensaje */
  busqueda: string;
  onAbrir: () => void;
  onCerrar: () => void;
  onElegir: (r: RespuestaRapida) => void;
}) {
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const buscador = useRef<HTMLInputElement>(null);

  // El texto tecleado tras la "/" manda; si no, el buscador de aquí dentro.
  const termino = busqueda || q;
  const lista = useMemo(() => filtrar(respuestas, termino), [respuestas, termino]);

  useEffect(() => setActivo(0), [termino, abierto]);

  useEffect(() => {
    if (!abierto) {
      setQ("");
      return;
    }
    // Si viene del botón (no de la "/"), enfocamos el buscador
    if (!busqueda) setTimeout(() => buscador.current?.focus(), 30);

    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) onCerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto, busqueda, onCerrar]);

  // Flechas y Enter funcionan aunque el foco siga en el cuadro de mensaje
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onCerrar();
      if (!lista.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActivo((i) => (i + 1) % lista.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActivo((i) => (i - 1 + lista.length) % lista.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onElegir(lista[activo]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [abierto, lista, activo, onElegir, onCerrar]);

  return (
    <div ref={caja} className="relative flex-none">
      <button
        type="button"
        onClick={() => (abierto ? onCerrar() : onAbrir())}
        title="Respuestas rápidas ( / )"
        aria-label="Respuestas rápidas"
        className={`mb-2 grid h-6 w-6 place-items-center rounded transition ${
          abierto ? "text-violet" : "text-muted-2 hover:text-violet"
        }`}
      >
        <Zap className="h-5 w-5" />
      </button>

      {abierto && (
        <div className="absolute bottom-10 left-0 z-40 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2">
            <Search className="h-4 w-4 flex-none text-muted-2" />
            {busqueda ? (
              <span className="flex-1 truncate text-sm text-muted">
                Buscando <b className="text-white">/{busqueda}</b>
              </span>
            ) : (
              <input
                ref={buscador}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar respuesta…"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-muted-2 focus:outline-none"
              />
            )}
            <Link
              href="/settings/quick-replies"
              title="Gestionar respuestas rápidas"
              className="flex-none text-muted-2 transition hover:text-white"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {respuestas.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-muted">Todavía no tienes respuestas rápidas.</p>
                <Link
                  href="/settings/quick-replies"
                  className="mt-2 inline-block text-sm font-semibold text-violet hover:underline"
                >
                  Crear la primera →
                </Link>
              </div>
            )}

            {respuestas.length > 0 && lista.length === 0 && (
              <p className="px-4 py-5 text-center text-sm text-muted-2">
                Ninguna coincide con “{termino}”.
              </p>
            )}

            {lista.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setActivo(i)}
                onClick={() => onElegir(r)}
                className={`flex w-full flex-col gap-0.5 border-b border-surface-border px-3 py-2.5 text-left transition last:border-b-0 ${
                  i === activo ? "bg-surface-raised" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="rounded bg-violet/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet">
                    /{r.shortcut}
                  </span>
                  <span className="truncate text-sm font-semibold text-white">{r.title}</span>
                </span>
                <span className="line-clamp-2 text-xs text-muted-2">{r.body}</span>
              </button>
            ))}
          </div>

          {lista.length > 0 && (
            <div className="flex items-center gap-3 border-t border-surface-border px-3 py-1.5 text-[11px] text-muted-2">
              <span className="flex items-center gap-1">↑↓ moverse</span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> usar
              </span>
              <span>Esc cerrar</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
