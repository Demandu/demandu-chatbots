"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { generarLlave } from "@/lib/api/llave";

/**
 * Crear una llave de API.
 *
 * LA LLAVE COMPLETA SE DEVUELVE UNA SOLA VEZ, aquí, y no se guarda en ningún
 * sitio: en la base solo queda su hash. Si el cliente la pierde, no hay forma
 * de recuperarla ni para nosotros — hay que crear otra. Es incómodo a
 * propósito: es lo que hace que una filtración de la base no valga nada.
 */
export async function crearLlave(nombre: string): Promise<{
  ok: boolean;
  llave?: string;
  error?: string;
}> {
  const limpio = (nombre ?? "").trim().slice(0, 60) || "Sin nombre";

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu organización." };

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const { completa, hash, prefijo } = generarLlave();

  // RLS decide si esta persona puede crear llaves (permiso de conexiones).
  const { error } = await sb
    .from("api_keys")
    .insert({ org_id: orgId, nombre: limpio, prefijo, hash, creada_por: user?.id ?? null });

  if (error) {
    console.error("[llaves] no se pudo crear:", error.message);
    return { ok: false, error: "No se pudo crear la llave. ¿Tienes permiso de conexiones?" };
  }

  revalidatePath("/settings/integrations");
  return { ok: true, llave: completa };
}

/**
 * Revocar. No se borra la fila: se marca.
 *
 * Así el cliente sigue viendo que esa llave existió, cuándo se usó por última
 * vez y cuándo se cortó. Borrarla dejaría un agujero en la historia justo
 * cuando más falta hace mirarla: después de un susto.
 */
export async function revocarLlave(id: string): Promise<{ ok: boolean; error?: string }> {
  const sb = createClient();
  const { error } = await sb
    .from("api_keys")
    .update({ revocada_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "No se pudo revocar." };
  revalidatePath("/settings/integrations");
  return { ok: true };
}
