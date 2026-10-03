import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnvioApuntado, NegocioParaLaLista } from "./estadoDeLosNegocios";
import { ETIQUETAS_DE_BIENVENIDA } from "./estadoDeLosNegocios";

/**
 * LO QUE LA LISTA DE NEGOCIOS NECESITA, EN CUATRO CONSULTAS Y NO EN VEINTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `buscarUsuarioPorCorreo` recorre las páginas de Supabase buscando UNA
 * dirección. Llamarlo por cada negocio sería recorrer la lista entera siete
 * veces para contestar lo mismo. Aquí se trae una vez y se indexa por correo.
 *
 * SE INDEXA EN MINÚSCULAS porque el correo de contacto de un negocio lo
 * escribió una persona a mano y el de la cuenta lo normalizó Supabase. Con una
 * mayúscula de diferencia, la lista diría «sin cuenta» de alguien que sí la
 * tiene — y entonces ofrecería reenviarle cosas que no le tocan.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const POR_PAGINA = 1000;
const PAGINAS_MAX = 20;

export type CuentaConocida = { confirmadoEl: string | null; invitadoEl: string | null };

/** Todas las cuentas, por correo en minúsculas. */
export async function cuentasPorCorreo(admin: SupabaseClient): Promise<Map<string, CuentaConocida>> {
  const fuera = new Map<string, CuentaConocida>();
  for (let page = 1; page <= PAGINAS_MAX; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw new Error(error.message);
    const usuarios = data?.users ?? [];
    for (const u of usuarios) {
      const correo = String(u.email ?? "").trim().toLowerCase();
      if (!correo) continue;
      fuera.set(correo, {
        confirmadoEl: u.email_confirmed_at ?? null,
        invitadoEl: (u as any).invited_at ?? null,
      });
    }
    if (usuarios.length < POR_PAGINA) break;
  }
  return fuera;
}

export async function negociosParaLaLista(admin: SupabaseClient): Promise<NegocioParaLaLista[]> {
  const { data, error } = await admin
    .from("organizations")
    .select("id, name, contacto_email, bienvenida_enviada_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as any[]) ?? []) as NegocioParaLaLista[];
}

/** Solo los envíos de bienvenida. Las pruebas y los de Supabase no pintan aquí. */
export async function enviosDeBienvenida(admin: SupabaseClient): Promise<EnvioApuntado[]> {
  const { data, error } = await admin
    .from("correos_enviados")
    .select("para, etiqueta, enviado, error, created_at")
    .in("etiqueta", ETIQUETAS_DE_BIENVENIDA as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data as any[]) ?? []) as EnvioApuntado[];
}

/**
 * Quién es el dueño de cada negocio.
 *
 * HACE FALTA PARA EL BOTÓN: la acción de reenviar recibe el id de la PERSONA y
 * comprueba que el negocio es suyo. La lista habla de negocios, así que tiene
 * que traer a su dueño para poder pulsar.
 *
 * Sin los accesos de soporte: quien entró a dar soporte no es el dueño.
 */
export async function duenoDeCadaNegocio(admin: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await admin
    .from("memberships")
    .select("org_id, user_id, role, created_at")
    .is("soporte_de", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const fuera = new Map<string, string>();
  const filas = ((data as any[]) ?? []).map((m) => ({
    org: String(m.org_id),
    usuario: String(m.user_id),
    rol: String(m.role ?? ""),
  }));
  // El dueño manda; si no hay, un administrador; y si tampoco, el primero que
  // entró. Un negocio sin nadie no tendría botón, y eso esconde el pendiente.
  for (const r of filas) if (r.rol === "owner" && !fuera.has(r.org)) fuera.set(r.org, r.usuario);
  for (const r of filas) if (r.rol === "admin" && !fuera.has(r.org)) fuera.set(r.org, r.usuario);
  for (const r of filas) if (!fuera.has(r.org)) fuera.set(r.org, r.usuario);
  return fuera;
}
