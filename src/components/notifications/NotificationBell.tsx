"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EVENTO_PREFS, leerPrefs, enSilencio } from "@/lib/notifications";

/** Campana con el número de mensajes sin leer. Lleva a la Bandeja. */
export function NotificationBell() {
  const [pendientes, setPendientes] = useState(0);
  const [silenciado, setSilenciado] = useState(false);

  useEffect(() => {
    const sincronizar = () => {
      const p = leerPrefs();
      setSilenciado(!p.activo || enSilencio(p));
    };
    sincronizar();
    window.addEventListener(EVENTO_PREFS, sincronizar);
    window.addEventListener("storage", sincronizar);

    const sb = createClient();
    const contar = async () => {
      const { data } = await sb.from("conversations").select("unread").gt("unread", 0).limit(100);
      setPendientes(((data as any[]) ?? []).reduce((n, c) => n + (Number(c.unread) || 0), 0));
      sincronizar();
    };
    contar();
    const t = setInterval(contar, 8000);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_PREFS, sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, []);

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
