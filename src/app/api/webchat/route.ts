import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWebFlow, chooseWebFlow } from "@/lib/flow/webRuntime";
import { cerrarRecorrido } from "@/lib/flow/flowRuns";
import type { Flow } from "@/lib/flow/types";
import { agenteDelBot } from "@/lib/ai/agentes";

export const dynamic = "force-dynamic";

/**
 * Endpoint PÚBLICO del widget de chat web.
 * Lo llama `public/widget.js` desde el sitio del cliente, por eso lleva CORS.
 * El bot se identifica por su UUID (no adivinable) y solo se exponen los
 * mensajes del bot — nunca datos de la organización.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Nombre para un visitante web que todavía no dijo quién es.
 *
 * Antes todos se llamaban igual: "Visitante web". En la Bandeja y en el Embudo
 * aparecían tres renglones idénticos y el agente no tenía forma de saber cuál
 * era cuál. Ahora cada sesión trae un código corto y estable —"Visitante 4F2A"—
 * derivado de su propio identificador, así que se pueden nombrar en voz alta,
 * buscar y distinguir de un vistazo.
 *
 * Se usa md5 para que el mismo código se pueda calcular igual desde SQL cuando
 * haya que rellenar contactos viejos.
 */
function nombreDeVisitante(sessionId: string): string {
  try {
    const hex = createHash("md5").update(String(sessionId)).digest("hex");
    return `Visitante ${hex.slice(-4).toUpperCase()}`;
  } catch {
    return "Visitante web";
  }
}

/**
 * Hasta qué momento el visitante ya tiene todo pintado en pantalla.
 *
 * El sondeo pide "lo salido DESPUÉS de esta marca", así que se toma la fecha
 * del último mensaje saliente ya guardado. Sin esto, el widget repetiría los
 * mensajes que el bot acaba de contestar en este mismo turno.
 */
