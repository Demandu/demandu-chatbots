"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, MailOpen, MailPlus, CheckCircle2, RotateCcw, Eraser, Trash2 } from "lucide-react";

export type AccionChat = "no_leido" | "leido" | "cerrar" | "reabrir" | "vaciar" | "eliminar";

/**
 * Menú de una conversación, igual que el "⋮" de WhatsApp.
 * Las acciones que borran algo van separadas abajo y en rojo.
 */
export function ConvoMenu({
  cerrada,
  sinLeer,
  onAccion,
  className = "",
}: {
  cerrada: boolean;
  sinLeer: boolean;
  onAccion: (a: AccionChat) => void;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
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

  const item = (a: AccionChat, icono: React.ReactNode, texto: string, rojo = false) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setAbierto(false);
        onAccion(a);
      }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
        rojo ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-surface-raised hover:text-white"
      }`}
    >
      <span className="flex-none">{icono}</span> {texto}
    </button>
  );

  return (
    <div ref={caja} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Opciones de la conversación"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setAbierto((v) => !v);
        }}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted-2 transition hover:bg-surface-raised hover:text-white"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {abierto && (
        <div className="absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
          {sinLeer
            ? item("leido", <MailOpen className="h-4 w-4" />, "Marcar como leído")
            : item("no_leido", <MailPlus className="h-4 w-4" />, "Marcar como no leído")}
          {cerrada
            ? item("reabrir", <RotateCcw className="h-4 w-4" />, "Reabrir conversación")
            : item("cerrar", <CheckCircle2 className="h-4 w-4" />, "Cerrar conversación")}

          <div className="my-1 border-t border-surface-border" />
          {item("vaciar", <Eraser className="h-4 w-4" />, "Vaciar mensajes", true)}
          {item("eliminar", <Trash2 className="h-4 w-4" />, "Eliminar chat", true)}
        </div>
      )}
    </div>
  );
}
