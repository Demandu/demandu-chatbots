import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Salud de la cuenta de Meta de cada cliente.
 *
 * PARA QUÉ SIRVE ESTO DE VERDAD: Meta no avisa antes de bloquear un número.
 * Lo que sí hace es bajarle la calificación de calidad primero — verde,
 * amarillo, rojo — y ese semáforo va por delante del problema. Un cliente en
 * amarillo tiene arreglo (mandar menos, mejores plantillas, no escribir a
 * quien no pidió nada). Un cliente en rojo bloqueado ya no.
 *
 * Adelantarse a eso es la diferencia entre una llamada de «oye, ojo con esto»
 * y una de «se me cayó el WhatsApp del negocio».
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const LIMITE_MS = 10000;

export type SaludMeta = {
  org_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
  numero: string | null;
  nombre_para_mostrar: string | null;
  calidad: string | null;
  limite_envio: string | null;
  estado_numero: string | null;
  estado_revision: string | null;
  verificacion_negocio: string | null;
  plantillas_total: number | null;
  plantillas_rechazadas: number | null;
  riesgo: number | null;
  motivos: string[];
  crudo: any;
  error: string | null;
};

/** Los nombres de Meta, en cristiano. */
export const CALIDAD: Record<string, { texto: string; tono: "bien" | "ojo" | "mal" }> = {
  GREEN: { texto: "Verde", tono: "bien" },
  YELLOW: { texto: "Amarillo", tono: "ojo" },
  RED: { texto: "Rojo", tono: "mal" },
  UNKNOWN: { texto: "Sin datos", tono: "ojo" },
};

export const LIMITE: Record<string, string> = {
  TIER_50: "50 al día",
  TIER_250: "250 al día",
  TIER_1K: "1.000 al día",
  TIER_10K: "10.000 al día",
  TIER_100K: "100.000 al día",
  TIER_UNLIMITED: "Sin límite",
  UNLIMITED: "Sin límite",
};

/**
 * Cuánto riesgo corre esta cuenta, de 0 a 100.
 *
 * NO ES UN NÚMERO DE META: es nuestro, y está calibrado para que ordenar por
 * él ponga arriba a quien hay que llamar hoy. Los pesos salen de qué tan cerca
 * está cada señal de un bloqueo real, no de qué tan fácil es de medir.
 */
function calcularRiesgo(d: Partial<SaludMeta>): { riesgo: number; motivos: string[] } {
  const motivos: string[] = [];
  let r = 0;

  if (d.calidad === "RED") {
    r += 60;
    motivos.push("Meta le bajó la calidad a ROJO: está a un paso de que le limiten o bloqueen el número");
  } else if (d.calidad === "YELLOW") {
    r += 30;
    motivos.push("Calidad en AMARILLO: le están marcando mensajes como no deseados");
  }

  if (d.estado_numero && !["APPROVED", "AVAILABLE_WITHOUT_REVIEW"].includes(d.estado_numero)) {
    r += 20;
    motivos.push(`El nombre para mostrar no está aprobado (${d.estado_numero})`);
  }

  if (d.estado_revision && d.estado_revision !== "APPROVED") {
    r += 25;
    motivos.push(`La cuenta de WhatsApp no está aprobada por Meta (${d.estado_revision})`);
  }

  if (d.verificacion_negocio && d.verificacion_negocio !== "verified") {
    r += 10;
    motivos.push("El negocio no está verificado en Meta: le limita el volumen y las funciones");
  }

  const total = d.plantillas_total ?? 0;
  const rechazadas = d.plantillas_rechazadas ?? 0;
  // El umbral es 3 y no 1 a propósito: a todo el mundo le rechazan alguna
  // mientras aprende. Un patrón de rechazos es otra cosa — Meta lo lee como
  // que el negocio insiste en mandar lo que no debe.
  if (rechazadas >= 3 && total > 0 && rechazadas / total > 0.3) {
    r += 15;
    motivos.push(`${rechazadas} de ${total} plantillas rechazadas: Meta lo toma como mala señal`);
  }

  if (d.limite_envio === "TIER_250" || d.limite_envio === "TIER_50") {
    // Informativo, no riesgo: casi toda cuenta nueva empieza aquí y sube sola.
    motivos.push("Cuenta nueva: Meta todavía le tiene un límite bajo de envío. Sube solo con buen uso.");
  }

  return { riesgo: Math.min(100, r), motivos };
}

async function graph(url: string, token: string, señal: AbortSignal): Promise<any> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: señal, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? `Meta contestó ${r.status}`);
  return j;
}

/** ¿El error es «ese campo no existe» y no un problema de verdad? */
function esCampoInexistente(e: any): boolean {
  return /nonexistent field|does not exist|Unsupported get request|invalid.*field/i.test(String(e?.message ?? ""));
}

/**
 * Pide unos campos y, si Meta se queja de alguno, reintenta con los seguros.
 *
 * META RECHAZA LA PETICIÓN ENTERA SI UN SOLO CAMPO NO EXISTE. No devuelve el
 * resto sin ese campo: devuelve un error y nada más. Y sus campos cambian
 * entre versiones y hay algunos en beta que aparecen y desaparecen.
 *
 * Sin este reintento, el día que Meta retire un campo el tablero pasaría de
 * golpe a decir «error» en TODOS los clientes a la vez — que es exactamente
 * cuando más falta hace que funcione. Mejor perder una columna que perderlo
 * todo.
 */
