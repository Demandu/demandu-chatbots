import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// El catálogo vive aparte porque lo necesita también la pantalla de
// configuración, que corre en el navegador. Ver `salidas-eventos.ts`.
//
// SE IMPORTA ADEMÁS DE REEXPORTARSE. Un `export { ... } from` reenvía el tipo
// hacia fuera pero NO lo mete en el ámbito de este archivo, así que `emitir`
// se escribía con un `ClaveDeEvento` que aquí no existía. Lo cazó `tsc`.
import type { ClaveDeEvento } from "@/lib/salidas-eventos";
export { EVENTOS, type ClaveDeEvento } from "@/lib/salidas-eventos";

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
