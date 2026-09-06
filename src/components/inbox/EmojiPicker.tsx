"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";

/**
 * Selector de emojis del compositor.
 *
 * ESTÁ ESCRITO A MANO Y NO ES UNA LIBRERÍA. Los paquetes de emojis pesan entre
 * varios cientos de kilobytes y un megabyte porque traen los 3.700 del estándar
 * con sus nombres en veinte idiomas. En una bandeja que se abre cien veces al
 * día eso se paga en cada carga, y nadie usa 3.700 emojis: en atención a
 * clientes se usan estos.
 *
 * Ordenados por lo que de verdad se manda en una conversación de negocio, no
 * por el orden de Unicode: primero saludos y aprobación, al final lo raro.
 */
const GRUPOS: { nombre: string; emojis: string[] }[] = [
  {
    nombre: "Los de siempre",
    emojis: ["👋", "🙂", "😊", "😃", "😉", "👍", "🙏", "💪", "🎉", "✅", "❤️", "🔥", "✨", "👏", "🤝", "💯"],
  },
  {
    nombre: "Caras",
    emojis: ["😀", "😄", "😁", "😅", "😂", "🥹", "😍", "🥰", "😘", "🤗", "🤔", "😐", "😴", "😎", "🥳", "😇",
             "🙃", "😬", "😥", "😞", "😢", "😭", "😤", "😡", "🤯", "😱", "🤒", "🤕", "🤐", "🫡"],
  },
  {
    nombre: "Gestos",
    emojis: ["👌", "🤙", "✌️", "🤞", "👉", "👈", "👆", "👇", "✋", "🖐️", "🙌", "👐", "🫶", "🤲", "☝️", "👊"],
  },
  {
    nombre: "Negocio",
    emojis: ["📅", "🕒", "📍", "📞", "📱", "💬", "📩", "📧", "📎", "📄", "📝", "📦", "🚚", "🛒", "💳", "💰",
             "💵", "🏷️", "🎁", "🏢", "🏠", "⭐", "📈", "📊"],
  },
  {
    nombre: "Señales",
    emojis: ["✔️", "❌", "⚠️", "❓", "❗", "🔔", "🔕", "🔒", "🔓", "⏰", "⏳", "🔄", "➡️", "⬅️", "🆗", "🆕"],
  },
  {
    nombre: "Otros",
    emojis: ["☕", "🍕", "🎂", "🌟", "🌈", "☀️", "🌧️", "🐶", "🐱", "🚀", "💡", "🎯", "🧡", "💚", "💙", "💜"],
  },
];

export function EmojiPicker({ onElegir }: { onElegir: (emoji: string) => void }) {
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

  return (
    <div ref={caja} className="relative mb-1 flex-none">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Emojis"
        className={`grid h-8 w-8 place-items-center rounded-lg transition ${
          abierto ? "bg-surface-raised text-white" : "text-muted-2 hover:text-white"
        }`}
      >
        <Smile className="h-6 w-6" />
      </button>

      {abierto && (
        <div className="absolute bottom-10 left-0 z-40 w-[292px] overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
          <div className="max-h-72 overflow-y-auto p-2">
            {GRUPOS.map((g) => (
              <div key={g.nombre} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  {g.nombre}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      // No se cierra al elegir: mandar dos o tres emojis
                      // seguidos es lo normal, y reabrirlo cada vez cansa.
                      onClick={() => onElegir(e)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-xl transition hover:bg-surface-raised"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
