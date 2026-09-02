import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import {
  origenPublico, conectarConCodigo, suscribirCuenta,
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

  // ── Sonda: ¿cuántas veces se entra aquí con el MISMO código? ─────────────
  //
  // Facebook devuelve «Error validating verification code… asegúrate de que tu
  // redirect_uri sea idéntica» TAMBIÉN cuando el código ya se canjeó. Es su
  // mensaje para «este código no vale», y culpa a la URI aunque la URI esté
  // bien — cosa que ya se comprobó tres veces.
  //
  // Si algo llama a esta ruta dos veces (una precarga del navegador, un
  // reintento de la CDN), la primera llamada quema el código y la segunda —la
  // que ve la persona— falla siempre. Desde fuera es indistinguible de un
  // problema de configuración.
  //
  // Se apunta una huella del código, NO el código: seis caracteres y su largo
  // bastan para saber si son dos llamadas del mismo o dos intentos distintos.
  await anotarFallo(
    orgId,
    "entrada",
    `huella=${code.slice(0, 6)}…${code.length} agente=${(req.headers.get("user-agent") ?? "").slice(0, 40)} proposito=${req.headers.get("sec-purpose") ?? "-"}`,
  );

  try {
    const c = await conectarConCodigo(req, code);

    const sb = createClient();
    const { error } = await sb.from("instagram_channels").upsert(
      {
        org_id: orgId,
        bot_id: botId || null,
        ig_user_id: c.igUserId,
        username: c.username,
        // La página SÍ importa en este camino: el token con el que se manda y
        // se recibe es el de la página, y la suscripción al webhook también va
        // por ella.
        page_id: c.pageId,
        page_name: c.pageName,
        access_token: c.token,
        token_caduca: c.caduca,
        permisos: c.permisos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ig_user_id" },
    );

    if (error) {
      // El caso que importa: `ig_user_id` es único en toda la plataforma, así
      // que si otra organización ya conectó esa cuenta, esto falla — y debe
      // fallar. Dos negocios no pueden recibir los mensajes de la misma cuenta.
      await anotarFallo(orgId, "guardar", error.message);
      return NextResponse.redirect(`${destino}?error=cuenta_ya_conectada`);
    }

    // El paso que nadie recuerda hasta que no llega ningún mensaje. Va por la
    // PÁGINA, que es de quien cuelga la cuenta en este camino.
    const sus = await suscribirCuenta(c.pageId, c.token);
    if (!sus.ok) {
      await anotarFallo(orgId, "suscribir", sus.error ?? "");
      // Queda guardada —la conexión existe— pero se dice la verdad: todavía no
      // va a llegar nada. Un «conectado» a secas sería mentira.
      return NextResponse.redirect(`${destino}?ig=sin_suscribir`);
    }

    return NextResponse.redirect(`${destino}?ig=conectado`);
  } catch (e: any) {
    const mensaje = e?.message ?? String(e);
    await anotarFallo(orgId, "canjear", mensaje);
    // El caso más frecuente merece su propio mensaje: la persona autorizó, pero
    // ninguna de sus páginas tiene un Instagram ligado. Decirle «no se pudo
    // conectar» la dejaría sin saber qué arreglar, cuando la solución está en
    // su mano y son dos minutos.
    if (mensaje.startsWith("SIN_CUENTAS")) {
      return NextResponse.redirect(`${destino}?error=sin_cuentas`);
    }
    return NextResponse.redirect(`${destino}?error=fallo_al_conectar`);
  }
}

/**
 * Deja constancia de por qué falló un intento de conexión.
 *
 * POR QUÉ NO BASTA CON `console.error`. Los registros de Netlify solo se
 * transmiten en vivo: si nadie está mirando la consola en ese preciso momento,
 * el error se pierde para siempre. Cuando un cliente escribe «no me conecta»
 * media hora después, no hay absolutamente nada que consultar — que es
 * exactamente lo que nos pasó al conectar la primera cuenta.
 *
 * NUNCA LANZA. Esto es diagnóstico: si falla el propio apunte del fallo, lo
 * último que puede hacer es tapar el fallo original.
 */
async function anotarFallo(orgId: string | null, paso: string, detalle: string): Promise<void> {
  console.error(`[ig callback] ${paso}:`, detalle);
  try {
    // Con la llave de servicio: la sesión del cliente puede leer sus fallos,
    // pero escribirlos es cosa del servidor.
    await createAdminClient().from("conexiones_fallidas").insert({
      org_id: orgId,
      canal: "instagram",
      paso,
      // Se recorta: los mensajes de Meta a veces traen un volcado entero, y
      // esto es una pista, no un archivo de registro. 900 y no 500 porque el
      // diagnóstico va al FINAL del mensaje —después del texto de Meta, que ya
      // es largo— y cortarlo antes desperdiciaría el intento entero.
      detalle: String(detalle ?? "").slice(0, 900),
    });
  } catch (e) {
    console.error("[ig callback] tampoco pude anotar el fallo:", e);
  }
}
