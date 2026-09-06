import { normalizar } from "@/lib/flow/shortcuts";
import type { Origen } from "@/lib/flow/origenes";

/**
 * QUÉ FLUJO CONTESTA A ESTO QUE LLEGÓ DE INSTAGRAM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA. Hasta hoy CUALQUIER comentario caía en «el flujo que coincida por
 * palabra clave», viniera de un reel, de una historia o de un directo. Un
 * negocio no habla igual en los tres: en el reel de una promoción quiere soltar
 * el código exacto; en un comentario suelto quiere conversar.
 *
 * Y lo peor: la plataforma YA GUARDABA de dónde escucha cada flujo. La
 * migración 0033 añadió `origen`, `publicacion`, `respuesta_publica` y
 * `una_por_persona`, y el constructor lleva semanas dejando configurarlos. El
 * webhook no leía ninguno de los cuatro. El negocio elegía «comentario en un
 * reel», guardaba, lo veía guardado, y su flujo se activaba igual desde un
 * mensaje directo.
 *
 * Mismo patrón que las tres herramientas de la tienda que nadie tenía: no
 * fallaba nada, simplemente no hacía lo que decía.
 *
 * ── UN FLUJO CON SU DISPARADOR *ES* LA REGLA ──────────────────────────────
 *
 * No hay una tabla de reglas aparte, y es a propósito. Una regla que elige un
 * flujo y un flujo son la misma cosa contada dos veces: con dos tablas hay que
 * mantenerlas sincronizadas, y la pantalla tendría que enseñar las dos.
 *
 * ── ARCHIVO CASI PURO ─────────────────────────────────────────────────────
 *
 * Solo importa `normalizar`, que ya se usa para los atajos del chat. Escribir
 * aquí otra forma de quitar tildes y mayúsculas sería garantizar que un día
 * «PROMOCIÓN» coincida en un sitio y no en el otro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Una fila de `flows`, con lo que hace falta para elegirla. */
export type FlujoConDisparador = {
  id: string;
  enabled?: boolean | null;
  /** De dónde escucha. Ver `origenes.ts`. */
  origen?: string | null;
  /** Una publicación concreta. Vacío = todas las de esa superficie. */
  publicacion?: string | null;
  /** Vacío = cualquier texto vale. Con palabras, tiene que traer alguna. */
  keywords?: string[] | null;
  /** A igualdad de especificidad, manda el que el negocio puso antes. */
  priority?: number | null;
  respuesta_publica?: string | null;
  una_por_persona?: boolean | null;
};

/** Lo que hace falta saber del evento para elegir. */
export type LoQueLlego = {
  tipo?: string | null;
  tipoDeMedia?: string | null;
  mediaId?: string | null;
  texto?: string | null;
};

/**
 * De qué superficie viene esto.
 *
 * `media_product_type` lo manda Meta y vale `FEED`, `REELS`, `STORY` o `AD`.
 * UN ANUNCIO ES UNA PUBLICACIÓN a efectos de contestarlo: el negocio no piensa
 * «esto es un AD», piensa «comentaron mi post». Tratarlo aparte obligaría a
 * configurar dos veces lo mismo para que su publicidad conteste igual.
 */
export function superficieDe(e: LoQueLlego | null | undefined): Origen | null {
  const t = String(e?.tipo ?? "");
  const media = String(e?.tipoDeMedia ?? "").toUpperCase();

  if (t === "dm") return "dm";
  if (t === "respuesta_historia") return "story_reply";
  if (t === "mencion_historia" || t === "mencion") return "story_mention";
  if (t === "comentario_vivo") return "live";
  if (t === "comentario") {
    if (media === "REELS") return "reel";
    if (media === "STORY") return "story_reply";
    return "post";
  }
  return null;
}

/**
 * ¿El texto trae alguna de las palabras? Vacío = cualquiera vale.
 *
 * POR SUBCADENA, NO POR PALABRA ENTERA. Quien comenta una promo escribe
 * «PROMO!!!», «promo?» o «yo quiero la promo» — pedirle la palabra aislada
 * dejaría fuera a la mayoría, y una promoción que no contesta a la mitad de la
 * gente es peor que no tenerla.
 */
