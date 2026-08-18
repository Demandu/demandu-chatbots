"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  EVENTO_PREFS, avisoEscritorio, debeAvisar, leerPrefs, reproducirTono, type PrefsAviso,
} from "@/lib/notifications";

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
    if (prefs.sonido) reproducirTono(prefs.tono, prefs.volumen);
    if (prefs.escritorio && document.visibilityState !== "visible") {
      avisoEscritorio("Mensaje nuevo en Demandu", `${quien} te escribió.`, () => router.push("/inbox"));
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
