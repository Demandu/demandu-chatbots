/**
 * Registro de recorridos de flujo.
 *
 * POR QUÉ EXISTE: hasta ahora la conversación solo guardaba en qué flujo va
 * AHORA MISMO (conversations.flow_state), y eso se sobrescribe con cada
 * mensaje. Así era imposible responder "¿qué flujo funciona mejor?" sin
 * inventarse el número. Aquí queda un renglón por cada vez que un lead entra
 * a un flujo, con cuántos bloques recorrió y cómo terminó.
 *
 * REGLA DE ORO: esto es medición, no conversación. Si algo falla aquí, el bot
 * tiene que seguir contestando como si nada. Por eso TODO va en try/catch y
 * ninguna función lanza: como mucho devuelven null y se pierde una medición.
 *
 * El motor de WhatsApp (Deno) tiene una copia de esta misma lógica; si cambias
 * los motivos de fin, cámbialos en los dos lados (hay una prueba que lo vigila).
 */

/** Cómo terminó el recorrido. Cualquier otro valor lo rechaza la base. */
export type MotivoFin = "completado" | "agente" | "reiniciado" | "cambio";

export const MOTIVOS_FIN: MotivoFin[] = ["completado", "agente", "reiniciado", "cambio"];

export interface DatosRecorrido {
  orgId: string;
  conversationId: string;
  botId?: string | null;
  flowId?: string | null;
  flowName?: string | null;
  channel?: string | null;
}

/** Abre un recorrido y devuelve su id (o null si no se pudo registrar). */
export async function abrirRecorrido(db: any, d: DatosRecorrido): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("flow_runs")
      .insert({
        org_id: d.orgId,
        conversation_id: d.conversationId,
        bot_id: d.botId ?? null,
        flow_id: d.flowId ?? null,
        flow_name: d.flowName ?? null,
        channel: d.channel ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (e: any) {
    console.error("[analítica] no se pudo abrir el recorrido:", e?.message ?? e);
    return null;
  }
}

/**
 * Suma los bloques recorridos en este turno. El recorrido sigue abierto:
 * una conversación puede estar días esperando la respuesta del lead.
 */
export async function avanzarRecorrido(
  db: any,
  runId: string | null | undefined,
  pasos: number,
  ultimoNodo?: string | null,
): Promise<void> {
  if (!runId) return;
  try {
    // Se lee y se vuelve a escribir en vez de un `+ pasos` en SQL porque el
    // cliente de Supabase no expone incrementos. Dos mensajes del mismo lead
    // no se procesan a la vez, así que no hay carrera real.
    const { data } = await db.from("flow_runs").select("steps").eq("id", runId).single();
    await db
      .from("flow_runs")
      .update({
        steps: (data?.steps ?? 0) + Math.max(0, pasos),
        last_node_id: ultimoNodo ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (e: any) {
    console.error("[analítica] no se pudo avanzar el recorrido:", e?.message ?? e);
  }
}

/** Cierra el recorrido con el motivo por el que terminó. */
export async function cerrarRecorrido(
  db: any,
  runId: string | null | undefined,
  motivo: MotivoFin,
  pasos = 0,
  ultimoNodo?: string | null,
): Promise<void> {
  if (!runId) return;
  try {
    const { data } = await db.from("flow_runs").select("steps").eq("id", runId).single();
    const ahora = new Date().toISOString();
    await db
      .from("flow_runs")
      .update({
        steps: (data?.steps ?? 0) + Math.max(0, pasos),
        last_node_id: ultimoNodo ?? null,
        ended_at: ahora,
        ended_reason: motivo,
        updated_at: ahora,
      })
      .eq("id", runId)
      // Si ya estaba cerrado no se toca: el primer motivo es el bueno.
      .is("ended_at", null);
  } catch (e: any) {
    console.error("[analítica] no se pudo cerrar el recorrido:", e?.message ?? e);
  }
}
