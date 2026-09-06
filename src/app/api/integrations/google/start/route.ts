import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentOrgId } from "@/lib/org";
import { buildAuthUrl, publicOrigin } from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

/** Inicia el OAuth de Google Calendar. Redirige al consentimiento de Google. */
export async function GET(req: Request) {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.redirect(`${publicOrigin(req)}/login`);
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${publicOrigin(req)}/settings/integrations?error=missing_credentials`);
  }

  // Nonce anti-CSRF guardado en cookie httpOnly y enviado como state
  const state = crypto.randomUUID();
  cookies().set("g_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  /* ── A DÓNDE VOLVER DESPUÉS ────────────────────────────────────────────
   *
   * Se guarda en una cookie y no en el `state` porque el `state` es el nonce
   * anti-CSRF: meterle datos de navegación lo convierte en algo que hay que
   * parsear antes de compararlo, y un nonce que se parsea es un nonce que
   * alguien puede confundir.
   *
   * Solo rutas de esta plataforma: sin la comprobación, cualquiera podría
   * mandar a alguien a `/api/integrations/google/start?volver=https://…` y
   * usarnos de trampolín a su propio sitio justo después de un login de
   * Google. */
  const volver = new URL(req.url).searchParams.get("volver") ?? "";
  if (volver.startsWith("/") && !volver.startsWith("//")) {
    cookies().set("g_oauth_volver", volver, {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
    });
  }

  return NextResponse.redirect(buildAuthUrl(req, state));
}
