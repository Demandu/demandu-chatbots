"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { membresiaActiva, type Membresia } from "@/lib/membresia";

export interface Catalogs {
  tags: any[];
  members: any[];
  groups: any[];
  teams: any[];
  states: any[];
  bots: any[];
  attributes: any[];
  /** Calendarios de Google Calendar si la integración está conectada */
  calendars: any[];
  googleCalendarConnected: boolean;
  /* ── CALENDLY ────────────────────────────────────────────────────────────
     Los tipos de cita NO salen de una consulta a Supabase como todo lo demás
     de aquí: viven en Calendly y pedirlos necesita el token, que desde la 0092
     no es legible con la sesión del usuario — a propósito, para que no viaje
     al navegador. Por eso van por una ruta del servidor.

     `calendlyRoto` distingue «no tienes Calendly» de «lo tienes y dejó de
     responder». Son dos arreglos distintos, y enseñar el primero cuando pasa
     el segundo manda al cliente a configurar lo que ya estaba bien. */
  calendlyConectado: boolean;
  calendlyRoto: boolean;
  calendlyTipos: { uri: string; nombre: string; duracion: number; activo: boolean }[];
}

const EMPTY: Catalogs = {
  tags: [], members: [], groups: [], teams: [], states: [], bots: [], attributes: [],
  calendars: [], googleCalendarConnected: false,
  calendlyConectado: false, calendlyRoto: false, calendlyTipos: [],
};

/** Lee los catálogos de la organización (RLS los aísla) para poblar los selectores. */
export function useCatalogs(): { catalogs: Catalogs; loading: boolean; orgId: string | null } {
  const [catalogs, setCatalogs] = useState<Catalogs>(EMPTY);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [t, m, g, tm, s, b, at, gc, mem] = await Promise.all([
        supabase.from("tags").select("id,name,color").order("name"),
        supabase.from("team_members").select("id,name,email").order("name"),
        supabase.from("lead_groups").select("id,name,color").order("name"),
        supabase.from("teams").select("id,name").order("name"),
        supabase.from("conversation_states").select("id,name,color").order("sort"),
        supabase.from("bots").select("id,name").order("name"),
        supabase.from("custom_attributes").select("id,name,key,type,purpose").order("sort"),
        supabase.from("integrations").select("account_email,data").eq("provider", "google_calendar").maybeSingle(),
        // TODAS las membresías, y se elige con la misma regla que el servidor.
        // Un `.limit(1)` aquí devolvía la que Postgres quisiera: con una sesión
        // de soporte abierta, el catálogo de etiquetas de una cuenta dentro de
        // la otra.
        supabase.from("memberships").select("org_id, role, permisos, soporte_hasta, created_at"),
      ]);

      // Calendly va aparte y NO bloquea al resto: es el único catálogo que
      // depende de un servicio ajeno, y si Calendly tarda, el constructor
      // entero se quedaría en blanco esperando por un selector.
      let cal = { conectado: false, roto: false, tipos: [] as any[] };
      try {
        const r = await fetch("/api/integrations/calendly/tipos");
        if (r.ok) {
          const j = await r.json();
          cal = { conectado: !!j.conectado, roto: !!j.roto, tipos: j.tipos ?? [] };
        }
      } catch {
        /* sin Calendly el bloque sigue sirviendo con Google */
      }
      setCatalogs({
        tags: t.data ?? [],
        members: m.data ?? [],
        groups: g.data ?? [],
        teams: tm.data ?? [],
        states: s.data ?? [],
        bots: b.data ?? [],
        attributes: at.data ?? [],
        calendars: ((gc.data as any)?.data?.calendars as any[]) ?? [],
        googleCalendarConnected: !!gc.data,
        calendlyConectado: cal.conectado,
        calendlyRoto: cal.roto,
        calendlyTipos: cal.tipos,
      });
      setOrgId(membresiaActiva((mem.data ?? []) as Membresia[])?.org_id ?? null);
      setLoading(false);
    })();
  }, []);

  return { catalogs, loading, orgId };
}
