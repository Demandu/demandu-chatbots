import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * A dónde vuelve el cliente después de entrar con Apple o Facebook.
 *
 * CÓMO FUNCIONA: Apple/Meta nos devuelven un `code` de un solo uso. Aquí se
 * cambia por una sesión y se guarda en la cookie. Sin este paso el cliente
 * vuelve a la plataforma "logueado" según el proveedor pero sin sesión nuestra,
 * y acaba otra vez en la pantalla de entrar sin entender nada.
 *
 * TIENE QUE SER UNA RUTA DE SERVIDOR, no una página: la cookie de sesión se
 * escribe en la respuesta, y desde un componente de cliente no hay respuesta
 * donde escribirla.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const proveedorFallo = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  // El cliente le dio a "Cancelar" en la pantalla de Apple o Facebook, o el
  // proveedor rechazó. No es un fallo nuestro: se le devuelve a entrar con el
  // motivo, en vez de dejarlo en una pantalla en blanco.
  if (proveedorFallo) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(proveedorFallo)}`, url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=Falt%C3%B3%20el%20c%C3%B3digo%20de%20acceso.", url.origin));
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL("/login?error=Servidor%20sin%20configurar.", url.origin));
  }

  // La respuesta se crea ANTES de hablar con Supabase porque es donde se van a
  // escribir las cookies de sesión.
  const respuesta = NextResponse.redirect(new URL("/dashboard", url.origin));
  const almacen = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options as any),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return respuesta;
}
