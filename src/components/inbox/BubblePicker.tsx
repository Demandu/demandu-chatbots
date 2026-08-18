"use client";

import { useState } from "react";
import { Check } from "lucide-react";

/** Colores sugeridos, todos con buen contraste para leer el texto encima. */
const SUGERIDOS = [
  { hex: "#e7ddff", nombre: "Violeta Demandu" },
  { hex: "#dcf8c6", nombre: "Verde WhatsApp" },
  { hex: "#ffe0ef", nombre: "Rosa" },
  { hex: "#dbeafe", nombre: "Azul cielo" },
  { hex: "#fff3c4", nombre: "Amarillo suave" },
  { hex: "#e2e8f0", nombre: "Gris claro" },
  { hex: "#d1fae5", nombre: "Menta" },
  { hex: "#ffe4d0", nombre: "Durazno" },
];

export function BubblePicker({
  action,
  value,
}: {
  action: (formData: FormData) => void;
  value: string;
}) {
  const [color, setColor] = useState(value);

  return (
    <form action={action} className="max-w-lg space-y-5">
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
                color.toLowerCase() === c.hex.toLowerCase() ? "border-violet" : "border-[#e2e4f0]"
              }`}
              style={{ backgroundColor: c.hex }}
            >
              {color.toLowerCase() === c.hex.toLowerCase() && <Check className="h-4 w-4 text-[#2c2550]" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">
          O elige el tuyo
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-[#e2e4f0] bg-white p-1"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="input-l w-32 font-mono text-sm"
            placeholder="#e7ddff"
          />
        </div>
      </div>

      {/* Vista previa: así se verá una conversación real */}
      <div className="rounded-2xl border border-[#e6e8f2] bg-[#ece9f6] p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Vista previa</p>
        <div className="flex flex-col gap-1.5">
          <div className="max-w-[75%] self-start rounded-lg rounded-tl-sm bg-white px-3 py-2 text-[13.5px] text-[#1b1c39] shadow-sm">
            Hola, ¿tienen disponibilidad para esta semana?
          </div>
          <div
            className="max-w-[75%] self-end rounded-lg rounded-tr-sm px-3 py-2 text-[13.5px] text-[#2c2550] shadow-sm"
            style={{ backgroundColor: color }}
          >
            ¡Claro que sí! Te comparto los horarios disponibles 😊
          </div>
        </div>
      </div>

      <button className="btn-primary">Guardar color</button>
    </form>
  );
}
