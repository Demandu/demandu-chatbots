import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Deja constancia de que alguien del equipo de Demandu pasó por la plataforma.
 *
 * POR QUÉ NO BASTA CON LO QUE YA GUARDA SUPABASE. Su registro de inicios de
 * sesión (`auth.audit_log_entries`) está vacío — lo poda solo. Lo único que
 * queda es `last_sign_in_at`, una sola marca: el último acceso y nada más. Sin
 * esto no hay historial, y un historial que no se apuntó no se recupera después.
 *
 * DÓNDE SE LLAMA Y POR QUÉ AHÍ. Desde el marco del panel del vendedor y desde
 * el del panel de cliente. El segundo no sobra: cuando un vendedor entra a la
 * cuenta de un cliente para darle soporte, lo que se pinta es el panel de
 * cliente — y eso es exactamente el trabajo que se quiere ver.
 *
 * NUNCA REVIENTA NI HACE ESPERAR. Es un apunte de gestión: que falle no puede
 * tumbar la pantalla de nadie, y que tarde no puede retrasar una carga. Por eso
 * no se espera al resultado.
 *
 * La función de la base ignora a quien no sea del equipo: a los clientes no se
 * les lleva registro de asistencia, no trabajan para nosotros.
 */
export function anotarPaso(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    createAdminClient()
      .rpc("anotar_paso_del_equipo", { p_user_id: userId })
      .then(({ error }) => {
        if (error) console.error("[asistencia] no se pudo anotar:", error.message);
      });
  } catch (e) {
    console.error("[asistencia] fallo al anotar:", e);
  }
}
