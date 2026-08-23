"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * El freno de mano de la IA, por cliente.
 *
 * NO ES UN PRECIO, ES UN LÍMITE. Cobrarle más a alguien de forma automática
 * sin que lo haya aceptado es cómo se consiguen contracargos y reseñas de una
 * estrella. Lo que hace este freno es acotar el costo mientras hablas con él
 * y acuerdan subirlo de plan — que es la conversación que de verdad convierte.
 *
 * Y al llegar al tope el bot NO se calla: sigue con sus flujos y botones, solo
 * deja de pensar respuestas nuevas.
 */
export async function ponerTopeIA(formData: FormData): Promise<void> {
  // El marco de /superadmin ya comprueba el permiso, pero esta acción se puede
  // invocar directamente por su URL: se vuelve a comprobar aquí.
  const { data: esAdmin } = await createClient().rpc("is_platform_admin");
  if (!esAdmin) return;

  const orgId = String(formData.get("org_id") ?? "");
  const crudo = String(formData.get("tope") ?? "").trim();
  if (!orgId) return;

  // Vacío = sin tope, que es lo normal y lo que se vende.
  const tope = crudo === "" ? null : Math.max(0, Math.floor(Number(crudo) || 0));

  await createAdminClient().from("organizations").update({ tope_ia: tope }).eq("id", orgId);
  revalidatePath("/superadmin/consumo");
}
