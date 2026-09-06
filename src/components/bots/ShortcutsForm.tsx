"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { RotateCcw, Headset, Info, CheckCircle2, X, Plus } from "lucide-react";
import { ATAJOS_DEFAULT, type Atajos } from "@/lib/flow/shortcuts";

/** Campo de palabras: se agregan como etiquetas, no como texto separado por comas. */
function Palabras({
  valores,
  onChange,
  placeholder,
}: {
  valores: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [texto, setTexto] = useState("");

  const agregar = () => {
    const w = texto.trim();
    if (!w) return;
    if (!valores.some((v) => v.toLowerCase() === w.toLowerCase())) onChange([...valores, w]);
    setTexto("");
  };

  return (
    <div className="rounded-xl border border-linea-2 bg-tarjeta p-2">
      <div className="flex flex-wrap gap-1.5">
        {valores.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-lg bg-suave px-2 py-1 text-sm font-medium text-ink"
          >
            {v}
            <button
              type="button"
              aria-label={`Quitar ${v}`}
              onClick={() => onChange(valores.filter((x) => x !== v))}
              className="text-ink-3 transition hover:text-danger"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                agregar();
              }
            }}
            onBlur={agregar}
            placeholder={placeholder}
            className="w-32 bg-transparent px-1 py-1 text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
          {texto && (
            <button type="button" onClick={agregar} className="text-ink-3 transition hover:text-ink">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar atajos"}
    </button>
  );
}

export function ShortcutsForm({
  botId,
  inicial,
  action,
}: {
  botId: string;
  inicial: Atajos;
  action: (estado: { ok: boolean; mensaje: string }, fd: FormData) => Promise<{ ok: boolean; mensaje: string }>;
}) {
  const [estado, formAction] = useFormState(action, { ok: false, mensaje: "" });
  const [a, setA] = useState<Atajos>(inicial);

  const set = (patch: Partial<Atajos>) => setA({ ...a, ...patch });

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <input type="hidden" name="bot_id" value={botId} />
      <input type="hidden" name="atajos" value={JSON.stringify(a)} />

      {/* Reiniciar */}
      <div className="card-l p-5">
        <label className="mb-3 flex cursor-pointer items-start justify-between gap-4">
          <span className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-violet/15 text-violet">
              <RotateCcw className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Volver al inicio</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                Si el cliente escribe alguna de estas palabras, la conversación empieza de cero. Es su salida cuando se
                pierde.
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={a.reset.enabled}
            onChange={(e) => set({ reset: { ...a.reset, enabled: e.target.checked } })}
            className="mt-1 h-5 w-5 flex-none accent-pink"
          />
        </label>

        <div className={a.reset.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-45"}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Palabras que lo activan</label>
            <Palabras
              valores={a.reset.words}
              onChange={(words) => set({ reset: { ...a.reset, words } })}
              placeholder="0, menú…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Qué contesta el bot</label>
            <input
              value={a.reset.reply}
              onChange={(e) => set({ reset: { ...a.reset, reply: e.target.value } })}
              className="input-l"
            />
          </div>
        </div>
      </div>

      {/* Agente en vivo */}
      <div className="card-l p-5">
        <label className="mb-3 flex cursor-pointer items-start justify-between gap-4">
          <span className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-pink/15 text-pink">
              <Headset className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Hablar con una persona</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                El bot se calla, la conversación se marca como <b className="text-ink-2">solicitud de chat</b> y tu
                equipo recibe un aviso al instante.
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={a.agent.enabled}
            onChange={(e) => set({ agent: { ...a.agent, enabled: e.target.checked } })}
            className="mt-1 h-5 w-5 flex-none accent-pink"
          />
        </label>

        <div className={a.agent.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-45"}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Palabras que lo activan</label>
            <Palabras
              valores={a.agent.words}
              onChange={(words) => set({ agent: { ...a.agent, words } })}
              placeholder="1, asesor…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Qué contesta el bot</label>
            <input
              value={a.agent.reply}
              onChange={(e) => set({ agent: { ...a.agent, reply: e.target.value } })}
              className="input-l"
            />
          </div>
        </div>
      </div>

      {/* Recordatorio */}
      <div className="card-l p-5">
        <label className="mb-3 flex cursor-pointer items-start justify-between gap-4">
          <span className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-warning/20 text-aviso">
              <Info className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink">Recordarle al cliente que existen</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                Si nadie sabe que puede escribir “0”, nadie lo escribe. Este mensajito se lo dice.
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={a.hint.enabled}
            onChange={(e) => set({ hint: { ...a.hint, enabled: e.target.checked } })}
            className="mt-1 h-5 w-5 flex-none accent-pink"
          />
        </label>

        <div className={a.hint.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-45"}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Texto del recordatorio</label>
            <input
              value={a.hint.text}
              onChange={(e) => set({ hint: { ...a.hint, text: e.target.value } })}
              className="input-l"
            />
            <p className="mt-1 text-[11px] text-ink-3">
              En WhatsApp, el texto entre asteriscos sale en <b className="text-ink-2">negritas</b>.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={a.hint.onStart}
              onChange={(e) => set({ hint: { ...a.hint, onStart: e.target.checked } })}
              className="h-4 w-4 accent-pink"
            />
            Mostrarlo al empezar la conversación (una sola vez)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={a.hint.onOptions}
              onChange={(e) => set({ hint: { ...a.hint, onOptions: e.target.checked } })}
              className="h-4 w-4 accent-pink"
            />
            Mostrarlo debajo de cada menú de opciones
          </label>
        </div>
      </div>

      {/* Vista previa */}
      <div className="rounded-2xl border border-linea bg-suave p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Así lo verá tu cliente</p>
        <div className="space-y-1.5">
          <div className="ml-auto w-fit max-w-[80%] rounded-xl rounded-br-sm bg-demandu-gradient px-3 py-2 text-[12.5px] text-white">
            {a.agent.words[0] || "1"}
          </div>
          <div className="w-fit max-w-[80%] rounded-xl rounded-bl-sm bg-tarjeta px-3 py-2 text-[12.5px] text-ink shadow-sm">
            {a.agent.reply}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Guardar />
        <button
          type="button"
          onClick={() => setA(ATAJOS_DEFAULT)}
          className="btn-soft px-3 py-2 text-sm"
        >
          Volver a lo recomendado
        </button>
        {estado.mensaje && (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              estado.ok ? "text-exito" : "text-danger"
            }`}
          >
            {estado.ok && <CheckCircle2 className="h-4 w-4" />} {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
