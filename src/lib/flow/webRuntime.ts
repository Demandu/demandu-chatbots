import { getNode, getStartNode, defaultNext, buttonTarget } from "./engine";
import type { Flow, DemanduNode, ConditionRule, FlowButton } from "./types";
import { aiAnswer, type AiSettings } from "@/lib/ai/answer";
import { detectarAtajo, leerAtajos, type Atajos } from "./shortcuts";
import { abrirRecorrido, avanzarRecorrido, cerrarRecorrido, type MotivoFin } from "./flowRuns";
import { decidirDesvio, puenteDeVuelta, esAfirmacion, type MotivoDesvio } from "./desvio";
import {
  tiendaDelBot, enlaceDelBot, mensajeDeTienda, productosQueSePuedenOfrecer,
  precioDelBot, comoVaElPedido, pedidoDelQueHablar,
  type TiendaDelBot, type ProductoDelBot, type PedidoDelBot,
} from "@/lib/tienda/paraElBot";
import type { MensajeChat } from "@/lib/tienda/conversacionDePedido";
import type { CarritoChat } from "@/lib/tienda/pedirPorChat";

/**
 * Motor de conversación para canales que NO envían por una API externa
 * (hoy: el widget del sitio web). En vez de mandar el mensaje, lo va
 * acumulando y lo devuelve para que el widget lo pinte. Guarda todo en la
 * Bandeja igual que WhatsApp, así el equipo ve y contesta desde un solo lugar.
 */

export type OutMsg = { text: string; buttons?: { id: string; label: string }[] };
/**
 * Lo que el bot está esperando.
 *
 * EL CARRITO VIAJA AQUÍ DENTRO, y no en `vars`, por dos motivos. `vars` se
 * interpola en los textos que ve el cliente, así que un carrito entero podría
 * acabar pintado en un mensaje. Y esta es exactamente la vida que tiene que
 * tener: mientras el bloque conduce la charla existe, y en cuanto el flujo se
 * va, desaparece — un carrito a medias resucitando tres días después es peor
 * que empezar de nuevo.
 */
type Awaiting =
  | { nodeId: string; type: "question" | "buttons" }
  | { nodeId: string; type: "tienda_pedir"; carrito: CarritoChat | null }
  // ESPERANDO QUE ELIJA UNA HORA. El id del botón ES la hora en ISO, igual que
  // en el motor de WhatsApp: así no hay que guardar la lista de horarios en
  // ninguna parte ni preocuparse de que caduque entre un mensaje y el otro.
  | { nodeId: string; type: "cita" }
  | null;

interface Ctx {
  flow: Flow;
  orgId: string;
  conversationId: string;
  admin: any;
  vars: Record<string, string>;
  out: OutMsg[];
  botId: string;
  aiSettings: AiSettings | null;
  lastUserText: string;
  /** Analítica: bloques recorridos en este turno y cómo terminó el recorrido. */
  pasos: number;
  ultimoNodo: string | null;
  finMotivo: MotivoFin | null;
  /**
   * El bloque «Ir a otra conversación» cambia el flujo EN CALIENTE. Hay que
   * devolver el id nuevo para que el turno siguiente retome donde toca: sin
   * esto, el estado guardado apuntaría a un bloque de un flujo que ya no corre
   * y la conversación se quedaría atorada en un nodo inexistente.
   */
  flowIdNuevo: string | null;
}

