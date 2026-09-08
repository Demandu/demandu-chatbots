/**
 * BUSCAR UNA DIRECCIÓN Y SACAR SU PUNTO EN EL MAPA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ PROBLEMA RESUELVE, QUE NO ES «QUEDA BONITO».
 *
 * ASAP no acepta «PH Pijao, apto 12B»: exige cuatro números. Y en Panamá media
 * ciudad no tiene nomenclatura, así que esos números no se pueden deducir de la
 * dirección escrita. Hasta ahora la única forma de conseguirlos era pedirle al
 * cliente que mandara su ubicación por WhatsApp, o que abriera Google Maps y
 * copiara dos números a mano. Los dos caminos se pierden gente.
 *
 * Escribir la dirección y elegirla de una lista da el punto SIN que nadie sepa
 * que existe una coordenada. Es la misma información, pedida de una forma que
 * una persona sí sabe hacer.
 *
 * ── ESTE ARCHIVO ES PURO, Y ES DONDE VIVE EL CONTROL DEL GASTO ────────────
 *
 * Google cobra por petición. Preguntar en cada tecla convierte una dirección de
 * treinta letras en treinta llamadas: la misma pantalla, la misma persona, diez
 * veces la factura. Las reglas que lo impiden —cuántas letras hacen falta,
 * cuánto se espera, cuándo NO se pregunta— están aquí, en funciones que se
 * pueden probar sin llamar a nadie y sin gastar un céntimo.
 *
 * Meterlas dentro del componente sería esconder una decisión de dinero dentro
 * de una decisión de diseño, que es exactamente como se llega a una factura que
 * nadie esperaba.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const API_LUGARES = "https://places.googleapis.com/v1";

/**
 * ── LAS TRES REGLAS QUE DECIDEN LA FACTURA ────────────────────────────────
 *
 * MÍNIMO DE LETRAS. Con una o dos letras Google no puede sugerir nada útil —
 * devuelve las calles más famosas del país— y cada intento se paga igual. La
 * cuarta letra es donde una sugerencia empieza a valer algo.
 *
 * ESPERA. Nadie escribe una letra y se para: escribe una ráfaga. Preguntar
 * mientras teclea es pagar por respuestas que nadie va a llegar a leer, porque
 * la siguiente tecla las borra. 350 ms es más de lo que tarda en escribir la
 * letra siguiente y menos de lo que se nota como lentitud.
 *
 * TOPE POR BÚSQUEDA. Una dirección se encuentra en tres o cuatro intentos. Si
 * llevamos doce, o el sitio no está en Google o alguien está jugando con el
 * campo — y en los dos casos seguir preguntando solo suma factura.
 */
export const LETRAS_MINIMAS = 4;
export const ESPERA_MS = 350;
export const MAX_POR_BUSQUEDA = 12;

/** Panamá. Sesga los resultados sin prohibir el resto. */
export const PAIS_POR_DEFECTO = "pa";

/**
 * ¿Se pregunta por esto?
 *
 * SE DECIDE ANTES DE LLAMAR, no dentro del componente. Cada `false` de aquí es
 * una petición que no se paga.
 */
export function valeLaPenaBuscar(texto: string | null | undefined, yaPreguntadas = 0): boolean {
  const t = String(texto ?? "").trim();
  if (t.length < LETRAS_MINIMAS) return false;
  if (yaPreguntadas >= MAX_POR_BUSQUEDA) return false;
  return true;
}

/**
 * Un identificador de búsqueda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO ES UN DETALLE DE IMPLEMENTACIÓN: ES LA MITAD DE LA FACTURA.
 *
 * Google agrupa las llamadas que llevan el mismo identificador y las cobra como
 * UNA búsqueda. Sin él, cada tecla es una búsqueda suelta y se paga por
 * separado. Es la diferencia entre pagar una vez por dirección encontrada o
 * pagar cuatro.
 *
 * Y SE TIRA EN CUANTO SE ELIGE UNA. Reutilizarlo para la siguiente dirección
 * haría que Google cobrara todo como una búsqueda eterna — que suena bien y no
 * lo es: la búsqueda se cierra al pedir las coordenadas, y a partir de ahí el
 * identificador viejo ya no agrupa nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function nuevaBusqueda(): string {
  // `randomUUID` existe en el navegador moderno y en Node. El respaldo es para
  // los contextos sin él (http en local, algún navegador viejo): un
  // identificador flojo agrupa igual, y lo que no puede es faltar.
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* sigue al respaldo */
  }
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lo que se le manda a Google para pedir sugerencias. */
export function cuerpoDeSugerencias(v: {
  texto: string;
  busqueda: string;
  pais?: string | null;
}): Record<string, unknown> {
  return {
    input: String(v.texto ?? "").trim(),
    sessionToken: String(v.busqueda ?? ""),
    // SE SESGA A PANAMÁ, NO SE PROHÍBE EL RESTO. Un negocio panameño que
    // reparte a alguien de visita en Costa Rica es raro pero posible, y
    // prohibirlo daría un «no encuentro tu dirección» sin explicación.
    includedRegionCodes: [String(v.pais ?? PAIS_POR_DEFECTO).toLowerCase()],
    languageCode: "es",
  };
}

