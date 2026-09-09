"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

/**
 * Qué calendarios se ven en la pantalla de agenda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Se guarda con la SESIÓN del usuario, no con el cliente admin: el RLS de
 * `organizations` ya impide tocar la de otro, y usar admin aquí sería quitar
 * esa comprobación para nada.
 *
 * GUARDAR CERO CALENDARIOS ES UNA ELECCIÓN VÁLIDA y se guarda como array vacío,
 * NO como null. `null` significa «no lo he elegido» y activa el valor de fábrica
 * —el principal—, así que confundir los dos haría que apagarlo todo volviera a
 * encender el principal, y la pantalla parecería que no guarda.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function guardarCalendariosVisibles(formData: FormData): Promise<void> {
  const ids = formData
    .getAll("calendario")
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  /* LA ORGANIZACIÓN SE PIDE POR SU NOMBRE, NUNCA «la primera que salga».
   * Con una sesión de soporte abierta hay más de una a la vista, y guardar en
   * «una cualquiera» le cambiaría la pantalla al cliente equivocado. */
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  await createClient()
    .from("organizations")
    .update({ calendarios_visibles: ids })
    .eq("id", orgId);

  revalidatePath("/calendario");
}
