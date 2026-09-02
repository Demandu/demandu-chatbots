import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWebFlow, chooseWebFlow } from "@/lib/flow/webRuntime";
import { cerrarRecorrido } from "@/lib/flow/flowRuns";
import {
  leerEventos, abreConversacion, textoParaElFlujo,
  type EventoInstagram,
} from "@/lib/canales/instagramEntrante";
import { enviarDm, responderEnPrivado, perfilDeInstagram } from "@/lib/canales/instagramEnviar";
import { firmaValida } from "@/lib/canales/instagramFirma";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

/**
 * El webhook de Instagram: por aquí entra TODO lo que pasa en la cuenta del
 * cliente — mensajes directos, comentarios, respuestas a historias y menciones.
 *
 * ES UN ENDPOINT PÚBLICO SIN SESIÓN. Meta llama desde sus servidores, así que
 * no hay usuario, ni cookie, ni RLS que valga: se usa la llave de servicio.
 * Por eso lo PRIMERO que hace es comprobar la firma. Sin esa comprobación,
 * cualquiera que sepa la dirección podría inventarse mensajes de clientes,
 * meter conversaciones falsas en la Bandeja y gastar la cuota de IA del
 * cliente. La firma es lo único que separa este endpoint de un formulario
 * abierto a internet.
 *
 * SE CONTESTA 200 SIEMPRE (después de la firma). Si Meta recibe un error,
 * reintenta; y si reintenta muchas veces, DESACTIVA la suscripción del
 * cliente. Un fallo tonto procesando un mensaje no puede acabar en «a este
 * cliente le dejó de funcionar Instagram y nadie sabe desde cuándo».
 */

