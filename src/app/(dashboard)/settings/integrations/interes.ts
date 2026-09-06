"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { INTEGRACIONES } from "@/lib/integraciones";

/**
 * "Avísame cuando esté".
 *
 * NO ES UN BOTÓN DECORATIVO. Lo que se guarda aquí es la lista de espera real,
 * y es lo que decide qué integración se construye primero: cuántos clientes la
 * pidieron, en vez de una corazonada nuestra. Por eso el botón existe aunque la
 * integración no exista — el dato vale más que la función.
 */
export async function avisarme(clave: string): Promise<{ ok: boolean; error?: string }> {
  if (!INTEGRACIONES.some((i) => i.clave === clave)) {
    return { ok: false, error: "Esa integración no existe." };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu organización." };

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const { error } = await sb
    .from("interes_integraciones")
    .insert({ org_id: orgId, proveedor: clave, user_id: user?.id ?? null });

  // El índice único impide contar dos veces al mismo cliente. Si ya la había
  // pedido, para él es un éxito igual: ya está apuntado.
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    return { ok: false, error: "No se pudo apuntar. Inténtalo otra vez." };
  }

  revalidatePath("/settings/integrations");
  return { ok: true };
}
