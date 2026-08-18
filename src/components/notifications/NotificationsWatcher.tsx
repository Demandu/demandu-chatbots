"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EVENTO_PREFS, avisoEscritorio, debeAvisar, leerPrefs, reproducirTono, type PrefsAviso,
} from "@/lib/notifications";
import { lanzarAviso } from "./Toasts";

/**
 * Vigila mensajes nuevos en toda la plataforma (no solo en la Bandeja) y avisa
 * según las preferencias de esta persona. Vive en el marco de la app, así que
 * funciona esté donde esté navegando.
 */
export function NotificationsWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [prefs, setPrefs] = useState<PrefsAviso>(leerPrefs);
  const visto = useRef<number | null>(null); // último `last_message_at` conocido
  const tituloOriginal = useRef<string>("");

  // Las preferencias pueden cambiar desde la pantalla de Configuración
  useEffect(() => {
    const recargar = () => setPrefs(leerPrefs());
    window.addEventListener(EVENTO_PREFS, recargar);
    window.addEventListener("storage", recargar);
    return () => {
      window.removeEventListener(EVENTO_PREFS, recargar);
      window.removeEventListener("storage", recargar);
    };
  }, []);

  // Cada pantalla tiene su propio título; nos quedamos con el de la actual
  // (sin el contador) para poder anteponerle los pendientes.
  useEffect(() => {
    tituloOriginal.current = document.title.replace(/^\(\d+\)\s*/, "");
  }, [pathname]);

  const revisar = useCallback(async () => {
    const sb = createClient();
    const { data } = await sb
      .from("conversations")
      .select("id, unread, last_message_at, assignee_member_id, contact:contacts(name,wa_name)")
      .gt("unread", 0)
      .order("last_message_at", { ascending: false })
      .limit(20);

    const filas = (data as any[]) ?? [];
    const pendientes = filas.reduce((n, c) => n + (Number(c.unread) || 0), 0);

    // Contador en la pestaña
    if (prefs.activo && prefs.titulo) {
      document.title = pendientes > 0 ? `(${pendientes}) ${tituloOriginal.current}` : tituloOriginal.current;
    } else {
      document.title = tituloOriginal.current;
    }

    const ultima = filas[0];
    const marca = ultima ? new Date(ultima.last_message_at).getTime() : 0;

    // La primera vuelta solo toma la foto: no avisamos de lo que ya estaba ahí.
    if (visto.current === null) {
      visto.current = marca;
      return;
    }
    if (!marca || marca <= visto.current) return;
    visto.current = marca;

    if (!debeAvisar(prefs)) return;
    if (prefs.soloMias && !ultima.assignee_member_id) return;

    const quien = ultima.contact?.name || ultima.contact?.wa_name || "Un cliente";

    // Adelanto del mensaje, para que se sepa de qué va sin abrirlo
    let adelanto = "Te escribió un mensaje nuevo.";
    try {
      const { data: msg } = await sb
        .from("messages")
        .select("body")
        .eq("conversation_id", ultima.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cuerpo = (msg as any)?.body?.trim();
      if (cuerpo) adelanto = cuerpo.length > 120 ? `${cuerpo.slice(0, 120)}…` : cuerpo;
    } catch { /* si falla, queda el texto genérico */ }

    if (prefs.sonido) reproducirTono(prefs.tono, prefs.volumen);

    // La tarjeta dentro de la app: es la que se ve mientras estás trabajando.
    if (prefs.enApp) lanzarAviso({ titulo: quien, cuerpo: adelanto, href: "/inbox" });

    // El aviso del sistema solo tiene sentido si NO estás mirando la pestaña.
    if (prefs.escritorio && document.visibilityState !== "visible") {
      avisoEscritorio(quien, adelanto, () => router.push("/inbox"));
    }
  }, [prefs, router]);

  useEffect(() => {
    revisar();
    const t = setInterval(revisar, 8000);
    return () => clearInterval(t);
  }, [revisar]);

  // Al salir, deja el título como estaba
  useEffect(() => () => { document.title = tituloOriginal.current || document.title; }, []);

  return null;
}
