import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarTexto, enviarArchivo, type ResultadoEnvio } from "@/lib/canales/whatsappEnviar";

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
export async function POST(req: Request) {
  const sb = createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { conversacion, texto, adjunto, original, idioma } = await req
    .json()
    .catch(() => ({} as any));

  const cuerpo = String(texto ?? "").trim();
  if (!conversacion || (!cuerpo && !adjunto?.url)) {
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

  // ── Entrega por el canal que toque ──────────────────────────────────────
  if (conv.channel === "whatsapp") {
    const { data: canal } = await sb
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
  }

  // Instagram y Messenger entran aquí cuando estén conectados. Hasta entonces
  // se dice la verdad en vez de guardar en silencio algo que nadie recibió.
  if (conv.channel === "instagram" || conv.channel === "messenger") {
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
      body: cuerpo || adjunto?.nombre || "",
      ...(Object.keys(payload).length ? { payload } : {}),
    })
    .select("id,direction,sender,body,created_at,payload")
    .maybeSingle();

  if (error || !fila) {
    console.error("[canales/enviar] no se guardó:", error?.message);
    return NextResponse.json({ error: "No se pudo guardar el mensaje." }, { status: 500 });
  }

  await sb
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), handoff_requested_at: null })
    .eq("id", conv.id);

  return NextResponse.json({ mensaje: fila });
}
