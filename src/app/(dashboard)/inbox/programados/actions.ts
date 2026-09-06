"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";

/**
 * Cancela un mensaje que el chatbot tenía programado.
 *
 * POR QUÉ VA CON EL CLIENTE DE ADMINISTRACIÓN Y NO CON EL NORMAL. La tabla de
 * esperas es de solo lectura para el cliente a propósito: quien las crea y las
 * cierra es el motor, y dejar que cualquiera las edite abriría la puerta a
 * moverles la hora o el bloque de destino desde el navegador.
 *
 * Cancelar es la ÚNICA excepción, así que se hace aquí, comprobando a mano las
 * dos cosas que la base ya no comprueba por nosotros:
 *
 *   1. que la espera sea de TU organización, y
 *   2. que tengas permiso de conversaciones.
 *
 * Sin la primera, cualquiera con una sesión válida podría cancelar los
 * recordatorios de otro negocio con solo cambiar un id en el formulario.
 */
export async function cancelarEspera(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const { permisos } = await misPermisos();
  if (!permisos.has("conversaciones")) return;

  const admin = createAdminClient();
  await admin
    .from("esperas_pendientes")
    .update({
      estado: "cancelada",
      detalle: "cancelado a mano desde el panel",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    // El filtro por organización es la comprobación de verdad: aunque llegue
    // un id de otra cuenta, no hay ninguna fila que cambiar.
    .eq("org_id", orgId)
    .in("estado", ["pendiente", "enviada"]);

  revalidatePath("/inbox/programados");
}
