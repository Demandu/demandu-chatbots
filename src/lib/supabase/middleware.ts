import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Las pantallas a las que no se entra sin sesión.
 *
 * VIVE AQUÍ Y SE EXPORTA porque la usan dos sitios: esta función y la red de
 * seguridad de `src/middleware.ts`. Con la lista escrita dos veces, el día que
 * se añada una pantalla solo se acordaría una de las dos — y la que se
 * olvidara dejaría pasar sin sesión justo cuando algo ya ha ido mal.
 */
export function esProtegida(pathname: string): boolean {
  return [
    "/dashboard",
    "/bots",
    "/inbox",
    "/contacts",
    "/settings",
    // Se quedaron fuera al añadirlas y nadie lo notó porque RLS no devuelve
    // nada sin sesión: la pantalla salía vacía en vez de mandar a entrar, que
    // parece un fallo de la plataforma.
    "/tienda",
    "/crm",
    "/analytics",
    "/campaigns",
  ].some((p) => pathname.startsWith(p));
}

/** Refreshes the Supabase auth session on every request and guards routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Si aún no se configura Supabase, no bloqueamos la navegación (modo vista previa).
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /**
   * ── QUE UN TROPIEZO DE RED NO TUMBE LA PLATAFORMA ENTERA ──────────────
   *
   * Esta llamada sale a Supabase EN CADA PETICIÓN, y por aquí pasa todo: las
   * pantallas, el escaparate, hasta `/robots.txt`. Sin guarda, un solo
   * tropiezo —un tiempo de espera, el arranque en frío de los segundos
   * siguientes a publicar— revienta aquí, y entonces Netlify no tiene nada
   * que enseñar: saca su página genérica con un «Request ID» y parece que la
   * plataforma entera está caída.
   *
   * Pasó el 23 de septiembre de 2026, a los segundos de un despliegue, y a la
   * siguiente recarga funcionaba — que es justo lo que lo hacía increíble.
   *
   * SE FALLA HACIA EL LADO SEGURO: sin saber quién eres, se te trata como
   * visitante. Las pantallas protegidas mandan a entrar (una molestia de un
   * segundo) y lo público se sirve igual. Lo que NO se hace es dejar pasar a
   * una pantalla protegida por no haber podido comprobar la sesión.
   *
   * Arriba ya se había previsto que FALTARAN las claves. Faltaba prever que la
   * llamada misma fallara.
   */
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    console.error("[middleware] no pude comprobar la sesion:", (e as Error)?.message);
  }

  const { pathname } = request.nextUrl;
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isProtected = esProtegida(pathname);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
