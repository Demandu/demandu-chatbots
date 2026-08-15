"use client";

import { NODE_META, type NodeType } from "@/lib/flow/types";

/** Componentes agrupados por categoría en la paleta del constructor. */
const CATEGORIES: { name: string; items: NodeType[] }[] = [
  { name: "Mensajes", items: ["message", "media", "question", "buttons"] },
  { name: "Lógica", items: ["condition", "delay", "redirect"] },
  { name: "Inteligencia", items: ["ai"] },
  { name: "Acciones", items: ["action", "api", "calendar", "tags", "human", "assign"] },
  { name: "Comercio & WhatsApp", items: ["catalog", "payment", "whatsapp_flow", "template"] },
  { name: "Cierre", items: ["end"] },
];

export function Palette() {
  const onDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData("application/demandu-node", type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-[230px] overflow-auto border-r border-surface-border bg-surface p-4">
      <h4 className="mb-1 font-display text-[13px] font-semibold text-white">Componentes</h4>
      <p className="text-xs text-muted-2">Arrastra un bloque al lienzo</p>

      {CATEGORIES.map((cat, ci) => (
        <div key={cat.name}>
          <p
            className={`mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-2 ${
              ci === 0 ? "mt-3" : "mt-4"
            }`}
          >
            {cat.name}
          </p>
          {cat.items.map((type) => {
            const m = NODE_META[type];
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => onDragStart(e, type)}
                className="mb-2 flex cursor-grab items-center gap-3 rounded-xl border border-surface-border bg-surface-card px-3 py-2.5 transition hover:translate-x-0.5 hover:border-pink"
              >
                <span
                  className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-[15px]"
                  style={{ background: m.bg, color: m.color }}
                >
                  {m.icon}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-white">{m.label}</div>
                  <div className="text-[11px] text-muted-2">{m.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