export function coincidenLasPalabras(palabras: string[] | null | undefined, texto: string): boolean {
  const lista = (palabras ?? []).map((p) => normalizar(String(p ?? ""))).filter(Boolean);
  if (!lista.length) return true;

  const t = normalizar(texto ?? "");
  if (!t) return false;

  return lista.some((p) => t.includes(p));
}

/**
 * Qué flujo contesta a esto.
 *
 * ── GANA EL MÁS ESPECÍFICO, Y ESO NO ES UN DETALLE ────────────────────────
 *
 * Un negocio pone un flujo general para todos sus reels y otro para EL reel de
 * la promoción de esta semana. Si ganara cualquiera de los dos, la promoción
 * saldría o no según el orden en que se guardaron — y el dueño no tendría forma
 * de saber por qué a veces sale y a veces no.
 *
 * El orden es: publicación concreta + palabras · publicación concreta ·
 * palabras · general. Y a igualdad, la prioridad que el negocio puso, que es lo
 * único que él controla.
 */
export function reglaQueAplica<T extends FlujoConDisparador>(
  flujos: T[] | null | undefined,
  e: LoQueLlego | null | undefined,
): T | null {
  const superficie = superficieDe(e);
  if (!superficie) return null;

  const media = String(e?.mediaId ?? "");
  const texto = String(e?.texto ?? "");

  const candidatos = (flujos ?? []).filter((f) => {
    if (f.enabled === false) return false;

    // UN FLUJO SIN ORIGEN ESCUCHA MENSAJES DIRECTOS. Es el valor por defecto de
    // la columna y el comportamiento de todos los flujos que ya existían: no
    // pueden empezar a contestar comentarios por haberse añadido esta regla.
    if (String(f.origen ?? "dm") !== superficie) return false;

    // UN FLUJO DE UNA PUBLICACIÓN CONCRETA NO SE APLICA A OTRA. Sin esto, la
    // promoción de un reel contestaría en todos los demás.
    const suya = String(f.publicacion ?? "").trim();
    if (suya && suya !== media) return false;

    return coincidenLasPalabras(f.keywords, texto);
  });

  if (!candidatos.length) return null;

  const peso = (f: T) =>
    (String(f.publicacion ?? "").trim() ? 2 : 0) + ((f.keywords ?? []).length ? 1 : 0);

  return [...candidatos].sort((a, b) => {
    const d = peso(b) - peso(a);
    if (d !== 0) return d;
    return (a.priority ?? 0) - (b.priority ?? 0);
  })[0];
}

/**
 * Dónde se contesta.
 *
 * ── EN PRIVADO SIEMPRE; EN PÚBLICO SOLO SI HAY QUÉ DECIR Y DÓNDE ──────────
 *
 * A una respuesta de historia o a un mensaje directo no se les puede contestar
 * «en público» porque no hay público. Y sin texto en `respuesta_publica` no hay
 * nada que publicar: mandar algo genérico en el comentario de alguien es peor
 * que no contestar, porque lo ve todo el mundo.
 */
export const TIENE_COMENTARIO_PUBLICO: Origen[] = ["post", "reel", "live"];

export function dondeContestar(
  flujo: FlujoConDisparador | null | undefined,
  superficie: Origen | null,
): { publico: boolean; privado: boolean } {
  const hayDonde = !!superficie && TIENE_COMENTARIO_PUBLICO.includes(superficie);
  const hayQue = !!String(flujo?.respuesta_publica ?? "").trim();
  return { publico: hayDonde && hayQue, privado: true };
}

/**
 * ¿Se le puede escribir en privado a esta persona por esta publicación?
 *
 * `una_por_persona` lleva semanas guardándose y no se miraba nunca: quien
 * comentaba tres veces el mismo reel recibía tres mensajes privados. Eso no es
 * insistencia, es lo que hace que alguien te silencie.
 *
 * Encendido por omisión —y por eso se compara con `!== false`— porque es lo que
 * casi todo el mundo quiere y los flujos de antes no tienen el campo.
 */
export function puedeEscribirEnPrivado(
  flujo: FlujoConDisparador | null | undefined,
  yaLeEscribimos: boolean,
): boolean {
  if (flujo?.una_por_persona === false) return true;
  return !yaLeEscribimos;
}