export type Sugerencia = { id: string; texto: string; detalle: string };

/**
 * Leer lo que contesta Google.
 *
 * SE LEE EN VARIOS SITIOS Y NO SE ADIVINA UNO. Es la lección de ASAP: el
 * `delivery_id` venía en `result.delivery_id`, deduje tres formas y ninguna
 * acertó — y el precio fue un pedido real en la calle. Aquí el fallo sería más
 * suave (una lista vacía), pero la costumbre es la misma.
 */
export function leerSugerencias(respuesta: unknown): Sugerencia[] {
  const r = (respuesta ?? {}) as Record<string, any>;
  const lista = Array.isArray(r.suggestions) ? r.suggestions : [];
  const salida: Sugerencia[] = [];

  for (const s of lista) {
    const p = s?.placePrediction ?? s?.place_prediction ?? null;
    if (!p) continue;
    const id = String(p.placeId ?? p.place_id ?? p.place ?? "").trim();
    // EL NOMBRE CORTO Y EL RESTO, SEPARADOS. «Súper 99» arriba y «Vía España,
    // Ciudad de Panamá» debajo se lee de un vistazo; todo junto en una línea
    // obliga a leerlo entero para distinguir dos sucursales.
    const texto = String(
      p.structuredFormat?.mainText?.text ?? p.text?.text ?? p.description ?? "",
    ).trim();
    const detalle = String(p.structuredFormat?.secondaryText?.text ?? "").trim();
    if (!id || !texto) continue;
    salida.push({ id, texto, detalle });
  }
  return salida;
}

export type Punto = { direccion: string; lat: number; long: number };

/**
 * Leer las coordenadas del sitio elegido.
 *
 * ── CUIDADO CON EL CERO, OTRA VEZ ─────────────────────────────────────────
 *
 * `Number(null)` y `Number("")` son 0, y (0, 0) es un punto REAL en el
 * Atlántico, frente a la costa de Ghana. Una respuesta a la que le falte la
 * latitud diría tenerla, el pedido saldría con coordenadas válidas, y la moto
 * se pediría para el golfo de Guinea. Es el mismo cero que ya nos mordió tres
 * veces en ASAP.
 */
export function leerPunto(respuesta: unknown): Punto | null {
  const r = (respuesta ?? {}) as Record<string, any>;
  const loc = r.location ?? r.geometry?.location ?? null;
  if (!loc) return null;

  const numero = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const lat = numero(loc.latitude ?? loc.lat);
  const long = numero(loc.longitude ?? loc.lng ?? loc.long);
  if (lat === null || long === null) return null;
  if (lat < -90 || lat > 90 || long < -180 || long > 180) return null;

  const direccion = String(r.formattedAddress ?? r.formatted_address ?? r.displayName?.text ?? "").trim();
  if (!direccion) return null;

  return { direccion, lat, long };
}

/**
 * Los campos que se le piden a Google al cerrar la búsqueda.
 *
 * SOLO TRES, Y ESO ES DINERO. Google cobra por familias de campos: pedir la
 * dirección y el punto entra en la tarifa barata; añadir el horario, las fotos
 * o las reseñas —que no vamos a usar— salta a una tarifa tres veces mayor. Se
 * pide lo que hace falta y nada más.
 */
export const CAMPOS_DEL_PUNTO = "formattedAddress,location,displayName";

/**
 * ¿Se puede seguir sin esto?
 *
 * SIEMPRE SÍ, Y ES LA REGLA MÁS IMPORTANTE DE TODO EL ARCHIVO.
 *
 * En Panamá hay direcciones que Google no conoce: una casa en una barriada sin
 * nomenclatura, un PH recién entregado. Si el formulario exigiera elegir de la
 * lista, esa gente no podría comprar — y el negocio no se enteraría de que dejó
 * de venderles, porque un cliente que no puede terminar no escribe para
 * quejarse: se va.
 *
 * Escribir a mano tiene que seguir funcionando. Lo que se pierde entonces es la
 * coordenada, no la venta: el pedido entra y se le pide la ubicación por
 * WhatsApp, como hasta ahora.
 */
export function sePuedeEscribirAMano(): true {
  return true;
}