function interp(t: string | undefined, vars: Record<string, string>) {
  const out = (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
  // Si una variable vino vacía, no dejamos "¡Hola ! ..." ni dobles espacios.
  // (Mismo tratamiento que en el motor de WhatsApp.)
  return out
    .replace(/([,;:])\s*([!?.…])/g, "$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?…])/g, "$1")
    .trim();
}

/**
 * Textos de ejemplo que el constructor deja al soltar un bloque nuevo.
 * Si un bloque todavía los tiene, es que no se configuró: no se envían.
 */
const PLACEHOLDERS = new Set([
  "Disparador del flujo", "Texto simple", "Imagen, video o archivo",
  "Captura una respuesta", "Opciones / menú", "Ramifica según reglas",
  "Ramifica según los datos del contacto", "Respuesta con IA", "Pausa temporizada",
  "Webhook o integración", "Google Calendar", "Segmenta el contacto",
  "Transferir a tu equipo", "Reparte a agente / equipo", "Va a otro flujo / bot",
  "Llama una API y ramifica", "Llama una API y ramifica por respuesta",
  "Formulario nativo de WhatsApp", "Cobro con pasarela",
  "Venta de productos por WhatsApp", "Mensaje con plantilla aprobada",
  "Reacciona a menciones/respuestas de historias IG",
  "Responde comentarios y pasa a DM", "Envía un DM de Instagram",
  "Responde comentarios de Facebook y pasa a DM",
  "Captura datos en tu sitio", "Cierra el flujo",
]);
const esEjemplo = (t?: string | null) => !!t && PLACEHOLDERS.has(t.trim());

/**
 * La tienda dentro del widget web.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AQUÍ NO HAY LISTAS INTERACTIVAS. WhatsApp tiene un mensaje de lista con hasta
 * diez filas; el widget solo tiene botones. Así que el catálogo se degrada a
 * botones —que es lo que hay— y el enlace de la tienda va en el propio texto.
 *
 * SE DEGRADA, NO SE CALLA. Un bloque que en WhatsApp funciona y en el widget no
 * hace nada es el peor de los dos mundos: el negocio arma su flujo, lo prueba
 * en el panel, se ve bien, y en su sitio web no pasa nada. Eso es exactamente
 * lo que hoy le ocurre a `catalog`, `payment` y `template`, que caen en el
 * `default` y solo mandan su texto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function tiendaDelBotEnLaBase(ctx: Ctx) {
  if (!ctx.botId) return null;
  const { data } = await ctx.admin
    .from("tiendas")
    .select("id, slug, nombre, activa, config")
    .eq("org_id", ctx.orgId)
    .eq("bot_id", ctx.botId)
    .eq("activa", true)
    .order("nombre");
  return tiendaDelBot((data ?? []) as TiendaDelBot[]);
}

/** La salida por prefijo, igual que en el motor de WhatsApp. */
function salidaDe(ctx: Ctx, node: any, prefijo: string): string | undefined {
  const b = (node.data?.buttons ?? []).find((x: any) => String(x.id ?? "").startsWith(prefijo));
  return b ? buttonTarget(ctx.flow, node.id, b) : undefined;
}

function push(ctx: Ctx, text: string, buttons?: FlowButton[]) {
  if (esEjemplo(text) && !(buttons ?? []).length) return;
  const body = interp(text, ctx.vars);
  const opts = (buttons ?? []).map((b) => ({ id: b.id, label: b.label ?? "Opción" }));
  if (!body && !opts.length) return;
  ctx.out.push(opts.length ? { text: body || "Elige una opción", buttons: opts } : { text: body });
}

/**
 * Un turno del pedido por chat, en el widget.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODA LA CONVERSACIÓN LA DECIDE `conversar`, QUE NO VIVE AQUÍ. Este runtime y
 * el motor de WhatsApp le mandan lo que la persona tocó y reciben el carrito
 * nuevo más los mensajes ya escritos. Los dos son carteros.
 *
 * Es lo único que evita que un pedido hecho por el widget se cobre distinto que
 * uno hecho por WhatsApp: no hay dos versiones de las preguntas ni dos sumas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function pedirPorElChatWeb(
  ctx: Ctx,
  node: any,
  carrito: CarritoChat | null,
  respuesta: string,
): Promise<{ espera: Awaiting; siguiente: string | undefined }> {
  const noSePudo = () => ({
    espera: null as Awaiting,
    siguiente: salidaDe(ctx, node, "no-") ?? defaultNext(ctx.flow, node),
  });

  const t = await tiendaDelBotEnLaBase(ctx);
  if (!t) return noSePudo();

  // En el widget no hay teléfono: quien escribe se identifica por su
  // conversación, que es lo único que lo señala. Por eso aquí el formulario SÍ
  // le pregunta el teléfono y en WhatsApp no — allá ya se sabe.
  const { data: conv } = await ctx.admin
    .from("conversations").select("contact_id").eq("id", ctx.conversationId).maybeSingle();

  // ── SE CARGA CUANDO SE USA, NO AL ARRANCAR ──────────────────────────────
  //
  // `conversarDePedido` arrastra el cliente de administración de Supabase, y
  // este runtime lo cargan también las pruebas del motor, que corren sin
  // paquetes instalados. Con el import arriba, un flujo que ni siquiera tiene
  // el bloque de pedidos no podía ni cargarse. Aquí abajo solo pesa cuando de
  // verdad hay alguien pidiendo.
  const { conversar } = await import("@/lib/tienda/conversacionDePedido");

  const turno = await conversar({
    slug: t.slug,
    carrito,
    respuesta,
    saludo: interp(String(node.data?.text ?? "").trim(), ctx.vars),
    quien: {
      contacto_id: conv?.contact_id ?? null,
      conversacion_id: ctx.conversationId,
      nombre: ctx.vars?.nombre ?? null,
    },
  });

  for (const m of turno.mensajes) pintarMensajeDePedido(ctx, m);

  if (turno.salida === null) {
    return { espera: { nodeId: node.id, type: "tienda_pedir", carrito: turno.carrito }, siguiente: undefined };
  }
  if (turno.salida === "ok") {
    ctx.vars.pedido_numero = String(turno.pedido?.numero ?? "");
    ctx.vars.pedido_codigo = String(turno.pedido?.codigo ?? "");
    ctx.vars.pedido_total = String(turno.pedido?.total ?? "");
    return { espera: null, siguiente: salidaDe(ctx, node, "ok-") ?? defaultNext(ctx.flow, node) };
  }
  return noSePudo();
}

/**
 * El mismo mensaje, con lo que el widget sabe pintar.
 *
 * EL WIDGET NO TIENE LISTAS, solo botones, así que una lista de diez se queda
 * en seis y el resto se contesta escribiendo — `conversar` acepta el nombre del
 * producto o de la opción, no solo el identificador de la fila. Pintar veinte
 * botones sería peor que no pintarlos: nadie los lee y tapan la conversación.
 */
function pintarMensajeDePedido(ctx: Ctx, m: MensajeChat) {
  if (m.tipo === "texto") return push(ctx, m.texto);
  if (m.tipo === "enlace") return push(ctx, `${m.texto}\n\n${m.url}`);

  const opciones =
    m.tipo === "lista"
      ? m.filas.slice(0, 6).map((f) => ({
          id: f.id,
          label: `${f.titulo}${f.descripcion ? ` · ${f.descripcion}` : ""}`.slice(0, 40),
        }))
      : m.botones.map((b) => ({ id: b.id, label: b.titulo }));

  const recortada = m.tipo === "lista" && m.filas.length > 6;
  push(ctx, m.texto, opciones);
  if (recortada) push(ctx, "Si no ves lo que buscas, escríbeme su nombre.");
}

function evalRule(rule: ConditionRule, vars: Record<string, string>): boolean {
  const raw = rule.attribute ? vars[rule.attribute] ?? "" : "";
  const a = String(raw).toLowerCase();
  const b = String(rule.value ?? "").toLowerCase();
  switch (rule.operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    case "greater_than": return parseFloat(raw) > parseFloat(rule.value ?? "");
    case "less_than": return parseFloat(raw) < parseFloat(rule.value ?? "");
    case "is_empty": return !raw;
    case "is_not_empty": return !!raw;
    default: return false;
  }
}

function evalCondition(flow: Flow, node: DemanduNode, vars: Record<string, string>) {
  for (const br of node.data.conditions ?? []) {
    const results = (br.rules ?? []).map((r) => evalRule(r, vars));
    const ok = br.match === "any" ? results.some(Boolean) : results.every(Boolean);
    if (ok) {
      const edge = flow.edges.find((e) => e.source === node.id && e.sourceHandle === br.id);
      if (edge) return edge.target;
    }
  }
  return flow.edges.find((e) => e.source === node.id && e.sourceHandle === "otherwise")?.target;
}

/** Últimos mensajes de la conversación, para que la IA tenga contexto. */
/**
 * Aplica el bloque de etiquetas del constructor.
 *
 * Nunca revienta la conversación: etiquetar importa, pero menos que seguir
 * atendiendo. Si algo falla queda en el registro y el flujo continúa.
 */
async function aplicarEtiquetas(ctx: Ctx, node: DemanduNode) {
  const d: any = node.data ?? {};
  const poner: string[] = d.tagIdsAdd ?? [];
  const quitar: string[] = d.tagIdsRemove ?? [];
  if (!poner.length && !quitar.length) return;

  try {
    const { data: conv } = await ctx.admin
      .from("conversations").select("contact_id").eq("id", ctx.conversationId).maybeSingle();
    if (!conv?.contact_id) return;

    const ids = [...poner, ...quitar];
    const { data: filas } = await ctx.admin
      .from("tags").select("id, name").in("id", ids).eq("org_id", ctx.orgId);
    const nombre = new Map(((filas ?? []) as any[]).map((t) => [t.id, t.name]));

    if (quitar.length) {
      const { data: c } = await ctx.admin
        .from("contacts").select("tags").eq("id", conv.contact_id).eq("org_id", ctx.orgId).maybeSingle();
      const quedan = new Set<string>(c?.tags ?? []);
      for (const id of quitar) { const n = nombre.get(id); if (n) quedan.delete(n); }
      await ctx.admin.from("contacts").update({ tags: [...quedan] }).eq("id", conv.contact_id);
    }

    for (const id of poner) {
      const n = nombre.get(id);
      if (!n) continue;
      const { error } = await ctx.admin.rpc("poner_etiqueta", {
        p_org_id: ctx.orgId, p_contact_id: conv.contact_id, p_etiqueta: n,
      });
      if (error) console.error(`[etiquetas] no pude poner "${n}":`, error.message);
    }
  } catch (e) {
    console.error("[etiquetas] no se pudieron aplicar:", e);
  }
}

async function recentHistory(ctx: Ctx): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    const { data } = await ctx.admin
      .from("messages")
      .select("direction, body")
      .eq("conversation_id", ctx.conversationId)
      .order("created_at", { ascending: false })
      .limit(6);
    return ((data ?? []) as any[])
      .reverse()
      .filter((m) => m.body)
      .map((m) => ({ role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const), content: m.body }));
  } catch {
    return [];
  }
}

