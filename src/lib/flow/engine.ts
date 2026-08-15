import type { Flow, DemanduNode, FlowButton } from "./types";

/** Obtiene un nodo por id. */
export function getNode(flow: Flow, id: string): DemanduNode | undefined {
  return flow.nodes.find((n) => n.id === id);
}

/** Nodo de inicio del flujo. */
export function getStartNode(flow: Flow): DemanduNode | undefined {
  return (
    flow.nodes.find((n) => n.data?.isStart) ??
    flow.nodes.find((n) => n.type === "start") ??
    flow.nodes[0]
  );
}

/**
 * Siguiente nodo por defecto (sigue la arista sin sourceHandle específico,
 * o el campo data.to como respaldo).
 */
export function defaultNext(flow: Flow, node: DemanduNode): string | undefined {
  const edge = flow.edges.find((e) => e.source === node.id && !e.sourceHandle);
  return edge?.target ?? node.data.to;
}

/** Destino asociado a un botón (por sourceHandle = button.id, o button.to). */
export function buttonTarget(flow: Flow, nodeId: string, button: FlowButton): string | undefined {
  const edge = flow.edges.find((e) => e.source === nodeId && e.sourceHandle === button.id);
  return edge?.target ?? button.to;
}

/** Reemplaza *negritas* estilo WhatsApp y saltos de línea por HTML. */
export function renderText(text = ""): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*(.*?)\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br/>");
}
