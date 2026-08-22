/**
 * De dónde escucha una conversación automática.
 *
 * DOS PREGUNTAS DISTINTAS, DOS CAMPOS. `trigger_type` responde CUÁNDO se activa
 * (bienvenida, palabra clave, cliente que vuelve). `origen` responde DÓNDE
 * escucha. Se combinan: "palabra clave" + "comentario en un reel".
 *
 * Meterlo todo en un solo campo habría obligado a duplicar la lógica de
 * palabras clave para cada sitio del que puede venir un mensaje — y esa lógica
 * ya existe, funciona y está probada desde hace meses.
 */

export type Origen = "dm" | "post" | "reel" | "story_reply" | "story_mention";

export const ORIGENES: {
  valor: Origen;
  label: string;
  desc: string;
  /** Canales donde tiene sentido ofrecerlo. */
  canales: string[];
  /** Si pide indicar una publicación concreta. */
  pidePublicacion?: boolean;
  /** Si permite contestar también en público, a la vista de todos. */
  admitePublica?: boolean;
}[] = [
  {
    valor: "dm",
    label: "Mensaje directo",
    desc: "Cuando te escriben por privado. Es lo de siempre.",
    canales: ["whatsapp", "instagram", "messenger", "webchat"],
  },
  {
    valor: "post",
    label: "Comentario en una publicación",
    desc: "Alguien comenta tu post. Le contestas por privado y, si quieres, también en el comentario.",
    canales: ["instagram", "messenger"],
    pidePublicacion: true,
    admitePublica: true,
  },
  {
    valor: "reel",
    label: "Comentario en un reel",
    desc: "Igual que el anterior, pero en reels. Es donde más funciona el «comenta X y te mando el enlace».",
    canales: ["instagram"],
    pidePublicacion: true,
    admitePublica: true,
  },
  {
    valor: "story_reply",
    label: "Respuesta a una historia",
    desc: "Alguien contesta a tu historia. La respuesta llega como mensaje directo.",
    canales: ["instagram"],
  },
  {
    valor: "story_mention",
    label: "Mención en una historia",
    desc: "Alguien te menciona en su historia. Sirve para agradecer o premiar a quien te comparte.",
    canales: ["instagram"],
  },
];

export function origenPara(canal: string) {
  return ORIGENES.filter((o) => o.canales.includes(canal));
}

export function infoOrigen(valor: string | null | undefined) {
  return ORIGENES.find((o) => o.valor === (valor ?? "dm")) ?? ORIGENES[0];
}

/**
 * Meta solo deja mandar UNA respuesta privada por comentario, y dentro de una
 * ventana de unos 7 días. No es una recomendación nuestra: es un rechazo del
 * lado de ellos, así que el flujo no puede reintentar a lo bruto.
 */
export const AVISO_RESPUESTA_PRIVADA =
  "Instagram solo permite un mensaje privado por comentario, y dentro de los 7 días siguientes. Pasado ese plazo, Meta lo rechaza.";
