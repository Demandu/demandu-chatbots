import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, enviarArchivo, enviarPlantilla, type ResultadoEnvio } from "@/lib/canales/whatsappEnviar";
import { enviarDm, enviarAdjuntoDm } from "@/lib/canales/instagramEnviar";

export const dynamic = "force-dynamic";

/**
 * Lo que escribe un agente en la Bandeja, ENTREGADO de verdad al cliente.
 *
 * EL AGUJERO QUE TAPA: hasta ahora la Bandeja solo guardaba el mensaje en la
 * base. En el canal web funcionaba de casualidad, porque el widget del
 * visitante pregunta cada cuatro segundos si hay algo nuevo. En WhatsApp no
 * preguntaba nadie: el agente escribía, veía su burbuja, y el cliente **no
 * recibía nada**. Sin error y sin aviso — el peor tipo de fallo.
 *
 * PRIMERO SE MANDA Y DESPUÉS SE GUARDA, con el resultado anotado. Es el mismo
 * orden que usa el motor de WhatsApp, y por la misma razón: si se guardara
 * antes, el equipo vería en pantalla una conversación que el cliente nunca
 * tuvo. Cuando el envío falla, el mensaje se guarda igual pero marcado, y la
 * Bandeja ya sabe pintar ese aviso con el motivo en lenguaje humano.
 *
 * EL CANAL WEB NO ENVÍA NADA aquí a propósito: ahí el widget sondea, y mandar
 * también por otro camino duplicaría cada mensaje.
 */
/**
 * El texto de la plantilla con los datos ya puestos: lo que va a leer la
 * persona. `{{1}}` es el primer valor, `{{2}}` el segundo, y así.
 *
 * Si algún hueco se quedara sin valor se deja el `{{n}}` a la vista en vez de
 * borrarlo: un texto con un hueco visible se detecta de un vistazo, mientras
 * que una frase a la que le falta una palabra parece correcta y engaña.
 */
function textoDeLaPlantilla(cuerpo: string | null, valores: string[]): string {
  const base = String(cuerpo ?? "").trim();
  if (!base) return "(plantilla sin texto)";
  return base.replace(/\{\{\s*(\d+)\s*\}\}/g, (entero, n) => {
    const v = valores[Number(n) - 1];
    return v && String(v).trim() ? String(v) : entero;
  });
}

