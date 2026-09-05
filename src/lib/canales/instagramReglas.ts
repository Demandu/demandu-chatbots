import { normalizar } from "@/lib/flow/shortcuts";

/**
 * Las reglas de respuesta automática de Instagram.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ RESUELVE. Hasta ahora, CUALQUIER comentario caía en «el flujo que
 * coincida por palabra clave», viniera de un reel, de una historia o de un
 * directo. Un negocio no habla igual en los tres: en un reel de promoción
 * quiere soltar el código exacto; en un comentario suelto quiere conversar.
 *
 * ── LOS TRES MODOS, Y POR QUÉ NO SOLO IA ──────────────────────────────────
 *
 * La competencia deja elegir entre IA y flujo. Para una PROMOCIÓN eso es un
 * error: si alguien comenta «PROMO» hay que soltar el mensaje exacto con las
 * condiciones exactas. Una IA que parafrasea puede inventarse un descuento o
 * una fecha límite, y eso es un problema legal, no un fallo de redacción.
 *
 *   mensaje → texto fijo. Para promociones y códigos.
 *   flujo   → una secuencia. Para calificar o vender paso a paso.
 *   agente  → conversación abierta con su personalidad y su entrenamiento.
 *
 * ── ARCHIVO CASI PURO ─────────────────────────────────────────────────────
 *
 * Solo importa `normalizar`, que ya se usa para los atajos del chat. Escribir
 * aquí otra forma de quitar tildes y mayúsculas sería garantizar que un día
 * «PROMOCIÓN» coincida en un sitio y no en el otro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Dónde ocurrió. Es lo que el negocio elige al crear la regla. */
export type Superficie = "dm" | "post" | "reel" | "live" | "historia" | "mencion";

export const SUPERFICIES: { clave: Superficie; nombre: string; desc: string }[] = [
  { clave: "post",     nombre: "Publicaciones", desc: "Comentarios en tus fotos y carruseles." },
  { clave: "reel",     nombre: "Reels",         desc: "Comentarios en tus reels." },
  { clave: "historia", nombre: "Historias",     desc: "Cuando alguien responde a tu historia." },
  { clave: "live",     nombre: "En vivo",       desc: "Comentarios durante una transmisión." },
  { clave: "mencion",  nombre: "Menciones",     desc: "Cuando te mencionan o comparten tu historia." },
  { clave: "dm",       nombre: "Mensajes directos", desc: "Cuando te escriben por privado." },
];

/** Solo en los comentarios se puede contestar en público. */
export const TIENE_COMENTARIO_PUBLICO: Superficie[] = ["post", "reel", "live"];

export type ReglaIg = {
  id: string;
  activa?: boolean | null;
  superficie: string;
  /** "todo" o "media": una publicación concreta. */
  alcance?: string | null;
  media_id?: string | null;
  /** Vacío = cualquier comentario. Con palabras, tiene que traer alguna. */
  palabras?: string[] | null;
  modo: string;
  mensaje?: string | null;
  flujo_id?: string | null;
  agente_id?: string | null;
  responder_en?: string | null;
  cta_texto?: string | null;
  cta_url?: string | null;
  orden?: number | null;
};

/**
 * De qué superficie viene este evento.
 *
 * `media_product_type` lo manda Meta y vale `FEED`, `REELS`, `STORY` o `AD`.
 * Un anuncio es una publicación a efectos de contestarlo: el negocio no piensa
 * «esto es un AD», piensa «comentaron mi post».
 */
export function superficieDe(e: {
  tipo?: string | null;
  tipoDeMedia?: string | null;
}): Superficie | null {
  const t = String(e?.tipo ?? "");
  const media = String(e?.tipoDeMedia ?? "").toUpperCase();

  if (t === "dm") return "dm";
  if (t === "respuesta_historia") return "historia";
  if (t === "mencion_historia" || t === "mencion") return "mencion";
  if (t === "comentario_vivo") return "live";
  if (t === "comentario") {
    if (media === "REELS") return "reel";
    if (media === "STORY") return "historia";
    // FEED, AD, o vacío: para el negocio es «mi publicación».
    return "post";
  }
  return null;
}

