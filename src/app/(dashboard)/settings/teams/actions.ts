"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { diferenciaConElRol, TODAS, type ClavePermiso, type Rol } from "@/lib/permisos";

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
export async function borrarPersona(persona: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createClient().rpc("persona_borrar", { p_persona: persona });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
