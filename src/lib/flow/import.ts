import { NODE_META, type NodeType } from "./types";

/**
 * Convierte un export de BotPenguin (payload.questions[]) al grafo de Demandu
 * { nodes, edges } compatible con React Flow. Permite importar/clonar bots.
 */

const TYPE_MAP: Record<string, NodeType> = {
  image: "message",
  statement: "message",
  multi_product: "message",
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
  "assign-chat": "human",
  agent: "human",
  whatsapp_flow: "action",
  api: "action",
  payment: "action",
  redirect: "action",
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
    } else {
      const tgt = q.next?.target;
      if (tgt && ids.has(tgt)) {
        edges.push({ id: `e-${q.id}`, source: q.id, target: tgt, sourceHandle: null, label: null });
      }
    }
  });

  return { nodes, edges };
}
