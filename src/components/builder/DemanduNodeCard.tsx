"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_META, ACTION_META, type NodeType, type DemanduNodeData } from "@/lib/flow/types";

/** Nodo visual del constructor. Se registra para todos los NodeType. */
export function DemanduNodeCard({ type, data, selected }: NodeProps) {
  const meta = NODE_META[(type as NodeType) ?? "message"];
  const d = data as DemanduNodeData;
  const text = d.text ?? "";

  return (
    <div
      className={`w-[230px] overflow-hidden rounded-2xl border bg-surface-card shadow-card transition ${
        selected ? "border-pink shadow-glow" : "border-surface-border hover:border-violet"
      }`}
    >
      {/* Barra de acento por tipo */}
      <div style={{ height: 4, background: meta.color }} />

      {type !== "start" && (
        <Handle type="target" position={Position.Left} className="!border-muted" />
      )}

      <div className="flex items-center gap-2.5 border-b border-surface-border px-3.5 py-2.5">
        <span
          className="grid h-6 w-6 flex-none place-items-center rounded-lg text-sm"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.icon}
        </span>
        <span className="font-display text-[13px] font-bold text-white">{d.label}</span>
        <span
          className="ml-auto rounded-md px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>

      <div className="px-3.5 py-3 text-[12.5px] leading-snug text-muted">
        {text.length > 90 ? text.slice(0, 90) + "…" : text || meta.description}
      </div>

      {type === "buttons" && d.buttons && (
        <div className="flex flex-col gap-1.5 px-3.5 pb-3.5">
          {d.buttons.map((b) => (
            <div
              key={b.id}
              className="relative flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-xs text-white"
            >
              <span className="h-1.5 w-1.5 flex-none rounded-full bg-violet" />
              {b.label}
              <Handle id={b.id} type="source" position={Position.Right} style={{ top: "50%" }} />
            </div>
          ))}
        </div>
      )}

      {d.actions && d.actions.length > 0 && (
        <div className="flex gap-1.5 px-3.5 pb-3 text-sm">
          {d.actions.map((a) => (
            <span key={a.id} title={ACTION_META[a.type].label}>
              {ACTION_META[a.type].icon}
            </span>
          ))}
        </div>
      )}

      {type !== "buttons" && type !== "end" && (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
