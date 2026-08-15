"use client";

import { useFormStatus } from "react-dom";

/**
 * Botón de "crear bot" para las tarjetas de canal. Usa useFormStatus para
 * mostrar estado de carga y deshabilitarse mientras el server action corre,
 * así se siente responsivo y evita crear bots duplicados por doble clic.
 * Debe renderizarse DENTRO del <form action={createBot}>.
 */
export function CreateBotButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="card group relative flex w-full flex-col items-start gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:border-pink disabled:cursor-wait disabled:opacity-80"
    >
      {children}
      <span className="mt-1 text-xs font-semibold text-pink">
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-pink border-t-transparent" />
            Creando…
          </span>
        ) : (
          <span className="opacity-0 transition group-hover:opacity-100">Crear bot →</span>
        )}
      </span>
    </button>
  );
}
