/**
 * Modelo de datos de un flujo conversacional de Demandu.
 * El MISMO objeto alimenta el Constructor visual y el motor del Webchat.
 */

export type NodeType =
  | "start"
  | "message"
  | "media"
  | "question"
  | "buttons"
  | "condition"
  | "ai"
  | "delay"
  | "action"
  | "calendar"
  | "tags"
  | "human"
  | "assign"
  | "redirect"
  | "api"
  | "whatsapp_flow"
  | "payment"
  | "catalog"
  | "template"
  | "end";

export interface FlowButton {
  id: string;
  label: string;
  /** id del nodo destino */
  to?: string;
  /** palabras clave que también disparan esta opción (NLP) */
  keywords?: string;
  /** etiquetas que se asignan al contacto al elegir esta opción */
  tagIds?: string[];
  /** estado de conversación al que se cambia al elegir esta opción */
  statusId?: string;
  /** miembro/agente al que se asigna el chat al elegir esta opción */
  assignMemberId?: string;
  description?: string;
}

/** Operadores para el nodo Condición. */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty";

export interface ConditionRule {
  id: string;
  /** clave del atributo/variable a evaluar (ej. ciudad) */
  attribute?: string;
  operator: ConditionOperator;
  value?: string;
}

/** Una rama del nodo Condición. Su id es el sourceHandle de la arista de salida. */
export interface ConditionBranch {
  id: string;
  label: string;
  /** "all" = se cumplen todas las reglas (Y); "any" = al menos una (O) */
  match: "all" | "any";
  rules: ConditionRule[];
}

/** Operadores que no requieren un valor de comparación. */
export const OPERATORS_WITHOUT_VALUE: ConditionOperator[] = ["is_empty", "is_not_empty"];

export const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  equals: "es igual a",
  not_equals: "es distinto de",
  contains: "contiene",
  not_contains: "no contiene",
  starts_with: "empieza con",
  ends_with: "termina con",
  greater_than: "es mayor que",
  less_than: "es menor que",
  is_empty: "está vacío",
  is_not_empty: "no está vacío",
};

/** Acciones compartidas que se disparan al llegar a un nodo (capa transversal). */
export type NodeActionType =
  | "add_tag"
  | "remove_tag"
  | "assign_agent"
  | "assign_group"
  | "set_attribute"
  | "notify_team"
  | "set_status"
  | "opt_out"
  | "webhook";

export interface NodeAction {
  id: string;
  type: NodeActionType;
  value?: string;
}

export const ACTION_META: Record<
  NodeActionType,
  { label: string; icon: string; placeholder: string }
> = {
  add_tag: { label: "Asignar etiqueta", icon: "🏷️", placeholder: "nombre-etiqueta" },
  remove_tag: { label: "Quitar etiqueta", icon: "🏷️", placeholder: "nombre-etiqueta" },
  assign_agent: { label: "Asignar a agente", icon: "🧑‍💼", placeholder: "agente@demandu.tech" },
  assign_group: { label: "Asignar a grupo", icon: "👥", placeholder: "Ventas" },
  set_attribute: { label: "Guardar atributo", icon: "🧩", placeholder: "@ciudad = CDMX" },
  notify_team: { label: "Notificar al equipo", icon: "🔔", placeholder: "Canal o correo" },
  set_status: { label: "Cambiar estado", icon: "🟢", placeholder: "ganada" },
  opt_out: { label: "Dar de baja (opt-out)", icon: "🚫", placeholder: "" },
  webhook: { label: "Disparar webhook", icon: "🔗", placeholder: "https://…" },
};

export const ACTION_ORDER: NodeActionType[] = [
  "add_tag", "remove_tag", "assign_agent", "assign_group",
  "set_attribute", "notify_team", "set_status", "opt_out", "webhook",
];

export interface DemanduNodeData {
  label: string;
  text?: string;
  /** solo para type = "buttons" */
  buttons?: FlowButton[];
  /** solo para type = "question": variable donde se guarda la respuesta */
  variable?: string;
  dataType?: "text" | "number" | "email" | "phone";
  required?: boolean;
  retries?: number;
  errorMessage?: string;
  /** solo para type = "media" (Multimedia) */
  mediaType?: "image" | "video" | "file";
  mediaUrl?: string;
  mediaName?: string;
  caption?: string;
  /** solo para type = "delay" (Espera) */
  delayValue?: number;
  delayUnit?: "seconds" | "minutes" | "hours";
  /** solo para type = "ai" */
  aiProvider?: "demandu" | "anthropic" | "openai" | "gemini";
  systemPrompt?: string;
  knowledgeBaseId?: string;
  /** solo para type = "calendar" */
  calendarId?: string;
  durationMin?: number;
  /** solo para type = "human" */
  team?: string;
  /** solo para type = "assign" (Asignar chat) */
  assignBy?: "team" | "member" | "round_robin";
  teamId?: string;
  memberId?: string;
  businessHoursOnly?: boolean;
  skipOffline?: boolean;
  waitForAssignment?: boolean;
  /** solo para type = "redirect" */
  targetBotId?: string;
  /** solo para type = "api" (las ramas por respuesta reutilizan `buttons`) */
  apiUrl?: string;
  apiMethod?: "GET" | "POST" | "PUT" | "DELETE";
  apiHeaders?: string;
  apiBody?: string;
  /** solo para type = "whatsapp_flow" */
  waFlowId?: string;
  waFlowCta?: string;
  waFlowScreen?: string;
  waFlowVersion?: string;
  waHeader?: string;
  waBody?: string;
  waFooter?: string;
  /** solo para type = "payment" */
  gateway?: string;
  amount?: string;
  currency?: string;
  successBotId?: string;
  failureBotId?: string;
  whatsappPayment?: boolean;
  /** solo para type = "catalog" */
  catalogId?: string;
  products?: string;
  /** solo para type = "template" */
  templateName?: string;
  templateLang?: string;
  /** solo para type = "message" */
  media?: "none" | "image" | "video" | "file";
  typingDelay?: number;
  /** solo para type = "buttons" (opciones avanzadas, estilo Single Choice) */
  allowBack?: boolean;
  allowSkip?: boolean;
  skipIfAnswered?: boolean;
  notifyOnResponse?: boolean;
  includeInLeads?: boolean;
  /** marca este nodo como el arranque de la conversación (solo uno por flujo) */
  isStart?: boolean;
  /** acciones que se disparan al llegar al nodo (capa compartida) */
  actions?: NodeAction[];
  /** solo para type = "condition": ramas evaluadas en orden (con salida "otherwise") */
  conditions?: ConditionBranch[];
  /** siguiente nodo por defecto (no aplica a buttons/condition/end) */
  to?: string;
}

