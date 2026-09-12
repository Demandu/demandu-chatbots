import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { runWebFlow } from "@/lib/flow/webRuntime";
import { agenteDelBot } from "@/lib/ai/agentes";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

/**
 * «PROBAR FLUJO»: LA PRUEBA CORRE EL MOTOR DE VERDAD.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES HABÍA UN TERCER MOTOR. `Webchat.tsx` traía su propio intérprete de
 * flujos en el navegador: 7 tipos de bloque, contra 29 del motor de Node y 49
 * del de WhatsApp. Todo lo demás —Multimedia, Tienda, Reservas, Condición,
 * Redirigir— caía en su rama por defecto y solo imprimía el texto del nodo. Por
 * eso una imagen salía como «imagen, texto o video» en vez de como imagen.
 *
 * Y lo peor no era lo que faltaba, era lo que inventaba: el bloque de IA tenía
 * la respuesta ESCRITA A MANO en el archivo —una recomendación de un «Kit
 * Skincare»— igual para todos los clientes de la plataforma. Un negocio probaba,
 * veía a Lana contestar, creía que su entrenamiento funcionaba, publicaba, y
 * WhatsApp hacía otra cosa. Una vista previa que miente es peor que ninguna.
 *
 * Esta puerta borra ese motor. Corre `runWebFlow`, el MISMO que atiende el
 * widget de la web y de Instagram. Lo que se ve aquí es lo que hace el producto.
 *
 * ── LO QUE SIGUE SIN PODER PROBARSE, Y SE DICE ────────────────────────────
 *
 * El motor de WhatsApp (Deno) entiende 49 tipos de bloque; este 29. Un bloque
 * que solo existe allá no se puede probar aquí, y la pantalla tiene que decirlo
 * en vez de fingir. Prometer 49 sería repetir el error que esto corrige.
 *
 * ── POR QUÉ NO SE REUSA `/api/webchat` ────────────────────────────────────
 *
 * Esa ruta es PÚBLICA (CORS abierto, sin sesión), solo atiende bots de canal
 * `webchat`, y elige el flujo por disparador. Aquí hace falta lo contrario: con
 * sesión, cualquier canal, y EL flujo que el dueño tiene abierto. Doblar la
 * ruta pública para esto habría metido un modo de prueba en la puerta por donde
 * entran los visitantes de todos los clientes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return Response.json({ error: "sin_sesion" }, { status: 401 });

  // Probar un chatbot es trabajo de quien puede tocarlos. Sin esto, cualquier
  // miembro dispararía la IA del negocio —que cuesta dinero— desde su panel.
  const { permisos } = await misPermisos();
  if (!permisos.has("chatbots")) return Response.json({ error: "sin_permiso" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  const flowId = String(b?.flowId ?? "");
  const texto = String(b?.text ?? "");
  const esInicio = !!b?.start;
  const reiniciar = !!b?.reiniciar;
  if (!flowId) return Response.json({ error: "falta_flujo" }, { status: 400 });

  const admin = createAdminClient();

  const { data: flujo, error: errFlujo } = await admin
    .from("flows")
    .select("id, name, graph, bot_id")
    .eq("id", flowId)
    .maybeSingle();
  // «No se pudo leer» no es «no existe». Contestar 404 a un fallo de la base
  // haría que la pantalla dijera «este flujo ya no existe» sobre un flujo vivo.
  if (errFlujo) return Response.json({ error: "no_se_pudo_leer" }, { status: 500 });
  if (!flujo) return Response.json({ error: "flujo_no_existe" }, { status: 404 });

  const { data: bot, error: errBot } = await admin
    .from("bots")
    .select("id, org_id, channel, ai, shortcuts, agente_id")
    .eq("id", flujo.bot_id)
    .maybeSingle();
  if (errBot) return Response.json({ error: "no_se_pudo_leer" }, { status: 500 });
  // EL DUEÑO DEL FLUJO MANDA, NO EL QUE PREGUNTA. Sin esta comprobación,
  // cualquiera con sesión probaría el flujo de otra cuenta —y con él su IA, su
  // tienda y sus datos— sabiendo solo un identificador.
  if (!bot || bot.org_id !== orgId) return Response.json({ error: "flujo_no_existe" }, { status: 404 });

  /* ── UNA SOLA CONVERSACIÓN DE PRUEBA POR CHATBOT ────────────────────────
   * Se reutiliza siempre. Probar veinte veces no puede dejar veinte
   * conversaciones muertas ni veinte contactos en el CRM. */
  const externo = `prueba:${bot.id}`;
  let { data: contacto } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel", "webchat")
    .eq("external_id", externo)
    .maybeSingle();

  if (!contacto) {
    const ins = await admin
      .from("contacts")
      .insert({ org_id: orgId, channel: "webchat", external_id: externo, name: "Prueba del panel" })
      .select("id")
      .maybeSingle();
    contacto = ins.data;
    // Dos pruebas a la vez chocan con el índice único: no es un error, ya está.
    if (!contacto) {
      ({ data: contacto } = await admin
        .from("contacts")
        .select("id")
        .eq("org_id", orgId)
        .eq("channel", "webchat")
        .eq("external_id", externo)
        .maybeSingle());
    }
  }
  if (!contacto) return Response.json({ error: "no_se_pudo_preparar" }, { status: 500 });

  let { data: conv } = await admin
    .from("conversations")
    .select("id, flow_state")
    .eq("org_id", orgId)
    .eq("contact_id", contacto.id)
    .eq("prueba", true)
    .limit(1)
    .maybeSingle();

  if (!conv) {
    const ins = await admin
      .from("conversations")
      .insert({
        org_id: orgId,
        contact_id: contacto.id,
        bot_id: bot.id,
        channel: "webchat",
        status: "open",
        prueba: true,
        flow_state: {},
      })
      .select("id, flow_state")
      .maybeSingle();
    conv = ins.data as any;
  }
  if (!conv) return Response.json({ error: "no_se_pudo_preparar" }, { status: 500 });

  const graph = (flujo.graph as any) ?? { nodes: [], edges: [] };
  const flow = {
    id: flujo.id,
    name: "",
    nodes: graph.nodes ?? [],
    edges: graph.edges ?? [],
  } as Flow;
  // Un lienzo vacío no es un fallo: es un flujo que todavía no se dibujó.
  if (!flow.nodes.length) return Response.json({ messages: [], vacio: true });

  const estadoGuardado = (conv.flow_state as any) ?? {};
  const estado = reiniciar || esInicio ? { vars: {} } : estadoGuardado;

  const elAgente = await agenteDelBot(admin, bot as any);

  const r = await runWebFlow({
    flow,
    orgId,
    conversationId: conv.id,
    admin,
    flowState: estado,
    text: texto,
    isStart: esInicio,
    botId: bot.id,
    aiSettings: elAgente.ajustes,
    tiendaElegida: elAgente.tiendaId,
    atajos: (bot as any).shortcuts ?? null,
    flowName: (flujo as any).name ?? null,
    iaDeRespaldo: (bot as any).ai?.enabled !== false && (bot as any).ai?.fallback_flujo !== false,
    // Las dos que hacen que esto sea una prueba y no una conversación:
    // ni se guarda en la Bandeja (ni gasta del plan) ni entra en Resultados.
    guardarEnBandeja: false,
    esPrueba: true,
  });

  await admin
    .from("conversations")
    .update({
      flow_state: {
        vars: r.vars,
        awaiting: r.awaiting,
        flow_id: r.flowIdNuevo ?? flujo.id,
        hintEnviado: r.hintEnviado,
        run_id: null,
        terminado: r.terminado ?? false,
      },
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conv.id);

  return Response.json({ messages: r.out, terminado: r.terminado ?? false });
}