/**
 * Contesta con la IA una duda que el flujo no esperaba.
 * Devuelve el texto, o null si la IA no supo (o no está configurada): en ese
 * caso el motor sigue con el comportamiento de siempre en vez de soltar dos
 * mensajes de "no sé" seguidos.
 */
async function responderDuda(ctx: Ctx): Promise<string | null> {
  const settings: AiSettings = { ...(ctx.aiSettings ?? {}) };
  try {
    const respuesta = await aiAnswer({
      admin: ctx.admin,
      botId: ctx.botId,
      orgId: ctx.orgId,
      question: ctx.lastUserText,
      settings,
      history: await recentHistory(ctx),
    });
    const limpio = (respuesta ?? "").trim();
    if (!limpio) return null;
    // Si la IA devolvió su mensaje de respaldo, es que no supo: no aporta.
    const respaldo = (settings.fallback ?? "").trim();
    if (respaldo && limpio === respaldo) return null;
    return limpio;
  } catch {
    return null;
  }
}


/* ── LOS CUATRO BLOQUES QUE LA PALETA PROMETÍA Y ESTE MOTOR NO EJECUTABA ────
 *
 * `channels.ts` se declara «fuente ÚNICA de verdad: qué componente aplica en
 * cada canal» y da `calendar`, `action`, `api` y `redirect` por buenos en TODOS
 * los canales. Este motor —el del widget web Y el de Instagram— no tenía `case`
 * para ninguno: caían al caso por defecto, escribían su texto y seguían.
 *
 * Sin un solo error. Un «Agendar cita» en un bot de Instagram no agendaba nada
 * y tampoco lo decía; un webhook no salía nunca; un «Ir a otra conversación» se
 * quedaba donde estaba. El cliente los arrastraba, los configuraba y construía
 * su negocio encima.
 *
 * Se portan con la MISMA semántica que el motor de WhatsApp, no con una
 * parecida: mismos nombres de variables (`api_ok`, `cita_dia`…), mismas
 * salidas por prefijo, mismos silencios. Dos motores que se comportan casi
 * igual son peores que uno solo, porque nadie sabe cuál de los dos está mal.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * «Acción / Webhook»: avisar a otro sistema del cliente.
 *
 * SE DISPARA Y LA CONVERSACIÓN SIGUE, sin esperar respuesta. Quien pone este
 * bloque quiere avisar a su CRM, no hacer esperar a la persona que está
 * escribiendo. El fallo queda en el registro, no en su cara.
 */
async function dispararAccionWeb(ctx: Ctx, node: any) {
  const d = node.data ?? {};
  const url = interp(String(d.apiUrl ?? "").trim(), ctx.vars);
  if (!url) {
    console.error("[accion] el bloque no tiene dirección configurada:", node.id);
    return;
  }

  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };
  // Aquí las cabeceras son un JSON escrito a mano en una caja de texto. Si está
  // mal escrito no se rompe la conversación por ello: se manda sin ellas.
  try {
    const extra = JSON.parse(interp(String(d.apiHeaders ?? "").trim() || "{}", ctx.vars));
    for (const [k, v] of Object.entries(extra)) cabeceras[k] = String(v);
  } catch {
    console.error("[accion] cabeceras ilegibles en el bloque", node.id);
  }

  const metodo = String(d.apiMethod ?? "POST").toUpperCase();
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), 10000);

  fetch(url, {
    method: metodo,
    headers: cabeceras,
    body: metodo === "GET" || metodo === "HEAD" ? undefined : (interp(String(d.apiBody ?? ""), ctx.vars) || "{}"),
    signal: ctl.signal,
  })
    .then((r) => { if (!r.ok) console.error(`[accion] ${url} respondió ${r.status}`); })
    .catch((e) => console.error("[accion] no contestó:", e?.message ?? e));
}

/**
 * «Consultar un sistema»: preguntar y seguir por un camino u otro.
 *
 * SIN DIRECCIÓN SE VA POR «Otros», no por el camino del éxito. En el flujo de
 * un cliente esa salida suele llevar a una persona, que es exactamente lo que
 * hace falta si el bloque quedó a medias.
 */
async function llamarApiWeb(ctx: Ctx, node: any): Promise<string | undefined> {
  const d = node.data ?? {};
  const url = interp(String(d.apiUrl ?? "").trim(), ctx.vars);

  const porFallo = () =>
    salidaDe(ctx, node, "other-") ?? salidaDe(ctx, node, "err-") ?? defaultNext(ctx.flow, node);

  if (!url) {
    console.error("[api] el bloque no tiene dirección configurada:", node.id);
    ctx.vars.api_ok = "false";
    ctx.vars.api_status = "0";
    ctx.vars.api_error = "El bloque de API no tiene dirección configurada.";
    return porFallo();
  }

  const metodo = String(d.apiMethod ?? "GET").toUpperCase();
  const cabeceras: Record<string, string> = { "Content-Type": "application/json" };
  for (const h of (d.apiHeaders ?? [])) {
    if (h?.key) cabeceras[String(h.key)] = interp(String(h.value ?? ""), ctx.vars);
  }

  let status = 0;
  let cuerpo = "";
  try {
    const ctl = new AbortController();
    // 15 s y fuera. Detrás hay una persona esperando: dejar la petición abierta
    // «por si acaso» solo alarga su silencio.
    const reloj = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(url, {
      method: metodo,
      headers: cabeceras,
      body: metodo === "GET" || metodo === "HEAD" ? undefined : interp(String(d.apiBody ?? ""), ctx.vars) || undefined,
      signal: ctl.signal,
    });
    clearTimeout(reloj);
    status = res.status;
    cuerpo = await res.text().catch(() => "");
  } catch (e: any) {
    console.error("[api] no contestó:", e?.message ?? e);
    ctx.vars.api_ok = "false";
    ctx.vars.api_status = "0";
    ctx.vars.api_error = e?.name === "AbortError" ? "La API tardó demasiado." : "No se pudo conectar con la API.";
    return porFallo();
  }

  ctx.vars.api_status = String(status);
  ctx.vars.api_ok = status >= 200 && status < 300 ? "true" : "false";

  // Si contestaron con JSON, cada campo pasa a ser una variable del flujo. Solo
  // el primer nivel: anidar con puntos complicaría el editor sin que nadie lo
  // haya pedido.
  try {
    const j = JSON.parse(cuerpo);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      for (const [k, v] of Object.entries(j)) {
        if (v === null || typeof v === "object") continue;
        ctx.vars[`api_${k}`] = String(v);
      }
    }
  } catch { /* no era JSON, no pasa nada */ }

  if (status >= 200 && status < 300) return salidaDe(ctx, node, "ok-") ?? defaultNext(ctx.flow, node);
  return salidaDe(ctx, node, "err-") ?? salidaDe(ctx, node, "other-") ?? defaultNext(ctx.flow, node);
}

