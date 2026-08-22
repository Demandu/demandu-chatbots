import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolverPermisos, type ClavePermiso, type Rol } from "@/lib/permisos";

/**
 * Quién eres y qué puedes, resuelto en el servidor.
 *
 * VA EN `cache()` PORQUE SE PREGUNTA MUCHAS VECES POR PANTALLA: la barra
 * lateral, el marco y la propia página lo necesitan. Sin esto serían tres
 * viajes a Supabase por navegación, en fila, antes de dibujar nada.
 *
 * No es caché entre visitas: cada carga vuelve a comprobar la sesión, así que
 * un cambio de permisos se nota en la siguiente pantalla que abras.
 */
export const misPermisos = cache(async function misPermisos(): Promise<{
  rol: Rol | null;
  permisos: Set<ClavePermiso>;
  esDueno: boolean;
}> {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) return { rol: null, permisos: new Set(), esDueno: false };

  const { data } = await sb
    .from("memberships")
    .select("role, permisos")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const rol = ((data as any)?.role ?? null) as Rol | null;
  return {
    rol,
    permisos: resolverPermisos(rol, (data as any)?.permisos),
    esDueno: rol === "owner",
  };
});

/**
 * Corta el paso a una pantalla.
 *
 * ESCONDER NO ES PROHIBIR: la barra lateral deja de mostrar lo que no te toca,
 * pero cualquiera puede escribir la dirección a mano. Sin esta comprobación en
 * el servidor, los permisos serían decoración.
 *
 * Se manda a la primera pantalla que SÍ pueda ver, no a un "no tienes permiso":
 * para quien atiende clientes, toparse con un muro es confuso; que la app se
 * abra donde trabaja, no.
 */
export async function exigir(clave: ClavePermiso) {
  const { permisos } = await misPermisos();
  if (permisos.has(clave)) return;

  const orden: ClavePermiso[] = ["conversaciones", "embudo", "contactos", "chatbots", "resultados"];
  const destino = orden.find((c) => permisos.has(c));
  const rutas: Record<ClavePermiso, string> = {
    conversaciones: "/inbox",
    embudo: "/crm",
    contactos: "/contacts",
    chatbots: "/bots",
    resultados: "/analytics",
    ia: "/settings/ai",
    config: "/settings",
    envios: "/campaigns",
    conexiones: "/settings/integrations",
    equipo: "/settings/teams",
    plan: "/settings/plan",
    borrar: "/inbox",
  };
  // Si no puede ver NADA, al inicio: ahí siempre hay algo que decirle.
  redirect(destino ? rutas[destino] : "/dashboard");
}
