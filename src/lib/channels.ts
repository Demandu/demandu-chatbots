// ============================================================================
// Fuente ÚNICA de verdad: qué feature y qué componente aplica en cada canal.
// La consumen el menú del bot (BotNav) y la paleta del constructor.
// Regla: un chatbot solo muestra lo que su canal permite (reglas de Meta/API).
// Ver proyecto: matriz-canales-features-componentes.md
// ============================================================================

export type Channel = "whatsapp" | "instagram" | "messenger" | "webchat";

export const CHANNEL_META: Record<Channel, { label: string; color: string }> = {
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  instagram: { label: "Instagram", color: "#E1306C" },
  messenger: { label: "Messenger", color: "#0084FF" },
  webchat: { label: "Sitio web", color: "#7c4dff" },
};

export function channelOf(raw?: string | null): Channel {
  return (raw as Channel) in CHANNEL_META ? (raw as Channel) : "webchat";
}

// ---------------------------------------------------------------------------
// FEATURES (pestañas / secciones dentro de un chatbot)
// ---------------------------------------------------------------------------
export type FeatureKey =
  | "flows"        // Conversaciones automáticas — todos
  | "broadcasts"   // Envíos masivos — solo WhatsApp
  | "drips"        // Seguimientos automáticos — solo WhatsApp
  | "templates"    // Plantillas de mensajes — solo WhatsApp
  | "catalog"      // Catálogo de productos — solo WhatsApp
  | "forms"        // Formularios de WhatsApp — solo WhatsApp
  | "appearance"   // Apariencia de la burbuja — solo sitio web
  | "ai"           // Lana IA (personalidad) — todos
  | "training"     // Entrenamiento (info del negocio) — todos
  | "install"      // Conexión — todos (distinto por canal)
  | "settings";    // Ajustes — todos

// Pensado para que el ORDEN del array sea el orden de las pestañas.
export const FEATURES: {
  key: FeatureKey;
  label: string;
  channels: Channel[];
}[] = [
  { key: "flows", label: "Conversaciones automáticas", channels: ["whatsapp", "instagram", "messenger", "webchat"] },
  { key: "broadcasts", label: "Envíos masivos", channels: ["whatsapp"] },
  { key: "drips", label: "Seguimientos", channels: ["whatsapp"] },
  { key: "templates", label: "Plantillas de mensajes", channels: ["whatsapp"] },
  { key: "catalog", label: "Catálogo", channels: ["whatsapp"] },
  { key: "forms", label: "Formularios", channels: ["whatsapp"] },
  { key: "appearance", label: "Apariencia", channels: ["webchat"] },
  { key: "ai", label: "Lana IA", channels: ["whatsapp", "instagram", "messenger", "webchat"] },
  { key: "training", label: "Entrenamiento", channels: ["whatsapp", "instagram", "messenger", "webchat"] },
  { key: "install", label: "Conexión", channels: ["whatsapp", "instagram", "messenger", "webchat"] },
  { key: "settings", label: "Ajustes", channels: ["whatsapp", "instagram", "messenger", "webchat"] },
];

export function featuresFor(channel: Channel): FeatureKey[] {
  return FEATURES.filter((f) => f.channels.includes(channel)).map((f) => f.key);
}
export function hasFeature(channel: Channel, key: FeatureKey): boolean {
  return featuresFor(channel).includes(key);
}

// ---------------------------------------------------------------------------
// COMPONENTES (bloques del constructor de flujos)
// `desc` = frase corta en la paleta (qué hace). `lana` = lo que Lana "dice"
// como tutorial en texto. Mini-videos por bloque: fase posterior.
// ---------------------------------------------------------------------------
// OJO: estas claves DEBEN coincidir una a una con `NODE_META` de
// `src/lib/flow/types.ts`, que es lo que el cliente arrastra de verdad en el
// constructor. Si documentamos un bloque que no existe, prometemos algo que no
// está; si falta uno, ese bloque se queda sin explicación ni tutorial de Lana.
export type ComponentKey =
  | "message" | "media" | "question" | "buttons" | "condition" | "ai" | "delay"
  | "action" | "api" | "calendar" | "tags" | "human" | "assign" | "redirect"
  | "catalog" | "payment" | "whatsapp_flow" | "call_permission" | "template"
  | "tienda" | "tienda_catalogo" | "tienda_pedido" | "tienda_pedir"
  | "ig_story" | "ig_comment" | "ig_dm" | "fb_comment" | "web_form" | "end";

const ALL: Channel[] = ["whatsapp", "instagram", "messenger", "webchat"];