/** «Ir a otra conversación»: el flujo vivo de otro bot de la misma cuenta. */
async function flujoDeOtroBotWeb(
  ctx: Ctx,
  node: any,
): Promise<{ id: string; nodes: any[]; edges: any[] } | null> {
  const destino = String(node.data?.targetBotId ?? "").trim();
  if (!destino) return null;

  try {
    const { data: flujos } = await ctx.admin
      .from("flows").select("id, graph, trigger_type, enabled, is_live, priority")
      .eq("bot_id", destino).eq("org_id", ctx.orgId);

    const vivos = (flujos ?? []).filter((f: any) => f.enabled !== false && f.is_live !== false);
    const elegido = vivos.find((f: any) => f.trigger_type === "welcome")
      ?? vivos.find((f: any) => f.trigger_type !== "keyword")
      ?? vivos[0];

    const g = elegido?.graph;
    if (!g?.nodes?.length) return null;
    return { id: elegido.id, nodes: g.nodes, edges: g.edges ?? [] };
  } catch (e) {
    console.error("[redirigir] no pude cargar el bot destino:", e);
    return null;
  }
}

/**
 * «Agendar cita»: ofrecer horarios.
 *
 * ── SE LLAMA A `@/lib/agenda` DIRECTAMENTE, SIN DAR EL RODEO POR HTTP ─────
 * El motor de WhatsApp corre en Deno y tiene que pedirlo por una ruta; este
 * corre en el mismo Node que la agenda. Pasar por HTTP aquí sería añadir una
 * llamada de red, un fallo posible y una autenticación, para llegar a la
 * función que está al lado.
 *
 * El `import` es dinámico a propósito: `agenda.ts` arrastra el cliente de
 * Supabase, y las pruebas del motor cargan este archivo sin `node_modules`.
 * Unas pruebas que necesitan instalar media plataforma para correr son unas
 * pruebas que dejan de correrse.
 *
 * Devuelve "espera" si ofreció horas, "enlace" si mandó el enlace de la agenda,
 * y null si no pudo hacer ninguna de las dos.
 */
async function ofrecerHorariosWeb(ctx: Ctx, node: any): Promise<"espera" | "enlace" | null> {
  const d = node.data ?? {};
  const { horariosLibres } = await import("@/lib/agenda");

  let r: any = null;
  try {
    r = await horariosLibres(ctx.orgId, {
      agendaProveedor: d.agendaProveedor,
      calendarId: d.calendarId,
      calendlyTipo: d.calendlyTipo,
      durationMin: Number(d.durationMin) || 30,
      maxSlots: 6,
    });
  } catch (e: any) {
    console.error("[agenda] no pude leer horarios:", e?.message ?? e);
  }

  const slots = r?.slots ?? [];

  // SI HAY ENLACE, LA CITA SE PUEDE HACER IGUAL. Pasa con los Calendly del plan
  // gratis, que dejan leer los huecos pero no reservar por API. Mandar el
  // enlace es una cita agendada; pasar a una persona por esto es gastar un
  // humano en algo que se resuelve en diez segundos.
  if (!slots.length && r?.enlace) {
    push(ctx, interp(d.textoConEnlace || "Agenda tu cita aquí y elige la hora que mejor te venga 👇", ctx.vars) + "\n" + r.enlace);
    return "enlace";
  }

  if (!slots.length) {
    const porque = r?.conectado === false ? "no hay agenda conectada" : "no hay horarios libres";
    console.error(`[agenda] sin horarios (${porque}) org=${ctx.orgId}`);
    push(ctx, d.textoSinHorarios || "Ahora mismo no puedo ver horarios disponibles 😕 Te paso con una persona del equipo.");
    return null;
  }

  // Los horarios van como botones y el id de cada uno ES la hora en ISO. La
  // etiqueta ya viene escrita en español desde la plataforma («mié 27 ago,
  // 10:00»): formatear fechas aquí sería reimplementar lo que ya se hace bien
  // en un solo sitio, con la zona horaria del negocio.
  push(
    ctx,
    d.text || "Estos son los horarios disponibles para tu cita:",
    slots.slice(0, 3).map((s: any) => ({ id: s.startISO, label: s.label })),
  );
  return "espera";
}

/**
 * Eligió una hora: se crea la cita.
 *
 * Deja las MISMAS variables que el motor de WhatsApp (`cita_dia`, `cita_hora`,
 * `cita_cuando`…). Un flujo escrito para WhatsApp que se reutiliza en la web
 * tiene que decir lo mismo; si aquí se llamaran distinto, el mensaje de
 * confirmación saldría con los huecos en blanco.
 */
async function agendarElegidoWeb(ctx: Ctx, node: any, inicioISO: string): Promise<boolean> {
  const d = node.data ?? {};
  const correo = d.attendeeAttr ? ctx.vars[d.attendeeAttr] : undefined;
  const nombre = d.nameAttr ? ctx.vars[d.nameAttr] : ctx.vars.nombre;

  const { agendar } = await import("@/lib/agenda");
  let r: any = null;
  try {
    r = await agendar(ctx.orgId, {
      inicioISO,
      durationMin: Number(d.durationMin) || 30,
      agendaProveedor: d.agendaProveedor,
      calendarId: d.calendarId,
      calendlyTipo: d.calendlyTipo,
      titulo: d.tituloEvento || `Cita con ${nombre ?? "cliente"}`,
      descripcion: d.descripcionEvento || "Cita agendada desde el chat.",
      correoInvitado: correo || undefined,
    });
  } catch (e: any) {
    console.error("[agenda] no pude agendar:", e?.message ?? e);
  }

  if (r?.ok) {
    ctx.vars.cita_inicio = r.inicioISO ?? inicioISO;
    ctx.vars.cita_enlace = r.enlace ?? "";
    ctx.vars.cita_ok = "true";
    ctx.vars.cita_dia = r.dia ?? "";
    ctx.vars.cita_hora = r.hora ?? "";
    ctx.vars.cita_cuando = r.etiqueta ?? "";
    return true;
  }

  ctx.vars.cita_ok = "false";
  ctx.vars.cita_error = r?.error ?? "No se pudo agendar.";
  // El motivo se le dice tal cual viene: «ese horario acaba de ocuparse» es
  // accionable, «error 502» no lo es.
  push(ctx, r?.error || "No pude agendar esa hora 😕 Intentemos con otra.");
  return false;
}

