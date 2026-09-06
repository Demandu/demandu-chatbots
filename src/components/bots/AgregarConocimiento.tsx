"use client";

import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Check, Loader2 } from "lucide-react";

/**
 * Formulario para agregar un dato del negocio.
 *
 * Existe como componente de cliente por una sola razón: con un `<form action>`
 * de servidor a secas, los campos se quedan con lo que ya se guardó y el
 * cliente no sabe si funcionó — o peor, lo agrega dos veces. Aquí el formulario
 * se vacía solo y confirma.
 */
export function AgregarConocimiento({
  botId,
  accion,
}: {
  botId: string;
  accion: (estado: any, formData: FormData) => Promise<{ ok: boolean; mensaje?: string }>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false });
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) {
      form.current?.reset();
      form.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    }
  }, [estado]);

  return (
    <form ref={form} action={enviar} className="space-y-3">
      <input type="hidden" name="bot_id" value={botId} />
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-2">Tema</label>
        <input name="title" required className="input-l" placeholder="Horarios de atención" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink-2">¿Qué debe saber?</label>
        <textarea
          name="content"
          required
          className="input-l min-h-[130px]"
          placeholder="Abrimos de lunes a viernes de 9 a 19 h y sábados de 10 a 14 h. Domingos cerrado."
        />
      </div>
      <Boton />
      {estado?.mensaje && (
        <p className={`text-xs ${estado.ok ? "text-success" : "text-danger"}`}>{estado.mensaje}</p>
      )}
    </form>
  );
}

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {pending ? "Guardando…" : "Agregar"}
    </button>
  );
}

/** Confirmación de que se guardó, para la lista de ejemplos. */
export function Guardado() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
      <Check className="h-3.5 w-3.5" /> Agregado
    </span>
  );
}
