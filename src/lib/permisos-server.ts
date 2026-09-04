import { cache } from "react";
import { redirect } from "next/navigation";
import { membresiaDeLaSesion } from "@/lib/org";
import { resolverPermisos, type Ajustes, type ClavePermiso, type Rol } from "@/lib/permisos";

/**
 * Quién eres y qué puedes, resuelto en el servidor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ROL SALE DE LA MISMA FILA QUE LA ORGANIZACIÓN, y eso es una corrección, no
 * una comodidad. Antes esta función hacía su propia consulta —`memberships`,
 * `.limit(1)`, sin orden— independiente de la que elegía la cuenta. Con dos
 * membresías (dueño de la propia + soporte en la de un cliente) eran dos sorteos
 * distintos sobre las mismas filas: podía tocar la cuenta del CLIENTE con el rol
 * de DUEÑO de la propia. Y `owner` da por bueno cualquier permiso.
 *
 * Ahora las dos cosas vienen del mismo objeto (`membresiaDeLaSesion`), así que
 * discrepar es imposible por construcción.
 *
 * SIGUE EN `cache()`: la barra lateral, el marco y la propia página lo preguntan
 * en cada render, y ahora comparten también el viaje a Supabase con
 * `getCurrentOrgId`. No es caché entre visitas: cada carga vuelve a comprobar la
 * sesión, así que un cambio de permisos se nota en la siguiente pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const misPermisos = cache(async function misPermisos(): Promise<{
  rol: Rol | null;
  permisos: Set<ClavePermiso>;
  esDueno: boolean;
}> {
  const m = await membresiaDeLaSesion();
  if (!m) return { rol: null, permisos: new Set(), esDueno: false };

  const rol = ((m.role ?? null) as Rol | null);
  // `permisos` viaja como `unknown` desde `membresia.ts` a propósito: ese
  // archivo es puro y no debe conocer la lista de permisos. `resolverPermisos`
  // ya trata cualquier basura como «sin ajustes», que es lo prudente.
  return {
    rol,
    permisos: resolverPermisos(rol, m.permisos as Ajustes),
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