async function graphDegradando(
  base: string,
  deseados: string[],
  seguros: string[],
  token: string,
  señal: AbortSignal,
): Promise<{ datos: any; campos: "completos" | "reducidos" }> {
  try {
    return { datos: await graph(`${base}?fields=${deseados.join(",")}`, token, señal), campos: "completos" };
  } catch (e) {
    if (!esCampoInexistente(e)) throw e;
    return { datos: await graph(`${base}?fields=${seguros.join(",")}`, token, señal), campos: "reducidos" };
  }
}

/** Mide una cuenta. Nunca lanza: devuelve el error dentro del resultado. */
export async function medirCliente(canal: {
  org_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
  access_token: string | null;
}): Promise<SaludMeta> {
  const base: SaludMeta = {
    org_id: canal.org_id,
    waba_id: canal.waba_id,
    phone_number_id: canal.phone_number_id,
    numero: null, nombre_para_mostrar: null, calidad: null, limite_envio: null,
    estado_numero: null, estado_revision: null, verificacion_negocio: null,
    plantillas_total: null, plantillas_rechazadas: null,
    riesgo: null, motivos: [], crudo: null, error: null,
  };

  if (!canal.waba_id || !canal.access_token) {
    return { ...base, error: "Este cliente todavía no tiene WhatsApp conectado" };
  }

  const ctl = new AbortController();
  const reloj = setTimeout(() => ctl.abort(), LIMITE_MS);

  try {
    // Los «seguros» son los que la documentación de Meta confirma hoy. Los
    // «deseados» añaden los que valen la pena pero no están garantizados
    // —`account_review_status` y `messaging_limit_tier` no aparecen en la
    // referencia actual— así que se piden con red debajo.
    const [cuenta, numeros] = await Promise.all([
      graphDegradando(
        `${GRAPH}/${canal.waba_id}`,
        ["name", "account_review_status", "business_verification_status"],
        ["name", "business_verification_status"],
        canal.access_token,
        ctl.signal,
      ),
      graphDegradando(
        `${GRAPH}/${canal.waba_id}/phone_numbers`,
        ["display_phone_number", "verified_name", "quality_rating", "name_status", "messaging_limit_tier", "status"],
        ["display_phone_number", "verified_name", "quality_rating", "status"],
        canal.access_token,
        ctl.signal,
      ),
    ]);

    // Se busca el número que tenemos conectado; si no aparece, se toma el
    // primero. Un cliente puede tener varios en su WABA y quedarse con el
    // primero a ciegas mostraría la calidad de un número que no usamos.
    const lista: any[] = numeros.datos?.data ?? [];
    const n = lista.find((x) => x.id === canal.phone_number_id) ?? lista[0] ?? {};
    const c = cuenta.datos ?? {};

    const { data: plantillas } = await createAdminClient()
      .from("whatsapp_templates")
      .select("status")
      .eq("org_id", canal.org_id);

    const ps = (plantillas as any[]) ?? [];
    const total = ps.length;
    const rechazadas = ps.filter((p) => String(p.status ?? "").toUpperCase() === "REJECTED").length;

    const medido: SaludMeta = {
      ...base,
      numero: n.display_phone_number ?? null,
      nombre_para_mostrar: n.verified_name ?? c.name ?? null,
      calidad: n.quality_rating ?? null,
      limite_envio: n.messaging_limit_tier ?? null,
      estado_numero: n.name_status ?? null,
      estado_revision: c.account_review_status ?? null,
      verificacion_negocio: c.business_verification_status ?? null,
      plantillas_total: total,
      plantillas_rechazadas: rechazadas,
      // Se guarda tal cual lo manda Meta, incluido si hubo que pedir menos
      // campos: el día que una columna salga vacía en todos los clientes a la
      // vez, aquí está la razón sin tener que adivinarla.
      crudo: { cuenta: c, numero: n, campos: { cuenta: cuenta.campos, numeros: numeros.campos } },
      error: null,
    };

    const { riesgo, motivos } = calcularRiesgo(medido);
    return { ...medido, riesgo, motivos };
  } catch (e: any) {
    // UN FALLO DE MEDICIÓN NO ES UNA CUENTA SANA. Se guarda el error y el
    // riesgo queda en null, que la pantalla pinta en gris. Un token caducado
    // que se leyera como «todo bien» es justo el problema que este tablero
    // existe para evitar.
    return {
      ...base,
      error: e?.name === "AbortError" ? "Meta no contestó a tiempo" : e?.message ?? "No se pudo consultar a Meta",
    };
  } finally {
    clearTimeout(reloj);
  }
}

/** Mide a todos los clientes con WhatsApp conectado y guarda el resultado. */
export async function revisarMeta(): Promise<{ medidos: number; conError: number }> {
  const admin = createAdminClient();

  const { data: canales } = await admin
    .from("whatsapp_channels")
    .select("org_id, waba_id, phone_number_id, access_token");

  const lista = ((canales as any[]) ?? []).filter((c) => c.org_id);
  if (!lista.length) return { medidos: 0, conError: 0 };

  // De cinco en cinco. Meta corta por exceso de peticiones, y con cien
  // clientes lanzarlas todas de golpe es la forma más rápida de que nos
  // bloquee justo la API de la que depende todo el producto.
  const resultados: SaludMeta[] = [];
  for (let i = 0; i < lista.length; i += 5) {
    resultados.push(...(await Promise.all(lista.slice(i, i + 5).map(medirCliente))));
  }

  const ahora = new Date().toISOString();
  await admin.from("meta_salud").upsert(
    resultados.map((r) => ({ ...r, medido_at: ahora })),
    { onConflict: "org_id" },
  );

  return { medidos: resultados.length, conError: resultados.filter((r) => r.error).length };
}