async function runFrom(startId: string | undefined, ctx: Ctx): Promise<Awaiting> {
  let current = startId;
  let guard = 0;
  while (current && guard++ < 80) {
    const node = getNode(ctx.flow, current);
    if (!node) break;
    // Analítica: cada bloque que se pisa cuenta como un paso del recorrido.
    ctx.pasos++;
    ctx.ultimoNodo = node.id;
    switch (node.type) {
      case "start":
        current = node.data.to ?? defaultNext(ctx.flow, node);
        break;
      case "question":
        push(ctx, node.data.text ?? "");
        return { nodeId: node.id, type: "question" };
      case "buttons":
        push(ctx, node.data.text ?? "", node.data.buttons);
        return { nodeId: node.id, type: "buttons" };
      case "condition":
        current = evalCondition(ctx.flow, node, ctx.vars);
        break;

      // ── LOS CUATRO QUE FALTABAN ───────────────────────────────────────
      // La paleta los ofrece en el widget y en Instagram desde siempre; este
      // motor no los ejecutaba. Ver la nota larga junto a sus ayudantes.

      case "action":
        await dispararAccionWeb(ctx, node);
        current = defaultNext(ctx.flow, node);
        break;

      case "api":
        current = await llamarApiWeb(ctx, node);
        break;

      case "redirect": {
        const otro = await flujoDeOtroBotWeb(ctx, node);
        if (!otro) {
          console.error("[redirigir] no encontré flujo de destino en el bloque", node.id);
          current = defaultNext(ctx.flow, node);
          break;
        }
        // El flujo se cambia EN CALIENTE y se sigue desde su inicio. El id
        // nuevo viaja de vuelta para que el turno siguiente retome donde toca.
        ctx.flow = { ...ctx.flow, nodes: otro.nodes, edges: otro.edges } as any;
        ctx.flowIdNuevo = otro.id;
        current = getStartNode(ctx.flow)?.id;
        break;
      }

      case "calendar": {
        const r = await ofrecerHorariosWeb(ctx, node);
        if (r === "espera") return { nodeId: node.id, type: "cita" };

        // MANDÓ EL ENLACE DE LA AGENDA: la cita se puede hacer y no hay nada
        // roto, así que no se molesta a nadie del equipo. Se detiene aquí
        // porque la salida normal del bloque confirma una cita que todavía no
        // existe; la de verdad entrará sola a la Bandeja por el aviso.
        if (r === "enlace") {
          // «completado», no un motivo nuevo: el bloque hizo su trabajo —la
          // persona tiene con qué agendar—. Inventar un valor que `MotivoFin`
          // no admite habría metido basura en la analítica, y encima con un
          // `as` que le tapa la boca al compilador.
          ctx.finMotivo = "completado";
          return null;
        }

        // ── NO SE PUDO OFRECER NINGUNA HORA ──────────────────────────────
        // NUNCA se sigue por la salida normal: en un flujo real esa salida es
        // el mensaje de «tu cita ha sido agendada». El bot diría «te paso con
        // una persona» y acto seguido confirmaría una cita que no existe, con
        // todos los campos vacíos. Dos mentiras seguidas.
        await ctx.admin.from("conversations").update({
          status: "assigned",
          handoff_requested_at: new Date().toISOString(),
          handoff_reason: "No se pudieron ofrecer horarios de cita",
        }).eq("id", ctx.conversationId);
        ctx.finMotivo = "agente";
        return null;
      }

      // ── LOS TRES DE LA TIENDA ─────────────────────────────────────────
      case "tienda": {
        const t = await tiendaDelBotEnLaBase(ctx);
        const m = mensajeDeTienda(t, node.data.text, node.data.tiendaBoton);
        if (!m) {
          // Tienda apagada o sin vincular: por la otra salida, sin mandar un
          // enlace muerto.
          current = salidaDe(ctx, node, "no-") ?? defaultNext(ctx.flow, node);
          break;
        }
        // En el widget el botón de enlace no existe: va dentro del texto.
        push(ctx, `${m.texto}\n\n${m.enlace}`);
        ctx.vars.tienda_enlace = m.enlace;
        current = salidaDe(ctx, node, "ok-") ?? defaultNext(ctx.flow, node);
        break;
      }

      case "tienda_catalogo": {
        const t = await tiendaDelBotEnLaBase(ctx);
        if (!t) {
          current = salidaDe(ctx, node, "no-") ?? defaultNext(ctx.flow, node);
          break;
        }
        const { data: crudos } = await ctx.admin
          .from("tienda_productos")
          .select("id, nombre, precio, categoria, oculto, stock, orden")
          .eq("tienda_id", t.id).order("orden").order("nombre");
        const productos = productosQueSePuedenOfrecer((crudos ?? []) as ProductoDelBot[]);
        if (!productos.length) {
          current = salidaDe(ctx, node, "no-") ?? defaultNext(ctx.flow, node);
          break;
        }
        const moneda = String((t as any)?.config?.moneda ?? "$");
        // TRES BOTONES Y EL ENLACE. El widget no tiene listas, y una fila de
        // veinte botones no la lee nadie: se enseñan los primeros y para el
        // resto está la tienda, que es donde de verdad se compra.
        const primeros = productos.slice(0, 3).map((p) => ({
          id: `prod-${p.id}`,
          label: `${p.nombre} · ${precioDelBot(p.precio, moneda)}`.slice(0, 40),
        }));
        push(ctx, interp(node.data.text ?? "", ctx.vars) || "Estos son nuestros productos:", primeros);
        push(ctx, `Ver todo el catálogo: ${enlaceDelBot(t)}`);
        return { nodeId: node.id, type: "buttons" };
      }

      case "tienda_pedir": {
        // Empieza sin carrito: `null` es lo que le dice a `conversar` que esta
        // es la primera vuelta y que toca enseñar el catálogo.
        const r = await pedirPorElChatWeb(ctx, node, null, "");
        if (r.espera) return r.espera;
        current = r.siguiente;
        break;
      }

      case "tienda_pedido": {
        const t = await tiendaDelBotEnLaBase(ctx);
        const sinPedidos = () => {
          const txt = String(node.data.sinPedidosMensaje ?? "").trim();
          if (txt) push(ctx, txt);
          return salidaDe(ctx, node, "no-") ?? defaultNext(ctx.flow, node);
        };
        if (!t) { current = sinPedidos(); break; }

        // En el widget no hay teléfono: se busca por la conversación, que es
        // lo único que identifica a quien está escribiendo.
        const { data: conv } = await ctx.admin
          .from("conversations").select("contact_id").eq("id", ctx.conversationId).maybeSingle();
        if (!conv?.contact_id) { current = sinPedidos(); break; }

        const { data: pedidos } = await ctx.admin
          .from("pedidos").select("numero, estado, pago, total, created_at")
          .eq("tienda_id", t.id).eq("contacto_id", conv.contact_id)
          .order("created_at", { ascending: false }).limit(10);

        const p = pedidoDelQueHablar((pedidos ?? []) as PedidoDelBot[]);
        if (!p) { current = sinPedidos(); break; }

        push(ctx, comoVaElPedido(p, String((t as any)?.config?.moneda ?? "$")));
        ctx.vars.pedido_numero = String(p.numero);
        ctx.vars.pedido_estado = String(p.estado);
        current = salidaDe(ctx, node, "ok-") ?? defaultNext(ctx.flow, node);
        break;
      }
      case "tags": {
        // EL BLOQUE «Segmenta el contacto» NO HACÍA NADA en el canal web:
        // no tenía caso, así que caía en el `default` y seguía de largo. Un
        // cliente que armaba su flujo con etiquetas veía cómo funcionaba en
        // WhatsApp y no en su web, sin ningún error que lo explicara.
        //
        // Poner pasa por la base, que es quien conoce los grupos; quitar se
        // hace aquí. Mismo criterio que el motor de WhatsApp.
        await aplicarEtiquetas(ctx, node);
        current = defaultNext(ctx.flow, node);
        break;
      }
      case "delay":
        current = defaultNext(ctx.flow, node);
        break;
      case "human":
      case "assign":
        push(ctx, node.data.text ?? "Te comunico con un asesor, un momento 🙌");
        // `handoff_requested_at` no es decorativo: de él dependen el filtro
        // "Solicitudes" de la Bandeja, el aviso en pantalla y el reparto
        // automático. Sin él, el flujo decía "te comunico con un asesor" y
        // NADIE se enteraba — la conversación se quedaba esperando en silencio.
        await ctx.admin
          .from("conversations")
          .update({
            status: "assigned",
            handoff_requested_at: new Date().toISOString(),
            handoff_reason: "El flujo lo mandó con una persona",
          })
          .eq("id", ctx.conversationId);
        ctx.finMotivo = "agente";
        return null;
      case "end":
        if (node.data.text) push(ctx, node.data.text);
        await ctx.admin.from("conversations").update({ status: "closed" }).eq("id", ctx.conversationId);
        ctx.finMotivo = "completado";
        return null;
      case "media":
        if (node.data.mediaUrl) push(ctx, node.data.mediaUrl);
        if (node.data.caption) push(ctx, node.data.caption);
        current = defaultNext(ctx.flow, node);
        break;
      case "ai": {
        // Responde con IA usando la info del negocio (Bot Training).
        // Si no hay pregunta todavía, muestra el texto del nodo y espera.
        if (!ctx.lastUserText) {
          if (node.data.text) push(ctx, node.data.text);
          return { nodeId: node.id, type: "question" };
        }
        const settings: AiSettings = {
          ...(ctx.aiSettings ?? {}),
          ...(node.data.systemPrompt ? { persona: node.data.systemPrompt } : {}),
        };
        // El contexto del agente. Con él, la IA no solo habla: puede mirar la
        // agenda, agendar, etiquetar, guardar datos y pasar con una persona.
        // `armarHerramientas` no arma nada si el cliente no activó ninguna, así
        // que un bot normal se comporta igual que siempre.
        const agente = {
          admin: ctx.admin,
          orgId: ctx.orgId,
          botId: ctx.botId,
          conversationId: ctx.conversationId,
          vars: ctx.vars,
          pasoAHumano: false,
        };
        const answer = await aiAnswer({
          admin: ctx.admin,
          botId: ctx.botId,
          orgId: ctx.orgId,
          question: ctx.lastUserText,
          settings,
          history: await recentHistory(ctx),
          agente,
        });
        push(ctx, answer);

        // El agente pasó la conversación a una persona. El flujo se detiene:
        // seguir escuchando sería que el bot volviera a contestar después de
        // haber dicho que ya le atiende alguien del equipo.
        if (agente.pasoAHumano) {
          ctx.finMotivo = "agente";
          return null;
        }

        // El nodo de IA se queda escuchando: la siguiente pregunta vuelve aquí.
        return { nodeId: node.id, type: "question" };
      }
      default:
        if (node.data.text) push(ctx, node.data.text);
        current = defaultNext(ctx.flow, node);
    }
  }
  return null;
}

