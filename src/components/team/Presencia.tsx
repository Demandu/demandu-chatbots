"use client";

import { useCallback, useEffect, useState } from "react";
import { Circle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Sigo aquí" + el interruptor de disponibilidad.
 *
 * Es la pieza que hace que el reparto automático sirva de algo: sin saber
 * quién está frente a la computadora, el chat le cae al que se fue a comer y
 * el cliente espera una hora. Todos los competidores tienen reparto; el que
 * de verdad funciona es el que sabe quién está.
 *
 * El latido va cada 60 segundos y SOLO mientras la pestaña está visible: si el
 * agente cierra la laptop, deja de latir y en 5 minutos deja de recibir chats
 * sin tener que acordarse de marcarse ausente.
 */
export function Presencia({ compacto = false }: { compacto?: boolean }) {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const latir = useCallback(async (nuevo?: boolean) => {
    try {
      const sb = createClient();
      const { error } = await sb.rpc("crm_sigo_aqui", {
        p_disponible: nuevo === undefined ? null : nuevo,
      });
      if (error) return;
      // Solo se lee el estado real cuando hace falta pintarlo la primera vez.
      if (disponible === null || nuevo !== undefined) {
        const { data } = await sb.from("team_members").select("available").limit(1).maybeSingle();
        setDisponible((data as any)?.available ?? true);
      }
    } catch {
      /* la presencia nunca debe romper la pantalla */
    }
  }, [disponible]);

  useEffect(() => {
    latir();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") latir();
    }, 60_000);
    const alVolver = () => { if (document.visibilityState === "visible") latir(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
    // Solo al montar: el latido se encarga del resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras no sepamos si esta persona es del equipo, no se pinta nada.
  if (disponible === null) return null;

  const cambiar = async () => {
    setCambiando(true);
    const nuevo = !disponible;
    setDisponible(nuevo);
    await latir(nuevo);
    setCambiando(false);
  };

  return (
    <button
      type="button"
      onClick={cambiar}
      title={
        disponible
          ? "Estás recibiendo chats. Toca para dejar de recibir."
          : "No estás recibiendo chats. Toca para volver a recibir."
      }
      className={
        compacto
          ? "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-surface-raised"
          : "inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised px-3 py-2 text-sm font-medium transition hover:border-pink"
      }
    >
      {cambiando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
      ) : (
        <Circle
          className={`h-2.5 w-2.5 ${disponible ? "fill-success text-success" : "fill-[#8a8db0] text-[#8a8db0]"}`}
        />
      )}
      <span className={disponible ? "text-white" : "text-muted"}>
        {disponible ? "Disponible" : "Ausente"}
      </span>
    </button>
  );
}
