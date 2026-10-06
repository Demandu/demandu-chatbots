"use client";

/**
 * LOS AVISOS DEJAN DE PREGUNTAR CADA 8 SEGUNDOS.
 *
 * Medido el 5 oct 2026 en `pg_stat_statements`: las TRES consultas más
 * repetidas de toda la base eran los sondeos de la campana y del vigilante —
 * 155.083, 156.236 y 156.203 llamadas en 73 días, **con 7 cuentas de cliente**.
 * Cada agente con la plataforma abierta hacía ~900 consultas por hora solo
 * para enterarse de que no había nada nuevo.
 *
 * Ahora el aviso llega cuando pasa algo, por el mismo `bandeja_pulso` que ya
 * usa la Bandeja desde la migración 0142.
 *
 * ── POR QUÉ SE ESCUCHA EL PULSO Y NO `conversations` ──────────────────────
 *
 * Realtime aplica RLS: a quien le quitan un chat ya no le llega el cambio de
 * esa fila, que es justo el aviso que necesita. El pulso es una tabla aparte
 * cuyo único trabajo es decir «algo cambió en esta conversación de esta
 * cuenta». Su política solo deja ver los pulsos de las cuentas propias, así que
 * no hace falta filtrar por cuenta desde aquí para no ver los de otros.
 *
 * ── Y POR QUÉ QUEDA UNA RED, NO CERO ──────────────────────────────────────
 *
 * Un portátil que despierta, un wifi que se cae o un túnel que se corta dejan
 * el socket muerto sin avisar. Un vigilante que deja de vigilar en silencio es
 * peor que uno que pregunta de vez en cuando: **60 segundos** es lo bastante
 * raro para no pesar (60 consultas/hora en vez de 450) y lo bastante seguido
 * para que nadie se quede una mañana sin avisos.
 */

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/** Cada cuánto se vuelve a preguntar aunque el tiempo real vaya bien. */
export const RED_MS = 60_000;
/** Los latidos se juntan: pasar 50 chats de golpe son 50 latidos y basta una vuelta. */
export const JUNTAR_MS = 250;

export function useLatidoDeLaBandeja(nombre: string, alLatir: () => void) {
  // El callback se guarda en una caja para que cambiar de preferencias no
  // vuelva a abrir el canal: resuscribirse pierde latidos entre medias.
  const caja = useRef(alLatir);
  useEffect(() => { caja.current = alLatir; }, [alLatir]);

  useEffect(() => {
    const sb = createClient();
    let espera: ReturnType<typeof setTimeout> | null = null;

    const latir = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => caja.current(), JUNTAR_MS);
    };

    const canal = sb
      .channel(`avisos:${nombre}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "bandeja_pulso" },
        latir,
      )
      .subscribe((estado: string) => {
        if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
          console.error(`[avisos:${nombre}] el tiempo real no conectó:`, estado, "— sigue la red cada 60 s");
        }
      });

    const red = setInterval(() => caja.current(), RED_MS);

    return () => {
      if (espera) clearTimeout(espera);
      clearInterval(red);
      sb.removeChannel(canal);
    };
  }, [nombre]);
}
