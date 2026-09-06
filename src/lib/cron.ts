import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿Esta llamada viene de verdad de una tarea programada nuestra?
 *
 * POR QUÉ NO ES UN SECRETO COMPARTIDO. Lo era, y no funcionó: la tarea de
 * Google Sheets estuvo desde el 22 de agosto llamando cada 2 minutos con el
 * texto de ejemplo «PEGA_AQUI_TU_SECRETO» —4.859 intentos, 4.859 rechazos— y
 * encima `CRON_SECRET` nunca se configuró en Netlify, así que ni con el valor
 * bueno habría entrado. Un secreto que hay que copiar a mano en dos sitios
 * distintos acaba mal en uno de los dos, y guardado dentro de la definición del
 * cron lo lee cualquiera con acceso a la base.
 *
 * AHORA: la base emite un TICKET justo antes de cada llamada. Vale cinco
 * minutos, sirve para un solo propósito y se gasta al usarlo — así que
 * interceptarlo tampoco sirve de nada. No hay nada que configurar.
 *
 * Se sigue aceptando `CRON_SECRET` si algún día existe, para no romper a quien
 * llame así; pero ya no hace falta que exista.
 */
export async function llamadaDeTareaProgramada(req: Request, proposito: string): Promise<boolean> {
  const secreto = (process.env.CRON_SECRET ?? "").trim();
  const dado = (req.headers.get("x-demandu-cron") ?? "").trim();
  if (secreto && dado && dado === secreto) return true;

  const ticket = (req.headers.get("x-demandu-ticket") ?? "").trim();
  if (!ticket) return false;

  try {
    const { data, error } = await createAdminClient()
      .rpc("usar_ticket_de_cron", { p_id: ticket, p_proposito: proposito });
    if (error) {
      console.error("[tareas] no pude comprobar el ticket:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[tareas] fallo comprobando el ticket:", e);
    return false;
  }
}
