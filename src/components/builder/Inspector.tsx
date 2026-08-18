"use client";

import { useEffect, useState } from "react";
import {
  NODE_META, ACTION_META, ACTION_ORDER, OPERATOR_LABEL, OPERATORS_WITHOUT_VALUE,
  type DemanduNode, type DemanduNodeData, type NodeType, type NodeActionType, type FlowButton,
  type ConditionBranch, type ConditionRule, type ConditionOperator,
} from "@/lib/flow/types";
import type { Catalogs } from "@/lib/catalogs";
import { MediaUpload } from "./MediaUpload";
import { LanaAvatar } from "@/components/Lana";

interface Props {
  node: DemanduNode | null;
  onChange: (patch: Partial<DemanduNodeData>) => void;
  onDelete?: (id: string) => void;
  onSetStart?: (id: string) => void;
  catalogs?: Catalogs;
  orgId?: string | null;
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

export function Inspector({ node, onChange, onDelete, onSetStart, catalogs, orgId }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [node?.id]);

  if (!node) {
    return (
      <div className="w-[380px] max-w-[88vw] flex-none border-l border-surface-border bg-surface p-5 text-sm text-muted-2">
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

  // ── Condición: ramas y reglas ──
  const conditions = d.conditions ?? [];
  const setConditions = (next: ConditionBranch[]) => onChange({ conditions: next });
  const addBranch = () =>
    setConditions([
      ...conditions,
      { id: `c-${Date.now()}`, label: `Condición ${conditions.length + 1}`, match: "all", rules: [{ id: `r-${Date.now()}`, operator: "equals" }] },
    ]);
  const updateBranch = (bi: number, patch: Partial<ConditionBranch>) =>
    setConditions(conditions.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const removeBranch = (bi: number) => setConditions(conditions.filter((_, i) => i !== bi));
  const addRule = (bi: number) =>
    updateBranch(bi, { rules: [...conditions[bi].rules, { id: `r-${Date.now()}`, operator: "equals" }] });
  const updateRule = (bi: number, ri: number, patch: Partial<ConditionRule>) =>
    updateBranch(bi, { rules: conditions[bi].rules.map((r, i) => (i === ri ? { ...r, ...patch } : r)) });
  const removeRule = (bi: number, ri: number) =>
    updateBranch(bi, { rules: conditions[bi].rules.filter((_, i) => i !== ri) });

  const updateButton = (i: number, patch: Partial<FlowButton>) =>
    onChange({ buttons: buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const removeButton = (i: number) =>
    onChange({ buttons: buttons.filter((_, idx) => idx !== i) });
  const addButton = () =>
    onChange({ buttons: [...buttons, { id: `b${buttons.length + 1}-${Date.now()}`, label: "Nueva opción" }] });

  const toggleId = (arr: string[] | undefined, id: string) => {
    const set = new Set(arr ?? []);
    if (set.has(id)) set.delete(id); else set.add(id);
    return Array.from(set);
  };

  return (
    <div className="w-[380px] max-w-[88vw] flex-none overflow-auto border-l border-surface-border bg-surface p-5">
      <div className="mb-1 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-xl text-base" style={{ background: meta.bg, color: meta.color }}>
          {meta.icon}
        </span>
        <h3 className="font-display text-base font-semibold text-white">{meta.label}</h3>
      </div>

      {/* Lana explica este bloque (texto ahora; mini-video por bloque después) */}
      <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-pink/25 bg-pink/5 p-3">
        <LanaAvatar size={34} />
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-pink">Lana explica</div>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">{meta.description}</p>
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-surface-border bg-surface-raised px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-pink hover:text-pink"
          >
            ▶ Ver tutorial (30 seg)
          </button>
        </div>
      </div>
      <p className="mb-4 text-[10px] text-muted-2">ID: {node.id}</p>

      {onSetStart && (
        d.isStart ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2.5 text-xs font-semibold text-success">
            <span>▶</span> Este es el nodo de inicio de la conversación
          </div>
        ) : (
          <button
            onClick={() => onSetStart(node.id)}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-raised py-2.5 text-xs font-semibold text-muted transition hover:border-success hover:text-success"
          >
            ▶ Marcar como inicio de la conversación
          </button>
        )
      )}

      <Field label="Título del nodo">
        <input className="input" value={d.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>

      {d.text !== undefined &&
        !["calendar", "media", "api", "whatsapp_flow", "payment", "catalog", "template", "condition", "tags", "action", "ig_story", "ig_comment", "fb_comment", "web_form"].includes(node.type) && (
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
          <Field label="Archivo">
            <MediaUpload
              orgId={orgId ?? null}
              kind={(d.mediaType ?? "image") as "image" | "video" | "file"}
              value={d.mediaUrl}
              fileName={d.mediaName}
              onUploaded={(patch) => onChange(patch)}
            />
          </Field>
          <details className="mb-4">
            <summary className="cursor-pointer text-[11px] text-muted-2 hover:text-muted">o pegar una URL manualmente</summary>
            <input className="input mt-2" value={d.mediaUrl ?? ""} placeholder="https://…" onChange={(e) => onChange({ mediaUrl: e.target.value, mediaName: "" })} />
          </details>
          <Field label="Texto / caption (opcional)">
            <textarea className="input min-h-[60px]" value={d.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} />
          </Field>
        </>
      )}

      {/* Botones / Selección única: opciones + ajustes por opción + avanzado */}
      {node.type === "buttons" && (
        <>
          <Field label="Opciones (el contacto elige una)">
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

                <input
                  className="mt-2 w-full rounded-lg bg-surface-card px-2 py-1.5 text-xs text-white placeholder:text-muted-2 focus:outline-none"
                  value={b.keywords ?? ""}
                  placeholder="Palabras clave que también la disparan (coma)"
                  onChange={(e) => updateButton(i, { keywords: e.target.value })}
                />

                {/* Ajustes por opción (equivalente al engranaje de Single Choice) */}
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-[11px] font-semibold text-muted-2 hover:text-muted">
                    ⚙️ Al elegir esta opción…
                  </summary>
                  <div className="mt-2 space-y-2 border-t border-surface-border pt-2">
                    <select
                      className="w-full rounded-lg bg-surface-card px-2 py-1.5 text-xs text-white focus:outline-none"
                      value={b.tagIds?.[0] ?? ""}
                      onChange={(e) => updateButton(i, { tagIds: e.target.value ? [e.target.value] : [] })}
                    >
                      <option value="">🏷️ Asignar etiqueta… (opcional)</option>
                      {(catalogs?.tags ?? []).map((t: any) => (<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                    <select
                      className="w-full rounded-lg bg-surface-card px-2 py-1.5 text-xs text-white focus:outline-none"
                      value={b.statusId ?? ""}
                      onChange={(e) => updateButton(i, { statusId: e.target.value })}
                    >
                      <option value="">🟢 Cambiar estado del chat… (opcional)</option>
                      {(catalogs?.states ?? []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                    <select
                      className="w-full rounded-lg bg-surface-card px-2 py-1.5 text-xs text-white focus:outline-none"
                      value={b.assignMemberId ?? ""}
                      onChange={(e) => updateButton(i, { assignMemberId: e.target.value })}
                    >
                      <option value="">🧑‍💼 Asignar a un agente… (opcional)</option>
                      {(catalogs?.members ?? []).map((m: any) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                    </select>
                  </div>
                </details>
              </div>
            ))}
            <button className="w-full rounded-xl border border-dashed border-surface-border py-2.5 text-xs text-muted hover:border-pink hover:text-pink" onClick={addButton}>
              ＋ Agregar opción
            </button>
          </Field>

          {/* Guardar la opción elegida en un atributo (mejora sobre BotPenguin) */}
          <Field label="Guardar la opción elegida en el atributo (opcional)">
            {(catalogs?.attributes ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-2">Crea atributos en Configuración → Atributos para poder guardar la elección.</p>
            ) : (
              <select className="input" value={d.variable ?? ""} onChange={(e) => onChange({ variable: e.target.value })}>
                <option value="">No guardar</option>
                {(catalogs?.attributes ?? []).map((a: any) => (
                  <option key={a.id} value={a.key}>{a.name} · {`{{${a.key}}}`}</option>
                ))}
              </select>
            )}
          </Field>

          <SectionTitle>Opciones avanzadas</SectionTitle>
          <div className="mb-3 space-y-2">
            <Toggle label="Permitir regresar" checked={d.allowBack ?? false} onChange={(v) => onChange({ allowBack: v })} />
            <Toggle label="Permitir omitir la pregunta" checked={d.allowSkip ?? false} onChange={(v) => onChange({ allowSkip: v })} />
            <Toggle label="Omitir si el contacto ya respondió antes" checked={d.skipIfAnswered ?? false} onChange={(v) => onChange({ skipIfAnswered: v })} />
            <Toggle label="Notificarme cuando respondan" checked={d.notifyOnResponse ?? false} onChange={(v) => onChange({ notifyOnResponse: v })} />
            <Toggle label="Incluir en Leads" checked={d.includeInLeads ?? false} onChange={(v) => onChange({ includeInLeads: v })} />
          </div>
          <Field label="Retraso antes de mostrar el mensaje (seg)">
            <input type="number" min={0} step={0.5} className="input w-28" value={d.typingDelay ?? 0} onChange={(e) => onChange({ typingDelay: Number(e.target.value) })} />
          </Field>
        </>
      )}

      {/* Pregunta: validación + reintentos */}
      {node.type === "question" && (
        <>
          <Field label="Guardar la respuesta en el atributo">
            {(catalogs?.attributes ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-border px-3 py-3 text-[11px] text-muted-2">
                Aún no tienes atributos. Créalos en <a href="/settings/attributes" target="_blank" className="font-semibold text-pink hover:underline">Configuración → Atributos</a> y aquí podrás elegirlos.
              </div>
            ) : (
              <>
                <select
                  className="input"
                  value={d.variable ?? ""}
                  onChange={(e) => {
                    const attr = (catalogs?.attributes ?? []).find((a: any) => a.key === e.target.value);
                    const map: Record<string, DemanduNodeData["dataType"]> = { string: "text", number: "number", float: "number", email: "email", phone: "phone" };
                    onChange({ variable: e.target.value, dataType: (attr && map[attr.type]) || d.dataType });
                  }}
                >
                  <option value="">Selecciona un atributo…</option>
                  {(catalogs?.attributes ?? []).map((a: any) => (
                    <option key={a.id} value={a.key}>{a.name} · {`{{${a.key}}}`}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-2">
                  ¿Falta uno? Créalo en <a href="/settings/attributes" target="_blank" className="text-pink hover:underline">Configuración → Atributos</a>.
                </p>
              </>
            )}
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
          {!catalogs?.googleCalendarConnected ? (
            <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-muted">
              Aún no has conectado Google Calendar. Conéctalo en{" "}
              <a href="/settings/integrations" target="_blank" className="font-semibold text-pink hover:underline">Configuración → Integraciones</a>{" "}
              y luego elige aquí el calendario.
            </div>
          ) : (
            <Field label="Calendario de Google">
              <select className="input" value={d.calendarId ?? ""} onChange={(e) => onChange({ calendarId: e.target.value })}>
                <option value="">Selecciona un calendario…</option>
                {(catalogs?.calendars ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.summary}{c.primary ? " (principal)" : ""}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Duración de la cita">
            <div className="flex items-center gap-2">
              <input type="number" min={5} step={5} className="input w-28" value={d.durationMin ?? 30} onChange={(e) => onChange({ durationMin: Number(e.target.value) })} />
              <span className="text-sm text-muted-2">minutos</span>
            </div>
          </Field>
          <Field label="Mensaje al ofrecer horarios">
            <textarea className="input min-h-[70px]" value={d.text ?? ""} placeholder="Estos son los horarios disponibles para tu cita:" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>

          <SectionTitle>Datos del cliente en el evento</SectionTitle>
          {(catalogs?.attributes ?? []).length === 0 ? (
            <p className="mb-3 text-[11px] text-muted-2">
              Crea atributos (correo, nombre, empresa) en <a href="/settings/attributes" target="_blank" className="text-pink hover:underline">Configuración → Atributos</a> y captúralos con un nodo Pregunta antes de esta cita.
            </p>
          ) : (
            <>
              <Field label="Correo del cliente (se invita al evento)">
                <select className="input" value={d.attendeeAttr ?? ""} onChange={(e) => onChange({ attendeeAttr: e.target.value })}>
                  <option value="">Sin invitado</option>
                  {(catalogs?.attributes ?? []).map((a: any) => (
                    <option key={a.id} value={a.key}>{a.name} · {`{{${a.key}}}`}</option>
                  ))}
                </select>
              </Field>
              <div className="flex gap-2">
                <Field label="Nombre del cliente">
                  <select className="input" value={d.nameAttr ?? ""} onChange={(e) => onChange({ nameAttr: e.target.value })}>
                    <option value="">—</option>
                    {(catalogs?.attributes ?? []).map((a: any) => (<option key={a.id} value={a.key}>{a.name}</option>))}
                  </select>
                </Field>
                <Field label="Empresa">
                  <select className="input" value={d.companyAttr ?? ""} onChange={(e) => onChange({ companyAttr: e.target.value })}>
                    <option value="">—</option>
                    {(catalogs?.attributes ?? []).map((a: any) => (<option key={a.id} value={a.key}>{a.name}</option>))}
                  </select>
                </Field>
              </div>
              <p className="mb-2 text-[11px] text-muted-2">
                El título del evento será <b className="text-muted">“Cita — Nombre · Empresa”</b> y se enviará invitación al correo.
              </p>
            </>
          )}

          <p className="mb-4 text-[11px] text-muted-2">
            La disponibilidad respeta tu <b className="text-muted">Horario laboral</b> (Configuración → Horario laboral) y evita traslapes con eventos existentes.
          </p>
        </>
      )}

      {node.type === "human" && (
        <>
          <Field label="Asignar a equipo">
            <select className="input" value={d.team ?? ""} onChange={(e) => onChange({ team: e.target.value })}>
              <option value="">Sin equipo específico</option>
              {(catalogs?.teams ?? []).map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="O a un agente específico (opcional)">
            <select className="input" value={d.memberId ?? ""} onChange={(e) => onChange({ memberId: e.target.value })}>
              <option value="">Cualquiera del equipo</option>
              {(catalogs?.members ?? []).map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <div className="mb-3 space-y-2">
            <Toggle label="Notificar al equipo cuando entre el chat" checked={d.notifyTeam ?? true} onChange={(v) => onChange({ notifyTeam: v })} />
            <Toggle label="Solo transferir en horario laboral" checked={d.businessHoursOnly ?? false} onChange={(v) => onChange({ businessHoursOnly: v })} />
          </div>
          {d.businessHoursOnly && (
            <Field label="Mensaje fuera de horario">
              <textarea className="input min-h-[60px]" value={d.offlineMessage ?? ""} placeholder="Ahora no hay asesores disponibles. Déjanos tu mensaje y te contactamos pronto." onChange={(e) => onChange({ offlineMessage: e.target.value })} />
            </Field>
          )}
          <p className="mb-4 text-[11px] text-muted-2">
            El horario laboral se define en <b className="text-muted">Configuración → Horario laboral</b>.
          </p>
        </>
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

      {/* ── Etiquetar: asignar/quitar etiquetas + grupo de leads ── */}
      {node.type === "tags" && (
        <>
          <Field label="Etiquetas a asignar">
            <TagChips
              options={catalogs?.tags ?? []}
              selected={d.tagIdsAdd ?? []}
              onToggle={(id) => onChange({ tagIdsAdd: toggleId(d.tagIdsAdd, id) })}
              empty="Crea etiquetas en Configuración → Etiquetas."
            />
          </Field>
          <Field label="Etiquetas a quitar (opcional)">
            <TagChips
              options={catalogs?.tags ?? []}
              selected={d.tagIdsRemove ?? []}
              onToggle={(id) => onChange({ tagIdsRemove: toggleId(d.tagIdsRemove, id) })}
            />
          </Field>
          <Field label="Agregar a grupo de leads (opcional)">
            <select className="input" value={d.leadGroupId ?? ""} onChange={(e) => onChange({ leadGroupId: e.target.value })}>
              <option value="">Ninguno</option>
              {(catalogs?.groups ?? []).map((g: any) => (<option key={g.id} value={g.id}>{g.name}</option>))}
            </select>
          </Field>
        </>
      )}

      {/* ── Acción / Webhook: disparo a un endpoint (sin ramificar) ── */}
      {node.type === "action" && (
        <>
          <Field label="URL del webhook">
            <input className="input" value={d.apiUrl ?? ""} placeholder="https://tu-servicio.com/webhook" onChange={(e) => onChange({ apiUrl: e.target.value })} />
          </Field>
          <Field label="Método">
            <select className="input" value={d.apiMethod ?? "POST"} onChange={(e) => onChange({ apiMethod: e.target.value as DemanduNodeData["apiMethod"] })}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </Field>
          <Field label="Headers (JSON, opcional)">
            <textarea className="input min-h-[56px] font-mono text-xs" value={d.apiHeaders ?? ""} placeholder={'{ "Authorization": "Bearer {{token}}" }'} onChange={(e) => onChange({ apiHeaders: e.target.value })} />
          </Field>
          {(d.apiMethod === "POST" || d.apiMethod === "PUT" || !d.apiMethod) && (
            <Field label="Body (JSON, opcional)">
              <textarea className="input min-h-[64px] font-mono text-xs" value={d.apiBody ?? ""} placeholder={'{ "telefono": "{{telefono}}" }'} onChange={(e) => onChange({ apiBody: e.target.value })} />
            </Field>
          )}
          <p className="mb-4 text-[11px] text-muted-2">
            Se dispara al llegar al nodo (sin esperar la respuesta). Si necesitas ramificar según el resultado, usa el nodo <b className="text-muted">Acción API</b>.
          </p>
        </>
      )}

      {/* ── Fin: estado final + reapertura ── */}
      {node.type === "end" && (
        <>
          <Field label="Estado final de la conversación">
            <select className="input" value={d.finalStatusId ?? ""} onChange={(e) => onChange({ finalStatusId: e.target.value })}>
              <option value="">No cambiar</option>
              {(catalogs?.states ?? []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </Field>
          <div className="mb-2">
            <Toggle label="Reabrir si el contacto escribe de nuevo" checked={d.reopenOnMessage ?? true} onChange={(v) => onChange({ reopenOnMessage: v })} />
          </div>
          <p className="mb-4 text-[11px] text-muted-2">Este nodo cierra el flujo. El mensaje de arriba es la despedida que verá el contacto.</p>
        </>
      )}

      {/* ── Condición: ramas con reglas (atributo · operador · valor) ── */}
      {node.type === "condition" && (
        <>
          <p className="mb-3 text-[11px] text-muted-2">
            Las ramas se evalúan de arriba hacia abajo. El contacto sigue la primera que se cumpla; si ninguna aplica, toma la salida <b className="text-muted">En caso contrario</b>.
          </p>
          {conditions.map((br, bi) => (
            <div key={br.id} className="mb-3 rounded-xl border border-warning/40 bg-surface-raised p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-warning">⑂</span>
                <input
                  className="flex-1 bg-transparent text-sm font-semibold text-white focus:outline-none"
                  value={br.label}
                  placeholder="Nombre de la rama"
                  onChange={(e) => updateBranch(bi, { label: e.target.value })}
                />
                <button className="text-muted-2 hover:text-danger" onClick={() => removeBranch(bi)} title="Quitar rama">✕</button>
              </div>

              {br.rules.length > 1 && (
                <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-2">
                  Se cumple si
                  <select
                    className="rounded-md bg-surface-card px-1.5 py-1 text-[11px] text-white focus:outline-none"
                    value={br.match}
                    onChange={(e) => updateBranch(bi, { match: e.target.value as "all" | "any" })}
                  >
                    <option value="all">TODAS las reglas (Y)</option>
                    <option value="any">CUALQUIER regla (O)</option>
                  </select>
                </div>
              )}

              {br.rules.map((r, ri) => {
                const noValue = OPERATORS_WITHOUT_VALUE.includes(r.operator);
                return (
                  <div key={r.id} className="mb-1.5 space-y-1.5 rounded-lg bg-surface-card p-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        className="min-w-0 flex-1 rounded-md bg-surface-raised px-1.5 py-1 text-xs text-white focus:outline-none"
                        value={r.attribute ?? ""}
                        onChange={(e) => updateRule(bi, ri, { attribute: e.target.value })}
                      >
                        <option value="">Atributo…</option>
                        {(catalogs?.attributes ?? []).map((a: any) => (
                          <option key={a.id} value={a.key}>{a.name}</option>
                        ))}
                      </select>
                      <button className="flex-none text-muted-2 hover:text-danger" onClick={() => removeRule(bi, ri)} title="Quitar regla">✕</button>
                    </div>
                    <select
                      className="w-full rounded-md bg-surface-raised px-1.5 py-1 text-xs text-white focus:outline-none"
                      value={r.operator}
                      onChange={(e) => updateRule(bi, ri, { operator: e.target.value as ConditionOperator })}
                    >
                      {(Object.keys(OPERATOR_LABEL) as ConditionOperator[]).map((op) => (
                        <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>
                      ))}
                    </select>
                    {!noValue && (
                      <input
                        className="w-full rounded-md bg-surface-raised px-2 py-1 text-xs text-white placeholder:text-muted-2 focus:outline-none"
                        value={r.value ?? ""}
                        placeholder="Valor a comparar"
                        onChange={(e) => updateRule(bi, ri, { value: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
              <button
                className="mt-1 w-full rounded-lg border border-dashed border-surface-border py-1.5 text-[11px] text-muted hover:border-pink hover:text-pink"
                onClick={() => addRule(bi)}
              >
                ＋ Agregar regla (Y/O)
              </button>
            </div>
          ))}
          <button
            className="w-full rounded-xl border border-dashed border-surface-border py-2.5 text-xs text-muted hover:border-pink hover:text-pink"
            onClick={addBranch}
          >
            ＋ Agregar rama
          </button>
          {(catalogs?.attributes ?? []).length === 0 && (
            <p className="mt-2 text-[11px] text-muted-2">
              Crea atributos en <a href="/settings/attributes" target="_blank" className="text-pink hover:underline">Configuración → Atributos</a> para poder compararlos aquí.
            </p>
          )}
        </>
      )}

      {/* ── Acción API: request + ramas por respuesta ── */}
      {node.type === "api" && (
        <>
          <Field label="URL del endpoint">
            <input className="input" value={d.apiUrl ?? ""} placeholder="https://api.tu-servicio.com/…" onChange={(e) => onChange({ apiUrl: e.target.value })} />
          </Field>
          <Field label="Método">
            <select className="input" value={d.apiMethod ?? "GET"} onChange={(e) => onChange({ apiMethod: e.target.value as DemanduNodeData["apiMethod"] })}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </Field>
          <Field label="Headers (JSON, opcional)">
            <textarea className="input min-h-[60px] font-mono text-xs" value={d.apiHeaders ?? ""} placeholder={'{ "Authorization": "Bearer {{token}}" }'} onChange={(e) => onChange({ apiHeaders: e.target.value })} />
          </Field>
          {(d.apiMethod === "POST" || d.apiMethod === "PUT") && (
            <Field label="Body (JSON, opcional)">
              <textarea className="input min-h-[70px] font-mono text-xs" value={d.apiBody ?? ""} placeholder={'{ "telefono": "{{@telefono}}" }'} onChange={(e) => onChange({ apiBody: e.target.value })} />
            </Field>
          )}
          <Field label="Ramas por respuesta">
            {buttons.map((b, i) => (
              <div key={b.id} className="mb-2 flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised p-2.5">
                <span className="text-muted-2">⿴</span>
                <input
                  className="flex-1 bg-transparent text-sm font-medium text-white focus:outline-none"
                  value={b.label}
                  placeholder="Nombre de la rama"
                  onChange={(e) => updateButton(i, { label: e.target.value })}
                />
                <button className="text-muted-2 hover:text-danger" onClick={() => removeButton(i)} title="Quitar">✕</button>
              </div>
            ))}
            <button className="w-full rounded-xl border border-dashed border-surface-border py-2.5 text-xs text-muted hover:border-pink hover:text-pink" onClick={addButton}>
              ＋ Agregar rama
            </button>
            <p className="mt-2 text-[11px] text-muted-2">Cada rama tiene su propio punto de salida (•). Conéctalas según el resultado de la API (ej. éxito 2xx, error 4xx/5xx).</p>
          </Field>
        </>
      )}

      {/* ── WhatsApp Flow: formulario nativo ── */}
      {node.type === "whatsapp_flow" && (
        <>
          <Field label="Flow ID (Meta)">
            <input className="input" value={d.waFlowId ?? ""} placeholder="1234567890" onChange={(e) => onChange({ waFlowId: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Field label="Pantalla inicial"><input className="input" value={d.waFlowScreen ?? ""} placeholder="WELCOME" onChange={(e) => onChange({ waFlowScreen: e.target.value })} /></Field>
            <Field label="Versión"><input className="input" value={d.waFlowVersion ?? "3"} onChange={(e) => onChange({ waFlowVersion: e.target.value })} /></Field>
          </div>
          <Field label="Encabezado (opcional)">
            <input className="input" value={d.waHeader ?? ""} onChange={(e) => onChange({ waHeader: e.target.value })} />
          </Field>
          <Field label="Cuerpo del mensaje">
            <textarea className="input min-h-[70px]" value={d.waBody ?? ""} placeholder="Completa el siguiente formulario para continuar." onChange={(e) => onChange({ waBody: e.target.value })} />
          </Field>
          <Field label="Pie de página (opcional)">
            <input className="input" value={d.waFooter ?? ""} onChange={(e) => onChange({ waFooter: e.target.value })} />
          </Field>
          <Field label="Texto del botón (CTA)">
            <input className="input" value={d.waFlowCta ?? ""} placeholder="Abrir formulario" onChange={(e) => onChange({ waFlowCta: e.target.value })} />
          </Field>
        </>
      )}

      {/* ── Pago: cobro con pasarela ── */}
      {node.type === "payment" && (
        <>
          <Field label="Pasarela">
            <select className="input" value={d.gateway ?? "stripe"} onChange={(e) => onChange({ gateway: e.target.value })}>
              <option value="stripe">Stripe</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="conekta">Conekta</option>
              <option value="paypal">PayPal</option>
            </select>
          </Field>
          <div className="flex gap-2">
            <Field label="Monto"><input className="input" value={d.amount ?? ""} placeholder="199.00 o {{@total}}" onChange={(e) => onChange({ amount: e.target.value })} /></Field>
            <Field label="Moneda">
              <select className="input" value={d.currency ?? "MXN"} onChange={(e) => onChange({ currency: e.target.value })}>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
                <option value="COP">COP</option>
                <option value="PEN">PEN</option>
                <option value="CLP">CLP</option>
                <option value="ARS">ARS</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
          </div>
          <Field label="Concepto / descripción del cobro">
            <input className="input" value={d.text ?? ""} placeholder="Anticipo de tu pedido" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <div className="mb-3">
            <Toggle label="Cobro nativo de WhatsApp Pay" checked={d.whatsappPayment ?? false} onChange={(v) => onChange({ whatsappPayment: v })} />
          </div>
          <Field label="Al pagar con éxito, ir a bot / flujo">
            <select className="input" value={d.successBotId ?? ""} onChange={(e) => onChange({ successBotId: e.target.value })}>
              <option value="">Continuar en este flujo</option>
              {(catalogs?.bots ?? []).map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
          <Field label="Si el pago falla, ir a bot / flujo">
            <select className="input" value={d.failureBotId ?? ""} onChange={(e) => onChange({ failureBotId: e.target.value })}>
              <option value="">Continuar en este flujo</option>
              {(catalogs?.bots ?? []).map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </Field>
        </>
      )}

      {/* ── Catálogo: venta de productos ── */}
      {node.type === "catalog" && (
        <>
          <Field label="ID del catálogo (Meta Commerce)">
            <input className="input" value={d.catalogId ?? ""} placeholder="ID del catálogo de WhatsApp" onChange={(e) => onChange({ catalogId: e.target.value })} />
          </Field>
          <Field label="Mensaje que acompaña el catálogo">
            <textarea className="input min-h-[60px]" value={d.text ?? ""} placeholder="Estos son nuestros productos disponibles:" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <Field label="SKUs / IDs de producto (uno por línea, opcional)">
            <textarea className="input min-h-[70px] font-mono text-xs" value={d.products ?? ""} placeholder={"sku-001\nsku-002"} onChange={(e) => onChange({ products: e.target.value })} />
          </Field>
          <p className="mb-4 text-[11px] text-muted-2">Si dejas los SKUs vacíos, se muestra el catálogo completo.</p>
        </>
      )}

      {/* ── Plantilla de WhatsApp ── */}
      {node.type === "template" && (
        <>
          <Field label="Nombre de la plantilla aprobada">
            <input className="input" value={d.templateName ?? ""} placeholder="confirmacion_pedido" onChange={(e) => onChange({ templateName: e.target.value })} />
          </Field>
          <Field label="Idioma">
            <select className="input" value={d.templateLang ?? "es_MX"} onChange={(e) => onChange({ templateLang: e.target.value })}>
              <option value="es_MX">Español (MX)</option>
              <option value="es">Español</option>
              <option value="es_ES">Español (ES)</option>
              <option value="en_US">Inglés (US)</option>
              <option value="pt_BR">Portugués (BR)</option>
            </select>
          </Field>
          <Field label="Variables / cuerpo (opcional)">
            <textarea className="input min-h-[70px]" value={d.text ?? ""} placeholder={"{{1}} = nombre\n{{2}} = folio"} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <p className="mb-4 text-[11px] text-muted-2">Las plantillas deben estar aprobadas por Meta. Solo se pueden enviar fuera de la ventana de 24 h.</p>
        </>
      )}

      {/* ── Instagram: responder historia ── */}
      {node.type === "ig_story" && (
        <>
          <Field label="Palabras clave en la historia (opcional)">
            <input className="input" value={d.triggerKeywords ?? ""} placeholder="promo, precio, info" onChange={(e) => onChange({ triggerKeywords: e.target.value })} />
          </Field>
          <Field label="Mensaje de respuesta por DM">
            <textarea className="input min-h-[70px]" value={d.text ?? ""} placeholder="¡Gracias por ver mi historia! 🙌 ¿Te ayudo con algo?" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <p className="mb-4 text-[11px] text-muted-2">Se activa cuando alguien responde o menciona tu historia de Instagram.</p>
        </>
      )}

      {/* ── Instagram/Facebook: comentario → DM ── */}
      {(node.type === "ig_comment" || node.type === "fb_comment") && (
        <>
          <Field label="Palabras clave en el comentario (opcional)">
            <input className="input" value={d.triggerKeywords ?? ""} placeholder="info, precio, quiero" onChange={(e) => onChange({ triggerKeywords: e.target.value })} />
          </Field>
          <Field label="Respuesta pública al comentario">
            <textarea className="input min-h-[56px]" value={d.publicReply ?? ""} placeholder="¡Te escribo por DM! 📩" onChange={(e) => onChange({ publicReply: e.target.value })} />
          </Field>
          <Field label="Mensaje que se envía por DM">
            <textarea className="input min-h-[70px]" value={d.text ?? ""} placeholder="Hola 👋 aquí está la info que pediste…" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <p className="mb-4 text-[11px] text-muted-2">Responde automáticamente los comentarios y sigue la conversación en privado.</p>
        </>
      )}

      {/* ── Web: formulario ── */}
      {node.type === "web_form" && (
        <>
          <Field label="Texto de introducción">
            <textarea className="input min-h-[60px]" value={d.text ?? ""} placeholder="Déjanos tus datos y te contactamos:" onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <p className="mb-4 text-[11px] text-muted-2">Captura cada dato con nodos <b className="text-muted">Pregunta</b> a continuación (nombre, correo, teléfono…).</p>
        </>
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

      {onDelete && (
        <>
          <SectionTitle>Zona de peligro</SectionTitle>
          <button
            onClick={() => onDelete(node.id)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/10 py-2.5 text-xs font-semibold text-danger transition hover:bg-danger/20"
          >
            🗑️ Eliminar nodo
          </button>
          <p className="mt-2 text-[11px] text-muted-2">También puedes seleccionar el nodo y pulsar <b className="text-muted">Supr</b> o <b className="text-muted">Retroceso</b>.</p>
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

function TagChips({
  options,
  selected,
  onToggle,
  empty,
}: {
  options: any[];
  selected: string[];
  onToggle: (id: string) => void;
  empty?: string;
}) {
  if (options.length === 0) return <p className="text-[11px] text-muted-2">{empty ?? "No hay opciones."}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              on ? "border-pink bg-pink/15 text-pink" : "border-surface-border bg-surface-raised text-muted hover:text-white"
            }`}
          >
            {on ? "✓ " : ""}{o.name}
          </button>
        );
      })}
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
