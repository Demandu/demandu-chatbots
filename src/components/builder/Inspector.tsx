"use client";

import { NODE_META, type DemanduNode, type DemanduNodeData, type NodeType } from "@/lib/flow/types";

interface Props {
  node: DemanduNode | null;
  onChange: (patch: Partial<DemanduNodeData>) => void;
}

/** Panel de configuración del nodo seleccionado. */
export function Inspector({ node, onChange }: Props) {
  if (!node) {
    return (
      <div className="w-[380px] border-l border-surface-border bg-surface p-5 text-sm text-muted-2">
        Selecciona un nodo para configurarlo.
      </div>
    );
  }
  const meta = NODE_META[node.type as NodeType];
  const d = node.data;

  return (
    <div className="w-[380px] overflow-auto border-l border-surface-border bg-surface p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl text-base" style={{ background: meta.bg, color: meta.color }}>
          {meta.icon}
        </span>
        <h3 className="font-display text-base font-semibold text-white">{meta.label}</h3>
      </div>
      <p className="mb-4 text-xs text-muted-2">{meta.description} · ID: {node.id}</p>

      <Field label="Título del nodo">
        <input className="input" value={d.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>

      {d.text !== undefined && node.type !== "calendar" && (
        <Field label="Mensaje">
          <textarea className="input min-h-[80px]" value={d.text} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      )}

      {node.type === "buttons" && (
        <Field label="Botones de opción">
          {(d.buttons ?? []).map((b, i) => (
            <div key={b.id} className="mb-2 flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised px-2.5 py-2">
              <span className="text-muted-2">⿴</span>
              <input
                className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                value={b.label}
                onChange={(e) => {
                  const buttons = [...(d.buttons ?? [])];
                  buttons[i] = { ...buttons[i], label: e.target.value };
                  onChange({ buttons });
                }}
              />
            </div>
          ))}
          <button
            className="w-full rounded-xl border border-dashed border-surface-border py-2.5 text-xs text-muted hover:border-pink hover:text-pink"
            onClick={() => {
              const buttons = [...(d.buttons ?? [])];
              buttons.push({ id: `b${buttons.length + 1}-${Date.now()}`, label: "Nueva opción" });
              onChange({ buttons });
            }}
          >
            ＋ Agregar botón
          </button>
        </Field>
      )}

      {node.type === "question" && (
        <>
          <Field label="Guardar respuesta en variable">
            <input className="input" value={d.variable ?? ""} placeholder="@variable" onChange={(e) => onChange({ variable: e.target.value })} />
          </Field>
          <Field label="Tipo de dato">
            <select className="input" value={d.dataType ?? "text"} onChange={(e) => onChange({ dataType: e.target.value as DemanduNodeData["dataType"] })}>
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="email">Email</option>
              <option value="phone">Teléfono</option>
            </select>
          </Field>
        </>
      )}

      {node.type === "ai" && (
        <>
          <Field label="Proveedor de IA">
            <select className="input" value={d.aiProvider ?? "demandu"} onChange={(e) => onChange({ aiProvider: e.target.value as DemanduNodeData["aiProvider"] })}>
              <option value="demandu">Demandu AI (Voyage + Anthropic)</option>
              <option value="anthropic">Anthropic (BYOK)</option>
              <option value="openai">OpenAI (BYOK)</option>
              <option value="gemini">Gemini (BYOK)</option>
            </select>
          </Field>
          <Field label="Instrucción / Prompt del sistema">
            <textarea className="input min-h-[80px]" value={d.systemPrompt ?? ""} onChange={(e) => onChange({ systemPrompt: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === "calendar" && (
        <>
          <Field label="Calendario (Google)">
            <input className="input" value={d.calendarId ?? ""} onChange={(e) => onChange({ calendarId: e.target.value })} />
          </Field>
          <Field label="Mensaje de confirmación">
            <textarea className="input min-h-[70px]" value={d.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === "human" && (
        <Field label="Asignar a equipo">
          <select className="input" value={d.team ?? "Ventas"} onChange={(e) => onChange({ team: e.target.value })}>
            <option>Ventas</option>
            <option>Soporte</option>
          </select>
        </Field>
      )}

      <button className="mt-1.5 w-full rounded-xl bg-demandu-gradient py-3 font-display text-sm font-bold text-white">
        Guardar cambios
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
