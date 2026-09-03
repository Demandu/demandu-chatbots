"use client";

import { useEffect, useState } from "react";
import { Phone, Mail, User, Building2, Tag as TagIcon, Sparkles, Check, StickyNote, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bandera, nombrePais, paisDesdeTelefono } from "@/lib/phoneCountry";
import { NotasPostIt } from "./NotasPostIt";
import { ComprasDelContacto } from "@/components/tienda/ComprasDelContacto";

export type ContactoFicha = {
  id: string;
  name: string | null;
  wa_name?: string | null;
  phone: string | null;
  email: string | null;
  company?: string | null;
  country?: string | null;
  notes?: string | null;
  attributes?: Record<string, any> | null;
  tags: string[] | null;
  /** De qué anuncio vino esta persona la primera vez. Lo pone el motor. */
  origen?: {
    tipo?: string | null;
    anuncio_id?: string | null;
    titular?: string | null;
    cuerpo?: string | null;
    url?: string | null;
    visto_en?: string | null;
  } | null;
};

/** Atributo definido por el cliente en Configuración. `key` es donde se guarda. */
type Attr = { id: string; name: string; key: string };

/**
 * Atributos que YA tienen su campo fijo arriba en la ficha.
 * Si el chatbot captura "nombre" o "correo", no queremos verlos dos veces:
 * se muestran una sola vez, en su campo de siempre.
 */
const EQUIVALENTES: Record<string, "name" | "email" | "phone" | "company" | "country"> = {
  nombre: "name", name: "name", nombre_completo: "name", nombrecompleto: "name",
  correo: "email", email: "email", mail: "email", correo_electronico: "email",
  telefono: "phone", phone: "phone", celular: "phone", whatsapp: "phone", movil: "phone",
  empresa: "company", company: "company", negocio: "company", compania: "company",
  pais: "country", country: "country",
};

/** Campo que se guarda solo al salir (sin botón de guardar: menos fricción). */
function Campo({
  label,
  icon,
  value,
  placeholder,
  multiline,
  onSave,
}: {
  label: string;
  icon?: React.ReactNode;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (v: string) => Promise<void> | void;
}) {
  const [v, setV] = useState(value);
  const [ok, setOk] = useState(false);
  useEffect(() => setV(value), [value]);

  const guardar = async () => {
    if (v === value) return;
    await onSave(v.trim());
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
        {icon} {label}
        {ok && <Check className="h-3 w-3 text-success" />}
      </span>
      {multiline ? (
        <textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={guardar}
          placeholder={placeholder}
          className="min-h-[64px] w-full rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-white placeholder:text-muted-2 focus:border-violet focus:outline-none"
        />
      ) : (
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={placeholder}
          className="w-full rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-white placeholder:text-muted-2 focus:border-violet focus:outline-none"
        />
      )}
    </label>
  );
}

/**
 * Ficha del lead. Arriba, cómo se llama en WhatsApp (no se puede cambiar:
 * es su perfil). Debajo, los datos que tu equipo sí edita.
 */
