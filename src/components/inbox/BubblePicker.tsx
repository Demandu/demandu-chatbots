"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, CheckCircle2 } from "lucide-react";
import { paletaChat } from "@/lib/chatColors";

/** Colores sugeridos. El resto de la paleta se calcula sola a partir de este. */
const SUGERIDOS = [
  { hex: "#e7ddff", nombre: "Violeta Demandu" },
  { hex: "#dcf8c6", nombre: "Verde WhatsApp" },
  { hex: "#ffe0ef", nombre: "Rosa" },
  { hex: "#dbeafe", nombre: "Azul cielo" },
  { hex: "#fff3c4", nombre: "Amarillo suave" },
  { hex: "#e2e8f0", nombre: "Gris claro" },
  { hex: "#d1fae5", nombre: "Menta" },
  { hex: "#ffe4d0", nombre: "Durazno" },
  { hex: "#6e42ff", nombre: "Violeta intenso" },
  { hex: "#1b1c39", nombre: "Noche" },
];

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
        </>
      ) : (
        "Guardar color"
      )}
    </button>
  );
}

export function BubblePicker({
  action,
  value,
}: {
  action: (estado: { ok: boolean; mensaje: string }, formData: FormData) => Promise<{ ok: boolean; mensaje: string }>;
  value: string;
}) {
  const [estado, formAction] = useFormState(action, { ok: false, mensaje: "" });
  const [color, setColor] = useState(value);
  const [aviso, setAviso] = useState("");

  // El aviso de "guardado" se va solo a los pocos segundos.
  useEffect(() => {
    if (!estado.mensaje) return;
    setAviso(estado.mensaje);
    const t = setTimeout(() => setAviso(""), 4000);
    return () => clearTimeout(t);
  }, [estado]);

  const p = paletaChat(color);
  const sinGuardar = color.toLowerCase() !== value.toLowerCase();

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      <input type="hidden" name="bubble_out" value={color} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Colores sugeridos</p>
        <div className="flex flex-wrap gap-2">
          {SUGERIDOS.map((c) => (
            <button
              type="button"
              key={c.hex}
              title={c.nombre}
              onClick={() => setColor(c.hex)}
              className={`grid h-11 w-11 place-items-center rounded-xl border-2 transition ${
                color.toLowerCase() === c.hex.toLowerCase() ? "border-violet" : "border-linea-2"
              }`}
              style={{ backgroundColor: c.hex }}
            >
              {color.toLowerCase() === c.hex.toLowerCase() && (
                <Check className="h-4 w-4" style={{ color: paletaChat(c.hex).textOut }} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">O elige el tuyo</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-linea-2 bg-tarjeta p-1"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="input-l w-32 font-mono text-sm"
            placeholder="#e7ddff"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">
          El fondo del chat y el color del texto se ajustan solos para que siempre se lea bien.
        </p>
      </div>

      {/* Vista previa: el chat completo, no solo la burbuja */}
      <div className="overflow-hidden rounded-2xl border border-linea">
        <div className="border-b border-linea bg-tarjeta px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Vista previa
        </div>
        <div
          className="flex flex-col gap-1.5 p-4"
          style={{ backgroundColor: p.canvas, backgroundImage: p.doodle }}
        >
          <div
            className="max-w-[75%] self-start rounded-lg rounded-tl-sm px-3 py-2 text-[13.5px] shadow-sm"
            style={{ backgroundColor: p.in, color: p.textIn }}
          >
            Hola, ¿tienen disponibilidad para esta semana?
          </div>
          <div
            className="max-w-[75%] self-end rounded-lg rounded-tr-sm px-3 py-2 text-[13.5px] shadow-sm"
            style={{ backgroundColor: p.out, color: p.textOut }}
          >
            ¡Claro que sí! Te comparto los horarios disponibles 😊
            <span className="ml-2 text-[10px]" style={{ color: p.metaOut }}>
              10:24
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <BotonGuardar />
        {aviso && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-sm font-medium text-exito">
            <CheckCircle2 className="h-4 w-4" /> {aviso}
          </span>
        )}
        {!aviso && sinGuardar && <span className="text-xs text-ink-3">Tienes cambios sin guardar.</span>}
      </div>
    </form>
  );
}
