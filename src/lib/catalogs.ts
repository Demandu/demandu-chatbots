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
}

const EMPTY: Catalogs = { tags: [], members: [], groups: [], teams: [], states: [], bots: [] };

/** Lee los catálogos de la organización (RLS los aísla) para poblar los selectores. */
export function useCatalogs(): { catalogs: Catalogs; loading: boolean } {
  const [catalogs, setCatalogs] = useState<Catalogs>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [t, m, g, tm, s, b] = await Promise.all([
        supabase.from("tags").select("id,name,color").order("name"),
        supabase.from("team_members").select("id,name,email").order("name"),
        supabase.from("lead_groups").select("id,name,color").order("name"),
        supabase.from("teams").select("id,name").order("name"),
        supabase.from("conversation_states").select("id,name,color").order("sort"),
        supabase.from("bots").select("id,name").order("name"),
      ]);
      setCatalogs({
        tags: t.data ?? [],
        members: m.data ?? [],
        groups: g.data ?? [],
        teams: tm.data ?? [],
        states: s.data ?? [],
        bots: b.data ?? [],
      });
      setLoading(false);
    })();
  }, []);

  return { catalogs, loading };
}