/**
 * Los flujos que de verdad pueden atender, en un orden SIEMPRE el mismo.
 *
 * DOS COSAS QUE COSTARON UN BOT MUDO EN PRODUCCIÓN (31 ago):
 *
 * 1. UN FLUJO VACÍO SE TRAGABA EL MENSAJE. Había dos flujos con la palabra
 *    clave «AI»: uno con bloques y otro sin ninguno, creado sin querer un rato
 *    antes. El motor se quedaba con el primero que coincidiera; si le tocaba el
 *    vacío, no había nada que ejecutar y el bot no contestaba nada. Un flujo
 *    sin bloques no puede atender a nadie: no debe ni competir.
 *
 * 2. NO HABÍA ORDEN. La base devuelve las filas en el orden que le apetece, así
 *    que con dos flujos empatados el bot funcionaba unas veces sí y otras no —
 *    la peor clase de fallo, porque quien lo reporta parece que se lo inventa.
 *    Ahora manda la prioridad y, en empate, el más recientemente editado: si
 *    alguien duplica un disparador, gana el que acaba de tocar.
 *
 * El mismo criterio, palabra por palabra, está en el motor de WhatsApp. Hay una
 * prueba estática que falla si los dos dejan de coincidir.
 */
export function flujosQuePuedenAtender(flows: any[]): any[] {
  return (flows ?? [])
    .filter((f: any) => (f?.graph?.nodes?.length ?? 0) > 0)
    .sort(
      (a: any, b: any) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
    );
}

/** Elige el flujo por disparador (misma prioridad que WhatsApp). */
export function chooseWebFlow(entrantes: any[], text: string, isReturning: boolean, state: any) {
  const flows = flujosQuePuedenAtender(entrantes);
  const t = (text || "").toLowerCase();
  for (const f of flows) {
    if (
      f.trigger_type === "keyword" &&
      Array.isArray(f.keywords) &&
      f.keywords.some((k: string) => k && t.includes(String(k).toLowerCase()))
    ) return f;
  }
  if (state?.awaiting && state?.flow_id) {
    const cur = flows.find((f: any) => f.id === state.flow_id);
    if (cur) return cur;
  }
  if (isReturning) {
    const r = flows.find((f: any) => f.trigger_type === "returning");
    if (r) return r;
  }
  return (
    flows.find((f: any) => f.trigger_type === "welcome") ??
    flows.find((f: any) => f.trigger_type !== "keyword") ??
    flows[0] ??
    null
  );
}

/**
 * Guarda en la Bandeja lo que contestó el bot.
 *
 * OJO: `payload` es NOT NULL con default '{}' — nunca mandar null aquí,
 * porque invalida el insert completo y el bot "contesta" sin quedar registrado.
 *
 * NO TODOS LOS CANALES QUIEREN ESTO. El widget de la web SÍ: no hay nada que
 * «enviar», el visitante ve lo que haya en `messages`. Instagram y WhatsApp NO:
 * ellos mandan el mensaje por la API de Meta y lo guardan ELLOS, porque solo
 * ellos saben si la entrega falló y con qué motivo — y eso hay que apuntarlo.
 *
 * Guardar en los dos sitios dejaba cada respuesta del bot DUPLICADA en la
 * Bandeja de Instagram: al cliente le llegaba una sola vez, pero el equipo veía
 * dos, y con la conversación llena parece que el bot se volvió loco. Se
 * descubrió mirando los renglones de la base, no la pantalla.
 */
async function guardarSalida(
  ctx: Ctx,
  opts: { admin: any; conversationId: string; orgId: string; guardarEnBandeja?: boolean },
) {
  if (opts.guardarEnBandeja === false) return;
  if (!ctx.out.length) return;
  const { error } = await opts.admin.from("messages").insert(
    ctx.out.map((m) => ({
      conversation_id: opts.conversationId,
      org_id: opts.orgId,
      direction: "outbound",
      sender: "bot",
      body: m.text,
      payload: m.buttons ? { buttons: m.buttons } : {},
    })),
  );
  if (error) console.error("[webchat] no se guardaron los mensajes del bot:", error.message);
}