async function marcaActual(admin: any, conversationId: string): Promise<string> {
  try {
    const { data } = await admin
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as any)?.created_at ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

const DEFAULT_WIDGET = {
  color: "#6E42FF",
  position: "right",
  title: "¿Podemos ayudarte?",
  subtitle: "Normalmente respondemos al instante",
  greeting: "",
  launcher: "Chatea con nosotros",
};

export async function POST(req: Request) {
  try {
    // Sin la llave de servidor no podemos atender al visitante (no autenticado).
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error("[webchat] faltan variables de entorno del servidor");
      return json({ error: "server_not_configured" }, 503);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_request" }, 400);
    }

    const botId = String(body?.botId ?? "");
    const sessionId = String(body?.sessionId ?? "");
    const text = String(body?.text ?? "");
    const isStart = !!body?.start;
    /** Sondeo: el visitante no escribió nada, solo pregunta si le contestaron. */
    const esSondeo = !!body?.poll;
    const desdeCliente = String(body?.desde ?? "");

    if (!botId || !sessionId) return json({ error: "missing_params" }, 400);

    const admin = createAdminClient();

    const { data: bot, error: botErr } = await admin
      .from("bots")
      .select("id, org_id, name, channel, widget, ai, shortcuts, agente_id")
      .eq("id", botId)
      .maybeSingle();

    if (botErr) {
      console.error("[webchat] error leyendo bot:", botErr.message);
      return json({ error: "db_error" }, 500);
    }
    if (!bot || bot.channel !== "webchat") return json({ error: "bot_not_found" }, 404);

    const widget = { ...DEFAULT_WIDGET, ...((bot.widget as any) ?? {}) };

    // ── Sondeo ────────────────────────────────────────────────────────────────
    //
    // POR QUÉ EXISTE: el widget solo hablaba cuando le hablaban. Devolvía lo que
    // contestaba el bot en ESE mismo turno y nada más. Así que cuando un agente
    // tomaba la conversación y escribía desde la Bandeja, el mensaje NUNCA le
    // llegaba al visitante — que además acababa de leer "un asesor continuará
    // contigo por aquí". El pase a humano quedaba roto de este lado.
    //
    // No crea nada: si el visitante todavía no ha escrito, no hay contacto ni
    // conversación que inventar. Y solo devuelve mensajes SALIENTES de SU propia
    // conversación, nunca lo que él mismo escribió ni nada de otra sesión.
    if (esSondeo) {
      const vacio = { sessionId, widget, messages: [], desde: desdeCliente };

      const { data: c } = await admin
        .from("contacts")
        .select("id")
        .eq("org_id", bot.org_id)
        .eq("channel", "webchat")
        .eq("external_id", sessionId)
        .maybeSingle();
      if (!c) return json(vacio);

      const { data: cv } = await admin
        .from("conversations")
        .select("id, status, agent_typing_at")
        .eq("org_id", bot.org_id)
        .eq("contact_id", c.id)
        .eq("channel", "webchat")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cv) return json(vacio);

      // Los tres puntos. La Bandeja refresca la marca cada 3 s mientras el
      // agente teclea; se da por vigente 8 s para que no parpadeen entre pulsa
      // y pulsa, pero se apaguen solos si el agente se levanta de la silla.
      const tecleando =
        !!(cv as any).agent_typing_at &&
        Date.now() - new Date((cv as any).agent_typing_at).getTime() < 8000;

      let q = admin
        .from("messages")
        .select("id, body, created_at, payload")
        .eq("conversation_id", cv.id)
        .eq("direction", "outbound")
        .order("created_at", { ascending: true })
        .limit(30);
      // Sin marca previa no se devuelve el historial entero: el visitante ya lo
      // tiene pintado en pantalla y lo vería duplicado. Se le entrega la marca
      // que sale de la PROPIA base, no un `now()` de este servidor: si los dos
      // relojes van desfasados aunque sea un instante, un mensaje escrito justo
      // en medio se perdería para siempre.
      if (desdeCliente) q = q.gt("created_at", desdeCliente);
      else return json({ ...vacio, desde: await marcaActual(admin, cv.id), escribiendo: tecleando });

      const { data: nuevos } = await q;
      // Un mensaje vale si trae texto O si trae archivo: antes solo se miraba
      // el texto, así que un adjunto sin comentario no llegaba nunca.
      const filas = ((nuevos as any[]) ?? []).filter(
        (m) => (m.body ?? "").trim() || m.payload?.adjunto?.url,
      );

      return json({
        sessionId,
        widget,
        // SE MANDA EL ADJUNTO Y NADA MÁS DEL `payload`. Ahí dentro también vive
        // lo que el agente escribió antes de traducir, y eso es información
        // interna del equipo: al visitante no le corresponde verla.
        messages: filas.map((m) => ({
          text: m.body,
          adjunto: m.payload?.adjunto
            ? {
                url: m.payload.adjunto.url,
                nombre: m.payload.adjunto.nombre,
                tipo: m.payload.adjunto.tipo,
              }
            : undefined,
        })),
        desde: filas.length ? filas[filas.length - 1].created_at : desdeCliente,
        handedOff: cv.status === "assigned",
        // Si acaban de llegar mensajes, ya no está escribiendo: los mandó.
        escribiendo: filas.length ? false : tecleando,
      });
    }

    // Contacto anónimo del navegador (identificado por su sessionId).
    //
    // NO se usa `upsert`: escribía el nombre en CADA mensaje, así que si un
    // agente rebautizaba el contacto a "Juan Pérez", el siguiente mensaje del
    // cliente lo devolvía a "Visitante web". El nombre se pone al crearlo y
    // desde ahí manda quien lo edite.
    let { data: contact } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", bot.org_id)
      .eq("channel", "webchat")
      .eq("external_id", sessionId)
      .maybeSingle();

    if (!contact) {
      const ins = await admin
        .from("contacts")
        .insert({
          org_id: bot.org_id,
          channel: "webchat",
          external_id: sessionId,
          name: nombreDeVisitante(sessionId),
        })
        .select("id")
        .maybeSingle();
      contact = ins.data;

      // Dos mensajes casi a la vez pueden intentar crearlo los dos; el segundo
      // choca con el índice único. No es un error: el contacto ya existe.
      if (!contact) {
        ({ data: contact } = await admin
          .from("contacts")
          .select("id")
          .eq("org_id", bot.org_id)
          .eq("channel", "webchat")
          .eq("external_id", sessionId)
          .maybeSingle());
      }
    }

    if (!contact) return json({ error: "contact_error" }, 500);

    // Conversación abierta más reciente (o una nueva)
    let { data: conv } = await admin
      .from("conversations")
      .select("id, flow_state, status")
      .eq("org_id", bot.org_id)
      .eq("contact_id", contact.id)
      .eq("channel", "webchat")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv || conv.status === "closed") {
      const ins = await admin
        .from("conversations")
        .insert({
          org_id: bot.org_id,
          contact_id: contact.id,
          bot_id: bot.id,
          channel: "webchat",
          status: "open",
          flow_state: {},
        })
        .select("id, flow_state, status")
        .single();
      conv = ins.data as any;
    }
    if (!conv) return json({ error: "conversation_error" }, 500);

    // Mensaje del visitante
    if (!isStart && text) {
      await admin.from("messages").insert({
        conversation_id: conv.id,
        org_id: bot.org_id,
        direction: "inbound",
        sender: "contact",
        body: text,
      });
    }
    await admin.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);

    // Si un humano tomó el chat, el bot no interrumpe
    if (conv.status === "assigned") {
      return json({ sessionId, widget, messages: [], handedOff: true, desde: await marcaActual(admin, conv.id) });
    }

    // ¿Visitante que regresa?
    const { count: convCount } = await admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id);
    const isReturning = (convCount ?? 1) > 1;

    const { data: flowRows } = await admin
      .from("flows")
      // `priority` y `updated_at` NO son adorno: son lo que hace que, con dos
      // flujos que responden al mismo disparador, gane siempre el mismo.
      .select("id, name, graph, trigger_type, keywords, enabled, priority, updated_at")
      .eq("bot_id", bot.id);

    const flows = (flowRows ?? []).filter((f: any) => f.enabled !== false);
    const state = (conv.flow_state as any) ?? {};
    const chosen = chooseWebFlow(flows, text, isReturning, state);

    if (!chosen) return json({ sessionId, widget, messages: [], desde: await marcaActual(admin, conv.id) });

    const graph = (chosen.graph as any) ?? { nodes: [], edges: [] };
    const flow = { id: chosen.id, name: "", nodes: graph.nodes ?? [], edges: graph.edges ?? [] } as Flow;
    if (!flow.nodes.length) return json({ sessionId, widget, messages: [], desde: await marcaActual(admin, conv.id) });

    // Analítica: si un disparador movió la charla a otro flujo, el recorrido
    // anterior no quedó "abandonado": cambió. Se cierra con ese motivo.
    const mismoFlujo = state.flow_id === chosen.id;
    if (!mismoFlujo && state.run_id) {
      await cerrarRecorrido(admin, state.run_id, "cambio");
    }

    const flowState = mismoFlujo ? state : { vars: state.vars ?? {} };
    const elAgente = await agenteDelBot(admin, bot as any);

    const result = await runWebFlow({
      flow,
      orgId: bot.org_id,
      conversationId: conv.id,
      admin,
      flowState,
      text,
      isStart,
      botId: bot.id,
      // ── LA PERSONALIDAD SALE DEL AGENTE, CON `bots.ai` DE RESPALDO ────
      // Un agente puede servir a varios chatbots: el negocio escribe su forma
      // de hablar una vez y la usan WhatsApp, Instagram y la web. Si el bot no
      // tiene agente, se usa su configuración de siempre — esa caída es lo que
      // permite publicar esto sin jugarse los bots que están vendiendo hoy.
      aiSettings: elAgente.ajustes,
      tiendaElegida: elAgente.tiendaId,
      atajos: (bot as any).shortcuts ?? null,
      flowName: (chosen as any).name ?? null,
      // Encendida salvo que el cliente la apague a propósito. Manda el
      // interruptor general: si la IA está apagada, tampoco hay desvío.
      iaDeRespaldo:
        (bot as any).ai?.enabled !== false && (bot as any).ai?.fallback_flujo !== false,
      // En el turno anterior el bot dijo "no sé, ¿te paso con una persona?".
      ofreciAgente: state.ofreciAgente === true,
    });

    // ¿El bot acaba de decir "no sé" y ofrecer una persona? El mensaje de
    // respaldo lo escribe el cliente en su configuración, así que no se puede
    // reconocer por el texto: se compara con el que él mismo puso. Si el
    // siguiente mensaje es un "sí", el motor hace el pase.
    // Se recalcula en cada turno, así que se apaga solo en cuanto el bot
    // contesta cualquier otra cosa.
    const respaldo = String((bot as any).ai?.fallback ?? "").trim();
    const ofreciAgente =
      respaldo.length > 0 && result.out.some((m: any) => String(m?.text ?? "").trim() === respaldo);

    await admin
      .from("conversations")
      .update({
        flow_state: {
          vars: result.vars,
          awaiting: result.awaiting,
          // EL FLUJO PUEDE HABER CAMBIADO EN ESTE MISMO TURNO. El bloque «Ir
          // a otra conversación» salta al flujo de otro bot; guardar aquí
          // `chosen.id` dejaría el estado apuntando al flujo VIEJO, y el turno
          // siguiente buscaría el nodo en el que se quedó dentro de un gráfico
          // donde no existe. La conversación se quedaría muda.
          flow_id: result.flowIdNuevo ?? chosen.id,
          hintEnviado: result.hintEnviado,
          run_id: result.runId ?? null,
          ofreciAgente,
          // Sin esto, el siguiente mensaje reinicia el flujo y el bot repite
          // el saludo como perico.
          terminado: result.terminado ?? false,
        },
      })
      .eq("id", conv.id);

    // La marca va DESPUES de guardar la respuesta del bot, para que el sondeo
    // no la devuelva otra vez: el widget ya la pinto en este mismo turno.
    return json({ sessionId, widget, messages: result.out, desde: await marcaActual(admin, conv.id) });
  } catch (e: any) {
    console.error("[webchat]", e?.message ?? e);
    return json({ error: "server_error", detail: e?.message ?? "desconocido" }, 500);
  }
}
