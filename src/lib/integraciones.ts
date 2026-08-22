/**
 * El catálogo de integraciones.
 *
 * LA REGLA DE ESTE ARCHIVO: cada tarjeta dice la VERDAD sobre su estado.
 * BotPenguin enseña integraciones que no funcionan y es de lo que peor sabe
 * cuando lo descubres — se lleva por delante la confianza en todo lo demás,
 * incluido lo que sí funciona. Aquí una integración solo pasa a "disponible"
 * cuando un cliente puede conectarla y usarla el mismo día.
 *
 * SOBRE LOS LOGOS: se usa una placa con el color real de cada marca y su
 * inicial, no un dibujo aproximado del logo. Un logo mal calcado se ve peor que
 * una placa limpia, y además las marcas tienen reglas sobre cómo se usa el suyo.
 * Cuando una integración pase a "disponible" vale la pena dibujarle su logo de
 * verdad, como se hizo con Google Calendar.
 */

export type EstadoIntegracion = "disponible" | "proximamente";

export type Integracion = {
  clave: string;
  nombre: string;
  /** Color oficial de la marca, para la placa. */
  color: string;
  /** Qué se ve en la placa. Una o dos letras. */
  sigla: string;
  categoria: "CRM y datos" | "Inteligencia artificial" | "Cobros" | "Automatización" | "Agenda";
  descripcion: string;
  estado: EstadoIntegracion;
};

export const CATEGORIAS: Integracion["categoria"][] = [
  "CRM y datos",
  "Automatización",
  "Inteligencia artificial",
  "Cobros",
  "Agenda",
];

export const INTEGRACIONES: Integracion[] = [
  // ── Agenda ────────────────────────────────────────────────────────────────
  {
    clave: "google_calendar",
    nombre: "Google Calendar",
    color: "#4285F4",
    sigla: "31",
    categoria: "Agenda",
    descripcion: "El bloque «Agendar cita» crea eventos y consulta tu disponibilidad.",
    estado: "disponible",
  },
  {
    clave: "calendly",
    nombre: "Calendly",
    color: "#006BFF",
    sigla: "C",
    categoria: "Agenda",
    descripcion: "Que el chatbot ofrezca tus horarios de Calendly y agende sin salir del chat.",
    estado: "proximamente",
  },

  // ── CRM y datos ───────────────────────────────────────────────────────────
  {
    clave: "google_sheets",
    nombre: "Google Sheets",
    color: "#0F9D58",
    sigla: "S",
    categoria: "CRM y datos",
    descripcion: "Cada lead nuevo cae solo en una hoja de cálculo tuya.",
    estado: "proximamente",
  },
  {
    clave: "hubspot",
    nombre: "HubSpot",
    color: "#FF7A59",
    sigla: "H",
    categoria: "CRM y datos",
    descripcion: "Sincroniza contactos y negocios con tu HubSpot.",
    estado: "proximamente",
  },
  {
    clave: "salesforce",
    nombre: "Salesforce",
    color: "#00A1E0",
    sigla: "SF",
    categoria: "CRM y datos",
    descripcion: "Manda los leads del chat a Salesforce y trae de vuelta su estado.",
    estado: "proximamente",
  },
  {
    clave: "zoho",
    nombre: "Zoho CRM",
    color: "#E42527",
    sigla: "Z",
    categoria: "CRM y datos",
    descripcion: "Contactos y oportunidades sincronizados con Zoho.",
    estado: "proximamente",
  },

  // ── Automatización ────────────────────────────────────────────────────────
  {
    clave: "zapier",
    nombre: "Zapier",
    color: "#FF4F00",
    sigla: "Z",
    categoria: "Automatización",
    descripcion: "Conecta Demandu con miles de aplicaciones sin programar nada.",
    estado: "proximamente",
  },
  {
    clave: "make",
    nombre: "Make",
    color: "#6D00CC",
    sigla: "M",
    categoria: "Automatización",
    descripcion: "Automatizaciones visuales entre Demandu y el resto de tus herramientas.",
    estado: "proximamente",
  },

  // ── Inteligencia artificial ───────────────────────────────────────────────
  {
    clave: "claude",
    nombre: "Claude",
    color: "#D97757",
    sigla: "C",
    categoria: "Inteligencia artificial",
    descripcion: "El motor que ya usa Lana. Podrás elegirlo o traer tu propia llave.",
    estado: "proximamente",
  },
  {
    clave: "chatgpt",
    nombre: "ChatGPT",
    color: "#10A37F",
    sigla: "G",
    categoria: "Inteligencia artificial",
    descripcion: "Usa los modelos de OpenAI para las respuestas de tu chatbot.",
    estado: "proximamente",
  },
  {
    clave: "gemini",
    nombre: "Gemini",
    color: "#1A73E8",
    sigla: "G",
    categoria: "Inteligencia artificial",
    descripcion: "Los modelos de Google como motor de tu chatbot.",
    estado: "proximamente",
  },
  {
    clave: "deepseek",
    nombre: "DeepSeek",
    color: "#4D6BFE",
    sigla: "D",
    categoria: "Inteligencia artificial",
    descripcion: "Una opción más barata por conversación para volúmenes altos.",
    estado: "proximamente",
  },

  // ── Cobros ────────────────────────────────────────────────────────────────
  {
    clave: "mercado_pago",
    nombre: "Mercado Pago",
    color: "#00B1EA",
    sigla: "MP",
    categoria: "Cobros",
    descripcion: "Cobra dentro de la conversación de WhatsApp.",
    estado: "proximamente",
  },
  {
    clave: "yappy",
    nombre: "Yappy",
    color: "#00A6A0",
    sigla: "Y",
    categoria: "Cobros",
    descripcion: "Cobros por Yappy desde el chat, para clientes en Panamá.",
    estado: "proximamente",
  },
];

export function integracionesPorCategoria() {
  return CATEGORIAS.map((c) => ({
    categoria: c,
    items: INTEGRACIONES.filter((i) => i.categoria === c),
  })).filter((g) => g.items.length);
}
