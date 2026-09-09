import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * ── LA APP MÓVIL ENTRA POR AQUÍ TAMBIÉN ──────────────────────────────────────
 *
 * El navegador manda su sesión en cookies. La app del iPhone no tiene cookies:
 * manda el token de Supabase en la cabecera `Authorization: Bearer …`. Si esa
 * cabecera viene, se arma un cliente con ese token —RLS y `auth.getUser()`
 * funcionan igual que con la cookie— y las rutas existentes (`/api/canales/
 * enviar`, etc.) no tienen que cambiar nada.
 *
 * Sin la cabecera, todo sigue exactamente como antes.
 */
export function createClient() {
  const token = tokenDeLaCabecera();
  if (token) return clienteConToken(token);

  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing the session.
          }
        },
      },
    }
  );
}

function tokenDeLaCabecera(): string | null {
  try {
    const auth = headers().get("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return m ? m[1].trim() : null;
  } catch {
    // Fuera de una petición (por ejemplo, en generación estática) no hay cabeceras.
    return null;
  }
}

function clienteConToken(token: string) {
  const sb = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  );

  // `auth.getUser()` sin argumento busca una sesión guardada, y aquí no hay
  // ninguna: se le pasa el token explícitamente para que lo verifique contra
  // Supabase. Las rutas siguen llamando `getUser()` a secas.
  const original = sb.auth.getUser.bind(sb.auth);
  (sb.auth as any).getUser = (jwt?: string) => original(jwt ?? token);

  return sb as unknown as ReturnType<typeof createServerClient>;
}
