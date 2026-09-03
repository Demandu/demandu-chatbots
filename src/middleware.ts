import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DOMINIO_TIENDAS, hostDeLaPeticion } from "@/lib/tienda/direccion";

/**
 * Dos sitios en un mismo despliegue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `platform.demandu.tech` es la plataforma: se entra con cuenta.
 * `store.demandu.tech/<tienda>` es el escaparate público: no se entra con nada.
 *
 * Son el mismo programa porque comparten la base de datos y el catálogo — que
 * es justo la ventaja frente a una tienda suelta— pero se comportan distinto, y
 * eso se decide aquí, por el dominio desde el que llega la visita.
 *
 * NO SE TOCA `eshop.demandu.tech`. Ahí siguen las tiendas del proveedor
 * anterior, con clientes reales vendiendo hoy. Apuntarla aquí las tumbaría
 * todas de golpe; se migran de una en una cuando su dueño lo diga.
 *
 * ESTE ARCHIVO VA EN `src/`, Y ESO NO ES UN DETALLE. La aplicación vive en
 * `src/app`, así que Next SOLO carga `src/middleware.ts`. Hubo una copia de
 * esto en la raíz del repositorio durante horas: el código era correcto, las
 * pruebas pasaban, y no se ejecutaba nunca — el escaparate daba 404 en su
 * propio dominio y no había ningún error en ninguna parte. Un archivo que no
 * corre es peor que uno que falla. Hay una prueba estática que impide que
 * vuelva a haber dos.
 *
 * EN EL DOMINIO DE TIENDAS NO SE PREGUNTA POR LA SESIÓN. Comprobar quién eres
 * cuesta un viaje a Supabase, y en un escaparate público la respuesta siempre
 * es «nadie»: sería pagar ese viaje en cada visita de cada cliente de cada
 * tienda, para nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function middleware(request: NextRequest) {
  const host = hostDeLaPeticion(request.headers);

  if (host === DOMINIO_TIENDAS) {
    const { pathname } = request.nextUrl;

    // Lo de dentro del programa se deja pasar tal cual: reescribirlo rompería
    // los recursos de la propia página.
    if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/favicon.ico") {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    // La raíz del dominio no es una tienda de nadie.
    url.pathname = pathname === "/" ? "/t" : `/t${pathname}`;
    return NextResponse.rewrite(url);
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