/** ¿El texto trae alguna de las palabras? Vacío = cualquiera vale. */
export function coincidenLasPalabras(palabras: string[] | null | undefined, texto: string): boolean {
  const lista = (palabras ?? []).map((p) => normalizar(String(p ?? ""))).filter(Boolean);
  if (!lista.length) return true;

  const t = normalizar(texto ?? "");
  if (!t) return false;

  // POR SUBCADENA, NO POR PALABRA ENTERA. Quien comenta una promo escribe
  // «PROMO!!!», «promo?» o «yo quiero la promo» — pedirle la palabra aislada
  // dejaría fuera a la mayoría, y una promoción que no responde a la mitad de
  // la gente es peor que no tenerla.
  return lista.some((p) => t.includes(p));
}

/**
 * Qué regla contesta a esto.
 *
 * ── GANA LA MÁS ESPECÍFICA, Y ESO NO ES UN DETALLE ────────────────────────
 *
 * Un negocio pone una regla general para todos sus reels y otra para EL reel de
 * la promoción de esta semana. Si ganara cualquiera de las dos, la promoción
 * saldría o no según el orden en que se guardaron — y el dueño no tiene forma
 * de saber por qué a veces sale y a veces no.
 *
 * El orden es: publicación concreta + palabras · publicación concreta ·
 * palabras · general. Y a igualdad, la que el negocio haya puesto antes
 * (`orden`), que es lo único que él controla.
 */
export function reglaQueAplica(
  reglas: ReglaIg[] | null | undefined,
  ctx: { superficie: Superficie | null; mediaId?: string | null; texto?: string | null },
): ReglaIg | null {
  if (!ctx.superficie) return null;

  const media = String(ctx.mediaId ?? "");
  const texto = String(ctx.texto ?? "");

  const candidatas = (reglas ?? []).filter((r) => {
    if (r.activa === false) return false;
    if (r.superficie !== ctx.superficie) return false;

    // UNA REGLA DE UNA PUBLICACIÓN CONCRETA NO SE APLICA A OTRA. Sin esto, la
    // promoción de un reel contestaría en todos los demás.
    if (r.alcance === "media") {
      if (!media || String(r.media_id ?? "") !== media) return false;
    }

    return coincidenLasPalabras(r.palabras, texto);
  });

  if (!candidatas.length) return null;

  const peso = (r: ReglaIg) =>
    (r.alcance === "media" ? 2 : 0) + ((r.palabras ?? []).length ? 1 : 0);

  return [...candidatas].sort((a, b) => {
    const d = peso(b) - peso(a);
    if (d !== 0) return d;
    return (a.orden ?? 0) - (b.orden ?? 0);
  })[0];
}

/**
 * Dónde se contesta.
 *
 * EN LAS SUPERFICIES SIN COMENTARIO PÚBLICO SIEMPRE ES PRIVADO, diga lo que
 * diga la regla: a una respuesta de historia o a un DM no se le puede contestar
 * «en público» porque no hay público. Guardar la intención está bien; obedecerla
 * a ciegas haría que la respuesta no saliera por ningún lado.
 */
export function dondeContestar(
  regla: ReglaIg | null | undefined,
  superficie: Superficie | null,
): { publico: boolean; privado: boolean } {
  if (!superficie || !TIENE_COMENTARIO_PUBLICO.includes(superficie)) {
    return { publico: false, privado: true };
  }
  const donde = String(regla?.responder_en ?? "privado");
  if (donde === "comentario") return { publico: true, privado: false };
  if (donde === "ambos") return { publico: true, privado: true };
  return { publico: false, privado: true };
}
