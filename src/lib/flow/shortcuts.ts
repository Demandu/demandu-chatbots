/**
 * Atajos del chatbot: palabras o números que el cliente final puede escribir
 * en cualquier momento para reiniciar la conversación o pedir una persona.
 *
 * Se comprueban ANTES que cualquier otra cosa del flujo, así funcionan aunque
 * el bot esté esperando una respuesta a media conversación.
 */

export type Atajo = {
  enabled: boolean;
  /** Palabras exactas que activan el atajo (sin distinguir mayúsculas ni acentos) */
  words: string[];
  /** Lo que responde el bot al activarse */
  reply: string;
};

export type Atajos = {
  reset: Atajo;
  agent: Atajo;
  hint: {
    enabled: boolean;
    /** Texto recordatorio, ej: 'Escribe 0 para reiniciar o 1 para hablar con una persona' */
    text: string;
    /** Mostrarlo al empezar la conversación */
    onStart: boolean;
    /** Mostrarlo debajo de cada menú de opciones */
    onOptions: boolean;
  };
};

export const ATAJOS_DEFAULT: Atajos = {
  reset: {
    enabled: true,
    words: ["0", "menu", "menú", "reiniciar", "inicio"],
    reply: "Listo, empezamos de nuevo 🔄",
  },
  agent: {
    enabled: true,
    words: ["1", "asesor", "agente", "humano", "persona"],
    reply: "Enseguida te atiende una persona del equipo 🙌 Dame un momento.",
  },
  hint: {
    enabled: true,
    text: 'Escribe *0* para volver al inicio o *1* para hablar con una persona.',
    onStart: true,
    onOptions: false,
  },
};

/** Une lo guardado con los valores por defecto, sin perder nada. */
export function leerAtajos(raw: any): Atajos {
  const a = (raw ?? {}) as Partial<Atajos>;
  return {
    reset: { ...ATAJOS_DEFAULT.reset, ...(a.reset ?? {}) },
    agent: { ...ATAJOS_DEFAULT.agent, ...(a.agent ?? {}) },
    hint: { ...ATAJOS_DEFAULT.hint, ...(a.hint ?? {}) },
  };
}

/**
 * Quita acentos, mayúsculas, espacios de sobra y signos sueltos.
 * Los signos se limpian al PRINCIPIO y al final: en español la gente
 * escribe "¡0!" o "¿1?" y eso debe activar el atajo igual.
 */
export function normalizar(t: string): string {
  return String(t ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^[¡!¿?.,;:\s]+/g, "")
    .replace(/[¡!¿?.,;:\s]+$/g, "")
    .replace(/\s+/g, " ");
}

/**
 * ¿El mensaje activa un atajo? Solo coincidencia EXACTA con la palabra
 * configurada: si alguien escribe "quiero 1 pizza" no debe saltar al agente.
 */
export function detectarAtajo(texto: string, atajos: Atajos): "reset" | "agent" | null {
  const t = normalizar(texto);
  if (!t) return null;
  const coincide = (a: Atajo) =>
    a.enabled && (a.words ?? []).some((w) => w && normalizar(w) === t);
  if (coincide(atajos.agent)) return "agent";
  if (coincide(atajos.reset)) return "reset";
  return null;
}