export async function POST(req: Request) {
  const sb = createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { conversacion, texto, adjunto, original, idioma, plantilla } = await req
    .json()
    .catch(() => ({} as any));

  const cuerpo = String(texto ?? "").trim();
  const nombrePlantilla = String(plantilla?.nombre ?? "").trim();
  if (!conversacion || (!cuerpo && !adjunto?.url && !nombrePlantilla)) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  // RLS decide si esta conversación es suya. No hace falta comprobarlo a mano:
  // si no lo es, esta consulta vuelve vacía.
  const { data: conv } = await sb
    .from("conversations")
    .select("id, org_id, bot_id, channel, contact:contacts(phone, external_id)")
    .eq("id", conversacion)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: "No encuentro esa conversación." }, { status: 404 });

  const payload: Record<string, any> = {};
  if (adjunto?.url) payload.adjunto = adjunto;
  if (original) payload.original = original;
  if (idioma) payload.idioma = idioma;

  // ── La plantilla se comprueba AQUÍ, contra la base ──────────────────────
  //
  // NO NOS FIAMOS DE LO QUE MANDE EL NAVEGADOR. El nombre de la plantilla y sus
  // valores vienen del cliente, y de ahí puede venir cualquier cosa. Se busca
  // la plantilla con RLS puesto —así solo aparece si es de esta organización— y
  // se exige que esté APROBADA: mandar una que no lo está es un rechazo seguro
  // de Meta, y el agente se quedaría creyendo que reabrió la conversación.
  //
  // También se cuenta el número de variables. Si no coinciden, Meta rechaza el
  // envío entero con un error que no dice cuál falta; comprobarlo aquí permite
  // decírselo al agente en cristiano y antes de gastar el intento.
  let plantillaOk: { name: string; language: string; body: string | null } | null = null;
  if (nombrePlantilla) {
    if (conv.channel !== "whatsapp") {
      return NextResponse.json(
        { error: "Las plantillas son de WhatsApp: este canal no las usa." },
        { status: 400 },
      );
    }

    const { data: fila } = await sb
      .from("whatsapp_templates")
      .select("name, language, status, body, variables")
      .eq("org_id", conv.org_id)
      .eq("name", nombrePlantilla)
      .eq("language", String(plantilla?.idioma ?? ""))
      .maybeSingle();

    if (!fila) {
      return NextResponse.json({ error: "No encuentro esa plantilla." }, { status: 404 });
    }
    if (String(fila.status ?? "").toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        { error: "Esa plantilla todavía no está aprobada por Meta, así que no se puede enviar." },
        { status: 400 },
      );
    }

    const valores = Array.isArray(plantilla?.valores) ? plantilla.valores.map((v: any) => String(v ?? "")) : [];
    const faltan = Number(fila.variables ?? 0);
    if (valores.filter((v: string) => v.trim()).length !== faltan) {
      return NextResponse.json(
        {
          error:
            faltan === 0
              ? "Esta plantilla no lleva datos que rellenar."
              : `Esta plantilla necesita ${faltan} dato${faltan === 1 ? "" : "s"} y no puede quedar ninguno en blanco.`,
        },
        { status: 400 },
      );
    }

    plantillaOk = { name: fila.name, language: fila.language, body: fila.body ?? null };
    payload.plantilla = { nombre: fila.name, idioma: fila.language, valores };
  }

  // ── Entrega por el canal que toque ──────────────────────────────────────
  if (conv.channel === "whatsapp") {
    // ── EL TOKEN CON LA LLAVE DE SERVICIO ─────────────────────────────
    // Un agente SÍ puede contestar desde la Bandeja —es su trabajo— pero NO
    // debe poder leer el token de Meta. Antes esta consulta iba con su sesión,
    // así que el mismo permiso que le deja responder le dejaba sacarse el
    // token desde la consola del navegador y mandar mensajes por fuera.
    // Quién puede llegar aquí ya se comprobó arriba, contra su conversación.
    const { data: canal } = await createAdminClient()
      .from("whatsapp_channels")
      .select("phone_number_id, access_token")
      .eq("org_id", conv.org_id)
      .maybeSingle();

    const contacto = (conv as any).contact;
    const para = String(contacto?.phone ?? contacto?.external_id ?? "").replace(/[^\d]/g, "");

    let envio: ResultadoEnvio;
    if (!canal?.phone_number_id || !canal?.access_token) {
      envio = { ok: false, error: "Todavía no hay un número de WhatsApp conectado en Conexión." };
    } else if (!para) {
      envio = { ok: false, error: "Este contacto no tiene un número de WhatsApp guardado." };
    } else if (plantillaOk) {
      // La plantilla va primero: es lo único que WhatsApp acepta fuera de la
      // ventana de 24 h, que es justo cuando el agente la necesita.
      envio = await enviarPlantilla(
        canal.phone_number_id, canal.access_token, para,
        plantillaOk.name, plantillaOk.language,
        (payload.plantilla?.valores ?? []) as string[],
      );
    } else if (adjunto?.url) {
      envio = await enviarArchivo(
        canal.phone_number_id, canal.access_token, para,
        adjunto.url, adjunto.tipo ?? "", adjunto.nombre ?? "archivo",
        // Si el texto es solo el nombre del archivo no se manda como pie:
        // el cliente ya lo ve en el propio documento.
        cuerpo && cuerpo !== adjunto.nombre ? cuerpo : undefined,
      );
    } else {
      envio = await enviarTexto(canal.phone_number_id, canal.access_token, para, cuerpo);
    }

    if (!envio.ok) payload.no_entregado = { motivo: envio.error ?? "No se pudo enviar", code: envio.code ?? null };
    // ACEPTADO NO ES ENTREGADO. Se guarda el identificador de Meta para poder
    // casar después su aviso de entrega y marcar el mensaje si falló. Ver
    // `handleStatuses` en el motor.
    else if (envio.wamid) payload.wamid = envio.wamid;
  }

  // ── Instagram ────────────────────────────────────────────────────────────
  //
  // OJO CON LA VENTANA DE 24 HORAS. Instagram solo deja contestar dentro de las
  // 24 h siguientes al último mensaje del cliente, y no hay plantillas como en
  // WhatsApp para reabrirla: pasado ese plazo, no hay forma de escribirle. El
  // agente tiene que enterarse en el momento, no descubrirlo por el silencio.
  if (conv.channel === "instagram") {
    const { data: canal } = await createAdminClient()
      .from("instagram_channels")
      .select("ig_user_id, access_token")
      .eq("org_id", conv.org_id)
      .maybeSingle();

    const igsid = String((conv as any).contact?.external_id ?? "");

    let envio: ResultadoEnvio;
    if (!canal?.ig_user_id || !canal?.access_token) {
      envio = { ok: false, error: "Todavía no hay una cuenta de Instagram conectada en Conexión." };
    } else if (!igsid) {
      envio = { ok: false, error: "Este contacto no tiene identificador de Instagram." };
    } else if (adjunto?.url) {
      envio = await enviarAdjuntoDm(
        canal.ig_user_id, canal.access_token, igsid, adjunto.url, adjunto.tipo ?? "",
      );
    } else {
      envio = await enviarDm(canal.ig_user_id, canal.access_token, igsid, cuerpo);
    }

    if (!envio.ok) payload.no_entregado = { motivo: envio.error ?? "No se pudo enviar", code: envio.code ?? null };
  }

  // Messenger entra aquí cuando esté conectado. Hasta entonces se dice la
  // verdad en vez de guardar en silencio algo que nadie recibió.
  if (conv.channel === "messenger") {
    payload.no_entregado = {
      motivo: "Este canal todavía no está conectado, así que el cliente no recibió el mensaje.",
      code: null,
    };
  }

  const { data: fila, error } = await sb
    .from("messages")
    .insert({
      conversation_id: conv.id,
      org_id: conv.org_id,
      direction: "outbound",
      sender: "agent",
      // CON LA PLANTILLA SE GUARDA LO QUE LEE LA PERSONA, no «📨 Plantilla
      // xyz». El agente tiene que ver en la conversación exactamente el texto
      // que recibió el cliente: si no, no sabe qué le dijo y la siguiente
      // respuesta del lead no tiene contexto ninguno.
      body: plantillaOk ? textoDeLaPlantilla(plantillaOk.body, payload.plantilla.valores) : (cuerpo || adjunto?.nombre || ""),
      ...(Object.keys(payload).length ? { payload } : {}),
    })
    .select("id,direction,sender,body,created_at,payload")
    .maybeSingle();

  if (error || !fila) {
    console.error("[canales/enviar] no se guardó:", error?.message);
    return NextResponse.json({ error: "No se pudo guardar el mensaje." }, { status: 500 });
  }

  // ── CUANDO HABLA UNA PERSONA, EL BOT SE CALLA ────────────────────────────
  //
  // ESTE `status` ES EL ARREGLO DE UN CAOS REAL. Los dos motores ya se callaban
  // con `assigned` —está comprobado en el código de los dos— pero NADIE LO
  // PONÍA NUNCA. El agente escribía desde la Bandeja, el lead contestaba, y le
  // respondía el BOT: dos voces distintas hablando con el mismo cliente,
  // pisándose, cada una preguntando lo que la otra ya había preguntado.
  //
  // Se vio en una conversación de verdad: el agente escribió «hola como estas»,
  // el lead contestó «bien gracias y tú», y el bot soltó «Bien, gracias por
  // preguntar 😊 ¿Cuál es su nombre?» — al lead que el agente ya estaba
  // atendiendo.
  //
  // Se toma la conversación aunque el envío haya fallado: si un agente está
  // escribiendo, está metido en la conversación, llegara o no ese mensaje.
  await sb
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      handoff_requested_at: null,
      status: "assigned",
    })
    .eq("id", conv.id);

  return NextResponse.json({ mensaje: fila });
}
