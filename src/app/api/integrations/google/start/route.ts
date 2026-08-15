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

  return NextResponse.redirect(buildAuthUrl(req, state));
}
