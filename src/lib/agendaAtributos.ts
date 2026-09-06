import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LOS DATOS QUE HACEN FALTA PARA AGENDAR SE CREAN SOLOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ. Para agendar de verdad hacen falta dos datos de la persona: cómo se
 * llama y su correo —sin correo no hay invitación, y sin invitación la cita
 * existe pero nadie se entera—. Esos datos se guardan en «Datos del lead», una
 * pantalla que el dueño de una clínica no ha abierto nunca y que no tiene por
 * qué abrir.
 *
 * Hasta hoy el recorrido para que una IA agendara era: conectar Google en una
 * pantalla, crear dos atributos en otra, marcar dos casillas en una tercera. Si
 * te saltabas cualquiera de los tres, no fallaba nada visible — simplemente la
 * cita salía sin invitación, o la IA decía que no podía agendar.
 *
 * Ahora conectar la agenda deja los dos datos creados. Es una consulta que casi
 * siempre no hace nada, y evita el único recorrido de tres pantallas que tenía
 * esta plataforma.
 *
 * ── NO SE TOCA LO QUE EL NEGOCIO YA TIENE ─────────────────────────────────
 *
 * Si ya existe un atributo con esa clave —aunque se llame distinto, aunque sea
 * de otro tipo, aunque lo tenga oculto— SE DEJA COMO ESTÁ. Un negocio que
 * renombró «Correo» a «Email de contacto» y lo puso el primero de su lista no
 * puede encontrárselo reorganizado por haber conectado su calendario.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo mínimo para que una cita salga completa. */
export const ATRIBUTOS_DE_AGENDA = [
  { key: "nombre", name: "Nombre", type: "string", sort: 1 },
  { key: "correo", name: "Correo", type: "email", sort: 2 },
] as const;

/**
 * Deja creados los datos del lead que necesita la agenda.
 *
 * NUNCA REVIENTA. Se llama justo después de conectar Google o Calendly, y la
 * conexión ya está guardada cuando esto corre: si fallara y se dejara subir, el
 * negocio vería «no se pudo conectar tu calendario» con el calendario
 * perfectamente conectado, y volvería a intentarlo en bucle.
 */
export async function asegurarAtributosDeAgenda(orgId: string): Promise<void> {
  if (!orgId) return;
  try {
    const sb = createAdminClient();

    const { data: yaHay } = await sb
      .from("custom_attributes")
      .select("key")
      .eq("org_id", orgId)
      .in("key", ATRIBUTOS_DE_AGENDA.map((a) => a.key));

    const tiene = new Set(((yaHay ?? []) as any[]).map((a) => String(a.key)));
    const faltan = ATRIBUTOS_DE_AGENDA.filter((a) => !tiene.has(a.key));
    if (!faltan.length) return;

    // `sort` sale del final de la lista que ya tenga, no de los números fijos
    // de arriba: meterlos en las dos primeras posiciones le reordenaría la
    // pantalla a quien ya la tenía puesta a su gusto.
    const { data: ultimo } = await sb
      .from("custom_attributes")
      .select("sort")
      .eq("org_id", orgId)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();
    let sort = Number((ultimo as any)?.sort ?? 0);

    await sb.from("custom_attributes").insert(
      faltan.map((a) => ({
        org_id: orgId,
        key: a.key,
        name: a.name,
        type: a.type,
        purpose: "chatbot",
        visible: true,
        sort: ++sort,
      })),
    );
  } catch (e) {
    // La agenda ya está conectada. Que falten dos campos es molesto; decirle al
    // negocio que la conexión falló cuando no falló es mucho peor.
    console.error("[agenda] no pude crear los datos del lead:", (e as Error)?.message ?? e);
  }
}
