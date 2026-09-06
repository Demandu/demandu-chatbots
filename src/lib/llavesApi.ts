import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Comprueba la llave de API de un cliente y devuelve a qué organización es.
 *
 * LA LLAVE EN CLARO NO EXISTE EN LA BASE: solo su SHA-256. Así que verificar
 * es volver a calcular el resumen de lo que llegó y buscar ESE. Si la tabla se
 * filtrara, lo robado no serviría para entrar a ninguna cuenta — la misma
 * razón por la que no se guardan contraseñas.
 *
 * Por eso tampoco se puede "recuperar" una llave perdida: se revoca y se hace
 * otra. Es lo correcto aunque suene incómodo.
 */
export async function orgDeLaLlave(req: Request): Promise<string | null> {
  const cabecera = req.headers.get("authorization") ?? req.headers.get("x-demandu-key") ?? "";
  const llave = cabecera.replace(/^Bearer\s+/i, "").trim();
  if (!llave || llave.length < 20) return null;

  try {
    const bytes = new TextEncoder().encode(llave);
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

    const admin = createAdminClient();
    const { data } = await admin
      .from("api_keys")
      .select("id, org_id, revocada_at")
      .eq("hash", hash)
      .maybeSingle();

    if (!data || data.revocada_at) return null;

    // Cuándo se usó por última vez. Sirve para que el cliente reconozca cuál
    // de sus llaves está viva antes de revocar la que no debía.
    // No se espera al resultado: es un dato de conveniencia, no puede sumarle
    // latencia a la llamada de un chatbot que tiene a alguien esperando.
    admin.from("api_keys").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id).then(() => {});

    return data.org_id as string;
  } catch {
    return null;
  }
}
