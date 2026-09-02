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

  // Las MISMAS credenciales que ya usa WhatsApp: este camino va por Facebook
  // Login, así que no hace falta el par aparte de Instagram.
  if (!process.env.NEXT_PUBLIC_META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.redirect(`${destino}?error=sin_configurar`);
  }

  // ── El dominio desde el que se entra TIENE que ser el registrado ─────────
  //
  // ESTO EXISTE POR UN FALLO REAL Y DESCONCERTANTE. La misma plataforma
  // responde en varios dominios a la vez: el propio (platform.demandu.tech),
  // el de la rama de Netlify (main--demandu-chatbots.netlify.app) y el de
  // cualquier vista previa. Como la URL de retorno se construía a partir del
  // dominio desde el que navegabas, entrar por el de Netlify mandaba a Meta una
  // dirección que no es la registrada, y Meta contestaba «Invalid redirect_uri»
  // — un error que no dice ni qué dirección esperaba ni cuál recibió.
  //
  // Se comprueba ANTES de mandar a nadie a Meta, y se dice en cristiano.
  const canonico = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!canonico) {
    // Sin esta variable la plataforma no sabe cuál es su propia dirección
    // pública, así que acertará solo por casualidad.
    console.error("[ig] falta NEXT_PUBLIC_SITE_URL: la URL de retorno no puede ser fiable");
    return NextResponse.redirect(`${destino}?error=sin_dominio`);
  }
  if (origen !== canonico) {
    return NextResponse.redirect(
      `${canonico}/api/integrations/instagram/start?bot=${encodeURIComponent(botId)}`,
    );
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
