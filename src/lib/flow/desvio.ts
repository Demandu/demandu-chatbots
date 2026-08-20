/**
 * ¿El cliente se salió del flujo?
 *
 * EL PROBLEMA QUE RESUELVE: un flujo es un guion, y la gente no habla en
 * guiones. Hoy, cuando alguien escribe algo que el flujo no esperaba, pasa
 * una de tres cosas, y las tres son malas:
 *
 *   1. El flujo ya terminó → el bot vuelve a arrancar desde el saludo y repite
 *      como perico. (Caso real: "hola" → saludo; "¿para qué sirves?" → el mismo
 *      saludo otra vez.)
 *   2. Hay botones → "No entendí esa respuesta, elige una opción". El cliente
 *      preguntó algo legítimo y se le ignora.
 *   3. El bot pidió un dato → guarda "¿cuánto cuesta?" como si fuera el nombre.
 *
 * LA SOLUCIÓN: que conteste la IA y que el flujo NO se pierda. La IA responde
 * la duda y el flujo se queda esperando exactamente donde estaba, así que en
 * cuanto la persona conteste lo que se le pidió, sigue como si nada.
 *
 * Aquí vive solo la DECISIÓN — pura, se prueba sin red ni base. El envío lo
 * hacen los motores, y los dos usan estas mismas reglas.
 */

/** Por qué se desvía a la IA. Determina qué hacer después de que conteste. */
export type MotivoDesvio =
  | null
  /** El flujo ya no espera nada y la persona sigue escribiendo. */
  | "flujo_terminado"
  /** Hay opciones y escribió otra cosa. Después hay que volver a mostrarlas. */
  | "otra_cosa_en_botones"
  /** Se le pidió un dato y en vez de darlo, preguntó. Hay que volver a pedirlo. */
  | "pregunta_en_captura";

