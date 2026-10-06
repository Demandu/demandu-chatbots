"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EVENTO_PREFS, leerPrefs, enSilencio } from "@/lib/notifications";
import { useLatidoDeLaBandeja } from "./enVivo";

/** Campana con el número de mensajes sin leer. Lleva a la Bandeja. */
export function NotificationBell() {
  const [pendientes, setPendientes] = useState(0);
  const [silenciado, setSilenciado] = useState(false);

  /* Contar es una consulta; se guarda para que el latido la pueda llamar sin
     volver a montar nada. Antes esto corría cada 8 segundos y era una de las
     tres consultas más repetidas de la base — ver `enVivo.ts`. */
  const contar = useCallback(async () => {
    const sb = createClient();
    const { data, error } = await sb.from("conversations").select("unread").gt("unread", 0).limit(100);
    if (error) {
      // Sin esto, un fallo de red dejaba la campana en cero: «no tienes nada»
      // es una respuesta peor que no cambiar el número.
      console.error("[campana] no pude contar los sin leer:", error.message);
      return;
    }
    setPendientes(((data as any[]) ?? []).reduce((n, c) => n + (Number(c.unread) || 0), 0));
    const p = leerPrefs();
    setSilenciado(!p.activo || enSilencio(p));
  }, []);

  useLatidoDeLaBandeja("campana", contar);

  useEffect(() => {
    const sincronizar = () => {
      const p = leerPrefs();
      setSilenciado(!p.activo || enSilencio(p));
    };
    sincronizar();
    window.addEventListener(EVENTO_PREFS, sincronizar);
    window.addEventListener("storage", sincronizar);

    contar();
    return () => {
      window.removeEventListener(EVENTO_PREFS, sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, [contar]);

  return (
    <Link
      href="/inbox"
      aria-label={pendientes > 0 ? `${pendientes} mensajes sin leer` : "Sin mensajes nuevos"}
      title={silenciado ? "Avisos silenciados" : pendientes > 0 ? `${pendientes} sin leer` : "Sin mensajes nuevos"}
      className="relative grid h-9 w-9 place-items-center rounded-xl border border-surface-border bg-surface-raised text-muted transition hover:text-white"
    >
      {silenciado ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {pendientes > 0 && (
        <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pink px-1 text-[10px] font-bold text-white">
          {pendientes > 99 ? "99+" : pendientes}
        </span>
      )}
    </Link>
  );
}
