"use client";

import { useRef, useState } from "react";
import { createAttribute } from "@/app/(dashboard)/settings/actions";

const TYPES: { value: string; label: string }[] = [
  { value: "string", label: "Texto" },
  { value: "number", label: "Número entero" },
  { value: "float", label: "Decimal" },
  { value: "email", label: "Correo" },
  { value: "phone", label: "Teléfono" },
  { value: "date", label: "Fecha" },
  { value: "boolean", label: "Sí / No" },
  { value: "list", label: "Lista de opciones" },
];

const PURPOSES: { value: string; label: string; hint: string }[] = [
  { value: "chatbot", label: "Respuesta del bot", hint: "El nodo Pregunta guarda aquí lo que responde el contacto." },
  { value: "api", label: "Respuesta de una API", hint: "Guarda un valor devuelto por el nodo Acción API." },
  { value: "agent", label: "Respuesta del agente", hint: "Lo captura un agente humano desde la bandeja." },
];

function slug(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export function AttributeForm() {
  const [name, setName] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [key, setKey] = useState("");
  const [purpose, setPurpose] = useState("chatbot");
  const formRef = useRef<HTMLFormElement>(null);

  const effectiveKey = keyEdited ? slug(key) : slug(name);
  const activePurpose = PURPOSES.find((p) => p.value === purpose)!;

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await createAttribute(fd);
        setName(""); setKey(""); setKeyEdited(false); setPurpose("chatbot");
        formRef.current?.reset();
      }}
      className="mb-6 rounded-2xl border border-[#e6e8f2] bg-white p-4"
    >
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del atributo</label>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ciudad de entrega"
            className="input-l"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Clave (uso interno)</label>
          <input
            name="key"
            value={effectiveKey}
            onChange={(e) => { setKeyEdited(true); setKey(e.target.value); }}
            placeholder="ciudad_de_entrega"
            className="input-l font-mono text-xs"
          />
          <p className="mt-1 text-[11px] text-ink-3">Se usa en la conversación como <span className="font-mono text-ink-2">{`{{${effectiveKey || "clave"}}}`}</span></p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Tipo de dato</label>
          <select name="type" defaultValue="string" className="input-l">
            {TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </div>
      </div>

      <div className="mb-2">
        <label className="mb-1.5 block text-xs font-semibold text-ink-2">¿De dónde se obtiene el valor?</label>
        <div className="flex flex-wrap gap-2">
          {PURPOSES.map((p) => (
            <button
              type="button"
              key={p.value}
              onClick={() => setPurpose(p.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                purpose === p.value
                  ? "border-pink bg-pink/10 text-pink"
                  : "border-[#e2e4f0] bg-[#f4f5fb] text-ink-2 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="purpose" value={purpose} />
        <p className="mt-1.5 text-[11px] text-ink-3">{activePurpose.hint}</p>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary">Agregar atributo</button>
      </div>
    </form>
  );
}
