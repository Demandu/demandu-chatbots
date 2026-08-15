"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Nombre del bot editable en línea (guarda al salir del campo o con Enter). */
export function BotTitle({ botId, initialName }: { botId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok">("idle");

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return;
    setSaved("saving");
    await createClient().from("bots").update({ name: trimmed }).eq("id", botId);
    setSaved("ok");
    setTimeout(() => setSaved("idle"), 1500);
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-muted">Bots /</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-white hover:border-surface-border focus:border-pink focus:outline-none"
        title="Editar nombre del bot"
      />
      {saved === "saving" && <span className="text-[10px] text-muted-2">guardando…</span>}
      {saved === "ok" && <span className="text-[10px] text-success">✓</span>}
    </span>
  );
}