export async function runWebFlow(opts: {
  flow: Flow;
  orgId: string;
  conversationId: string;
  admin: any;
  flowState: any;
  text: string;
  isStart?: boolean;
  botId: string;
  aiSettings?: AiSettings | null;
  /** Atajos configurados en el chatbot (0 = reiniciar, 1 = persona, etc.) */
  atajos?: any;
  /** Que la IA conteste cuando el cliente se sale del flujo. */
  iaDeRespaldo?: boolean;
  /**
   * En el turno anterior el bot ofreció pasar con una persona (porque la IA no
   * supo). Si ahora el cliente dice que sí, se hace el pase.
   */
  ofreciAgente?: boolean;
  /** Analítica: nombre del flujo, para que el histórico no quede anónimo. */
  flowName?: string | null;
  /**
   * ¿Guarda el motor las respuestas en la Bandeja? Por defecto SÍ, que es lo
   * que necesita el widget de la web: allí no hay nada que enviar y el
   * visitante lee lo que haya en `messages`.
   *
   * Los canales de Meta pasan `false` y las guardan ellos, porque solo ellos
   * saben si Meta aceptó la entrega — y un mensaje que no llegó tiene que
   * quedar MARCADO, no como uno normal. Si los dos guardan, el equipo ve cada
   * respuesta del bot dos veces.
   */
  guardarEnBandeja?: boolean;
}): Promise<{
  vars: Record<string, string>;
  awaiting: Awaiting;
  out: OutMsg[];
  hintEnviado?: boolean;
  /** Recorrido abierto (null si terminó). Se guarda en flow_state. */
  runId?: string | null;
  /**
   * El flujo llegó al final y ya no espera nada. Se guarda para que el
   * siguiente mensaje NO reinicie el flujo desde el saludo: sin esto el bot
   * repite el mismo mensaje una y otra vez.
   */
  terminado?: boolean;
  /**
   * El bloque «Ir a otra conversación» saltó al flujo de otro bot.
   *
   * NULO SI NADIE REDIRIGIÓ, para que quien llama pueda escribir
   * `flowIdNuevo ?? el de siempre`. Devolver aquí el flujo actual haría que un
   * salto y un turno normal se vieran igual desde fuera — y guardar el id
   * viejo deja el estado apuntando a un nodo que en el flujo nuevo no existe:
   * la conversación se queda muda al turno siguiente.
   */
  flowIdNuevo?: string | null;
}> {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}) };
  const ctx: Ctx = {
    flow: opts.flow,
    orgId: opts.orgId,
    conversationId: opts.conversationId,
    admin: opts.admin,
    vars,
    out: [],
    botId: opts.botId,
    aiSettings: opts.aiSettings ?? null,
    lastUserText: opts.isStart ? "" : (opts.text ?? ""),
    pasos: 0,
    ultimoNodo: null,
    finMotivo: null,
    flowIdNuevo: null,
  };

  // Analítica: el recorrido que venía abierto de turnos anteriores.
  let runId: string | null = (opts.flowState?.run_id as string) ?? null;
  const abrirNuevo = () =>
    abrirRecorrido(opts.admin, {
      orgId: opts.orgId,
      conversationId: opts.conversationId,
      botId: opts.botId,
      flowId: opts.flow.id ?? null,
      flowName: opts.flowName ?? null,
      channel: "webchat",
    });

  const atajos: Atajos = leerAtajos(opts.atajos);

  // ── Atajos: mandan sobre cualquier otra cosa del flujo ──────────────────────
  // No cortamos aquí: seguimos hasta el bloque que guarda los mensajes en la
  // Bandeja, para que la respuesta del atajo también quede registrada.
  const atajoDetectado = opts.isStart ? null : detectarAtajo(opts.text ?? "", atajos);

  // El turno anterior el bot dijo "no sé, ¿te paso con una persona?" y ahora
  // contesta que sí. Sin esto, la oferta era humo: el cliente aceptaba y no
  // pasaba nada. "sí" no puede ser un atajo global — secuestraría cualquier
  // pregunta de sí/no del flujo — así que solo cuenta en este turno.
  const aceptoLaOferta =
    !opts.isStart && !!opts.ofreciAgente && !atajoDetectado && esAfirmacion(opts.text ?? "");

  const atajo: "agent" | "reset" | null = aceptoLaOferta ? "agent" : atajoDetectado;

  if (atajo === "agent") {
    push(ctx, atajos.agent.reply);
    await opts.admin
      .from("conversations")
      .update({
        status: "assigned",
        handoff_requested_at: new Date().toISOString(),
        handoff_reason: aceptoLaOferta
          ? "La IA no supo y el lead aceptó pasar con una persona"
          : "El lead pidió hablar con una persona",
        // Ya NO se fuerza `unread: 1`. Lo lleva el disparador de la base al
        // insertar cada mensaje; ponerlo aquí BAJABA el contador cuando había
        // varios mensajes sin leer, y el aviso se perdía.
      })
      .eq("id", opts.conversationId);
    // Analítica: el recorrido termina aquí, se lo lleva una persona.
    await cerrarRecorrido(opts.admin, runId, "agente");
    runId = null;
  } else if (atajo === "reset") {
    push(ctx, atajos.reset.reply);
    // Analítica: se cierra el recorrido anterior y empieza uno nuevo, para no
    // contar como "un recorrido larguísimo" lo que en realidad fueron dos.
    await cerrarRecorrido(opts.admin, runId, "reiniciado");
    runId = null;
  }

  const awaiting = opts.flowState?.awaiting as Awaiting;
  const nodoEsperado = awaiting?.nodeId ? getNode(opts.flow, awaiting.nodeId) : null;
  const yaTermino = !!opts.flowState?.terminado;

  // ── ¿El cliente se salió del flujo? ─────────────────────────────────────────
  // La gente no habla en guiones. Si escribió algo que el flujo no esperaba,
  // contesta la IA y el flujo NO se mueve: se queda esperando donde estaba,
  // así que en cuanto responda lo que se le pidió, sigue como si nada.
  const textoBoton = (opts.text ?? "").toLowerCase();
  const botonQueCoincide =
    awaiting?.type === "buttons"
      ? (nodoEsperado?.data.buttons ?? []).find(
          (b) => b.id === opts.text || (b.label ?? "").toLowerCase() === textoBoton,
        )
      : undefined;

  const desvio: MotivoDesvio =
    atajo
      ? null
      : decidirDesvio({
          esperando: awaiting,
          capturaDato: !!nodoEsperado?.data.variable && nodoEsperado?.type !== "ai",
          coincidioBoton: !!botonQueCoincide,
          tieneSalidaPorDefecto:
            awaiting?.type === "buttons" && !!nodoEsperado
              ? !!defaultNext(opts.flow, nodoEsperado)
              : false,
          flujoTerminado: yaTermino,
          esInicio: !!opts.isStart,
          texto: opts.text ?? "",
          iaDeRespaldo: opts.iaDeRespaldo !== false,
        });

  if (desvio) {
    const respuesta = await responderDuda(ctx);
    if (respuesta) {
      push(ctx, respuesta);
      const puente = puenteDeVuelta(desvio);
      if (puente) push(ctx, puente);
      // Se vuelve a mostrar lo que el flujo estaba pidiendo, para no dejar a
      // la persona sin saber cómo seguir.
      if (nodoEsperado && awaiting?.type === "buttons") {
        push(ctx, nodoEsperado.data.text ?? "", nodoEsperado.data.buttons);
      } else if (nodoEsperado && awaiting?.type === "question") {
        push(ctx, nodoEsperado.data.text ?? "");
      }
      await guardarSalida(ctx, opts);
      await avanzarRecorrido(opts.admin, runId, 1, nodoEsperado?.id ?? null);
      return {
        vars,
        awaiting,                       // el flujo NO se mueve
        out: ctx.out,
        hintEnviado: !!opts.flowState?.hintEnviado,
        runId,
        terminado: yaTermino,
      };
    }
    // La IA no supo. Si el flujo ya había terminado, mejor callar que repetir
    // el saludo; si estaba esperando algo, cae al comportamiento de siempre.
    if (desvio === "flujo_terminado") {
      const respaldo = (ctx.aiSettings?.fallback ?? "").trim();
      if (respaldo) push(ctx, respaldo);
      await guardarSalida(ctx, opts);
      return {
        vars, awaiting: null, out: ctx.out,
        hintEnviado: !!opts.flowState?.hintEnviado, runId, terminado: true,
        flowIdNuevo: ctx.flowIdNuevo,
      };
    }
  }

  let startId: string | undefined;

  if (atajo === "agent") {
    // El bot deja de conducir: ahora contesta una persona.
    startId = undefined;
  } else if (atajo === "reset") {
    startId = getStartNode(opts.flow)?.id;
  } else if (!opts.isStart && awaiting?.nodeId) {
    const node = nodoEsperado;
    if (awaiting.type === "question") {
      // Un nodo de IA se queda escuchando: cada pregunta vuelve a entrar en él.
      if (node?.type === "ai") {
        startId = node.id;
      } else {
        if (node?.data.variable) vars[node.data.variable] = opts.text;
        startId = node ? defaultNext(opts.flow, node) : undefined;
      }
    } else if (awaiting.type === "cita") {
      // ── ELIGIÓ UNA HORA ─────────────────────────────────────────────────
      // El id del botón ES la hora en ISO, así que no hay que guardar la lista
      // de horarios en ninguna parte ni preocuparse de que caduque. Si escribió
      // en vez de tocar el botón, `opts.text` no es una fecha y `agendar` lo
      // rechaza — que es lo correcto: no se inventa una hora.
      const cuando = botonQueCoincide?.id ?? opts.text;
      const ok = node ? await agendarElegidoWeb(ctx, node, cuando) : false;

      // SOLO SE SIGUE AL MENSAJE DE «cita agendada» SI LA CITA SE CREÓ DE
      // VERDAD. Ver el comentario del bloque `calendar`.
      if (!ok) {
        // Se vuelven a ofrecer horarios en vez de seguir adelante como si la
        // cita existiera.
        if (node) await ofrecerHorariosWeb(ctx, node);
        await guardarSalida(ctx, opts);
        await avanzarRecorrido(opts.admin, runId, 1, node?.id ?? null);
        return {
          vars,
          awaiting: node ? { nodeId: node.id, type: "cita" as const } : null,
          out: ctx.out,
          hintEnviado: !!opts.flowState?.hintEnviado,
          runId,
          flowIdNuevo: ctx.flowIdNuevo,
        };
      }
      startId = node ? defaultNext(opts.flow, node) : undefined;
    } else if (awaiting.type === "tienda_pedir") {
      // ── OTRA VUELTA DEL PEDIDO ─────────────────────────────────────────
      // El carrito viene DENTRO de `awaiting` y se devuelve tal cual: este
      // runtime no lo lee ni lo toca, igual que el motor de WhatsApp.
      //
      // SE MANDA EL ID DEL BOTÓN SI TOCÓ UNO, y si no, lo que escribió:
      // `conversar` entiende las dos cosas, así que quien escribe «una pizza»
      // en vez de tocar la lista sigue pudiendo pedir.
      if (node) {
        const dicho = botonQueCoincide?.id ?? opts.text;
        const r = await pedirPorElChatWeb(ctx, node, awaiting.carrito ?? null, dicho);
        if (r.espera) {
          await guardarSalida(ctx, opts);
          await avanzarRecorrido(opts.admin, runId, 1, node.id);
          return {
            vars,
            awaiting: r.espera,
            out: ctx.out,
            hintEnviado: !!opts.flowState?.hintEnviado,
            runId,
            flowIdNuevo: ctx.flowIdNuevo,
          };
        }
        startId = r.siguiente;
      }
    } else if (awaiting.type === "buttons") {
      const btn = botonQueCoincide;
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : node ? defaultNext(opts.flow, node) : undefined;

      // Escribió algo que no era ninguna opción y el bloque no tiene salida
      // por defecto: antes el bot se quedaba MUDO y el lead quedaba atorado.
      // (Con la IA de respaldo encendida esto casi no se alcanza.)
      if (!btn && !startId && node) {
        push(ctx, "No entendí esa respuesta 🤔 Elige una de las opciones:");
        push(ctx, node.data.text ?? "", node.data.buttons);
        await guardarSalida(ctx, opts);
        // El recorrido sigue vivo: el lead está atorado en el mismo bloque.
        await avanzarRecorrido(opts.admin, runId, 1, node.id);
        return {
          vars,
          awaiting: { nodeId: node.id, type: "buttons" },
          out: ctx.out,
          hintEnviado: !!opts.flowState?.hintEnviado,
          runId,
          flowIdNuevo: ctx.flowIdNuevo,
        };
      }
    }
  } else if (!opts.isStart && yaTermino && opts.iaDeRespaldo !== false) {
    // El flujo terminó, la IA no supo contestar y no hay nada que esperar:
    // reiniciarlo repetiría el saludo. Mejor no hacer nada.
    startId = undefined;
  } else {
    startId = getStartNode(opts.flow)?.id;
  }

  // Analítica: si vamos a recorrer bloques y no hay recorrido abierto, se abre
  // uno. Cubre tanto el arranque normal como las conversaciones que ya venían
  // a medias desde antes de que existiera esta medición.
  if (startId && !runId) runId = await abrirNuevo();

  const nextAwait = atajo === "agent" ? null : await runFrom(startId, ctx);

  // Recordatorio de los atajos: una sola vez por conversación.
  let hintEnviado = !!opts.flowState?.hintEnviado;
  if (!hintEnviado && ctx.out.length && atajos.hint.enabled && atajos.hint.onStart && atajos.hint.text && atajo !== "agent") {
    push(ctx, atajos.hint.text);
    hintEnviado = true;
  }

  await guardarSalida(ctx, opts);

  // Analítica: si el bot ya no espera nada, el recorrido terminó.
  // Sin bloque "Cerrar el flujo" pero habiendo llegado al final del gráfico
  // también cuenta como completado: el lead sí recorrió el flujo entero.
  if (runId && nextAwait === null && atajo !== "agent") {
    await cerrarRecorrido(opts.admin, runId, ctx.finMotivo ?? "completado", ctx.pasos, ctx.ultimoNodo);
    runId = null;
  } else if (runId) {
    await avanzarRecorrido(opts.admin, runId, ctx.pasos, ctx.ultimoNodo);
  }

  return {
    vars, awaiting: nextAwait, out: ctx.out, hintEnviado, runId,
    terminado: nextAwait === null,
    // NULO SI NADIE REDIRIGIÓ. Quien llama guarda `flowIdNuevo ?? el de
    // siempre`: si aquí se devolviera el flujo actual, un `redirect` y un turno
    // normal se verían igual desde fuera.
    flowIdNuevo: ctx.flowIdNuevo,
  };
}