/** Meta manda el reto de verificación aquí al guardar la URL en el panel. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const reto = url.searchParams.get("hub.challenge");

  const esperado = process.env.META_VERIFY_TOKEN ?? "";
  if (!esperado) {
    console.error("[ig webhook] falta META_VERIFY_TOKEN");
    return new NextResponse("no configurado", { status: 503 });
  }
  if (modo === "subscribe" && token === esperado && reto) {
    // Texto plano y tal cual: Meta compara la respuesta carácter a carácter.
    return new NextResponse(reto, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("no", { status: 403 });
}

export async function POST(req: Request) {
  // EL CUERPO SE LEE COMO TEXTO, NO CON `req.json()`. La firma se calcula sobre
  // los bytes exactos que mandó Meta: si se parsea y se vuelve a serializar,
  // cualquier diferencia de espacios o de orden cambia el HMAC y la firma
  // válida se rechazaría. Esto solo se puede hacer bien una vez.
  const crudo = await req.text();

  // ── QUIÉN FIRMA ESTO ─────────────────────────────────────────────────────
  //
  // LA APP DE INSTAGRAM, NO LA DE FACEBOOK. Son dos apps distintas con dos
  // claves distintas, y este webhook lo manda la de Instagram — la misma con la
  // que el cliente inició sesión. Verificar con la de Facebook rechaza
  // ABSOLUTAMENTE TODO con un 401.
  //
  // Y ese 401 es el fallo más silencioso de toda la plataforma: Meta cree que
  // entregó, la pantalla dice «conectado», y no llega ni un mensaje. Nos costó
  // una tarde. Por eso abajo se deja constancia cuando una firma no cuadra.
  //
  // Se aceptan las dos claves porque el canal de Messenger, cuando exista,
  // llegará firmado por la de Facebook a este mismo sitio. Ambas son NUESTRAS:
  // aceptar cualquiera de las dos no abre la puerta a nadie.
  const claves = [
    ["instagram", process.env.INSTAGRAM_APP_SECRET ?? ""],
    ["facebook", process.env.META_APP_SECRET ?? ""],
  ].filter(([, s]) => s) as [string, string][];

  if (!claves.length) {
    console.error("[ig webhook] no hay ninguna clave de app: no se puede verificar nada");
    return new NextResponse("no configurado", { status: 503 });
  }

  const cabecera = req.headers.get("x-hub-signature-256");
  const cual = claves.find(([, s]) => firmaValida(crudo, cabecera, s));
  if (!cual) {
    await firmaNoCuadra(crudo, cabecera, claves.map(([n]) => n));
    return new NextResponse("firma inválida", { status: 401 });
  }

  let cuerpo: any = null;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const eventos = leerEventos(cuerpo);
    for (const e of eventos) {
      // Cada evento va por su cuenta: que uno falle no puede dejar sin
      // atender a los demás del mismo lote.
      try {
        await atender(e);
      } catch (err: any) {
        console.error("[ig webhook] evento:", e.tipo, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.error("[ig webhook]", err?.message ?? err);
  }

  return NextResponse.json({ ok: true });
}

// ─── Atender un evento ───────────────────────────────────────────────────────

async function atender(e: EventoInstagram): Promise<void> {
  const admin = createAdminClient();

  // De qué cliente de la plataforma es esta cuenta. `ig_user_id` es único en
  // toda la base, así que esto no puede devolver la cuenta de otro.
  const { data: canal } = await admin
    .from("instagram_channels")
    .select("org_id, bot_id, ig_user_id, access_token")
    .eq("ig_user_id", e.cuentaNegocio)
    .maybeSingle();

  // Una cuenta que nadie conectó no es un error: puede ser una suscripción
  // vieja de Meta. Pero SE DEJA CONSTANCIA, porque este `return` es también por
  // donde se cae el fallo más difícil de ver de toda la integración: si el id
  // que manda Meta no es el que guardamos al conectar, todo parece bien —la
  // pantalla dice «conectado», Meta dice que entregó el aviso— y no pasa
  // absolutamente nada. Sin este apunte no queda ni rastro que mirar.
  if (!canal) {
    await noHayCanal(admin, e.cuentaNegocio);
    return;
  }

  // NO ATENDER DOS VECES. Meta reintenta los webhooks, y un reintento haría
  // que el bot contestara dos veces al mismo mensaje. Se reutiliza la misma
  // tabla del motor de WhatsApp: los ids de Instagram y los de WhatsApp no se
  // parecen, así que no chocan, y así hay UN solo sitio que limpiar.
  if (e.id) {
    const { error: repetido } = await admin.from("mensajes_vistos").insert({ wa_message_id: e.id });
    if (repetido) {
      if ((repetido as any).code === "23505") return; // ya lo atendimos
      // Cualquier otro fallo no puede dejar al cliente sin respuesta: es mejor
      // arriesgarse a un duplicado que a un silencio. Mismo criterio que el
      // motor de WhatsApp.
      console.error("[ig webhook] no pude anotar el mensaje:", repetido);
    }
  }

  const { data: bot } = await admin
    .from("bots")
    .select("id, org_id, name, channel, ai, shortcuts")
    .eq("id", canal.bot_id)
    .maybeSingle();
  if (!bot) return;

  const texto = textoParaElFlujo(e);

  // ── Un comentario: se contesta y NO se abre conversación ──────────────────
  //
  // Hasta que la persona no responde al DM, Instagram no deja escribirle más.
  // Por eso el comentario se trata aparte y no entra en la Bandeja como una
  // charla normal: el equipo no podría contestarla.
  if (!abreConversacion(e)) {
    await atenderComentario(admin, canal, bot, e, texto);
    return;
  }

  // ── Un DM, una respuesta a historia o una mención: conversación normal ────
  const contacto = await contactoDeInstagram(admin, canal, e);
  if (!contacto) return;

  let { data: conv } = await admin
    .from("conversations")
    .select("id, flow_state, status")
    .eq("org_id", canal.org_id)
    .eq("contact_id", contacto)
    .eq("channel", "instagram")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv || conv.status === "closed") {
    const ins = await admin
      .from("conversations")
      .insert({
        org_id: canal.org_id,
        contact_id: contacto,
        bot_id: bot.id,
        channel: "instagram",
        status: "open",
        flow_state: {},
      })
      .select("id, flow_state, status")
      .single();
    conv = ins.data as any;
  }
  if (!conv) return;

  // El mensaje del cliente se guarda SIEMPRE, conteste el bot o no. Si un
  // agente tiene la conversación tomada, el bot se calla pero el mensaje tiene
  // que estar en la Bandeja: si no, el equipo no ve lo que le escribieron.
  await admin.from("messages").insert({
    conversation_id: conv.id,
    org_id: canal.org_id,
    direction: "inbound",
    sender: "contact",
    body: texto,
    payload: {
      ig: {
        tipo: e.tipo,
        mid: e.id,
        ...(e.historiaId ? { historia_id: e.historiaId } : {}),
        ...(e.adjuntos?.length ? { adjuntos: e.adjuntos } : {}),
      },
    },
  });
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conv.id);

  // Un humano tomó el chat: el bot no interrumpe.
  if (conv.status === "assigned") return;

  const salidas = await correrElFlujo(admin, bot, conv, texto, canal.org_id);
  for (const m of salidas) {
    await mandarYGuardar(admin, canal, conv.id, e.de!, m);
  }
}

/**
 * Un comentario en una publicación, un reel o un directo.
 *
 * LA RESPUESTA PRIVADA ES DE UN SOLO DISPARO. Meta permite UNA por comentario
 * y dentro de 7 días; el segundo intento lo rechaza. El turno se pide a la base
 * ANTES de enviar, y la clave primaria de `ig_respuestas_privadas` hace de
 * candado: si dos entregas del mismo webhook llegan a la vez, solo una gana.
 */
