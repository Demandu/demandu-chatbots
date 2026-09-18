import "server-only";
import { GRAPH } from "./plantillas";

/**
 * TRAERSE DE META EL ESTADO DE LAS PLANTILLAS. UN SOLO SITIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO VIVÍA DENTRO DE UN BOTÓN. La única forma de que `whatsapp_templates`
 * dijera la verdad era que una persona abriera Difusiones y pulsara
 * «sincronizar». Nadie lo hace, así que lo guardado era una foto del día que
 * alguien pasó por ahí.
 *
 * Medido el 17 sep 2026: una cuenta tenía SIETE plantillas guardadas como
 * PENDING desde hacía seis días que en Meta llevaban seis días aprobadas, y la
 * del recordatorio de cita —aprobada en Meta— no estaba guardada siquiera.
 *
 * Un estado que miente es peor que no tenerlo: la plataforma decide con él si
 * puede mandar, y el negocio lee en pantalla algo que no es.
 *
 * Ahora lo llaman dos: el botón de siempre y una tarea programada. Por eso está
 * aquí y no en ninguno de los dos — dos copias de esto se habrían separado, y la
 * que se quedara atrás seguiría escribiendo estados viejos encima de los buenos.
 *
 * ── NO SUSTITUYE AL AVISO DE META, LO RESPALDA ────────────────────────────
 *
 * El motor escucha `message_template_status_update` y actualiza al instante.
 * Esto es la red debajo: un aviso perdido, una app reconectada, una cuenta que
 * ya tenía plantillas antes de que existiera el aviso. Preguntar de vez en
 * cuando cuesta una llamada y cierra todos esos huecos de golpe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Canal = {
  orgId: string;
  botId: string;
  wabaId: string;
  token: string;
};

export type Resumen = { guardadas: number; error?: string };

/** Del arreglo de `components` de Meta: el texto del cuerpo y cuántos huecos tiene. */
export function loQueDiceElCuerpo(components: any[]): { body: string; variables: number } {
  const body = (components ?? []).find((c) => c?.type === "BODY");
  const text: string = body?.text ?? "";
  const huecos = text.match(/\{\{\s*\d+\s*\}\}/g);
  return { body: text, variables: huecos ? huecos.length : 0 };
}

export async function sincronizarPlantillas(db: any, canal: Canal): Promise<Resumen> {
  if (!canal.wabaId || !canal.token || !canal.botId) {
    return { guardadas: 0, error: "sin canal de WhatsApp" };
  }

  let lista: any[];
  try {
    /* LOS CAMPOS SE PIDEN A MANO. Por defecto Meta NO devuelve `rejected_reason`
     * ni `quality_score`, y sin ellos el cliente ve un «Rechazada» mudo que no
     * le dice qué arreglar. */
    const campos = "id,name,language,category,status,components,rejected_reason,quality_score";
    const res = await fetch(
      `${GRAPH}/${canal.wabaId}/message_templates?limit=200&fields=${campos}`,
      { headers: { Authorization: `Bearer ${canal.token}` } },
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j?.data)) {
      const detalle = String(j?.error?.message ?? res.status);
      console.error(`[plantillas] Meta no dio la lista (org ${canal.orgId}):`, detalle);
      return { guardadas: 0, error: detalle };
    }
    lista = j.data;
  } catch (e: any) {
    console.error(`[plantillas] no pude hablar con Meta (org ${canal.orgId}):`, e?.message ?? e);
    return { guardadas: 0, error: "no se pudo hablar con Meta" };
  }

  let guardadas = 0;
  for (const t of lista) {
    const { body, variables } = loQueDiceElCuerpo(t?.components);
    const { error } = await db.from("whatsapp_templates").upsert(
      {
        org_id: canal.orgId,
        bot_id: canal.botId,
        waba_id: canal.wabaId,
        meta_id: String(t?.id ?? ""),
        name: t?.name,
        language: t?.language ?? "es",
        category: t?.category ?? null,
        status: t?.status ?? "PENDING",
        body,
        components: t?.components ?? null,
        variables,
        // «NONE» es lo que manda Meta cuando no hay motivo. Guardarlo como si
        // lo fuera pinta «Rechazada: NONE» en la pantalla del cliente.
        rejected_reason:
          t?.rejected_reason && String(t.rejected_reason).toUpperCase() !== "NONE"
            ? t.rejected_reason
            : null,
        quality: t?.quality_score?.score ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bot_id,name,language" },
    );
    if (error) console.error("[plantillas] no pude guardar una:", error.message);
    else guardadas++;
  }

  return { guardadas };
}
