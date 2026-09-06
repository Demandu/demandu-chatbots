"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { zonaValida } from "@/lib/zonaHoraria";

/**
 * El negocio miró su zona horaria y dijo que era la suya.
 *
 * ── SE COMPRUEBA QUE LA ZONA EXISTA, AUNQUE VENGA DE NUESTRO PROPIO AVISO ──
 *
 * Llega del navegador, y lo que llega del navegador se comprueba siempre. Una
 * zona inventada no falla al guardarse: falla meses después, al formatear la
 * hora en el mensaje de un cliente — que es exactamente el tipo de fallo del
 * que va todo esto.
 *
 * ── Y SE ESCRIBEN LAS DOS COSAS A LA VEZ ──────────────────────────────────
 *
 * La zona y la confirmación. Si se guardara solo la confirmación, quedaría un
 * negocio marcado como «ya lo miró» con la zona vieja puesta — o sea, el fallo
 * original con un sello de aprobado encima y sin ningún aviso que lo delate.
 */
export async function confirmarZona(zona: string): Promise<{ ok: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "Sesión caducada." };

  const z = String(zona ?? "").trim();
  if (!zonaValida(z)) return { ok: false, error: "Esa zona horaria no existe." };

  const { error } = await createClient()
    .from("organizations")
    .update({ timezone: z, zona_confirmada: true })
    .eq("id", orgId);

  if (error) {
    console.error("[zona] no pude confirmarla:", error.message);
    return { ok: false, error: "No se pudo guardar." };
  }

  // Las pantallas que enseñan horarios tienen que dejar de enseñar el aviso —y
  // de ofrecer las horas viejas— en cuanto esto se guarda.
  revalidatePath("/", "layout");
  return { ok: true };
}