async function atenderComentario(
  admin: any, canal: any, bot: any, e: EventoInstagram, texto: string,
): Promise<void> {
  const flujos = await flujosDelBot(admin, bot.id);
  const elegido = chooseWebFlow(flujos, texto, false, {});
  if (!elegido) return;

  const graph = (elegido.graph as any) ?? { nodes: [], edges: [] };
  if (!(graph.nodes ?? []).length) return;

  // El comentario no tiene conversación propia todavía, pero el motor necesita
  // una para dejar rastro. Se crea una conversación de Instagram ligada al
  // contacto que comentó, si se le puede identificar.
  const contacto = await contactoDeInstagram(admin, canal, e);
  if (!contacto) return;

  const { data: conv } = await admin
    .from("conversations")
    .insert({
      org_id: canal.org_id,
      contact_id: contacto,
      bot_id: bot.id,
      channel: "instagram",
      status: "open",
      flow_state: {},
      // Queda apuntado de dónde salió: un lead que llegó por un comentario en
      // un reel no es lo mismo que uno que escribió por su cuenta, y quien
      // paga la publicidad quiere poder distinguirlos.
      origen: {
        tipo: "comentario",
        plataforma: "meta",
        canal: "instagram",
        anuncio_id: e.mediaId ?? null,
        titular: e.tipoDeMedia ?? null,
        visto_en: new Date().toISOString(),
      },
    })
    .select("id, flow_state, status")
    .single();
  if (!conv) return;

  await admin.from("messages").insert({
    conversation_id: conv.id,
    org_id: canal.org_id,
    direction: "inbound",
    sender: "contact",
    body: texto,
    payload: { ig: { tipo: e.tipo, comentario_id: e.comentarioId, media_id: e.mediaId } },
  });

  const salidas = await correrElFlujo(admin, bot, conv, texto, canal.org_id);
  if (!salidas.length) return;

  // El primer mensaje del flujo se manda EN PRIVADO al comentario: es lo que
  // abre el DM y convierte un comentario público en una conversación.
  const primero = String(salidas[0]?.text ?? "").trim();
  if (primero && e.comentarioId) {
    const { data: turno } = await admin.rpc("tomar_turno_respuesta_privada", {
      p_org_id: canal.org_id,
      p_ig_user_id: canal.ig_user_id,
      p_comment_id: e.comentarioId,
    });

    if (turno === true) {
      const r = await responderEnPrivado(canal.ig_user_id, canal.access_token, e.comentarioId, primero);
      await admin
        .from("ig_respuestas_privadas")
        .update({ resultado: r.ok ? "enviada" : (r.error ?? "falló") })
        .eq("comment_id", e.comentarioId);

      await admin.from("messages").insert({
        conversation_id: conv.id,
        org_id: canal.org_id,
        direction: "outbound",
        sender: "bot",
        body: primero,
        payload: {
          ig: { tipo: "respuesta_privada", comentario_id: e.comentarioId },
          ...(r.ok ? {} : { no_entregado: { motivo: r.error, code: r.code ?? null } }),
        },
      });
    }
  }

  // El resto del flujo NO se manda: hasta que la persona no conteste al DM,
  // Instagram no deja mandarle nada más. Mandarlo en público sería peor: son
  // mensajes escritos para una conversación privada.
}

