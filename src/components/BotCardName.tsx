"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Check, X } from "lucide-react";

/**
 * Nombre del bot en la tarjeta de la lista, con renombrado en línea.
 * Clic en el lápiz para editar; Enter o ✓ para guardar, Esc o ✕ para cancelar.
 */
export function BotCardName({ botId, initialName }: { botId: string; initialName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setName(initialName);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return cancel();
    setSaving(true);
    const { error } = await createClient().from("bots").update({ name: trimmed }).eq("id", botId);
    setSaving(false);
    if (error) {
      setName(initialName);
    }
    setEditing(false);
    router.refresh();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className="min-w-0 flex-1 rounded-md border border-pink bg-surface-raised px-2 py-1 font-display text-lg font-semibold text-white focus:outline-none"
        />
        <button onClick={save} disabled={saving} title="Guardar" className="flex-none text-success hover:opacity-80">
          <Check className="h-4 w-4" />
        </button>
        <button onClick={cancel} title="Cancelar" className="flex-none text-muted-2 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h3 className="truncate font-display text-lg font-semibold text-white">{name}</h3>
      <button
        onClick={() => setEditing(true)}
        title="Renombrar bot"
        className="flex-none text-muted-2 opacity-0 transition hover:text-pink group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