/** Nodo compatible con React Flow (@xyflow/react). */
export interface DemanduNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: DemanduNodeData;
}

export interface DemanduEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string;
}

export interface Flow {
  id: string;
  name: string;
  nodes: DemanduNode[];
  edges: DemanduEdge[];
}

/** Metadatos visuales de cada tipo de componente (icono, color, descripción). */
export const NODE_META: Record<
  NodeType,
  { label: string; description: string; icon: string; color: string; bg: string }
> = {
  start: { label: "Inicio", description: "Disparador del flujo", icon: "▶", color: "#3DDC97", bg: "rgba(61,220,151,.15)" },
  message: { label: "Mensaje", description: "Texto simple", icon: "💬", color: "#F64A97", bg: "rgba(246,74,151,.15)" },
  media: { label: "Multimedia", description: "Imagen, video o archivo", icon: "🖼️", color: "#FF6FB0", bg: "rgba(255,111,176,.15)" },
  question: { label: "Pregunta", description: "Captura una respuesta", icon: "❓", color: "#3A85FF", bg: "rgba(58,133,255,.15)" },
  buttons: { label: "Botones", description: "Opciones / menú", icon: "⚿", color: "#6E42FF", bg: "rgba(110,66,255,.15)" },
  condition: { label: "Condición", description: "Ramifica según reglas", icon: "⑂", color: "#FFC857", bg: "rgba(255,200,87,.15)" },
  ai: { label: "IA · Lana", description: "Respuesta con IA", icon: "✨", color: "#8B66FF", bg: "rgba(139,102,255,.18)" },
  delay: { label: "Espera", description: "Pausa temporizada", icon: "⏱", color: "#9A9CC7", bg: "rgba(154,156,199,.15)" },
  action: { label: "Acción / API", description: "Webhook o integración", icon: "⚙", color: "#3DDC97", bg: "rgba(61,220,151,.15)" },
  calendar: { label: "Agendar cita", description: "Google Calendar", icon: "📅", color: "#3A85FF", bg: "rgba(58,133,255,.15)" },
  tags: { label: "Etiquetar", description: "Segmenta el contacto", icon: "🏷", color: "#FFC857", bg: "rgba(255,200,87,.15)" },
  human: { label: "Agente humano", description: "Transferir a tu equipo", icon: "🧑‍💼", color: "#FF5A5F", bg: "rgba(255,90,95,.15)" },
  assign: { label: "Asignar chat", description: "Reparte a agente / equipo", icon: "🎧", color: "#FF6FB0", bg: "rgba(255,111,176,.15)" },
  redirect: { label: "Redirigir", description: "Va a otro flujo / bot", icon: "🔀", color: "#3A85FF", bg: "rgba(58,133,255,.15)" },
  api: { label: "Acción API", description: "Llama una API y ramifica", icon: "🔌", color: "#3DDC97", bg: "rgba(61,220,151,.15)" },
  whatsapp_flow: { label: "WhatsApp Flow", description: "Formulario nativo de WhatsApp", icon: "📋", color: "#25D366", bg: "rgba(37,211,102,.16)" },
  payment: { label: "Pago", description: "Cobro con pasarela", icon: "💳", color: "#FFC857", bg: "rgba(255,200,87,.15)" },
  catalog: { label: "Catálogo", description: "Venta de productos por WhatsApp", icon: "🛒", color: "#6E42FF", bg: "rgba(110,66,255,.15)" },
  template: { label: "Plantilla WA", description: "Mensaje con plantilla aprobada", icon: "🗂️", color: "#3A85FF", bg: "rgba(58,133,255,.15)" },
  end: { label: "Fin", description: "Cierra el flujo", icon: "⏹", color: "#6E70A0", bg: "rgba(110,112,160,.15)" },
};

/** Orden de los componentes en la paleta del constructor. */
export const PALETTE_ORDER: NodeType[] = [
  "message", "media", "question", "buttons", "condition",
  "ai", "delay", "action", "api", "calendar", "tags", "human", "assign", "redirect",
  "catalog", "payment", "whatsapp_flow", "template", "end",
];