export const COMPONENTS: Record<ComponentKey, {
  label: string;
  desc: string;
  lana: string;
  channels: Channel[];
}> = {
  message:   { label: "Mensaje", desc: "Envía un texto a tu cliente.", lana: "Es el bloque más básico: escribe lo que tu chatbot le dirá al cliente. Puedes usar {{nombre}} para saludarlo por su nombre.", channels: ALL },
  media:     { label: "Imagen / archivo", desc: "Manda una foto, video o PDF.", lana: "Sube una imagen, video o documento. Ideal para catálogos, menús o comprobantes.", channels: ALL },
  buttons:   { label: "Botones", desc: "Da opciones para elegir con un toque.", lana: "En vez de que el cliente escriba, le das opciones listas para tocar. En WhatsApp e Instagram puedes poner hasta 3.", channels: ALL },
  question:  { label: "Pregunta", desc: "Pide un dato (nombre, correo…) y lo guarda.", lana: "Le preguntas algo al cliente (su nombre, correo, teléfono…) y el chatbot lo guarda para usarlo después.", channels: ALL },
  condition: { label: "Si… entonces", desc: "Toma un camino según la respuesta.", lana: "Hace que la conversación tome distintos caminos según lo que el cliente respondió. Por ejemplo: si dijo 'sí', va por aquí; si no, por allá.", channels: ALL },
  delay:     { label: "Espera", desc: "Pausa unos segundos antes de seguir.", lana: "Agrega una pausa (o el 'escribiendo…') para que la conversación se sienta más natural.", channels: ALL },
  ai:        { label: "Respuesta con IA (Lana)", desc: "Deja que la IA responda con tus datos.", lana: "Yo (Lana) respondo con inteligencia artificial usando la info de tu negocio. Útil para preguntas abiertas que no tienen un guion fijo.", channels: ALL },
  human:     { label: "Pasar a un humano", desc: "Avisa a tu equipo para que conteste.", lana: "Cuando el cliente necesita a una persona, este bloque avisa a tu equipo y les pasa la conversación.", channels: ALL },
  assign:    { label: "Asignar a un agente", desc: "Reparte el chat a un equipo o persona.", lana: "Reparte la conversación entre tu equipo (por turnos, por área u horario) para que nadie quede sin atender.", channels: ALL },
  tags:      { label: "Etiquetar", desc: "Marca al contacto (ej. 'interesado').", lana: "Le pones una etiqueta al contacto (por ejemplo 'interesado' o 'cliente') para segmentarlo después.", channels: ALL },
  redirect:  { label: "Ir a otra conversación", desc: "Salta a otro flujo del chatbot.", lana: "Envía al cliente a otra de tus conversaciones automáticas. Sirve para reutilizar partes sin repetirlas.", channels: ALL },
  template:  { label: "Enviar plantilla de WhatsApp", desc: "Mensaje aprobado por Meta.", lana: "Envía una plantilla aprobada por Meta. Es la única forma de escribirle primero a alguien en WhatsApp fuera de las 24 horas.", channels: ["whatsapp"] },
  catalog:   { label: "Catálogo de Meta", desc: "Productos subidos a Facebook.", lana: "Muestra productos del catálogo que subiste a Facebook Commerce. OJO: no son los de tu tienda de Demandu — para esos usa el bloque «Mis productos».", channels: ["whatsapp"] },

  // ── LOS TRES DE LA TIENDA DE DEMANDU ──────────────────────────────────
  // Van en TODOS los canales a propósito. La tienda es una página web: el
  // enlace sirve igual en WhatsApp, en Instagram y en el widget. Limitarlos a
  // WhatsApp dejaría fuera justo el canal por el que llega la gente a la
  // tienda, que es la biografía de Instagram.
  tienda: { label: "Mi tienda", desc: "Manda el enlace de tu tienda.", lana: "Manda el enlace de tu tienda con un botón. No tienes que escribir la dirección: la saco de tu tienda, así que si algún día la cambias, tus conversaciones siguen funcionando. Si tienes la tienda apagada, el bloque toma la otra salida y no le manda un enlace muerto a nadie.", channels: ALL },
  tienda_catalogo: { label: "Mis productos", desc: "Enseña tu catálogo dentro del chat.", lana: "Le enseña tus productos reales sin salir de la conversación: primero las categorías y luego los productos con su precio. Lo oculto y lo agotado no se enseña, para que nadie pida algo que no le puedes vender.", channels: ALL },
  tienda_pedido: { label: "Estado del pedido", desc: "Le dice cómo va su pedido.", lana: "Cuando alguien pregunta «¿dónde va mi pedido?», este bloque lo busca por su teléfono y le contesta solo. Si le falta pagar, se lo dice — que es lo que de verdad necesita saber.", channels: ALL },
  tienda_pedir: { label: "Pedir por el chat", desc: "Arma el pedido hablando y lo cobra.", lana: "El cliente elige productos, contesta las opciones (tamaño, sabor…), dice cuántos quiere y te deja su dirección, todo dentro de la conversación. Al final le llega el resumen con el total y su enlace para pagar por Yappy, y el pedido te entra igual que si lo hubiera hecho en la tienda. Los productos con demasiadas opciones para preguntarlas por chat abren su página en la tienda, ya listos para agregar.", channels: ALL },
  whatsapp_flow: { label: "Formulario (WhatsApp Flow)", desc: "Pide varios datos en una sola pantalla.", lana: "Un formulario nativo de WhatsApp: el cliente llena varios campos en una sola pantalla, sin ir pregunta por pregunta.", channels: ["whatsapp"] },
  call_permission: { label: "Permiso para llamar", desc: "Pide autorización antes de llamar por WhatsApp.", lana: "En WhatsApp no puedes llamar a un cliente sin que él lo autorice antes. Este bloque le manda la petición dentro de la conversación; si acepta, tu equipo puede llamarlo desde WhatsApp. Meta solo deja pedirlo una vez al día y dos veces por semana por persona, así que conviene pedirlo cuando de verdad haga falta.", channels: ["whatsapp"] },
  payment:   { label: "Cobro / pago", desc: "Cobra dentro del chat.", lana: "Cobra dentro de WhatsApp con tu pasarela de pago. (En otros canales, más adelante, será con un enlace de pago.)", channels: ["whatsapp"] },
  action:    { label: "Acción / Webhook", desc: "Avisa a otro sistema tuyo.", lana: "Manda la información a otro programa que uses (tu CRM, tu hoja de cálculo, tu sistema de pedidos). Si no sabes qué poner aquí, pídenos ayuda.", channels: ALL },
  api:       { label: "Consultar un sistema", desc: "Pregunta a otro sistema y sigue según la respuesta.", lana: "Le pregunta algo a otro sistema tuyo — por ejemplo si hay inventario — y la conversación sigue por un camino u otro según lo que conteste.", channels: ALL },
  calendar:  { label: "Agendar cita", desc: "Reserva en tu Google Calendar.", lana: "El cliente elige día y hora, y la cita queda en tu Google Calendar. Antes hay que conectar tu cuenta de Google en Configuración.", channels: ALL },
  ig_story:  { label: "Responder Historia", desc: "Contesta a quien responde tus historias.", lana: "Cuando alguien responde o menciona tu historia de Instagram, el chatbot le contesta solo. Buenísimo para convertir seguidores en clientes.", channels: ["instagram"] },
  ig_comment:{ label: "Comentarios de Instagram", desc: "Responde comentarios y sigue por privado.", lana: "Cuando alguien comenta tu publicación, el chatbot le responde en el comentario y le abre un mensaje privado para seguir la conversación.", channels: ["instagram"] },
  ig_dm:     { label: "Mensaje directo de Instagram", desc: "Envía un privado de Instagram.", lana: "Manda un mensaje directo por Instagram. Se usa junto con el bloque de comentarios para pasar de lo público a lo privado.", channels: ["instagram"] },
  fb_comment:{ label: "Comentarios de Facebook", desc: "Responde comentarios y sigue por Messenger.", lana: "Igual que en Instagram: responde el comentario en tu publicación de Facebook y sigue la charla por Messenger.", channels: ["messenger"] },
  web_form:  { label: "Formulario en tu sitio", desc: "Pide varios datos en el widget.", lana: "Muestra un formulario dentro del chat de tu sitio web para pedir varios datos de una sola vez.", channels: ["webchat"] },
  end:       { label: "Fin", desc: "Termina la conversación.", lana: "Cierra la conversación automática. Puedes poner un mensaje de despedida.", channels: ALL },
};

export function componentsFor(channel: Channel): ComponentKey[] {
  return (Object.keys(COMPONENTS) as ComponentKey[]).filter((k) =>
    COMPONENTS[k].channels.includes(channel)
  );
}
/**
 * Un bloque que ya no existe (por ejemplo, en un flujo guardado hace meses)
 * devuelve `false` en vez de tumbar la pantalla.
 */
export function componentAllowed(channel: Channel, key: string): boolean {
  return COMPONENTS[key as ComponentKey]?.channels.includes(channel) ?? false;
}
