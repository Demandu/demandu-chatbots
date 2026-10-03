import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Persona } from "./reenviar";

/**
 * Encontrar a una persona por su correo, para reenviarle algo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE RECORRE LA LISTA DE SUPABASE PORQUE NO HAY OTRA PUERTA. `auth.users` no se
 * puede consultar desde aquí y la API de administración no filtra por correo.
 * Con 1.000 por página, 20 páginas son 20.000 cuentas: cuando eso se quede
 * corto, lo que toca es una función en la base, no subir el número.
 *
 * SE BUSCA LA DIRECCIÓN EXACTA, sin mayúsculas. Un «contiene» devolvería a
 * varias personas y el botón de reenviar podría acabar en la equivocada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const POR_PAGINA = 1000;
const PAGINAS_MAX = 20;

export async function buscarUsuarioPorCorreo(admin: SupabaseClient, correo: string): Promise<User | null> {
  const buscado = correo.trim().toLowerCase();
  if (!buscado.includes("@")) return null;

  for (let page = 1; page <= PAGINAS_MAX; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw new Error(error.message);
    const usuarios = data?.users ?? [];
    const hallado = usuarios.find((u) => (u.email ?? "").toLowerCase() === buscado);
    if (hallado) return hallado;
    if (usuarios.length < POR_PAGINA) return null;
  }
  return null;
}

/** Lo que el módulo puro necesita saber, sacado del usuario de Supabase. */
export function personaDe(u: User): Persona {
  const crudo = u as User & { recovery_sent_at?: string | null; confirmation_sent_at?: string | null };
  return {
    confirmadoEl: u.email_confirmed_at ?? null,
    invitadoEl: u.invited_at ?? null,
    confirmacionEnviadaEl: crudo.confirmation_sent_at ?? null,
    recuperacionEnviadaEl: crudo.recovery_sent_at ?? null,
    proveedores: Array.from(new Set((u.identities ?? []).map((i) => i.provider))),
  };
}

/** Los negocios de esa persona, para la bienvenida. */
export async function negociosDe(
  admin: SupabaseClient,
  userId: string,
): Promise<{ id: string; name: string; contacto_nombre: string | null; contacto_email: string | null; bienvenida_enviada_at: string | null }[]> {
  // SIN LOS ACCESOS DE SOPORTE. Cuando el equipo entra a la cuenta de un
  // cliente queda una fila con `soporte_de`; ese negocio no es «suyo» y su
  // bienvenida no tiene nada que hacer en la ficha de quien dio soporte.
  const { data: mias, error } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .is("soporte_de", null);
  if (error) throw new Error(error.message);
  const ids = Array.from(new Set(((mias as any[]) ?? []).map((m) => String(m.org_id))));
  if (ids.length === 0) return [];

  const { data: orgs, error: e2 } = await admin
    .from("organizations")
    .select("id, name, contacto_nombre, contacto_email, bienvenida_enviada_at")
    .in("id", ids)
    .order("created_at", { ascending: true });
  if (e2) throw new Error(e2.message);
  return (orgs as any[]) ?? [];
}
