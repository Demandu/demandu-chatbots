"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Interruptor de encendido/apagado de un flujo (como los toggles de BotPenguin). */
export function FlowToggle({ flowId, enabled }: { flowId: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    const { error } = await createClient().from("flows").update({ enabled: next }).eq("id", flowId);
    if (error) setOn(!next); // revertir si falla
    setBusy(false);
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      role="switch"
      aria-checked={on}
      title={on ? "Activo — clic para pausar" : "Pausado — clic para activar"}
      className={`relative inline-flex h-5 w-9 flex-none items-center rounded-full transition ${on ? "bg-success" : "bg-surface-border"} ${busy ? "opacity-60" : ""}`}
    >
      <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}
