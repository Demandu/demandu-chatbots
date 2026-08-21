import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Devuelve el org_id de la organización del usuario autenticado (o null).
 *
 * VA ENVUELTO EN `cache()` DE REACT, y no es un detalle: averiguar quién eres
 * cuesta DOS viajes a Supabase (la sesión y luego su membresía), y varias
 * pantallas lo preguntaban tres veces en el mismo render — seis viajes en fila
 * antes de poder dibujar nada. Con `cache()`, dentro de una misma petición se
 * resuelve una vez y las demás llamadas reciben el mismo resultado.
 *
 * No es una caché entre peticiones: cada visita vuelve a comprobar la sesión,
 * así que no hay riesgo de servirle a alguien la organización de otro.
 */
export const getCurrentOrgId = cache(async function getCurrentOrgId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
});
