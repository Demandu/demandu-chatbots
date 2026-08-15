import { NODE_META, type NodeType } from "./types";

/**
 * Convierte un export de BotPenguin (payload.questions[]) al grafo de Demandu
 * { nodes, edges } compatible con React Flow. Permite importar/clonar bots.
 */

const TYPE_MAP: Record<string, NodeType> = {
  image: "message",
  statement: "message",
  multi_product: "catalog",
  text: "message",
  AI: "ai",
  ai: "ai",
  question: "question",
  email: "question",
  phone: "question",
  button: "buttons",
  options: "buttons",
  condition: "condition",
  delay: "delay",
  live_chat: "human",
  "assign-chat": "assign",
  agent: "human",
  redirect: "redirect",
  whatsapp_flow: "whatsapp_flow",
  api: "api",
  payment: "payment",
  template: "template",
  googleSheet: "action",
};

function mapType(t: string): NodeType {
  return TYPE_MAP[t] ?? "message";
}

/** Toma la primera línea significativa del mensaje como título corto del nodo. */
function titleFrom(label: string, type: NodeType): string {
  const line = (label || "")
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  const clean = (line ?? "").replace(/[*_~`>#{}]/g, "").trim();
  return clean ? clean.slice(0, 38) : NODE_META[type].label;
}

export function botpenguinToGraph(raw: any): { nodes: any[]; edges: any[] } {
  const questions: any[] = raw?.payload?.questions ?? raw?.questions ?? [];
  const ids = new Set(questions.map((q) => q.id));
  const nodes: any[] = [];
  const edges: any[] = [];

  questions.forEach((q, i) => {
    const type = mapType(q.type);
    const pos = q.canvasPosition ?? { x: 120 + i * 280, y: (i % 2) * 200 };
    const data: any = {
      label: titleFrom(q.label, type),
      text: q.label ?? "",
    };
    if (type === "buttons") {
      data.text = q.label ?? "Elige una opción:";
      data.buttons = (q.options ?? []).map((o: any) => ({
        id: o.id,
        label: o.value || o.description || "Opción",
        to: o.next?.target,
      }));
    }
    if (q.type === "image") data.media = "image";
    if (type === "ai") data.aiProvider = "demandu";
    if (type === "api") {
      data.apiUrl = q.apiConfig?.url ?? q.api?.url ?? "";
      data.apiMethod = (q.apiConfig?.method ?? q.api?.method ?? "GET").toUpperCase();
      data.buttons = [
        { id: `ok-${q.id}`, label: "✅ Éxito (2xx)", to: q.next?.target },
        { id: `err-${q.id}`, label: "⚠️ Error (4xx/5xx)" },
        { id: `other-${q.id}`, label: "Otros" },
      ];
    }
    if (type === "payment") {
      const p = q.paymentConfig ?? {};
      data.amount = p.amount != null ? String(p.amount) : "";
      data.currency = p.currency ?? "MXN";
      data.gateway = p.gateway ?? "stripe";
      data.whatsappPayment = !!p.whatsapp;
    }
    if (type === "whatsapp_flow") {
      data.waFlowId = q.whatsappFlowId ?? q.flowId ?? "";
      data.waFlowCta = q.whatsappFlowCta ?? q.flowCta ?? "";
      data.waBody = q.label ?? "";
    }
    if (type === "template") {
      data.templateName = q.templateName ?? q.template?.name ?? "";
      data.templateLang = q.templateLang ?? q.template?.language ?? "es_MX";
    }
    if (type === "assign" && q.chatAssignment) {
      const ca = q.chatAssignment;
      data.assignBy = ca.logic === "roundRobin" ? "round_robin" : ca.assignBy === "teamMembers" ? "member" : "team";
      data.businessHoursOnly = !!ca.assignInBusinessHours;
      data.skipOffline = !!ca.doNotassignToOfflineUsers;
      data.waitForAssignment = !!ca.waitForAssignment;
    }

    nodes.push({ id: q.id, type, position: { x: pos.x, y: pos.y }, data });

    // Aristas
    if (type === "buttons") {
      (q.options ?? []).forEach((o: any) => {
        const tgt = o.next?.target;
        if (tgt && ids.has(tgt)) {
          edges.push({
            id: `e-${o.id}`,
            source: q.id,
            target: tgt,
            sourceHandle: o.id,
            label: (o.value || "").slice(0, 20) || null,
          });
        }
      });
    } else if (type === "api") {
      const tgt = q.next?.target;
      if (tgt && ids.has(tgt)) {
        edges.push({ id: `e-${q.id}`, source: q.id, target: tgt, sourceHandle: `ok-${q.id}`, label: "Éxito" });
      }
    } else {
      const tgt = q.next?.target;
      if (tgt && ids.has(tgt)) {
        edges.push({ id: `e-${q.id}`, source: q.id, target: tgt, sourceHandle: null, label: null });
      }
    }
  });

  return { nodes, edges };
}