/**
 * Llegó un aviso que no pasa la firma.
 *
 * ESTE APUNTE VALE MÁS QUE TODOS LOS DEMÁS. Un 401 aquí es indistinguible,
 * desde fuera, de que Instagram no esté mandando nada: Meta reintenta un rato y
 * después DESACTIVA la suscripción del cliente. El cliente ve «conectado» y no
 * recibe un solo mensaje, para siempre, sin ningún error en ninguna pantalla.
 *
 * Se apunta con QUÉ claves se intentó y un trozo del cuerpo, para poder
 * distinguir «la clave es la que no toca» de «esto no lo mandó Meta». El cuerpo
 * se recorta y NUNCA se apunta la firma ni ninguna clave.
 */
async function firmaNoCuadra(
  crudo: string, cabecera: string | null, probadas: string[],
): Promise<void> {
  console.error("[ig webhook] firma inválida; probadas:", probadas.join(", "));
  try {
    const admin = createAdminClient();
    const hace10min = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: yaApuntado } = await admin
      .from("conexiones_fallidas")
      .select("id")
      .eq("canal", "instagram")
      .eq("paso", "webhook_firma")
      .gte("created_at", hace10min)
      .limit(1)
      .maybeSingle();
    if (yaApuntado) return;

    await admin.from("conexiones_fallidas").insert({
      org_id: null,
      canal: "instagram",
      paso: "webhook_firma",
      detalle:
        `probadas=[${probadas.join(",")}] trae_cabecera=${!!cabecera} ` +
        `cuerpo=${crudo.slice(0, 200)}`.slice(0, 900),
    });
  } catch (err) {
    console.error("[ig webhook] tampoco pude anotar la firma inválida:", err);
  }
}

/**
 * Llegó un aviso para una cuenta que no tenemos.
 *
 * Se apunta el id que mandó Meta AL LADO de los que sí tenemos guardados, que
 * es justo la comparación que hace falta y la que no se puede hacer de memoria:
 * son dos números largos que se parecen. Si son distintos, el fallo es que
 * guardamos el identificador equivocado al conectar.
 *
 * NUNCA LANZA y no toca la respuesta: esto es diagnóstico. Y no se repite el
 * apunte si ya hay uno reciente del mismo id — Meta reintenta, y no queremos
 * llenar la tabla con la misma línea.
 */
async function noHayCanal(admin: any, idQueMandoMeta: string): Promise<void> {
  try {
    const hace10min = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: yaApuntado } = await admin
      .from("conexiones_fallidas")
      .select("id")
      .eq("canal", "instagram")
      .eq("paso", "webhook_sin_cuenta")
      .gte("created_at", hace10min)
      .limit(1)
      .maybeSingle();
    if (yaApuntado) return;

    const { data: cuentas } = await admin
      .from("instagram_channels")
      .select("ig_user_id, username")
      .limit(5);
    const guardadas = ((cuentas as any[]) ?? [])
      .map((c) => `${c.ig_user_id}(@${c.username ?? "?"})`)
      .join(" ") || "ninguna";

    await admin.from("conexiones_fallidas").insert({
      org_id: null,
      canal: "instagram",
      paso: "webhook_sin_cuenta",
      detalle: `meta mandó id=${idQueMandoMeta} · guardadas=${guardadas}`.slice(0, 900),
    });
  } catch (err) {
    console.error("[ig webhook] no pude anotar la cuenta desconocida:", err);
  }
}

// ─── Piezas compartidas ──────────────────────────────────────────────────────

async function flujosDelBot(admin: any, botId: string): Promise<any[]> {
  const { data } = await admin
    .from("flows")
    .select("id, name, graph, trigger_type, keywords, enabled, priority, updated_at")
    .eq("bot_id", botId);
  return ((data as any[]) ?? []).filter((f) => f.enabled !== false);
}

/**
 * El contacto de quien escribe, creándolo si es la primera vez.
 *
 * Se identifica por `external_id`, que en Instagram es el IGSID — un id que
 * Meta da POR CADA NEGOCIO. La misma persona escribiendo a dos clientes
 * distintos de la plataforma tiene dos ids distintos, y eso es correcto: son
 * dos relaciones distintas y ninguno de los dos negocios tiene por qué saber
 * que el otro existe.
 */
