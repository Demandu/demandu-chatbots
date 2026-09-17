import { createAdminClient } from "@/lib/supabase/admin";
import { llamadaDeTareaProgramada } from "@/lib/cron";
import { mandarElRecordatorio } from "@/lib/agenda/mandarElRecordatorio";
import {
  ventanaDeLaTarea,
  tocaRecordar,
  TOPE_INTENTOS,
  AVISO_HORAS,
} from "@/lib/agenda/cuandoRecordar";

export const dynamic = "force-dynamic";

/**
 * LOS RECORDATORIOS DE CITA, QUE HASTA HOY NO LOS MANDABA NADIE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * La máquina estaba entera: la plantilla aprobada en la cuenta de cada cliente,
 * el envío con todas sus comprobaciones, y hasta la lectura de «Confirmo» y
 * «Necesito cambiarla». Lo único que faltaba era quien la disparase. Había doce
 * tareas programadas y ninguna miraba `citas`, así que la clínica que agenda a
 * las 11:00 no avisaba a nadie salvo que su recepcionista se acordara de entrar
 * al calendario y pulsar un botón.
 *
 * ── LA CONSULTA ESTRECHA, LA REGLA DECIDE ─────────────────────────────────
 *
 * El SQL se queda con las que pueden ser —sin recordar, no canceladas, con
 * intentos de sobra, dentro de la ventana— y `tocaRecordar` decide una por una.
 * Los dos usan los MISMOS números, importados del mismo archivo: con la ventana
 * escrita a mano en el SQL, cambiar `AVISO_HORAS` dejaría la consulta trayendo
 * unas citas y la regla descartando otras.
 *
 * Hay un motivo que el SQL no puede ver —«se agendó hace diez minutos»— porque
 * depende de dos columnas comparadas con la hora de ahora. Ése lo pone la regla,
 * y por eso el filtro de aquí no puede ser el único.
 *
 * ── EL TOPE DE INTENTOS NO ES UNA OPTIMIZACIÓN ────────────────────────────
 *
 * Si la plantilla no está aprobada en la cuenta de Meta de ese negocio, TODOS
 * sus envíos fallan igual. Sin tope, esta tarea convierte eso en una tormenta
 * de rechazos cada diez minutos, y Meta le baja la calidad al número — lo que
 * afecta a todos sus mensajes, no solo a los recordatorios.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuántas por vuelta. Un tope evita que un pico deje la tarea corriendo diez minutos. */
const POR_VUELTA = 40;

export async function POST(req: Request) {
  if (!(await llamadaDeTareaProgramada(req, "recordatorios_cita"))) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ahora = new Date();
  const { desde, hasta } = ventanaDeLaTarea(ahora);

  const { data: citas, error } = await admin
    .from("citas")
    .select("id, org_id, inicio, creada_at, estado, recordatorio_enviado_at, recordatorio_intentos")
    .is("recordatorio_enviado_at", null)
    .neq("estado", "cancelada")
    .lt("recordatorio_intentos", TOPE_INTENTOS)
    .gte("inicio", desde)
    .lte("inicio", hasta)
    .order("inicio", { ascending: true })
    .limit(POR_VUELTA);

  if (error) {
    console.error("[recordatorios] no pude leer las citas:", error.message);
    return Response.json({ error: "no se pudo leer" }, { status: 500 });
  }

  let mandados = 0;
  let fallidos = 0;
  let saltadas = 0;

  for (const cita of (citas ?? []) as any[]) {
    if (!tocaRecordar(cita, ahora)) {
      saltadas++;
      continue;
    }
    const r = await mandarElRecordatorio(admin, String(cita.org_id), String(cita.id));
    if (r.ok) mandados++;
    else fallidos++;
  }

  return Response.json({ ok: true, aviso_horas: AVISO_HORAS, mandados, fallidos, saltadas });
}
