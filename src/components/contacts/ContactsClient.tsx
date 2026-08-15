"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { deleteContact } from "@/app/(dashboard)/contacts/actions";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";

type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  channel: string | null;
  tags: string[] | null;
  created_at: string;
};

const CH: Record<string, { label: string; emoji: string }> = {
  whatsapp: { label: "WhatsApp", emoji: "🟢" },
  instagram: { label: "Instagram", emoji: "📸" },
  messenger: { label: "Messenger", emoji: "💬" },
  telegram: { label: "Telegram", emoji: "✈️" },
  webchat: { label: "Web Chat", emoji: "🌐" },
};

export function ContactsClient({ contacts }: { contacts: Contact[] }) {
  const [q, setQ] = useState("");
  const filtered = contacts.filter((c) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (c.name ?? "").toLowerCase().includes(t) ||
      (c.phone ?? "").includes(q) ||
      (c.email ?? "").toLowerCase().includes(t)
    );
  });

  return (
    <div>
      <div className="mb-4 flex w-full max-w-sm items-center gap-2 rounded-xl border border-surface-border bg-surface-raised px-3 py-2">
        <Search className="h-4 w-4 text-muted-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, teléfono o correo…"
          className="w-full bg-transparent text-sm text-white placeholder:text-muted-2 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border px-4 py-8 text-center text-sm text-muted-2">
          {contacts.length === 0 ? "Aún no tienes contactos. Agrega el primero arriba." : "Sin resultados."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-[11px] font-bold uppercase tracking-wide text-muted-2">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Etiquetas</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map((c) => {
                const ch = c.channel ? CH[c.channel] : null;
                return (
                  <tr key={c.id} className="bg-surface-card">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-[11px] font-bold text-white">
                          {(c.name ?? "?").slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-white">{c.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {c.channel ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ChannelIcon channel={c.channel} className="h-4 w-4" />
                          {ch?.label ?? c.channel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags ?? []).length === 0 ? (
                          <span className="text-muted-2">—</span>
                        ) : (
                          (c.tags ?? []).map((t) => (
                            <span key={t} className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-muted">{t}</span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteContact} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <button className="px-1 text-muted-2 transition hover:text-danger" title="Eliminar">✕</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
