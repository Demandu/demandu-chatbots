"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { diferenciaConElRol, TODAS, type ClavePermiso, type Rol } from "@/lib/permisos";

/**
 * El dominio desde el que está entrando el cliente.
 *
 * Se saca de la petición y no de una variable de entorno a propósito: el enlace
 * de la invitación tiene que volver AL MISMO sitio del que salió. Con un valor
 * fijo, invitar desde una vista previa de Netlify mandaría a la persona a
 * producción, y en local no funcionaría nunca.
 */
function dominioActual(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "platform.demandu.tech";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

/**
 * Rol y permisos de una persona del equipo.
 *
 * LOS RESGUARDOS DE VERDAD ESTÁN EN LA BASE (`persona_guardar_acceso`), no
 * aquí. Esta función solo traduce lo que marcó la pantalla; quien impide
 * ascender a alguien a dueño, tocar al dueño o editarse a uno mismo es
 * Postgres. Si esas reglas vivieran solo en TypeScript, bastaría con reenviar
 * la petición a mano para saltárselas.
 *
 * SE GUARDA LA DIFERENCIA CON EL ROL, no la lista completa: así, si mañana
 * cambiamos qué trae "Atención al cliente" de fábrica, todo el equipo lo hereda
 * sin migrar nada — salvo quien tenga una excepción puesta a propósito.
 */
export async function guardarAcceso(datos: {
  persona: string;
  rol: Rol;
  permisos: ClavePermiso[];
}): Promise<{ ok: boolean; error?: string }> {
  const limpios = (datos.permisos ?? []).filter((c) => TODAS.includes(c));

  const { error } = await createClient().rpc("persona_guardar_acceso", {
    p_persona: datos.persona,
    p_rol: datos.rol,
    p_permisos: diferenciaConElRol(datos.rol, limpios),
  });

  if (error) return { ok: false, error: error.message };

  // Los permisos deciden qué se ve en el marco de TODAS las pantallas: si solo
  // se revalidara /settings/teams, la persona afectada seguiría viendo su menú
  // de antes hasta recargar a mano.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Quitar a alguien del equipo.
 *
 * Sus conversaciones, tarjetas y tareas NO se borran: quedan sin asignar. La
 * pantalla ya se lo dijo antes de confirmar, con el número exacto.
 */
/**
 * Invitar a alguien a entrar a la plataforma.
 *
 * DOS PASOS Y EL ORDEN IMPORTA:
 *
 *   1. Se apunta la invitación en la base (`invitar_persona`). Ahí queda a qué
 *      organización entra, con qué rol y con qué permisos.
 *   2. Se le manda el correo con la API de administración de Supabase.
 *
 * Si se hiciera al revés y fallara el apunte, la persona recibiría un correo,
 * pondría su contraseña y aterrizaría en una organización vacía suya en vez de
 * en la de su jefe — con su propio embudo y sin ver ni una conversación. Es el
 * fallo silencioso que más cuesta después.
 *
 * LA CONTRASEÑA LA PONE ELLA, NUNCA NADIE MÁS. Aquí no se genera ni se guarda
 * ninguna: el correo lleva un enlace de un solo uso y la persona la escribe en
 * su propia pantalla. Así el administrador tiene todo el control —invitar,
 * reenviar, quitar— sin conocer la contraseña de su empleado, que es lo que
 * hace que las acciones dentro de la plataforma signifiquen algo.
 */
export async function invitarPersona(datos: {
  persona: string | null;
  correo: string;
  rol: Rol;
  permisos: ClavePermiso[];
}): Promise<{ ok: boolean; error?: string }> {
  const correo = (datos.correo ?? "").trim().toLowerCase();
  if (!correo.includes("@")) return { ok: false, error: "Hace falta un correo válido." };

  const limpios = (datos.permisos ?? []).filter((c) => TODAS.includes(c));

  const { error: errorApunte } = await createClient().rpc("invitar_persona", {
    p_persona: datos.persona,
    p_email: correo,
    p_rol: datos.rol,
    p_permisos: diferenciaConElRol(datos.rol, limpios),
  });
  if (errorApunte) return { ok: false, error: errorApunte.message };

  const { error: errorCorreo } = await createAdminClient().auth.admin.inviteUserByEmail(correo, {
    redirectTo: `${dominioActual()}/auth/callback?next=/crear-contrasena`,
  });

  if (errorCorreo) {
    // El apunte queda hecho a propósito: si el fallo es del correo (SMTP mal
    // configurado, límite por hora), reintentar la invitación funciona sin
    // dejar nada a medias.
    return {
      ok: false,
      error: `La invitación quedó guardada pero el correo no salió: ${errorCorreo.message}`,
    };
  }

  revalidatePath("/settings/teams");
  return { ok: true };
}

export async function borrarPersona(persona: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createClient().rpc("persona_borrar", { p_persona: persona });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
