import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { publicOrigin } from "@/lib/integrations/google";
import { urlDeAutorizacion, nuevoVerificador, retoDe } from "@/lib/integrations/calendly";

export const dynamic = "force-dynamic";

/**
 * Empieza la conexión con Calendly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS COSAS VIAJAN EN COOKIE Y NO EN LA BASE: el `state` —que es lo que impide
 * que alguien te enganche la cuenta de otro— y el VERIFICADOR de PKCE, que
 * Calendly exige para todas las aplicaciones.
 *
 * Los dos viven diez minutos y pertenecen a ESE navegador. Guardarlos en una
 * tabla obligaría a limpiarla y a decidir qué pasa si alguien abre dos
 * conexiones a la vez; en una cookie `httpOnly` el problema no existe.
 *
 * SE EXIGE EL PERMISO DE CONEXIONES. Conectar una agenda es una tarea de
 * conexión, como el resto: un agente no debería poder colgar la cuenta de
 * Calendly del negocio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(req: Request) {
  const origen = publicOrigin(req);
  const ajustes = `${origen}/settings/integrations`;

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.redirect(`${origen}/login`);

  const { permisos } = await misPermisos();
  if (!permisos.has("conexiones")) {
    return NextResponse.redirect(`${ajustes}?error=sin_permiso`);
  }

  if (!process.env.CALENDLY_CLIENT_ID || !process.env.CALENDLY_CLIENT_SECRET) {
    return NextResponse.redirect(`${ajustes}?error=calendly_sin_credenciales`);
  }

  const state = crypto.randomUUID();
  const verificador = nuevoVerificador();

  const galleta = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  cookies().set("cal_state", state, galleta);
  cookies().set("cal_verifier", verificador, galleta);

  return NextResponse.redirect(
    urlDeAutorizacion({
      clientId: process.env.CALENDLY_CLIENT_ID,
      redirect: `${origen}/api/integrations/calendly/callback`,
      state,
      reto: retoDe(verificador),
    }),
  );
}