async function contactoDeInstagram(admin: any, canal: any, e: EventoInstagram): Promise<string | null> {
  const igsid = e.de;
  if (!igsid) return null;

  const { data: hay } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", canal.org_id)
    .eq("channel", "instagram")
    .eq("external_id", igsid)
    .maybeSingle();
  if (hay) return hay.id;

  // El nombre se pide aparte y nunca bloquea: que no se sepa cómo se llama es
  // feo, perder el mensaje es grave.
  const perfil = e.usuario
    ? { nombre: null, usuario: e.usuario }
    : await perfilDeInstagram(igsid, canal.access_token);

  const ins = await admin
    .from("contacts")
    .insert({
      org_id: canal.org_id,
      channel: "instagram",
      external_id: igsid,
      name: perfil.nombre || (perfil.usuario ? `@${perfil.usuario}` : "Contacto de Instagram"),
    })
    .select("id")
    .maybeSingle();
  if (ins.data) return ins.data.id;

  // Dos mensajes casi a la vez pueden intentar crearlo los dos: el segundo
  // choca. No es un error, el contacto ya existe.
  const { data: otra } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", canal.org_id)
    .eq("channel", "instagram")
    .eq("external_id", igsid)
    .maybeSingle();
  return otra?.id ?? null;
}

/** Corre el motor y devuelve lo que hay que decir. */
async function correrElFlujo(
  admin: any, bot: any, conv: any, texto: string, orgId: string,
): Promise<{ text: string }[]> {
  const flujos = await flujosDelBot(admin, bot.id);
  const estado = (conv.flow_state as any) ?? {};
  const elegido = chooseWebFlow(flujos, texto, false, estado);
  if (!elegido) return [];

  const graph = (elegido.graph as any) ?? { nodes: [], edges: [] };
  const flow = { id: elegido.id, name: "", nodes: graph.nodes ?? [], edges: graph.edges ?? [] } as Flow;
  if (!flow.nodes.length) return [];

  const mismoFlujo = estado.flow_id === elegido.id;
  if (!mismoFlujo && estado.run_id) await cerrarRecorrido(admin, estado.run_id, "cambio");

  const resultado = await runWebFlow({
    flow,
    orgId,
    conversationId: conv.id,
    admin,
    flowState: mismoFlujo ? estado : { vars: estado.vars ?? {} },
    text: texto,
    botId: bot.id,
    aiSettings: (bot as any).ai ?? null,
    atajos: (bot as any).shortcuts ?? null,
    flowName: (elegido as any).name ?? null,
    iaDeRespaldo: (bot as any).ai?.enabled !== false && (bot as any).ai?.fallback_flujo !== false,
    ofreciAgente: estado.ofreciAgente === true,
  });

  const respaldo = String((bot as any).ai?.fallback ?? "").trim();
  const ofreciAgente =
    respaldo.length > 0 && resultado.out.some((m: any) => String(m?.text ?? "").trim() === respaldo);

  await admin
    .from("conversations")
    .update({
      flow_state: {
        vars: resultado.vars,
        awaiting: resultado.awaiting,
        flow_id: elegido.id,
        hintEnviado: resultado.hintEnviado,
        run_id: resultado.runId ?? null,
        ofreciAgente,
        terminado: resultado.terminado ?? false,
      },
    })
    .eq("id", conv.id);

  return resultado.out as any[];
}

/**
 * Manda por Instagram y guarda lo que pasó.
 *
 * PRIMERO SE ENVÍA Y DESPUÉS SE GUARDA, igual que en WhatsApp y por lo mismo:
 * guardar antes dejaría al equipo viendo en la Bandeja una conversación que el
 * cliente nunca tuvo. Si el envío falla, el mensaje se guarda MARCADO, que la
 * Bandeja ya sabe pintar con el motivo en cristiano.
 */
async function mandarYGuardar(
  admin: any, canal: any, conversationId: string, destinatario: string, m: { text?: string },
): Promise<void> {
  const texto = String(m?.text ?? "").trim();
  if (!texto) return;

  const r = await enviarDm(canal.ig_user_id, canal.access_token, destinatario, texto);

  await admin.from("messages").insert({
    conversation_id: conversationId,
    org_id: canal.org_id,
    direction: "outbound",
    sender: "bot",
    body: texto,
    payload: r.ok ? {} : { no_entregado: { motivo: r.error, code: r.code ?? null } },
  });
}
