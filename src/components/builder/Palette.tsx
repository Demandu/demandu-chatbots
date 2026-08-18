"use client";

import { NODE_META, type NodeType, type BotChannel } from "@/lib/flow/types";

type Category = { name: string; items: NodeType[] };

/** Componentes comunes a todos los canales. */
const COMMON: Category[] = [
  { name: "Mensajes", items: ["message", "media", "question", "buttons"] },
  { name: "Lógica", items: ["condition", "delay", "redirect"] },
  { name: "Inteligencia", items: ["ai"] },
  { name: "Acciones", items: ["action", "api", "calendar", "tags", "human", "assign"] },
];

/** Componentes exclusivos por canal (los de WhatsApp NO aparecen en otros canales). */
const CHANNEL_EXTRA: Record<BotChannel, Category[]> = {
  whatsapp: [{ name: "Comercio & WhatsApp", items: ["catalog", "payment", "whatsapp_flow", "template"] }],
  instagram: [{ name: "Instagram", items: ["ig_story", "ig_comment", "ig_dm"] }],
  messenger: [{ name: "Messenger", items: ["fb_comment", "template"] }],
  webchat: [{ name: "Sitio web", items: ["web_form"] }],
};

const CLOSE: Category = { name: "Cierre", items: ["end"] };

function categoriesFor(channel: BotChannel): Category[] {
  return [...COMMON, ...(CHANNEL_EXTRA[channel] ?? CHANNEL_EXTRA.webchat), CLOSE];
}

export function Palette({ channel = "webchat" }: { channel?: BotChannel }) {
  const CATEGORIES = categoriesFor(channel);
  const onDragStart = (e: React.DragEvent, type: NodeType) => {
    e.dataTransfer.setData("application/demandu-node", type);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="w-[230px] max-w-[80vw] flex-none overflow-auto border-r border-surface-border bg-surface p-4">
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
