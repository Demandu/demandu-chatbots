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
 *   1. Canjear el código por un token corto.
 *   2. Cambiarlo por uno de 60 días — si no, la conexión muere en una hora.
 *   3. SUSCRIBIR LA CUENTA a nuestra app. Este es el que más se olvida y el
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

    /* ── QUIÉN ESCRIBE ESTA FILA, Y POR QUÉ NO PUEDE SER LA SESIÓN ─────────
     *
     * PASÓ TRES VECES HOY, CON TRES PERSONAS DISTINTAS. La conexión terminaba
     * en «Esa cuenta ya está conectada a otra organización» con la tabla
     * COMPLETAMENTE VACÍA. El motivo real estaba en el registro:
     *
     *     permission denied for table instagram_channels
     *
     * La 0093 quitó a `authenticated` el acceso a esta tabla —el token de Meta
     * lo leía cualquier miembro desde la consola del navegador— y esta ruta se
     * quedó escribiendo con la sesión. Nadie podía conectar Instagram. Y lo
     * peor no es el fallo: es que le echábamos la culpa al cliente, diciéndole
     * que su cuenta estaba en otra organización cuando no lo estaba.
     *
     * Escribe la llave de servicio, que es la única que puede. Y por eso mismo
     * las dos comprobaciones que antes hacía RLS hay que hacerlas A MANO aquí
     * abajo: sin ellas, la llave de servicio se salta justo lo que protegía.
     * ────────────────────────────────────────────────────────────────────── */
    const sb = createClient();

    // 1) El chatbot tiene que ser de esta organización. Va con la SESIÓN, que
    //    es la que sabe quién eres: si no es tuyo, la consulta vuelve vacía.
    if (botId) {
      const { data: suyo } = await sb.from("bots").select("id").eq("id", botId).maybeSingle();
      if (!suyo) return NextResponse.redirect(`${destino}?error=estado_invalido`);
    }

    const admin = createAdminClient();

    // 2) La cuenta no puede estar ya en OTRA organización. Antes lo impedía
    //    RLS; con la llave de servicio hay que preguntarlo, o cualquiera
    //    conectaría una cuenta ajena y se quedaría con sus mensajes.
    const { data: yaEsta } = await admin
      .from("instagram_channels")
      .select("org_id")
      .eq("ig_user_id", c.igUserId)
      .maybeSingle();
    if (yaEsta && String((yaEsta as any).org_id) !== String(orgId)) {
      await anotarFallo(orgId, "guardar", `la cuenta ya es de la organización ${(yaEsta as any).org_id}`);
      return NextResponse.redirect(`${destino}?error=cuenta_ya_conectada`);
    }

    const { error } = await admin.from("instagram_channels").upsert(
      {
        org_id: orgId,
        bot_id: botId || null,
        ig_user_id: c.igUserId,
        username: c.username,
        // Con Instagram Login no hay página de Facebook de por medio: el
        // cliente entra con su cuenta y ya está. La columna existe para el otro
        // camino y aquí se queda vacía a propósito, no por descuido.
        page_id: null,
        page_name: null,
        access_token: c.token,
        token_caduca: c.caduca,
        permisos: c.permisos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ig_user_id" },
    );

    if (error) {
      /* UN FALLO NUESTRO NO SE LE CUELGA AL CLIENTE. Cualquier error al
       * guardar decía «tu cuenta ya está en otra organización» — una frase que
       * suena a que el problema es suyo y que mandó a buscar por el sitio
       * equivocado durante horas, mientras lo que fallaba era un permiso de
       * nuestra base. El choque de verdad ya se comprobó arriba; aquí abajo
       * solo quedan averías nuestras, y se dicen como tales. */
      await anotarFallo(orgId, "guardar", error.message);
      return NextResponse.redirect(`${destino}?error=no_pudimos_guardar`);
    }

    // ── Un chatbot, UNA cuenta de Instagram ──────────────────────────────────
    //
    // La clave única es `ig_user_id`, no `bot_id`, así que nada impedía que un
    // mismo chatbot acabara con dos cuentas colgando. Y pasó: al arreglar el
    // identificador, la cuenta se guardó con el id bueno y la fila del id viejo
    // se quedó ahí. Las dos decían ser la misma `@cuenta`.
    //
    // NO ES COSMÉTICO. La pantalla de Conexión busca la cuenta del chatbot con
    // `maybeSingle()`, que con dos filas revienta; y el motor podría contestar
    // con un token que ya no vale. También es lo que pasa cuando alguien
    // reconecta con OTRA cuenta de Instagram: la anterior tiene que irse, no
    // quedarse de fantasma.
    if (botId) {
      await admin
        .from("instagram_channels")
        .delete()
        .eq("bot_id", botId)
        .eq("org_id", orgId)
        .neq("ig_user_id", c.igUserId);
    }

    // El paso que nadie recuerda hasta que no llega ningún mensaje.
    const sus = await suscribirCuenta(c.igUserId, c.token);
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
