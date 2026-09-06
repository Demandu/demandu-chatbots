"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";

export type Aviso = {
  id: string;
  titulo: string;
  cuerpo?: string;
  /** A dónde llevar al hacer clic */
  href?: string;
};

/** Evento con el que cualquier parte de la app puede levantar un aviso. */
export const EVENTO_AVISO = "demandu:aviso";

export function lanzarAviso(a: Omit<Aviso, "id">) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_AVISO, { detail: a }));
}

const DURACION = 7000;

/**
 * Avisos dentro de la app: la tarjeta que aparece arriba a la derecha cuando
 * llega un mensaje. Es lo que se VE (el aviso del sistema operativo solo sale
 * cuando la persona está en otra pestaña).
 */
export function Toasts() {
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    const onAviso = (e: Event) => {
      const detalle = (e as CustomEvent).detail as Omit<Aviso, "id">;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      // Máximo 3 en pantalla: más que eso tapa la app.
      setAvisos((a) => [...a.slice(-2), { id, ...detalle }]);
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), DURACION);
    };
    window.addEventListener(EVENTO_AVISO, onAviso);
    return () => window.removeEventListener(EVENTO_AVISO, onAviso);
  }, []);

  if (!avisos.length) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[80] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 sm:right-4 sm:top-[72px]">
      {avisos.map((a) => (
        <div
          key={a.id}
          role="status"
          onClick={() => {
            if (a.href) router.push(a.href);
            setAvisos((x) => x.filter((y) => y.id !== a.id));
          }}
          className="pointer-events-auto flex animate-[avisoEntra_.22s_ease-out] cursor-pointer items-start gap-3 rounded-2xl border border-surface-border bg-surface/95 p-3 shadow-2xl backdrop-blur transition hover:border-pink"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-demandu-gradient text-white">
            <MessageSquare className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{a.titulo}</div>
            {a.cuerpo && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{a.cuerpo}</div>}
            <div className="mt-1 text-[11px] font-medium text-pink">Toca para abrir →</div>
          </div>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={(e) => {
              e.stopPropagation();
              setAvisos((x) => x.filter((y) => y.id !== a.id));
            }}
            className="grid h-7 w-7 flex-none place-items-center rounded-lg text-muted-2 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <style jsx global>{`
        @keyframes avisoEntra {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
