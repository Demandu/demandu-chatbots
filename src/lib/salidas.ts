import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Los eventos que Demandu sabe contar hacia fuera.
 *
 * ESTA LISTA ES UN CONTRATO. Quien conecta su CRM escribe código contra estos
 * nombres; cambiarle el nombre a uno rompe integraciones ajenas sin avisar. Se
 * añaden eventos nuevos, no se renombran los que ya salieron.
 *
 * Están en español a propósito, como el resto de la plataforma: quien los va a
 * leer es una pyme de habla hispana o su consultor, no un ingeniero de Silicon
 * Valley.
 */
export const EVENTOS = [
  { clave: "lead.nuevo", nombre: "Lead nuevo", desc: "Alguien escribe por primera vez." },
  { clave: "lead.datos", nombre: "Datos del lead", desc: "El chatbot capturó su nombre, correo u otro dato." },
  { clave: "cita.agendada", nombre: "Cita agendada", desc: "Se reservó una cita en el calendario." },
  { clave: "pase.a.humano", nombre: "Pidió una persona", desc: "La conversación necesita a alguien del equipo." },
  { clave: "conversacion.cerrada", nombre: "Conversación cerrada", desc: "Terminó la conversación." },
] as const;

export type ClaveDeEvento = (typeof EVENTOS)[number]["clave"];

/**
 * Manda un evento a las salidas del cliente.
 *
 * NUNCA REVIENTA Y NUNCA HACE ESPERAR. Se llama desde el camino de un mensaje
 * de WhatsApp: si esto fallara, se caería la conversación de un cliente por un
 * webhook mal configurado de otro. Y si tardara, el bot tardaría.
 *
 * Tampoco manda nada por su cuenta: solo encola. Entregar es cosa del reloj, que
 * sabe reintentar. Si el CRM del cliente está caído, aquí no nos enteramos ni
 * nos importa — ese es justo el punto de separarlo.
 *
 * Si el cliente no tiene ninguna salida configurada —el caso de casi todos— la
 * función de la base no inserta nada y esto cuesta una consulta trivial.
 */
export function emitir(orgId: string | null | undefined, tipo: ClaveDeEvento, datos: Record<string, unknown>): void {
  if (!orgId) return;
  try {
    createAdminClient()
      .rpc("emitir_evento", { p_org_id: orgId, p_tipo: tipo, p_payload: datos })
      .then(({ error }) => {
        if (error) console.error(`[salidas] no pude encolar ${tipo}:`, error.message);
      });
  } catch (e) {
    console.error(`[salidas] fallo al encolar ${tipo}:`, e);
  }
}
