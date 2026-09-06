"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Search, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { deleteContacts } from "@/app/(dashboard)/contacts/actions";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { Confirm } from "@/components/ui/Confirm";
import { bandera, paisDesdeTelefono } from "@/lib/phoneCountry";

type Contact = {
  id: string;
  name: string | null;
  wa_name?: string | null;
  phone: string | null;
  email: string | null;
  company?: string | null;
  country?: string | null;
  channel: string | null;
  tags: string[] | null;
  created_at: string;
};

const CH: Record<string, { label: string }> = {
  whatsapp: { label: "WhatsApp" },
  instagram: { label: "Instagram" },
  messenger: { label: "Messenger" },
  telegram: { label: "Telegram" },
  webchat: { label: "Web Chat" },
};

/** El botón vive dentro del form para poder leer su estado de envío. */
function BotonEliminar({ cuantos, onPedir }: { cuantos: number; onPedir: () => void }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="button"
      onClick={onPedir}
      disabled={pending || cuantos === 0}
      className="inline-flex items-center gap-1.5 rounded-xl bg-danger px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Eliminando…" : `Eliminar ${cuantos}`}
    </button>
  );
}

export function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [estado, formAction] = useFormState(deleteContacts, { ok: false, mensaje: "" });
  const formRef = useRef<HTMLFormElement>(null);

  const filtered = useMemo(
    () =>
      contacts.filter((c) => {
        if (!q) return true;
        const t = q.toLowerCase();
        return (
          (c.name ?? "").toLowerCase().includes(t) ||
          (c.wa_name ?? "").toLowerCase().includes(t) ||
          (c.company ?? "").toLowerCase().includes(t) ||
          (c.phone ?? "").includes(q) ||
          (c.email ?? "").toLowerCase().includes(t)
        );
      }),
    [contacts, q],
  );

  // Al cambiar la lista (tras borrar) se limpia la selección y se muestra el aviso.
  useEffect(() => {
    if (!estado.mensaje) return;
    setAviso({ ok: estado.ok, texto: estado.mensaje });
    setSel(new Set());
    setConfirmar(false);
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [estado]);

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const visiblesSeleccionados = filtered.filter((c) => sel.has(c.id));
  const todosMarcados = filtered.length > 0 && visiblesSeleccionados.length === filtered.length;
  const alternarTodos = () =>
    setSel(todosMarcados ? new Set() : new Set(filtered.map((c) => c.id)));

  const nombresPreview = visiblesSeleccionados
    .slice(0, 3)
    .map((c) => c.name || c.wa_name || c.phone || "sin nombre")
    .join(", ");

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="ids" value={Array.from(sel).join(",")} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-sm items-center gap-2 rounded-xl border border-linea-2 bg-tarjeta px-3 py-2">
          <Search className="h-4 w-4 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, empresa, teléfono o correo…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>

        {sel.size > 0 && <BotonEliminar cuantos={sel.size} onPedir={() => setConfirmar(true)} />}

        {aviso && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
              aviso.ok ? "bg-success/15 text-exito" : "bg-danger/10 text-danger"
            }`}
          >
            {aviso.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {aviso.texto}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linea px-4 py-8 text-center text-sm text-ink-3">
          {contacts.length === 0 ? "Aún no tienes contactos. Agrega el primero arriba." : "Sin resultados."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-suave text-left text-[11px] font-bold uppercase tracking-wide text-ink-3">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                    aria-label="Seleccionar todos"
                    className="h-4 w-4 cursor-pointer accent-pink"
                  />
                </th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Etiquetas</th>
                <th className="w-14 px-3 py-3 text-right">Borrar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {filtered.map((c) => {
                const marcado = sel.has(c.id);
                const iso = c.country ?? paisDesdeTelefono(c.phone);
                return (
                  <tr key={c.id} className={marcado ? "bg-pink/5" : "bg-tarjeta"}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(c.id)}
                        aria-label={`Seleccionar ${c.name ?? "contacto"}`}
                        className="h-4 w-4 cursor-pointer accent-pink"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-[11px] font-bold text-white">
                          {(c.name || c.wa_name || "?").slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">
                            {iso && <span className="mr-1">{bandera(iso)}</span>}
                            {c.name || c.wa_name || "—"}
                          </span>
                          {c.company && <span className="block truncate text-[11px] text-ink-3">{c.company}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {c.channel ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ChannelIcon channel={c.channel} className="h-4 w-4" />
                          {CH[c.channel]?.label ?? c.channel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-2">{c.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).length === 0 ? (
                          <span className="text-ink-3">—</span>
                        ) : (
                          (c.tags ?? []).map((t) => (
                            <span key={t} className="rounded-full bg-suave px-2 py-0.5 text-[11px] text-ink-2">
                              {t}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        title="Eliminar este contacto"
                        aria-label="Eliminar este contacto"
                        onClick={() => {
                          setSel(new Set([c.id]));
                          setConfirmar(true);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Confirm
        abierto={confirmar}
        titulo={sel.size === 1 ? "¿Eliminar este contacto?" : `¿Eliminar ${sel.size} contactos?`}
        detalle={
          <>
            Se borra {sel.size === 1 ? "el contacto" : "los contactos"}
            {nombresPreview && (
              <>
                {" "}
                (<b className="text-ink">{nombresPreview}</b>
                {visiblesSeleccionados.length > 3 && ` y ${visiblesSeleccionados.length - 3} más`})
              </>
            )}{" "}
            junto con <b className="text-ink">todas sus conversaciones y mensajes</b>. Esto no se puede deshacer.
            <span className="mt-2 block text-xs text-ink-3">
              Ojo: si esa persona te vuelve a escribir por WhatsApp, entra de nuevo como contacto nuevo. Para dejar de
              recibirle, bloquéala desde WhatsApp.
            </span>
          </>
        }
        confirmar={sel.size === 1 ? "Sí, eliminar" : `Sí, eliminar ${sel.size}`}
        onConfirmar={() => {
          setConfirmar(false);
          // Envía este formulario, que ya lleva los ids seleccionados
          formRef.current?.requestSubmit();
        }}
        onCancelar={() => setConfirmar(false)}
      />
    </form>
  );
}
