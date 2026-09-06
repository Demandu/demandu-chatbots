import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { tokenValido, quienSoy, tiposDeEvento } from "@/lib/integrations/calendly";

export const dynamic = "force-dynamic";

/**
 * Los tipos de cita de Calendly de este cliente, para el selector del bloque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA UNA RUTA Y NO SE PIDE DESDE EL NAVEGADOR
 *
 * Los demás selectores del constructor (etiquetas, equipos, atributos) salen de
 * una consulta directa a Supabase con la sesión del usuario: RLS los aísla y ya
 * está. Este no puede: los tipos de cita viven en CALENDLY, y para
 * preguntárselos hace falta el token de acceso — que desde la 0092 no es
 * legible con la sesión del usuario, precisamente para que no viaje al
 * navegador.
 *
 * Así que el viaje a Calendly lo hace el servidor y el navegador recibe solo lo
 * que necesita pintar: nombre, duración y URI. El token no sale de aquí.
 *
 * ── EL `org_id` SALE DE LA SESIÓN, NUNCA DE LA PETICIÓN ───────────────────
 *
 * Es lo único que impide que alguien pida los tipos de cita de otro cliente
 * cambiando un número. No hay parámetros: quien pregunta solo puede preguntar
 * por lo suyo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET() {
  const orgId = await getCurrentOrgId();
  if (!orgId) return Response.json({ conectado: false, tipos: [] });

  const { data: fila } = await createAdminClient()
    .from("integrations")
    .select("data")
    .eq("org_id", orgId)
    .eq("provider", "calendly")
    .maybeSingle();

  if (!fila) return Response.json({ conectado: false, tipos: [] });

  const token = await tokenValido(orgId);
  // HAY FILA PERO EL TOKEN NO SIRVE. Se dice que está conectado —lo está— y se
  // devuelve la lista vacía: el constructor enseña «vuelve a conectar Calendly»
  // en vez de «no tienes Calendly», que mandaría al cliente a arreglar lo que
  // no está roto.
  if (!token) return Response.json({ conectado: true, roto: true, tipos: [] });

  try {
    const usuario =
      String((fila.data as any)?.usuario_uri ?? "") || (await quienSoy(token)).uri;
    const tipos = await tiposDeEvento(token, usuario);
    return Response.json({ conectado: true, tipos });
  } catch (e: any) {
    console.error("[calendly tipos]", e?.message ?? e);
    return Response.json({ conectado: true, roto: true, tipos: [] });
  }
}
