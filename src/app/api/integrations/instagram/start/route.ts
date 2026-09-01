import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentOrgId } from "@/lib/org";
import { origenPublico, urlDeConsentimiento } from "@/lib/integrations/instagram";

export const dynamic = "force-dynamic";

/**
 * Empieza la conexión de Instagram: manda a la persona al consentimiento de
 * Meta.
 *
 * EL `state` NO ES BUROCRACIA. Sin él, cualquiera podría preparar un enlace
 * que, abierto por el dueño de una cuenta ya con sesión, conectara la cuenta de
 * Instagram del atacante a la organización de la víctima — o al revés. El
 * nonce va en una cookie httpOnly (que el JavaScript de una página ajena no
 * puede leer) y se comprueba al volver.
 *
 * En la misma cookie viaja el chatbot al que hay que ligar la cuenta: la vuelta
 * de Meta es una petición nueva y no conserva nada de la anterior.
 */
export async function GET(req: Request) {
  const origen = origenPublico(req);
  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.redirect(`${origen}/login`);

  const botId = new URL(req.url).searchParams.get("bot") ?? "";
  const destino = botId ? `${origen}/bots/${botId}/install` : `${origen}/settings/integrations`;

  if (!process.env.NEXT_PUBLIC_META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.redirect(`${destino}?error=sin_configurar`);
  }

  const nonce = crypto.randomUUID();
  cookies().set("ig_oauth", JSON.stringify({ nonce, botId }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(urlDeConsentimiento(req, nonce));
}
