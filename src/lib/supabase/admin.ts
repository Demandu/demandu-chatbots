import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con service_role: OMITE RLS.
 * Úsalo SOLO en el servidor (webhooks no autenticados). Nunca en el navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
