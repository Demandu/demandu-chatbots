"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que muestra estado "Guardando…" mientras corre la server action. */
export function SubmitButton({
  children,
  pendingText = "Guardando…",
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
