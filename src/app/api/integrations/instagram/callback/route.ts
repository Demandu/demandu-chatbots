import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import {
  origenPublico, canjearCodigo, cuentasDisponibles, suscribirPagina,
} from "@/lib/integrations/instagram";

export const dynamic = "force-dynamic";

/**
 * La vuelta del consentimiento de Meta: guarda la cuenta y la deja escuchando.
 *
 * TRES COSAS TIENEN QUE SALIR BIEN, y si falla la tercera hay que DECIRLO en
 * vez de enseñar un «conectado» que miente:
 *
 *   1. Canjear el código por un token.
 *   2. Encontrar la cuenta de Instagram ligada a alguna de sus páginas.
 *   3. SUSCRIBIR LA PÁGINA a nuestra app. Este es el que más se olvida y el
 *      que da el síntoma más desconcertante: todo dice «conectado» y no llega
 *      ni un mensaje, porque configurar el webhook en el panel de Meta solo
 *      dice «a dónde», no «de quién».
 */
export async function GET(req: Request) {
  const origen = origenPublico(req);
  const url = new URL(req.url);

  // La cookie trae el nonce y a qué chatbot ligar la cuenta.
  let nonce = "";
  let botId = "";
  try {
    const guardado = JSON.parse(cookies().get("ig_oauth")?.value ?? "{}");
    nonce = String(guardado.nonce ?? "");
    botId = String(guardado.botId ?? "");
  } catch { /* cookie corrupta: se trata como si no hubiera */ }
  cookies().delete("ig_oauth");

  const destino = botId ? `${origen}/bots/${botId}/install` : `${origen}/settings/integrations`;

  // Meta avisa así cuando la persona le dio a «Cancelar». No es un fallo y no
  // hay que asustarla con un error rojo.
  const errorDeMeta = url.searchParams.get("error");
  if (errorDeMeta) {
    return NextResponse.redirect(`${destino}?ig=cancelado`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !nonce || state !== nonce) {
    return NextResponse.redirect(`${destino}?error=estado_invalido`);
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.redirect(`${origen}/login`);

  try {
    const tokenDeUsuario = await canjearCodigo(req, code);
    const cuentas = await cuentasDisponibles(tokenDeUsuario);

    if (!cuentas.length) {
      // El motivo real casi siempre es el mismo, y decirlo ahorra una llamada
      // a soporte: o la cuenta no es profesional, o no está ligada a ninguna
      // página, o la persona no marcó la página en la pantalla de Meta.
      return NextResponse.redirect(`${destino}?error=sin_cuentas`);
    }

    // Se conecta la primera. Elegir entre varias es una pantalla más y hoy
    // ningún cliente tiene dos; cuando alguno las tenga, aquí es donde va.
    const c = cuentas[0];

    const sb = createClient();
    const { error } = await sb.from("instagram_channels").upsert(
      {
        org_id: orgId,
        bot_id: botId || null,
        ig_user_id: c.igUserId,
        username: c.username,
        page_id: c.pageId,
        page_name: c.pageName,
        access_token: c.pageToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ig_user_id" },
    );

    if (error) {
      // El caso que importa: `ig_user_id` es único en toda la plataforma, así
      // que si otra organización ya conectó esa cuenta, esto falla — y debe
      // fallar. Dos negocios no pueden recibir los mensajes de la misma cuenta.
      console.error("[ig callback] no pude guardar el canal:", error.message);
      return NextResponse.redirect(`${destino}?error=cuenta_ya_conectada`);
    }

    // El paso que nadie recuerda hasta que no llega ningún mensaje.
    const sus = await suscribirPagina(c.pageId, c.pageToken);
    if (!sus.ok) {
      console.error("[ig callback] la página no quedó suscrita:", sus.error);
      // Queda guardada —la conexión existe— pero se dice la verdad: todavía no
      // va a llegar nada. Un «conectado» a secas sería mentira.
      return NextResponse.redirect(`${destino}?ig=sin_suscribir`);
    }

    return NextResponse.redirect(`${destino}?ig=conectado`);
  } catch (e: any) {
    console.error("[ig callback]", e?.message ?? e);
    return NextResponse.redirect(`${destino}?error=fallo_al_conectar`);
  }
}
