import type { Flow } from "./types";

/** Flujo de ventas de ejemplo (Tienda Demo). */
export const sampleFlow: Flow = {
  id: "sample-sales",
  name: "Flujo de Ventas · Tienda Demo",
  nodes: [
    { id: "start", type: "start", position: { x: 40, y: 40 }, data: { label: "Cliente escribe", text: "Se activa cuando llega un mensaje nuevo.", to: "welcome" } },
    { id: "welcome", type: "message", position: { x: 40, y: 220 }, data: { label: "Bienvenida", text: "¡Hola! 👋 Soy *Lana*, la asistente de Tienda Demo. ¿Cómo puedo ayudarte hoy?", to: "menu" } },
    {
      id: "menu", type: "buttons", position: { x: 40, y: 400 },
      data: {
        label: "Menú principal", text: "Elige una opción para empezar:",
        buttons: [
          { id: "b1", label: "🛍️ Ver productos", to: "products" },
          { id: "b2", label: "📦 Hacer un pedido", to: "order" },
          { id: "b3", label: "🎧 Hablar con un asesor", to: "human" },
        ],
      },
    },
    { id: "products", type: "message", position: { x: 420, y: 340 }, data: { label: "Catálogo", text: "¡Genial! Estos son nuestros más vendidos ✨\n\n1. Kit Skincare — $499\n2. Serum Vitamina C — $329\n3. Bloqueador SPF50 — $259", to: "qualify" } },
    { id: "qualify", type: "ai", position: { x: 420, y: 560 }, data: { label: "Califica con IA", text: "Lana entiende la intención y recomienda el producto ideal.", aiProvider: "demandu", systemPrompt: "Eres Lana, asistente de ventas amable de Tienda Demo. Recomienda productos y cierra ventas.", to: "order" } },
    { id: "order", type: "question", position: { x: 800, y: 460 }, data: { label: "Datos del pedido", text: "Perfecto 🙌 ¿A qué nombre y dirección envío tu pedido?", variable: "@datos_envio", dataType: "text", to: "schedule" } },
    { id: "schedule", type: "calendar", position: { x: 800, y: 660 }, data: { label: "Agenda entrega", text: "Listo ✅ Tu pedido está confirmado. Agendé la entrega para mañana entre 10:00 y 12:00.", calendarId: "ventas@tiendademo.com", durationMin: 30, to: "end" } },
    { id: "human", type: "human", position: { x: 120, y: 640 }, data: { label: "Asesor humano", text: "Te comunico con un asesor de nuestro equipo. En un momento te atienden 👩‍💼", team: "Ventas" } },
    { id: "end", type: "end", position: { x: 520, y: 880 }, data: { label: "Fin", text: "Conversación cerrada. ¡Gracias por escribir! 💖" } },
  ],
  edges: [
    { id: "e-start", source: "start", target: "welcome" },
    { id: "e-welcome", source: "welcome", target: "menu" },
    { id: "e-b1", source: "menu", target: "products", sourceHandle: "b1", label: "Ver productos" },
    { id: "e-b2", source: "menu", target: "order", sourceHandle: "b2", label: "Hacer un pedido" },
    { id: "e-b3", source: "menu", target: "human", sourceHandle: "b3", label: "Asesor" },
    { id: "e-products", source: "products", target: "qualify" },
    { id: "e-qualify", source: "qualify", target: "order" },
    { id: "e-order", source: "order", target: "schedule" },
    { id: "e-schedule", source: "schedule", target: "end" },
  ],
};
