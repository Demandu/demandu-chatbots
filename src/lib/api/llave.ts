import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Autenticación de la API pública.
 *
 * QUIEN LLAMA AQUÍ NO TIENE SESIÓN. Llega Zapier, Make o el programador del
 * cliente con una llave y nada más, así que no hay usuario del que colgar los
 * permisos: la llave ES la identidad, y de ella sale a qué organización
 * pertenece cada dato.
 *
 * POR ESO SE USA `service_role` Y HAY QUE FILTRAR POR `org_id` A MANO EN CADA
 * CONSULTA. El cliente de administración se salta RLS por diseño; si alguna
 * consulta de la API olvidara su `.eq("org_id", ...)`, un cliente vería los
 * datos de otro. Es la regla más importante de todo este directorio.
 */

const PREFIJO = "dmd_";

export function generarLlave() {
  const secreto = randomBytes(24).toString("base64url");
  const completa = `${PREFIJO}${secreto}`;
  return {
    completa,
    hash: hashDeLlave(completa),
    // Lo justo para reconocerla en una lista sin revelar nada útil.
    prefijo: completa.slice(0, PREFIJO.length + 6),
  };
}

export function hashDeLlave(llave: string) {
  return createHash("sha256").update(llave.trim()).digest("hex");
}

export type Identidad = { orgId: string; keyId: string };

/**
 * Devuelve la organización de la llave, o null.
 *
 * Acepta `Authorization: Bearer dmd_…`. Se marca el último uso para que el
 * cliente pueda ver en la pantalla si una llave sigue viva o quedó olvidada —
 * y para poder revocar con confianza las que nadie usa.
 */
export async function identificar(req: Request): Promise<Identidad | null> {
  const cabecera = req.headers.get("authorization") ?? "";
  const llave = cabecera.toLowerCase().startsWith("bearer ")
    ? cabecera.slice(7).trim()
    : "";
  if (!llave.startsWith(PREFIJO)) return null;

  const admin = createAdminClient();
  const { data } = await admin.rpc("api_key_resolver", { p_hash: hashDeLlave(llave) });
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.org_id) return null;

  // Sin await: que la API conteste rápido importa más que apuntar la marca al
  // instante, y si esta escritura falla no debe tumbar la petición del cliente.
  admin
    .from("api_keys")
    .update({ ultimo_uso: new Date().toISOString() })
    .eq("id", fila.key_id)
    .then(() => {}, () => {});

  return { orgId: fila.org_id as string, keyId: fila.key_id as string };
}

/** La respuesta de "no te conozco", igual en todos los extremos. */
export function sinPermiso() {
  return Response.json(
    { error: "Llave de API inválida o revocada.", documentacion: "/settings/integrations" },
    { status: 401 },
  );
}
