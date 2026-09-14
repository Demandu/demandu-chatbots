"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { IDIOMAS, type Idioma } from "@/i18n/idiomas";

/**
 * Cambiar TU idioma, no el de la cuenta.
 *
 * ── SE ESCRIBE EN TU PROPIA MEMBRESÍA ─────────────────────────────────────
 *
 * Con la sesión del usuario y filtrando por `user_id` y `org_id`: nadie puede
 * cambiarle el idioma a otra persona, ni con la dirección escrita a mano.
 *
 * `revalidatePath("/", "layout")` NO es adorno: el idioma se resuelve en el
 * marco del panel y se entrega a todas las pantallas. Sin invalidar el marco,
 * el menú seguiría en el idioma viejo hasta la siguiente recarga completa —y
 * quien lo cambia creería que no funcionó.
 */
export async function guardarIdioma(idioma: string): Promise<{ ok: boolean; error?: string }> {
  if (!(IDIOMAS as readonly string[]).includes(idioma)) {
    return { ok: false, error: "idioma_desconocido" };
  }

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const orgId = await getCurrentOrgId();
  if (!user || !orgId) return { ok: false, error: "sin_sesion" };

  /* ── SE ESCRIBE CON LA LLAVE DE SERVICIO, Y NO ES PEREZA ──────────────
   *
   * `memberships` solo concede a una sesión de usuario UNA columna:
   * `debe_cambiar_contrasena`. Todo lo demás —el rol, los permisos, el acceso
   * de soporte— está cerrado a propósito, porque una persona que pudiera
   * editar su propia membresía podría ascenderse a dueña de la cuenta.
   *
   * `idioma` nació dentro de esa tabla y heredó ese cierre: la pantalla
   * guardaba y devolvía «No se pudo guardar tu idioma». Lo VIMOS en producción,
   * no lo dedujimos.
   *
   * La salida NO es abrir la columna: abrir `memberships` a la sesión por una
   * preferencia sería pagar un riesgo grande por una comodidad pequeña, y la
   * política que existe está afinada para otra cosa. Se escribe con la llave de
   * servicio DESPUÉS de saber quién llama, y se filtra por `user_id` Y
   * `org_id`: el alcance es exactamente el mismo —tu propia membresía, en la
   * cuenta en la que estás— y nadie puede cambiarle el idioma a otra persona. */
  const { error } = await createAdminClient()
    .from("memberships")
    .update({ idioma: idioma as Idioma })
    .eq("user_id", user.id)
    .eq("org_id", orgId);

  // Guardar y no mirar si guardó es cómo una pantalla acaba diciendo «listo»
  // sobre algo que no se escribió.
  if (error) return { ok: false, error: "no_se_pudo" };

  revalidatePath("/", "layout");
  return { ok: true };
}
