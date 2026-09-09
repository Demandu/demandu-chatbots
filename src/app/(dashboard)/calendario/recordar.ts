"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { enviarPlantilla } from "@/lib/canales/whatsappEnviar";
import { zonaDelNegocio } from "@/lib/agenda";
import { cuandoEnPalabras, valoresDelRecordatorio } from "@/lib/agenda/recordatorio";
import { RECORDATORIO_CITA } from "@/lib/whatsapp/plantillasDeLaCasa";

/**
 * MANDAR EL RECORDATORIO DE UNA CITA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE COMPRUEBA TODO ANTES DE MANDAR, Y CADA «NO» DICE QUÉ HACER.
 *
 * Un recordatorio que no sale y no explica por qué es peor que no tener el
 * botón: el negocio cree que avisó y nadie le contestó, cuando lo que pasó es
 * que ese contacto no tiene teléfono.
 *
 * ── UNO SOLO, Y ESTO NO ES UN DETALLE ─────────────────────────────────────
 *
 * `recordatorio_enviado_at` corta el segundo envío. Un recordatorio repetido es
 * la forma más rápida de que alguien silencie el número del negocio — y de que
 * Meta le baje la calidad al número, que afecta a TODOS sus mensajes.
 *
 * ── Y NO SE RECUERDA LO QUE YA PASÓ ───────────────────────────────────────
 *
 * Mandar «te recordamos tu cita» de una cita de ayer deja al negocio como si no
 * supiera de lo suyo delante de su cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function mandarRecordatorio(
  formData: FormData,
): Promise<void> {
  const citaId = String(formData.get("cita_id") ?? "").trim();
  if (!citaId) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const admin = createAdminClient();

  const { data: cita, error: errCita } = await admin
    .from("citas")
    .select("id, org_id, contact_id, inicio, nombre, estado, recordatorio_enviado_at")
    .eq("id", citaId)
    .eq("org_id", orgId)          // NO basta con el id: sin esto se recuerda la cita de otro negocio
    .maybeSingle();

  // «No se pudo mirar» y «no existe» son cosas distintas y se arreglan distinto.
  if (errCita) return apuntar(admin, orgId, citaId, "no se pudo leer la cita");
  if (!cita) return apuntar(admin, orgId, citaId, "esa cita no es de esta cuenta");

  if (cita.estado === "cancelada") return apuntar(admin, orgId, citaId, "la cita está cancelada");
  if (cita.recordatorio_enviado_at) return apuntar(admin, orgId, citaId, "ya se mandó el recordatorio");
  if (new Date(cita.inicio).getTime() < Date.now()) {
    return apuntar(admin, orgId, citaId, "esa cita ya pasó");
  }

  const { data: contacto, error: errContacto } = await admin
    .from("contacts")
    .select("phone, name, wa_name")
    .eq("id", cita.contact_id ?? "")
    .eq("org_id", orgId)
    .maybeSingle();
  if (errContacto) return apuntar(admin, orgId, citaId, "no se pudo leer el contacto");

  const telefono = String(contacto?.phone ?? "").replace(/\D/g, "");
  if (!telefono) return apuntar(admin, orgId, citaId, "ese contacto no tiene teléfono de WhatsApp");

  const { data: canal, error: errCanal } = await admin
    .from("whatsapp_channels")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle();
  if (errCanal) return apuntar(admin, orgId, citaId, "no se pudo leer el canal de WhatsApp");
  if (!canal?.phone_number_id || !canal?.access_token) {
    return apuntar(admin, orgId, citaId, "este negocio todavía no tiene WhatsApp conectado");
  }

  /* EL NOMBRE DEL NEGOCIO VA DENTRO DEL MENSAJE que lee el cliente, así que si
   * no se puede leer NO se manda a medias: el recordatorio es de un solo tiro
   * —`recordatorio_enviado_at` corta el segundo— y gastarlo en un «tu cita con
   * nosotros» es gastarlo mal. Se para y se dice. */
  const { data: org, error: errOrg } = await admin
    .from("organizations").select("name").eq("id", orgId).maybeSingle();
  if (errOrg) return apuntar(admin, orgId, citaId, "no se pudo leer el nombre del negocio");

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
    // que la plantilla siga en revisión, y eso NO se arregla reintentando.
    return apuntar(admin, orgId, citaId, envio.error ?? "Meta rechazó el envío");
  }

  // SE APUNTA DESPUÉS DE QUE META CONFIRME. Al revés, un envío fallido dejaría
  // la cita marcada como recordada y el botón no volvería a aparecer nunca.
  await admin
    .from("citas")
    .update({ recordatorio_enviado_at: new Date().toISOString() })
    .eq("id", cita.id)
    .eq("org_id", orgId);

  revalidatePath("/calendario");
}

/** Deja el motivo donde se pueda ver, en vez de fallar en silencio. */
async function apuntar(admin: any, orgId: string, citaId: string, motivo: string) {
  console.error(`[recordatorio] cita ${citaId}: ${motivo}`);
  try {
    await admin.from("conexiones_fallidas").insert({
      org_id: orgId, canal: "whatsapp", paso: "recordatorio_cita",
      detalle: `${citaId}: ${motivo}`.slice(0, 500),
    });
  } catch { /* apuntar el fallo no puede provocar otro */ }
  revalidatePath("/calendario");
}
