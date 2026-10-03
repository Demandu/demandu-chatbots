"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check, AlertTriangle } from "lucide-react";

/**
 * El formulario de «Agregar contacto», con respuesta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES NO DECÍA NADA, Y ESO ERA EL PROBLEMA. El 25 de septiembre alguien
 * agregó quince veces a la misma persona en 43 segundos: el formulario no
 * contestaba, así que parecía que no había pasado nada y se volvía a pulsar.
 *
 * Ahora contesta siempre — tanto si se creó como si ya estaba. «Ya lo tenías»
 * es una respuesta útil; el silencio no lo es nunca.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AgregarContacto({
  canales,
  accion,
}: {
  canales: { value: string; label: string }[];
  accion: (estado: any, formData: FormData) => Promise<{ ok: boolean; mensaje?: string }>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false });

  return (
    <div className="mb-6 rounded-2xl border border-linea bg-tarjeta p-4">
      <form action={enviar} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre</label>
          <input name="name" required placeholder="Nombre del contacto" className="input-l" />
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Teléfono</label>
          <input name="phone" placeholder="+52…" className="input-l" />
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Correo</label>
          <input name="email" type="email" placeholder="correo@ejemplo.com" className="input-l" />
        </div>
        <div className="min-w-[150px]">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Canal</label>
          <select name="channel" defaultValue="whatsapp" className="input-l">
            {canales.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <Boton />
      </form>

      {estado?.mensaje && (
        <p
          className={`mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold ${
            estado.ok ? "text-exito" : "text-danger"
          }`}
        >
          {estado.ok ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {estado.mensaje}
        </p>
      )}
    </div>
  );
}

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Agregando…" : "Agregar contacto"}
    </button>
  );
}
