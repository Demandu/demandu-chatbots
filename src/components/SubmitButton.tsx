"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que muestra estado "Guardando…" mientras corre la server action. */
export function SubmitButton({
  children,
  pendingText = "Guardando…",
  className = "btn-primary",
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  /** Motivos propios de la pantalla para no dejar pulsar (sin canal, sin
   *  plantilla aprobada…). Se suma a «ya se pulsó», nunca lo sustituye. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