/** Quita acentos y espacios de más, sin depender de la configuración regional. */
function normalizar(t: string): string {
  return String(t ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Palabras con las que arranca una pregunta en español. Se revisan junto al
 * signo de interrogación porque en el chat casi nadie escribe "¿".
 */
const ARRANQUES = [
  "que", "cual", "cuanto", "cuanta", "cuantos", "cuantas", "como", "cuando",
  "donde", "quien", "porque", "por que", "para que", "a que", "de que",
  "tienen", "tienes", "tiene", "hay", "puedo", "puedes", "pueden", "podria",
  "sirve", "sirven", "acepta", "aceptan", "cuesta", "cuestan", "vale", "valen",
  "manejan", "hacen", "haces", "venden", "vendes", "entregan", "envian",
  "me puedes", "se puede", "es posible", "quisiera saber", "necesito saber",
  "info", "informacion", "precio", "precios", "costo", "costos",
];

/**
 * ¿Esto parece una pregunta y no la respuesta a lo que se pidió?
 *
 * Es deliberadamente CONSERVADOR. Equivocarse hacia "es una respuesta" solo
 * guarda un dato raro que el agente puede corregir; equivocarse hacia "es una
 * pregunta" deja a la persona atorada en el mismo paso una y otra vez, que es
 * mucho peor. Ante la duda, se toma como respuesta.
 */
export function pareceUnaPregunta(texto: string): boolean {
  const t = normalizar(texto);
  if (!t) return false;

  // Una sola palabra corta casi siempre es un dato: un nombre, una ciudad, "si".
  const palabras = t.split(" ").filter(Boolean);
  if (palabras.length === 1 && t.length <= 12 && !t.includes("?")) return false;

  if (t.includes("?") || texto.includes("¿")) return true;
  return ARRANQUES.some((a) => t === a || t.startsWith(a + " "));
}

/**
 * Formas de decir que sí, para cuando el bot acaba de ofrecer pasar con una
 * persona.
 *
 * EL PROBLEMA QUE RESUELVE: cuando la IA no sabe algo, el bot dice "esa no me
 * la sé 🙈 ¿Quieres que te comunique con una persona del equipo?". El cliente
 * contesta "sí"… y no pasaba absolutamente nada. La palabra "sí" no está entre
 * los atajos (y no puede estarlo: secuestraría cualquier pregunta de sí/no del
 * flujo). Por eso esto solo se consulta en el turno siguiente a la oferta.
 */
const AFIRMACIONES = new Set([
  "si", "sí", "s", "claro", "ok", "okay", "oki", "va", "vale", "sale", "dale",
  "porfa", "por favor", "porfavor", "obvio", "simon", "andale", "orale",
  "si porfa", "si por favor", "claro que si", "me gustaria", "quiero",
  "si quiero", "adelante", "hazlo", "yes", "yep", "sure",
]);

/**
 * ¿Está aceptando la oferta de pasar con una persona?
 *
 * Conservador a propósito: solo frases cortas y claras. Si alguien contesta
 * "sí, pero antes dime el precio", eso NO es un sí a hablar con un humano —
 * es otra pregunta, y debe seguir contestándola la IA.
 */
export function esAfirmacion(texto: string): boolean {
  const t = normalizar(texto).replace(/[.!¡?¿,]/g, "").trim();
  if (!t || t.split(" ").length > 3) return false;
  return AFIRMACIONES.has(t);
}

export interface EstadoDelTurno {
  /** Qué está esperando el flujo, si algo. */
  esperando: { type: "question" | "buttons"; nodeId: string } | null;
  /** ¿Ese bloque de pregunta guarda la respuesta en una variable? */
  capturaDato: boolean;
  /** ¿El texto coincidió con alguna de las opciones? */
  coincidioBoton: boolean;
  /** ¿El bloque tiene salida por defecto para lo que no coincide? */
  tieneSalidaPorDefecto: boolean;
  /** ¿El flujo ya había terminado antes de este mensaje? */
  flujoTerminado: boolean;
  /** ¿Es el primer mensaje de la conversación? */
  esInicio: boolean;
  /** Lo que escribió la persona. */
  texto: string;
  /** ¿El chatbot tiene la IA de respaldo encendida? */
  iaDeRespaldo: boolean;
}

/**
 * La decisión, en un solo lugar para los dos motores.
 * Devuelve null cuando el flujo debe seguir su curso normal.
 */
export function decidirDesvio(e: EstadoDelTurno): MotivoDesvio {
  if (!e.iaDeRespaldo) return null;
  if (e.esInicio) return null;                 // el saludo siempre lo da el flujo
  if (!String(e.texto ?? "").trim()) return null;

  // 1. Hay opciones y escribió otra cosa. Si el bloque tiene salida por
  //    defecto, el flujo ya sabe qué hacer: no nos metemos.
  if (e.esperando?.type === "buttons") {
    if (e.coincidioBoton || e.tieneSalidaPorDefecto) return null;
    return "otra_cosa_en_botones";
  }

  // 2. Se le pidió un dato y preguntó en vez de contestarlo.
  if (e.esperando?.type === "question") {
    if (!e.capturaDato) return null;           // un bloque de IA ya escucha solo
    return pareceUnaPregunta(e.texto) ? "pregunta_en_captura" : null;
  }

  // 3. El flujo terminó y la persona sigue escribiendo. Sin esto el motor
  //    reinicia el flujo y repite el saludo, que es el fallo que más se nota.
  if (!e.esperando && e.flujoTerminado) return "flujo_terminado";

  return null;
}

/**
 * Cómo se une la respuesta de la IA con lo que el flujo estaba pidiendo.
 * Se devuelve el puente como texto para que los dos motores lo digan igual.
 */
export function puenteDeVuelta(motivo: MotivoDesvio): string {
  switch (motivo) {
    case "otra_cosa_en_botones":
      return "Volviendo a lo anterior 👇";
    case "pregunta_en_captura":
      return "Y volviendo a lo que te preguntaba 👇";
    default:
      return "";
  }
}
