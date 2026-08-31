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

  // A dónde va después de entrar. Lo usa la invitación al equipo, que necesita
  // llevar a la persona a ponerse una contraseña en vez de al panel.
  //
  // SOLO SE ACEPTAN RUTAS DE ESTA MISMA APP: si se admitiera cualquier valor,
  // bastaría con mandarle a alguien un enlace con `next=https://sitio-falso` y
  // acabaría, ya con sesión iniciada, en una pantalla que imita a Demandu.
  const pedido = url.searchParams.get("next") ?? "";
  const destino = pedido.startsWith("/") && !pedido.startsWith("//") ? pedido : "/dashboard";

  if (!code) {
    // SIN CÓDIGO NO SIEMPRE ES UN ERROR. El enlace de "olvidé mi contraseña"
    // llega con la sesión en el TROZO DE LA URL (`#access_token=…`), que el
    // navegador no manda al servidor: aquí no se ve nada, y aun así el enlace
    // es bueno. Se hace así a propósito para que funcione aunque el correo se
    // abra en otro navegador o en el teléfono — que es justo lo que hace la
    // gente. El trozo viaja solo en el redirect y lo recoge la pantalla de
    // elegir contraseña.
    //
    // Si además no había a dónde ir, entonces sí falta algo de verdad.
    if (pedido) return NextResponse.redirect(new URL(destino, url.origin));
    return NextResponse.redirect(new URL("/login?error=Falt%C3%B3%20el%20c%C3%B3digo%20de%20acceso.", url.origin));
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL("/login?error=Servidor%20sin%20configurar.", url.origin));
  }

  // La respuesta se crea ANTES de hablar con Supabase porque es donde se van a
  // escribir las cookies de sesión.
  const respuesta = NextResponse.redirect(new URL(destino, url.origin));
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
    // NUNCA se le enseña al cliente el mensaje crudo del SDK. Pasó de verdad:
    // en la pantalla de entrar apareció un párrafo en inglés hablando de "PKCE
    // code verifier" y de "SSR frameworks". Quien lo lee no entiende qué hizo
    // mal ni qué hacer ahora, y parece que la plataforma se rompió.
    console.error("[auth/callback]", error.message);
    const enEspanol = /code verifier|pkce/i.test(error.message)
      ? "Ese enlace se abrió en un navegador distinto al que lo pidió. Pide uno nuevo y ábrelo aquí mismo."
      : /expired|invalid/i.test(error.message)
        ? "El enlace ya caducó o se usó. Pide uno nuevo."
        : "No pudimos completar el acceso. Intenta de nuevo.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(enEspanol)}`, url.origin));
  }

  return respuesta;
}
