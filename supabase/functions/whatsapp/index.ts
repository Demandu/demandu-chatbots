import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "demandu_wa_2026";
const GRAPH = "https://graph.facebook.com/v20.0";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---- helpers de flujo ----
function getNode(flow: any, id: string) { return flow.nodes.find((n: any) => n.id === id); }
function getStartNode(flow: any) {
  return flow.nodes.find((n: any) => n.data?.isStart) ?? flow.nodes.find((n: any) => n.type === "start") ?? flow.nodes[0];
}
function defaultNext(flow: any, node: any) {
  const e = flow.edges.find((e: any) => e.source === node.id && !e.sourceHandle);
  return e?.target ?? node.data?.to;
}
function buttonTarget(flow: any, nodeId: string, button: any) {
  const e = flow.edges.find((e: any) => e.source === nodeId && e.sourceHandle === button.id);
  return e?.target ?? button.to;
}
function interp(t: string, vars: Record<string, string>) {
  const out = (t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_: string, k: string) => vars[k] ?? "");
  // Si una variable vino vacía, no dejamos "Hola, !" ni dobles espacios.
  return out
    .replace(/([,;:])\s*([!?.…])/g, "$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}

/**
 * Textos de ejemplo que el constructor pone al soltar un bloque nuevo
 * (la descripción del componente). NUNCA deben enviarse al cliente:
 * si un bloque todavía tiene su descripción, es que no se ha configurado.
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

/** País (ISO-2) a partir del teléfono internacional, para mostrar la bandera del lead. */
const PREFIJOS_PAIS: Record<string, string> = {
  "1787": "PR", "1939": "PR", "1809": "DO", "1829": "DO", "1849": "DO",
  "1876": "JM", "1868": "TT", "1345": "KY", "1242": "BS", "1": "US",
  "52": "MX", "54": "AR", "55": "BR", "56": "CL", "57": "CO", "58": "VE",
  "51": "PE", "593": "EC", "591": "BO", "595": "PY", "598": "UY", "597": "SR",
  "592": "GY", "594": "GF", "502": "GT", "503": "SV", "504": "HN", "505": "NI",
  "506": "CR", "507": "PA", "501": "BZ", "509": "HT", "53": "CU",
  "34": "ES", "351": "PT", "33": "FR", "39": "IT", "49": "DE", "44": "GB",
  "31": "NL", "32": "BE", "41": "CH", "43": "AT", "46": "SE", "47": "NO",
  "45": "DK", "358": "FI", "353": "IE", "48": "PL", "30": "GR", "40": "RO",
  "420": "CZ", "36": "HU", "380": "UA", "7": "RU", "90": "TR",
  "212": "MA", "20": "EG", "27": "ZA", "234": "NG", "254": "KE",
  "91": "IN", "86": "CN", "81": "JP", "82": "KR", "62": "ID", "63": "PH",
  "60": "MY", "65": "SG", "66": "TH", "84": "VN", "61": "AU", "64": "NZ",
  "972": "IL", "971": "AE", "966": "SA", "974": "QA", "965": "KW",
};
const PREFIJOS_ORDEN = Object.keys(PREFIJOS_PAIS).sort((a, b) => b.length - a.length);
function paisDesdeTelefono(phone?: string | null): string | null {
  const n = String(phone ?? "").replace(/\D/g, "");
  if (!n) return null;
  for (const p of PREFIJOS_ORDEN) if (n.startsWith(p)) return PREFIJOS_PAIS[p];
  return null;
}

// ---- envío a WhatsApp ----
async function waPost(pnid: string, token: string, payload: any) {
  const res = await fetch(`${GRAPH}/${pnid}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) console.error("wa send", res.status, await res.text());
}
function sendText(pnid: string, token: string, to: string, body: string) {
  return waPost(pnid, token, { to, type: "text", text: { body: body.slice(0, 4096) } });
}
function sendButtons(pnid: string, token: string, to: string, body: string, buttons: any[]) {
  const opts = buttons.slice(0, 10);
  if (opts.length <= 3) {
    return waPost(pnid, token, { to, type: "interactive", interactive: { type: "button", body: { text: (body || "Elige una opción").slice(0, 1024) }, action: { buttons: opts.map((b) => ({ type: "reply", reply: { id: b.id, title: (b.label || "Opción").slice(0, 20) } })) } } });
  }
  return waPost(pnid, token, { to, type: "interactive", interactive: { type: "list", body: { text: (body || "Elige una opción").slice(0, 1024) }, action: { button: "Ver opciones", sections: [{ title: "Opciones", rows: opts.map((b) => ({ id: b.id, title: (b.label || "Opción").slice(0, 24) })) }] } } });
}

/** Envía imagen, video o archivo con su texto (caption). */
function sendMedia(
  pnid: string, token: string, to: string,
  kind: "image" | "video" | "file", link: string, caption?: string, filename?: string,
) {
  const cap = (caption ?? "").slice(0, 1024);
  if (kind === "video") {
    return waPost(pnid, token, { to, type: "video", video: { link, ...(cap ? { caption: cap } : {}) } });
  }
  if (kind === "file") {
    return waPost(pnid, token, {
      to, type: "document",
      document: { link, ...(cap ? { caption: cap } : {}), ...(filename ? { filename } : {}) },
    });
  }
  return waPost(pnid, token, { to, type: "image", image: { link, ...(cap ? { caption: cap } : {}) } });
}

// ---- IA (mismo comportamiento que en el canal web) ----
const AI_DEFAULTS = {
  persona: "Eres Lana, la asistente virtual del negocio. Ayudas a los clientes con amabilidad y vas al grano.",
  style: "Cercano y profesional. Tutea al cliente.",
  fallback: "Esa no me la sé todavía 🙈 ¿Quieres que te comunique con una persona del equipo?",
  maxWords: 80,
};

/** Fragmentos de conocimiento del NEGOCIO — siempre acotados a org + chatbot. */
async function buscarConocimiento(db: any, orgId: string, botId: string, pregunta: string, limit = 5) {
  const q = (pregunta ?? "").trim();
  // AISLAMIENTO: sin organización Y chatbot no se busca nada. Nunca.
  if (!q || !orgId || !botId) return [];

  // 1) Por significado (embeddings)
  try {
    const key = Deno.env.get("VOYAGE_API_KEY");
    if (key) {
      const r = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("VOYAGE_MODEL") ?? "voyage-3", input: [q], input_type: "query" }),
      });
      if (r.ok) {
        const j = await r.json();
        const vector = j?.data?.[0]?.embedding;
        if (vector) {
          const { data, error } = await db.rpc("match_bot_knowledge", {
            p_org_id: orgId, p_bot_id: botId, p_embedding: vector, p_limit: limit,
          });
          if (!error && data?.length) return data.map((d: any) => ({ title: d.title, content: d.content }));
        }
      }
    }
  } catch { /* seguimos a palabras clave */ }

  // 2) Por palabras clave (español)
  try {
    const { data, error } = await db.from("bot_knowledge")
      .select("title, content").eq("org_id", orgId).eq("bot_id", botId).eq("enabled", true)
      .textSearch("search", q, { type: "websearch", config: "spanish" }).limit(limit);
    if (!error && data?.length) return data;
  } catch { /* seguimos al respaldo */ }

  // 3) Respaldo: los primeros fragmentos, para que haya algo de contexto
  try {
    const { data } = await db.from("bot_knowledge")
      .select("title, content").eq("org_id", orgId).eq("bot_id", botId).eq("enabled", true)
      .order("created_at", { ascending: true }).limit(limit);
    return data ?? [];
  } catch { return []; }
}

/** Responde con IA. Nunca revienta la conversación: ante cualquier fallo, respaldo. */
async function responderConIA(ctx: any, pregunta: string, promptDelNodo?: string) {
  const ai = { ...AI_DEFAULTS, ...(ctx.aiSettings ?? {}) };
  if (promptDelNodo) ai.persona = promptDelNodo;

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return ai.fallback;

  const kbRows = await buscarConocimiento(ctx.db, ctx.orgId, ctx.botId, pregunta);
  const kb = kbRows.length
    ? kbRows.map((k: any, i: number) => `[${i + 1}] ${k.title}\n${k.content}`).join("\n\n")
    : "(todavía no hay información cargada del negocio)";

  const system = [
    ai.persona,
    `Tono: ${ai.style}`,
    "",
    "INFORMACIÓN DEL NEGOCIO (úsala como única fuente de verdad):",
    kb,
    "",
    "REGLAS:",
    `- Responde en máximo ${ai.maxWords} palabras. Sé breve, es un chat.`,
    "- Usa SOLO la información del negocio de arriba. No inventes precios, horarios, direcciones ni políticas.",
    `- Si la respuesta no está en esa información, responde exactamente: "${ai.fallback}"`,
    "- Responde en el mismo idioma en que te escriba el cliente.",
    "- No menciones que existe una 'información del negocio' ni cites los números entre corchetes.",
  ].join("\n");

  // Últimos mensajes, para que la IA tenga hilo
  let history: any[] = [];
  try {
    const { data } = await ctx.db.from("messages")
      .select("direction, body").eq("conversation_id", ctx.convId)
      .order("created_at", { ascending: false }).limit(6);
    history = (data ?? []).reverse()
      .filter((m: any) => m.body)
      .map((m: any) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.body }));
  } catch { /* sin historial */ }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-haiku-latest",
        max_tokens: 400,
        system,
        messages: [...history, { role: "user", content: pregunta }],
      }),
    });
    if (!res.ok) {
      console.error("[ai]", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return ai.fallback;
    }
    const j = await res.json();
    const text = (j?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n").trim();
    if (text) {
      // Registra el consumo para el panel y la facturación (best-effort).
      try {
        await ctx.db.from("usage_events").insert({ org_id: ctx.orgId, bot_id: ctx.botId, kind: "ai_message", quantity: 1 });
      } catch { /* no bloquea la respuesta */ }
    }
    return text || ai.fallback;
  } catch (e) {
    console.error("[ai] red:", e);
    return ai.fallback;
  }
}

// ---- motor ----
function evalRule(rule: any, vars: Record<string, string>) {
  const raw = rule.attribute ? (vars[rule.attribute] ?? "") : "";
  const a = String(raw).toLowerCase();
  const b = String(rule.value ?? "").toLowerCase();
  switch (rule.operator) {
    case "equals": return a === b;
    case "not_equals": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    case "greater_than": return parseFloat(raw) > parseFloat(rule.value);
    case "less_than": return parseFloat(raw) < parseFloat(rule.value);
    case "is_empty": return !raw;
    case "is_not_empty": return !!raw;
    default: return false;
  }
}
function evalCondition(flow: any, node: any, vars: Record<string, string>) {
  for (const br of node.data.conditions ?? []) {
    const results = (br.rules ?? []).map((r: any) => evalRule(r, vars));
    const ok = br.match === "any" ? results.some(Boolean) : results.every(Boolean);
    if (ok) { const e = flow.edges.find((e: any) => e.source === node.id && e.sourceHandle === br.id); if (e) return e.target; }
  }
  const other = flow.edges.find((e: any) => e.source === node.id && e.sourceHandle === "otherwise");
  return other?.target;
}

async function say(ctx: any, body: string) {
  if (esEjemplo(body)) return; // bloque sin configurar: no molestamos al cliente
  const text = interp(body, ctx.vars);
  if (!text) return;
  await sendText(ctx.pnid, ctx.token, ctx.to, text);
  await ctx.db.from("messages").insert({ conversation_id: ctx.convId, org_id: ctx.orgId, direction: "outbound", sender: "bot", body: text });
}
async function sayButtons(ctx: any, body: string, node: any) {
  const text = interp(body, ctx.vars);
  const buttons = node.data.buttons ?? [];
  await sendButtons(ctx.pnid, ctx.token, ctx.to, text || "Elige una opción", buttons);
  await ctx.db.from("messages").insert({ conversation_id: ctx.convId, org_id: ctx.orgId, direction: "outbound", sender: "bot", body: text || "(opciones)", payload: { buttons: buttons.map((b: any) => ({ id: b.id, label: b.label })) } });
}

async function runFrom(startId: string | undefined, ctx: any) {
  let current = startId; let guard = 0;
  while (current && guard++ < 80) {
    const node = getNode(ctx.flow, current);
    if (!node) break;
    switch (node.type) {
      case "start": current = node.data.to ?? defaultNext(ctx.flow, node); break;
      case "question": await say(ctx, node.data.text ?? ""); return { nodeId: node.id, type: "question" };
      case "buttons": await sayButtons(ctx, node.data.text ?? "", node); return { nodeId: node.id, type: "buttons" };
      case "condition": current = evalCondition(ctx.flow, node, ctx.vars); break;
      case "delay": current = defaultNext(ctx.flow, node); break;

      // Multimedia: manda la imagen/video/archivo de verdad, con su texto.
      case "media": {
        const kind = (node.data.mediaType ?? "image") as "image" | "video" | "file";
        const caption = interp(node.data.caption ?? "", ctx.vars);
        if (node.data.mediaUrl) {
          await sendMedia(ctx.pnid, ctx.token, ctx.to, kind, node.data.mediaUrl, caption, node.data.mediaName);
          await ctx.db.from("messages").insert({
            conversation_id: ctx.convId, org_id: ctx.orgId, direction: "outbound", sender: "bot",
            body: caption || `(${kind === "video" ? "video" : kind === "file" ? "archivo" : "imagen"})`,
            payload: { media: { type: kind, url: node.data.mediaUrl, name: node.data.mediaName ?? null } },
          });
        } else if (caption) {
          // Sin archivo cargado todavía: al menos mandamos el texto, no un ejemplo.
          await say(ctx, node.data.caption ?? "");
        }
        current = defaultNext(ctx.flow, node);
        break;
      }

      // IA · Lana: responde con la información del negocio y se queda escuchando.
      case "ai": {
        if (!ctx.lastUserText) {
          await say(ctx, node.data.text ?? "");
          return { nodeId: node.id, type: "question" };
        }
        const respuesta = await responderConIA(ctx, ctx.lastUserText, node.data.systemPrompt);
        await say(ctx, respuesta);
        return { nodeId: node.id, type: "question" };
      }

      case "human": case "assign":
        await say(ctx, node.data.text ?? "Te comunico con un asesor, un momento 🙌");
        await ctx.db.from("conversations").update({ status: "assigned" }).eq("id", ctx.convId);
        return null;
      case "end":
        if (node.data.text) await say(ctx, node.data.text);
        await ctx.db.from("conversations").update({ status: "closed" }).eq("id", ctx.convId);
        return null;
      default:
        if (node.data.text) await say(ctx, node.data.text);
        current = defaultNext(ctx.flow, node);
    }
  }
  return null;
}

async function handleIncoming(opts: any) {
  const vars: Record<string, string> = { ...(opts.flowState?.vars ?? {}), ...(opts.baseVars ?? {}) };
  const ctx = {
    flow: opts.flow, pnid: opts.pnid, token: opts.token, to: opts.to,
    orgId: opts.orgId, convId: opts.convId, db: opts.db, vars,
    botId: opts.botId, aiSettings: opts.aiSettings ?? null, lastUserText: opts.visible ?? opts.text ?? "",
  };
  const awaiting = opts.flowState?.awaiting;
  let startId: string | undefined;
  if (awaiting?.nodeId) {
    const node = getNode(opts.flow, awaiting.nodeId);
    if (awaiting.type === "question") {
      if (node?.data.variable) vars[node.data.variable] = opts.text;
      // El bloque de IA se queda escuchando: la siguiente pregunta vuelve a él.
      startId = node?.type === "ai" ? node.id : (node ? defaultNext(opts.flow, node) : undefined);
    } else if (awaiting.type === "buttons") {
      const t = opts.text.toLowerCase();
      const btn = (node?.data.buttons ?? []).find((b: any) => b.id === opts.text || (b.label ?? "").toLowerCase() === t);
      startId = btn && node ? buttonTarget(opts.flow, node.id, btn) : (node ? defaultNext(opts.flow, node) : undefined);
    }
  } else {
    startId = getStartNode(opts.flow)?.id;
  }
  const nextAwait = await runFrom(startId, ctx);
  return { vars, awaiting: nextAwait };
}

// ---- selección de flujo por disparador ----
// Prioridad: (1) palabra clave (interrumpe incluso a mitad de conversación),
// (2) continuar el flujo activo, (3) lead que regresa, (4) bienvenida.
function chooseFlow(flows: any[], text: string, isReturning: boolean, state: any) {
  const t = (text || "").toLowerCase();
  for (const f of flows) {
    if (
      f.trigger_type === "keyword" &&
      Array.isArray(f.keywords) &&
      f.keywords.some((k: string) => k && t.includes(String(k).toLowerCase()))
    ) {
      return f;
    }
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

function json(o: any) { return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }); }

// ---- estados de entrega (difusiones) ----
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 };
async function handleStatuses(db: any, statuses: any[]) {
  for (const st of statuses) {
    const wamid = st?.id;
    const s = st?.status; // sent | delivered | read | failed
    if (!wamid || !s) continue;
    const tsAt = new Date((Number(st.timestamp) || Date.now() / 1000) * 1000).toISOString();
    if (s === "failed") {
      const err = st?.errors?.[0]?.title ?? st?.errors?.[0]?.message ?? "failed";
      await db.from("campaign_recipients").update({ status: "failed", error: err }).eq("wa_message_id", wamid);
      await db.from("drip_sends").update({ status: "failed", error: err }).eq("wa_message_id", wamid);
      continue;
    }
    if (!(s in STATUS_RANK)) continue;
    const patch: any = { status: s };
    if (s === "sent") patch.sent_at = tsAt;
    if (s === "delivered") patch.delivered_at = tsAt;
    if (s === "read") patch.read_at = tsAt;

    // Difusiones
    const { data: rec } = await db.from("campaign_recipients").select("id,status").eq("wa_message_id", wamid).maybeSingle();
    if (rec && (STATUS_RANK[s] ?? 0) > (STATUS_RANK[rec.status] ?? 0)) {
      await db.from("campaign_recipients").update(patch).eq("id", rec.id);
    }

    // Seguimientos (drips)
    const { data: dsend } = await db.from("drip_sends").select("id,status").eq("wa_message_id", wamid).maybeSingle();
    if (dsend && (STATUS_RANK[s] ?? 0) > (STATUS_RANK[dsend.status] ?? 0)) {
      await db.from("drip_sends").update(patch).eq("id", dsend.id);
    }
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return json({ ok: true }); }
    try {
      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // 1) Estados de entrega de difusiones (sent/delivered/read/failed)
      const statuses = value?.statuses;
      if (Array.isArray(statuses) && statuses.length) {
        await handleStatuses(admin(), statuses);
        return json({ ok: true });
      }

      // 2) Mensaje entrante
      const msg = value?.messages?.[0];
      if (!msg) return json({ ok: true });
      const pnid = value?.metadata?.phone_number_id;
      const from = msg.from;
      const name = value?.contacts?.[0]?.profile?.name ?? null;
      // Dos lecturas del mismo mensaje:
      //  · `text`    → lo que usa el motor para saber qué botón se tocó (el id).
      //  · `visible` → lo que LEE una persona en la bandeja (el texto del botón).
      // Antes se guardaba el id, y en el chat aparecían códigos raros.
      const text = msg.text?.body ?? msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? msg.button?.text ?? "";
      const etiquetaAdjunto =
        msg.type === "image" ? "📷 Imagen"
        : msg.type === "video" ? "🎥 Video"
        : msg.type === "audio" ? "🎤 Audio"
        : msg.type === "document" ? "📎 Archivo"
        : msg.type === "location" ? "📍 Ubicación"
        : msg.type === "sticker" ? "🩷 Sticker"
        : "";
      const visible =
        msg.text?.body ??
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        msg.button?.text ??
        (etiquetaAdjunto || text);
      const db = admin();
      const { data: cfg } = await db.from("whatsapp_channels").select("*").eq("phone_number_id", pnid).maybeSingle();
      if (!cfg) return json({ ok: true });

      // Atribuir respuesta a una difusión o seguimiento reciente ("quién respondió")
      const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      const repliedPatch = { status: "replied", replied_at: new Date().toISOString() };
      try {
        await db.from("campaign_recipients").update(repliedPatch)
          .eq("org_id", cfg.org_id).eq("phone", from)
          .in("status", ["sent", "delivered", "read"]).gte("created_at", since);
      } catch { /* best-effort */ }
      try {
        await db.from("drip_sends").update(repliedPatch)
          .eq("org_id", cfg.org_id).eq("phone", from)
          .in("status", ["sent", "delivered", "read"]).gte("created_at", since);
      } catch { /* best-effort */ }

      // El nombre de WhatsApp se guarda aparte (wa_name) para NO pisar el nombre
      // que el agente haya escrito a mano en la ficha del lead.
      const { data: contact } = await db.from("contacts")
        .upsert(
          { org_id: cfg.org_id, channel: "whatsapp", external_id: from, phone: from, wa_name: name, country: paisDesdeTelefono(from) },
          { onConflict: "org_id,channel,external_id" },
        )
        .select("id, name").single();
      // Si todavía no tiene nombre propio, estrenamos con el de WhatsApp.
      if (contact && !contact.name && name) {
        await db.from("contacts").update({ name }).eq("id", contact.id);
      }
      let { data: conv } = await db.from("conversations").select("id, flow_state, status").eq("org_id", cfg.org_id).eq("contact_id", contact.id).eq("channel", "whatsapp").order("last_message_at", { ascending: false }).limit(1).maybeSingle();
      if (!conv || conv.status === "closed") {
        const ins = await db.from("conversations").insert({ org_id: cfg.org_id, contact_id: contact.id, bot_id: cfg.bot_id, channel: "whatsapp", status: "open", flow_state: {} }).select("id, flow_state, status").single();
        conv = ins.data;
      }
      await db.from("messages").insert({ conversation_id: conv.id, org_id: cfg.org_id, direction: "inbound", sender: "contact", body: visible });
      await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conv.id);
      if (cfg.bot_id && conv.status !== "assigned") {
        // ¿Lead que regresa? (tiene más de una conversación con nosotros)
        const { count: convCount } = await db
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contact.id);
        const isReturning = (convCount ?? 1) > 1;

        // Ajustes de IA del chatbot (persona, tono, respaldo)
        const { data: botRow } = await db.from("bots").select("ai").eq("id", cfg.bot_id).maybeSingle();

        // Variables listas para usar en cualquier mensaje: {{whatsappName}}, {{nombre}}, {{telefono}}…
        const nombre = (name ?? "").trim();
        const baseVars: Record<string, string> = {
          whatsappName: nombre,
          nombre,
          name: nombre,
          primerNombre: nombre.split(/\s+/)[0] ?? "",
          firstName: nombre.split(/\s+/)[0] ?? "",
          telefono: from,
          phone: from,
        };

        // Todos los flujos habilitados del bot y elegir por disparador
        const { data: flowRows } = await db
          .from("flows")
          .select("id, graph, trigger_type, keywords, enabled")
          .eq("bot_id", cfg.bot_id);
        const flows = (flowRows ?? []).filter((f: any) => f.enabled !== false);
        const state = conv.flow_state ?? {};
        const chosen = chooseFlow(flows, visible, isReturning, state);

        if (chosen) {
          const graph = chosen.graph ?? { nodes: [], edges: [] };
          const flow = { nodes: graph.nodes ?? [], edges: graph.edges ?? [] };
          if (flow.nodes.length) {
            // Si cambiamos de flujo, ese flujo arranca desde el inicio (sin arrastrar awaiting)
            const flowState = state.flow_id === chosen.id ? state : { vars: state.vars ?? {} };
            const newState = await handleIncoming({
              flow, pnid, token: cfg.access_token, to: from,
              orgId: cfg.org_id, convId: conv.id, db, flowState, text, visible,
              botId: cfg.bot_id, aiSettings: (botRow as any)?.ai ?? null, baseVars,
            });
            await db.from("conversations").update({ flow_state: { ...newState, flow_id: chosen.id } }).eq("id", conv.id);
          }
        }
      }
    } catch (e) {
      console.error("[whatsapp webhook]", e);
    }
    return json({ ok: true });
  }

  return new Response("ok");
});
