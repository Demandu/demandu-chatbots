"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
}

const EMPTY: Catalogs = {
  tags: [], members: [], groups: [], teams: [], states: [], bots: [], attributes: [],
  calendars: [], googleCalendarConnected: false,
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
        supabase.from("memberships").select("org_id").limit(1).maybeSingle(),
      ]);
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
      });
      setOrgId((mem.data as any)?.org_id ?? null);
      setLoading(false);
    })();
  }, []);

  return { catalogs, loading, orgId };
}
