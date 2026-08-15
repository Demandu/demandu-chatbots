"use client";

import { useEffect, useState } from "react";
import {
  NODE_META, ACTION_META, ACTION_ORDER,
  type DemanduNode, type DemanduNodeData, type NodeType, type NodeActionType,
} from "@/lib/flow/types";
import type { Catalogs } from "@/lib/catalogs";

interface Props {
  node: DemanduNode | null;
  onChange: (patch: Partial<DemanduNodeData>) => void;
  catalogs?: Catalogs;
}

/** Qué catálogo alimenta el selector de cada tipo de acción. */
const ACTION_SOURCE: Partial<Record<NodeActionType, keyof Catalogs>> = {
  add_tag: "tags",
  remove_tag: "tags",
  assign_agent: "members",
  assign_group: "groups",
  notify_team: "teams",
  set_status: "states",
};

/** Panel de configuración del nodo seleccionado. */
export function Inspector({ node, onChange, catalogs }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [node?.id]);

  if (!node) {
    return (
      <div className="w-[380px] border-l border-surface-border bg-surface p-5 text-sm text-muted-2">
        Selecciona un nodo para configurarlo.
      </div>
    );
  }
  const meta = NODE_META[node.type as NodeType];
  const d = node.data;
  const actions = d.actions ?? [];

  const addAction = (type: NodeActionType) => {
    onChange({ actions: [...actions, { id: `a-${Date.now()}`, type }] });
    setMenuOpen(false);
  };
  const updateAction = (i: number, value: string) =>
    onChange({ actions: actions.map((a, idx) => (idx === i ? { ...a, value } : a)) });
  const removeAction = (i: number) =>
    onChange({ actions: actions.filter((_, idx) => idx !== i) });

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

      {node.type === "message" && (
        <>
          <Field label="Adjuntar multimedia">
            <select className="input" value={d.media ?? "none"} onChange={(e) => onChange({ media: e.target.value as DemanduNodeData["media"] })}>
              <option value="none">Ninguno</option>
              <option value="image">Imagen</option>
              <option value="video">Video</option>
              <option value="file">Archivo</option>
            </select>
          </Field>
          <Field label="Retraso de escritura (seg)">
            <input
              type="number" min={0} step={0.5} className="input"
              value={d.typingDelay ?? 1}
              onChange={(e) => onChange({ typingDelay: Number(e.target.value) })}
            />
          </Field>
        </>
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

      {/* ── Sección compartida: Acciones al llegar al nodo ── */}
      <SectionTitle>Acciones al llegar</SectionTitle>
      {actions.map((a, i) => {
        const am = ACTION_META[a.type];
        return (
          <div key={a.id} className="mb-2 flex items-center gap-2.5 rounded-xl border border-surface-border bg-surface-raised px-2.5 py-2">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-pink/10 text-sm">{am.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-white">{am.label}</div>
              {ACTION_SOURCE[a.type] ? (
                (() => {
                  const list = (catalogs?.[ACTION_SOURCE[a.type]!] ?? []) as any[];
                  return (
                    <select
                      className="w-full border-b border-dashed border-surface-border bg-transparent py-0.5 text-xs text-white focus:border-pink focus:outline-none"
                      value={a.value ?? ""}
                      onChange={(e) => updateAction(i, e.target.value)}
                    >
                      {list.length === 0 ? (
                        <option value="" className="bg-surface-card text-muted">— crea uno en Configuración —</option>
                      ) : (
                        <>
                          <option value="" className="bg-surface-card">Selecciona…</option>
                          {list.map((item) => (
                            <option key={item.id} value={item.id} className="bg-surface-card">
                              {item.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  );
                })()
              ) : (
                <input
                  className="w-full border-b border-dashed border-surface-border bg-transparent py-0.5 text-xs text-white focus:border-pink focus:outline-none"
                  value={a.value ?? ""}
                  placeholder={am.placeholder}
                  onChange={(e) => updateAction(i, e.target.value)}
                />
              )}
            </div>
            <button className="flex-none text-muted-2 hover:text-danger" onClick={() => removeAction(i)} title="Quitar">✕</button>
          </div>
        );
      })}

      <div className="relative">
        <button
          className="w-full rounded-xl border border-dashed border-surface-border py-2.5 text-xs text-muted hover:border-pink hover:text-pink"
          onClick={() => setMenuOpen((o) => !o)}
        >
          ＋ Agregar acción
        </button>
        {menuOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-surface-border bg-surface-card p-1.5 shadow-card">
            {ACTION_ORDER.map((k) => (
              <button
                key={k}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-white hover:bg-surface-raised"
                onClick={() => addAction(k)}
              >
                <span>{ACTION_META[k].icon}</span> {ACTION_META[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {node.type !== "end" && (
        <>
          <SectionTitle>Siguiente paso</SectionTitle>
          <select className="input">
            <option>{node.data.to ?? "—"}</option>
          </select>
        </>
      )}

      <button className="mt-4 w-full rounded-xl bg-demandu-gradient py-3 font-display text-sm font-bold text-white">
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 flex items-center gap-2.5">
      <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-2">{children}</span>
      <span className="h-px flex-1 bg-surface-border" />
    </div>
  );
}
