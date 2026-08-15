"use client";

import { useEffect, useState } from "react";
import {
  NODE_META, ACTION_META, ACTION_ORDER,
  type DemanduNode, type DemanduNodeData, type NodeType, type NodeActionType, type FlowButton,
} from "@/lib/flow/types";
import type { Catalogs } from "@/lib/catalogs";

interface Props {
  node: DemanduNode | null;
  onChange: (patch: Partial<DemanduNodeData>) => void;
  catalogs?: Catalogs;
}

const ACTION_SOURCE: Partial<Record<NodeActionType, keyof Catalogs>> = {
  add_tag: "tags",
  remove_tag: "tags",
  assign_agent: "members",
  assign_group: "groups",
  notify_team: "teams",
  set_status: "states",
};
const NO_VALUE = new Set<NodeActionType>(["opt_out"]);

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
  const buttons = d.buttons ?? [];

  const addAction = (type: NodeActionType) => {
    onChange({ actions: [...actions, { id: `a-${Date.now()}`, type }] });
    setMenuOpen(false);
  };
  const updateAction = (i: number, value: string) =>
    onChange({ actions: actions.map((a, idx) => (idx === i ? { ...a, value } : a)) });
  const removeAction = (i: number) =>
    onChange({ actions: actions.filter((_, idx) => idx !== i) });

  const updateButton = (i: number, patch: Partial<FlowButton>) =>
    onChange({ buttons: buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const removeButton = (i: number) =>
    onChange({ buttons: buttons.filter((_, idx) => idx !== i) });
  const addButton = () =>
    onChange({ buttons: [...buttons, { id: `b${buttons.length + 1}-${Date.now()}`, label: "Nueva opción" }] });

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

      {d.text !== undefined && node.type !== "calendar" && node.type !== "media" && (
        <Field label="Mensaje">
          <textarea className="input min-h-[80px]" value={d.text} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      )}

      {/* Mensaje: adjuntos + retraso */}
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
            <input type="number" min={0} step={0.5} className="input" value={d.typingDelay ?? 1} onChange={(e) => onChange({ typingDelay: Number(e.target.value) })} />
          </Field>
        </>
      )}

      {/* Multimedia (nodo dedicado) */}
      {node.type === "media" && (
        <>
          <Field label="Tipo de archivo">
            <select className="input" value={d.mediaType ?? "image"} onChange={(e) => onChange({ mediaType: e.target.value as DemanduNodeData["mediaType"] })}>
              <option value="image">Imagen</option>
              <option value="video">Video</option>
              <option value="file">Archivo / Documento</option>
            </select>
          </Field>
          <Field label="URL del archivo">
            <input className="input" value={d.mediaUrl ?? ""} placeholder="https://…" onChange={(e) => onChange({ mediaUrl: e.target.value })} />
          </Field>
          {d.mediaUrl && d.mediaType === "image" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={d.mediaUrl} alt="preview" className="mb-4 max-h-40 w-full rounded-xl border border-surface-border object-cover" />
          )}
          <Field label="Texto / caption (opcional)">
            <textarea className="input min-h-[60px]" value={d.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} />
          </Field>
        </>
      )}

      {/* Botones: por opción (texto, keywords, etiqueta) */}
      {node.type === "buttons" && (
        <Field label="Opciones">
          {buttons.map((b, i) => (
            <div key={b.id} className="mb-3 rounded-xl border border-surface-border bg-surface-raised p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-muted-2">⿴</span>
                <input
                  className="flex-1 bg-transparent text-sm font-medium text-white focus:outline-none"
                  value={b.label}
                  placeholder="Texto del botón"
                  onChange={(e) => updateButton(i, { label: e.target.value })}
                />
                <button className="text-muted-2 hover:text-danger" onClick={() => removeButton(i)} title="Quitar">✕</button>
              </div>
              <div className="mt-2 space-y-2 border-t border-surface-border pt-2">
                <input
                  className="w-full rounded-lg bg-surface-card px-2 py-1.5 text-xs text-white placeholder:text-muted-2 focus:outline-none"
                  value={b.keywords ?? ""}
                  placeholder="Palabras clave (separadas por coma)"
                  onChange={(e) => updateButton(i, { keywords: e.target.value })}
                />
                <select
                  className="w-full rounded-lg bg-surface-card px-2 py-1.5 text-xs text-white focus:outline-none"
                  value={b.tagIds?.[0] ?? ""}
                  onChange={(e) => updateButton(i, { tagIds: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">🏷️ Etiqueta al elegir… (opcional)</option>
                  {(catalogs?.tags ?? []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <button className="w-full rounded-xl border border-dashed border-surface-border py-2.5 text-xs text-muted hover:border-pink hover:text-pink" onClick={addButton}>
            ＋ Agregar opción
          </button>
        </Field>
      )}

      {/* Pregunta: validación + reintentos */}
      {node.type === "question" && (
        <>
          <Field label="Guardar respuesta en variable / atributo">
            <input className="input" value={d.variable ?? ""} placeholder="@ciudad" onChange={(e) => onChange({ variable: e.target.value })} />
          </Field>
          <Field label="Validar como">
            <select className="input" value={d.dataType ?? "text"} onChange={(e) => onChange({ dataType: e.target.value as DemanduNodeData["dataType"] })}>
              <option value="text">Texto libre</option>
              <option value="number">Número</option>
              <option value="email">Email</option>
              <option value="phone">Teléfono</option>
            </select>
          </Field>
          <div className="mb-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={d.required ?? true} onChange={(e) => onChange({ required: e.target.checked })} className="accent-pink" />
              Obligatoria
            </label>
            <div className="flex items-center gap-2 text-sm text-muted">
              Reintentos
              <input type="number" min={0} max={10} className="w-16 rounded-lg border border-surface-border bg-surface-raised px-2 py-1 text-sm text-white focus:outline-none" value={d.retries ?? 2} onChange={(e) => onChange({ retries: Number(e.target.value) })} />
            </div>
          </div>
          <Field label="Mensaje si la respuesta no es válida">
            <input className="input" value={d.errorMessage ?? ""} placeholder="Por favor ingresa un dato válido" onChange={(e) => onChange({ errorMessage: e.target.value })} />
          </Field>
        </>
      )}

      {/* Espera */}
      {node.type === "delay" && (
        <Field label="Duración de la espera">
          <div className="flex gap-2">
            <input type="number" min={1} className="input w-24" value={d.delayValue ?? 1} onChange={(e) => onChange({ delayValue: Number(e.target.value) })} />
            <select className="input flex-1" value={d.delayUnit ?? "seconds"} onChange={(e) => onChange({ delayUnit: e.target.value as DemanduNodeData["delayUnit"] })}>
              <option value="seconds">segundos</option>
              <option value="minutes">minutos</option>
              <option value="hours">horas</option>
            </select>
          </div>
        </Field>
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
          <select className="input" value={d.team ?? ""} onChange={(e) => onChange({ team: e.target.value })}>
            <option value="">Sin equipo específico</option>
            {(catalogs?.teams ?? []).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Asignar chat: lógica de reparto */}
      {node.type === "assign" && (
        <>
          <Field label="Repartir por">
            <select className="input" value={d.assignBy ?? "round_robin"} onChange={(e) => onChange({ assignBy: e.target.value as DemanduNodeData["assignBy"] })}>
              <option value="round_robin">Round-robin (equitativo)</option>
              <option value="team">Equipo específico</option>
              <option value="member">Miembro específico</option>
            </select>
          </Field>
          {(d.assignBy ?? "round_robin") !== "member" && (
            <Field label={d.assignBy === "team" ? "Equipo" : "Equipo (para el round-robin, opcional)"}>
              <select className="input" value={d.teamId ?? ""} onChange={(e) => onChange({ teamId: e.target.value })}>
                <option value="">{d.assignBy === "team" ? "Selecciona…" : "Todos los agentes"}</option>
                {(catalogs?.teams ?? []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          )}
          {d.assignBy === "member" && (
            <Field label="Miembro">
              <select className="input" value={d.memberId ?? ""} onChange={(e) => onChange({ memberId: e.target.value })}>
                <option value="">Selecciona…</option>
                {(catalogs?.members ?? []).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="mb-2 space-y-2">
            <Toggle label="Solo en horario laboral" checked={d.businessHoursOnly ?? false} onChange={(v) => onChange({ businessHoursOnly: v })} />
            <Toggle label="No asignar a agentes offline" checked={d.skipOffline ?? true} onChange={(v) => onChange({ skipOffline: v })} />
            <Toggle label="Esperar a que un agente tome el chat" checked={d.waitForAssignment ?? true} onChange={(v) => onChange({ waitForAssignment: v })} />
          </div>
          <p className="mb-4 text-[11px] text-muted-2">
            El horario laboral se define en <b className="text-muted">Configuración → Horario laboral</b>.
          </p>
        </>
      )}

      {/* Redirigir a otro flujo/bot */}
      {node.type === "redirect" && (
        <Field label="Redirigir a otro bot / flujo">
          <select className="input" value={d.targetBotId ?? ""} onChange={(e) => onChange({ targetBotId: e.target.value })}>
            <option value="">Selecciona un bot…</option>
            {(catalogs?.bots ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
      )}

      {/* ── Acciones compartidas ── */}
      <SectionTitle>Acciones al llegar</SectionTitle>
      {actions.map((a, i) => {
        const am = ACTION_META[a.type];
        return (
          <div key={a.id} className="mb-2 flex items-center gap-2.5 rounded-xl border border-surface-border bg-surface-raised px-2.5 py-2">
            <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-pink/10 text-sm">{am.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-white">{am.label}</div>
              {NO_VALUE.has(a.type) ? (
                <div className="text-[11px] leading-snug text-muted-2">
                  Marca al contacto como dado de baja: no recibirá campañas ni plantillas de WhatsApp, aunque esté en un CSV o grupo.
                </div>
              ) : ACTION_SOURCE[a.type] ? (
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
                            <option key={item.id} value={item.id} className="bg-surface-card">{item.name}</option>
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
              <button key={k} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-white hover:bg-surface-raised" onClick={() => addAction(k)}>
                <span>{ACTION_META[k].icon}</span> {ACTION_META[k].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {node.type !== "end" && (
        <>
          <SectionTitle>Siguiente paso</SectionTitle>
          <p className="text-xs text-muted-2">Conecta este nodo arrastrando desde su punto de salida (•) hacia otro nodo en el lienzo.</p>
        </>
      )}
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-surface-border bg-surface-raised px-3 py-2 text-sm text-muted">
      {label}
      <span
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={`relative h-5 w-9 flex-none rounded-full transition ${checked ? "bg-gradient-to-r from-pink to-violet" : "bg-surface-border"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </label>
  );
}
