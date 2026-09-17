"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { mandarElRecordatorio } from "@/lib/agenda/mandarElRecordatorio";

/**
 * EL BOTÓN «RECORDAR» DEL CALENDARIO.
 *
 * Aquí ya no vive nada más que la sesión y el refresco de la pantalla. El envío
 * —con sus comprobaciones, su candado de intentos y su bitácora— está en
 * `mandarElRecordatorio`, porque desde hoy también lo manda solo una tarea
 * programada y dos copias de esto se habrían separado en una semana.
 *
 * Va `aMano: true`: quien pulsa el botón está eligiendo mandarlo AHORA, aunque
 * falten tres días o la cita se acabe de agendar. Lo que protege a la otra
 * persona —cancelada, ya recordada, ya pasó— sigue frenando igual.
 */
export async function mandarRecordatorio(formData: FormData): Promise<void> {
  const citaId = String(formData.get("cita_id") ?? "").trim();
  if (!citaId) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  await mandarElRecordatorio(createAdminClient(), orgId, citaId, { aMano: true });

  // Se refresca pase lo que pase: si no salió, el motivo quedó apuntado y el
  // botón tiene que volver a estar disponible.
  revalidatePath("/calendario");
}