export function ContactPanel({
  contact,
  canal,
  agente,
  tags,
  attrs = [],
  orgId,
  conversacionId,
  onPatch,
  onToggleTag,
}: {
  contact: ContactoFicha;
  canal: string;
  agente?: string | null;
  tags: { id: string; name: string; color: string }[];
  attrs?: Attr[];
  /** Necesario para guardar las notas internas con su organización */
  orgId?: string | null;
  /** La conversación abierta, para poder volver a SU pedido y no a otro. */
  conversacionId?: string | null;
  onPatch: (patch: Partial<ContactoFicha>) => void;
  onToggleTag: (name: string) => void;
}) {
  const sb = createClient();
  const attrsData = contact.attributes ?? {};

  // Los atributos que duplican un campo fijo no se listan aparte…
  const extras = attrs.filter((a) => !EQUIVALENTES[a.key?.toLowerCase?.() ?? ""]);

  // …pero su valor no se pierde: si el campo fijo está vacío y el chatbot
  // sí capturó el dato, se muestra ahí para que el agente lo confirme.
  const capturado = (campo: "name" | "email" | "phone" | "company" | "country") => {
    for (const [clave, destino] of Object.entries(EQUIVALENTES)) {
      if (destino !== campo) continue;
      const v = attrsData[clave];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };

  // `||` a propósito, no `??`: un campo guardado como cadena vacía también
  // debe caer al valor que capturó el chatbot.
  const valorNombre = contact.name || capturado("name");
  const valorCorreo = contact.email || capturado("email");
  const valorEmpresa = contact.company || capturado("company");
  const iso = contact.country || capturado("country") || paisDesdeTelefono(contact.phone);

  const guardar = async (patch: Partial<ContactoFicha>) => {
    onPatch(patch);
    await sb.from("contacts").update(patch as any).eq("id", contact.id);
  };
  const guardarAtributo = async (key: string, val: string) => {
    const next = { ...(contact.attributes ?? {}), [key]: val };
    onPatch({ attributes: next });
    await sb.from("contacts").update({ attributes: next }).eq("id", contact.id);
  };

  const iniciales = (valorNombre || contact.wa_name || "?").trim().slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Identidad */}
      <div className="flex flex-col items-center border-b border-surface-border pb-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-lg font-bold text-white">
          {iniciales}
        </div>
        <div className="mt-2 font-display text-base font-semibold text-white">
          {valorNombre || contact.wa_name || "Contacto"}
        </div>
        <div className="text-xs text-muted-2">{canal}</div>
        {iso && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-raised px-2.5 py-1 text-xs text-muted">
            <span className="text-sm leading-none">{bandera(iso)}</span> {nombrePais(iso)}
          </div>
        )}
      </div>

      {/* Nombre en WhatsApp: informativo, no editable */}
      <div className="rounded-xl border border-surface-border bg-surface-raised p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">Nombre en WhatsApp</div>
        <div className="mt-0.5 text-sm text-white">{contact.wa_name || "—"}</div>
        <p className="mt-1 text-[11px] text-muted-2">Así aparece en su perfil. No se puede cambiar desde aquí.</p>
      </div>

      {/* Datos editables */}
      <div className="space-y-3">
        <Campo
          label="Nombre"
          icon={<User className="h-3.5 w-3.5" />}
          value={valorNombre}
          placeholder="Como quieres llamarle"
          onSave={(v) => guardar({ name: v || null })}
        />
        <Campo
          label="Correo"
          icon={<Mail className="h-3.5 w-3.5" />}
          value={valorCorreo}
          placeholder="correo@empresa.com"
          onSave={(v) => guardar({ email: v || null })}
        />
        <Campo
          label="Empresa"
          icon={<Building2 className="h-3.5 w-3.5" />}
          value={valorEmpresa}
          placeholder="Nombre de su empresa"
          onSave={(v) => guardar({ company: v || null })}
        />

        <div>
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            <Phone className="h-3.5 w-3.5" /> Teléfono
          </span>
          <div className="rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-muted">
            {contact.phone ?? "—"}
          </div>
        </div>

        <div>
          <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
            <User className="h-3.5 w-3.5" /> Atiende
          </span>
          <div className="rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-muted">
            {agente || "Sin asignar"}
          </div>
        </div>
      </div>

      {/* ── QUÉ HA COMPRADO ──────────────────────────────────────────────
          Va antes de «de dónde vino» porque pesa más: de qué anuncio llegó
          importa la primera vez; cuántas veces ha comprado importa todas las
          demás. Si nunca compró, este bloque no se pinta. */}
      <ComprasDelContacto contactoId={contact.id} conversacionId={conversacionId} />

      {/* ── DE DÓNDE VINO ────────────────────────────────────────────────
          Va ARRIBA de los atributos y de las etiquetas a propósito: es lo
          primero que cambia cómo saludas. Quien llega desde un anuncio de
          casas ya dijo qué quiere, y abrir con "¿en qué te ayudo?" es la forma
          más rápida de que se note que no lo estabas escuchando. */}
      {contact.origen && (
        <div className="border-t border-surface-border pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">
            <Megaphone className="h-3.5 w-3.5" /> Llegó por
          </div>
          <div className="rounded-lg border border-violet/30 bg-violet/10 px-2.5 py-2">
            <p className="text-sm font-semibold text-white">
              {contact.origen.titular || "Anuncio sin título"}
            </p>
            {contact.origen.cuerpo && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">
                {contact.origen.cuerpo}
              </p>
            )}
            <p className="mt-1 text-[11px] text-muted-2">
              {contact.origen.tipo === "post" ? "Publicación" : "Anuncio"}
              {contact.origen.anuncio_id ? ` · ${contact.origen.anuncio_id}` : ""}
            </p>
            {contact.origen.url && (
              <a
                href={contact.origen.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-block text-[11px] font-semibold text-pink hover:underline"
              >
                Ver el anuncio
              </a>
            )}
          </div>
        </div>
      )}

      {/* Atributos que definió el cliente en Configuración */}
      {extras.length > 0 && (
        <div className="space-y-3 border-t border-surface-border pt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-2">Otros datos</div>
          {extras.map((a) => (
            <Campo
              key={a.id}
              label={a.name}
              value={String(attrsData[a.key] ?? "")}
              placeholder="—"
              onSave={(v) => guardarAtributo(a.key, v)}
            />
          ))}
        </div>
      )}

      {/* Etiquetas */}
      <div className="border-t border-surface-border pt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">
          <TagIcon className="h-3.5 w-3.5" /> Etiquetas
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-[11px] text-muted-2">Crea etiquetas en Configuración.</span>}
          {tags.map((t) => {
            const on = (contact.tags ?? []).includes(t.name);
            return (
              <button
                key={t.id}
                onClick={() => onToggleTag(t.name)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on ? "border-transparent text-white" : "border-surface-border bg-surface-raised text-muted hover:text-white"
                }`}
                style={on ? { background: t.color, color: "#fff" } : undefined}
              >
                {on ? "✓ " : ""}{t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notas internas: post-its con autor y fecha */}
      {orgId ? (
        <NotasPostIt contactId={contact.id} orgId={orgId} />
      ) : (
        <div className="border-t border-surface-border pt-4">
          <Campo
            label="Notas internas"
            icon={<StickyNote className="h-3.5 w-3.5" />}
            value={contact.notes ?? ""}
            placeholder="Lo que tu equipo debe saber de este lead…"
            multiline
            onSave={(v) => guardar({ notes: v || null })}
          />
        </div>
      )}

      <div className="mt-auto rounded-xl border border-surface-border bg-surface-raised p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">
          <Sparkles className="h-3.5 w-3.5 text-violet" /> Resumen IA
        </div>
        <p className="text-xs text-muted-2">
          Disponible cuando conectes Lana IA: un resumen automático de la conversación y el siguiente mejor paso.
        </p>
      </div>
    </div>
  );
}
