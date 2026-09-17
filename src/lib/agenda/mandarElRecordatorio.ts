import "server-only";
import { enviarPlantilla } from "@/lib/canales/whatsappEnviar";
import { zonaDelNegocio } from "@/lib/agenda";
import { cuandoEnPalabras, valoresDelRecordatorio } from "@/lib/agenda/recordatorio";
import { RECORDATORIO_CITA } from "@/lib/whatsapp/plantillasDeLaCasa";
import { porQueNoSeRecuerda, EN_PALABRAS } from "@/lib/agenda/cuandoRecordar";

/**
 * MANDAR EL RECORDATORIO DE UNA CITA. UN SOLO SITIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Esto vivía dentro de la acción del botón del calendario, que era el único que
 * lo mandaba. Ahora hay dos que lo mandan —el botón y la tarea programada— y
 * copiarlo habría sido tener DOS recordatorios: uno que comprueba el teléfono y
 * otro que se olvida, uno que apunta el fallo y otro que se lo traga. Es
 * exactamente la familia de fallo que más veces nos ha costado algo aquí.
 *
 * ── LA CUENTA DE INTENTOS ES TAMBIÉN EL CANDADO ───────────────────────────
 *
 * Se sube ANTES de llamar a Meta, y solo si nadie más la ha subido mientras
 * tanto (`.eq("recordatorio_intentos", loQueLeimos)`). Dos ejecuciones de la
 * tarea que se solapen leen el mismo número, y solo una consigue escribirlo: la
 * otra se va de vacío. Sin eso, la misma persona recibe dos recordatorios — que
 * es la forma más rápida de que silencie el número del negocio.
 *
 * La marca de enviado, en cambio, se pone DESPUÉS de que Meta confirme. Al
 * revés, un envío fallido dejaría la cita como recordada para siempre.
 *
 * ── CADA «NO» DICE QUÉ HACER, Y QUEDA ESCRITO ─────────────────────────────
 *
 * Un recordatorio que no sale y no explica por qué es peor que no tener la
 * función: el negocio cree que avisó, y lo que pasó es que ese contacto no
 * tiene teléfono.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Resultado = { ok: true } | { ok: false; motivo: string };

export async function mandarElRecordatorio(
  admin: any,
  orgId: string,
  citaId: string,
  opciones: { aMano?: boolean } = {},
): Promise<Resultado> {
  const no = (motivo: string) => apuntar(admin, orgId, citaId, motivo);

  const { data: cita, error: errCita } = await admin
    .from("citas")
    .select(
      "id, org_id, contact_id, inicio, creada_at, nombre, estado, " +
        "recordatorio_enviado_at, recordatorio_intentos",
    )
    .eq("id", citaId)
    .eq("org_id", orgId) // NO basta con el id: sin esto se recuerda la cita de otro negocio
    .maybeSingle();

  // «No se pudo mirar» y «no existe» son cosas distintas y se arreglan distinto.
  if (errCita) return no("no se pudo leer la cita");
  if (!cita) return no("esa cita no es de esta cuenta");

  /* CUÁNDO SE RECUERDA LO DECIDE UN SOLO SITIO. La tarea filtra con esta misma
   * función antes de llegar aquí; esto no es una segunda comprobación por si
   * acaso, es la que vale también para el botón —que pasa `aMano`— y para las
   * citas que cambiaron entre que la tarea las leyó y llegó a mandarlas. */
  const porQue = porQueNoSeRecuerda(cita, new Date(), opciones);
  if (porQue) return no(EN_PALABRAS[porQue]);

  const { data: contacto, error: errContacto } = await admin
    .from("contacts")
    .select("phone, name, wa_name")
    .eq("id", cita.contact_id ?? "")
    .eq("org_id", orgId)
    .maybeSingle();
  if (errContacto) return no("no se pudo leer el contacto");

  const telefono = String(contacto?.phone ?? "").replace(/\D/g, "");
  if (!telefono) return no("ese contacto no tiene teléfono de WhatsApp");

  const { data: canal, error: errCanal } = await admin
    .from("whatsapp_channels")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle();
  if (errCanal) return no("no se pudo leer el canal de WhatsApp");
  if (!canal?.phone_number_id || !canal?.access_token) {
    return no("este negocio todavía no tiene WhatsApp conectado");
  }

  /* EL NOMBRE DEL NEGOCIO VA DENTRO DEL MENSAJE que lee el cliente, así que si
   * no se puede leer NO se manda a medias: el recordatorio es de un solo tiro y
   * gastarlo en un «tu cita con nosotros» es gastarlo mal. */
  const { data: org, error: errOrg } = await admin
    .from("organizations").select("name").eq("id", orgId).maybeSingle();
  if (errOrg) return no("no se pudo leer el nombre del negocio");

  /* EL CANDADO. Ver la cabecera: subir el contador es lo que reclama esta cita
   * para esta ejecución, y se hace comparando contra lo que acabamos de leer. */
  const intentosLeidos = Number(cita.recordatorio_intentos ?? 0);
  const { data: tomada, error: errTomar } = await admin
    .from("citas")
    .update({ recordatorio_intentos: intentosLeidos + 1 })
    .eq("id", cita.id)
    .eq("org_id", orgId)
    .eq("recordatorio_intentos", intentosLeidos)
    .is("recordatorio_enviado_at", null)
    .select("id")
    .maybeSingle();
  if (errTomar) return no("no se pudo apuntar el intento");
  if (!tomada) return { ok: false, motivo: "otra ejecución se la llevó primero" };

  const zona = (await zonaDelNegocio(orgId)) || "UTC";
  const valores = valoresDelRecordatorio({
    nombre: cita.nombre ?? contacto?.name ?? contacto?.wa_name ?? null,
    negocio: String(org?.name ?? "").trim() || "nosotros",
    cuando: cuandoEnPalabras(cita.inicio, zona),
  });

  const envio = await enviarPlantilla(
    canal.phone_number_id, canal.access_token, telefono,
    RECORDATORIO_CITA.nombre, RECORDATORIO_CITA.idioma, valores,
  );

  if (!envio.ok) {
    // El motivo de Meta, tal cual, para que se pueda arreglar. El más común es
    // que la plantilla siga en revisión, y eso NO se arregla reintentando: por
    // eso el intento ya quedó contado y el tope acabará parando la tarea.
    return no(envio.error ?? "Meta rechazó el envío");
  }

  await admin
    .from("citas")
    .update({ recordatorio_enviado_at: new Date().toISOString() })
    .eq("id", cita.id)
    .eq("org_id", orgId);

  return { ok: true };
}

/** Deja el motivo donde se pueda ver, en vez de fallar en silencio. */
async function apuntar(admin: any, orgId: string, citaId: string, motivo: string): Promise<Resultado> {
  console.error(`[recordatorio] cita ${citaId}: ${motivo}`);
  try {
    await admin.from("conexiones_fallidas").insert({
      org_id: orgId, canal: "whatsapp", paso: "recordatorio_cita",
      detalle: `${citaId}: ${motivo}`.slice(0, 500),
    });
  } catch { /* apuntar el fallo no puede provocar otro */ }
  return { ok: false, motivo };
}
