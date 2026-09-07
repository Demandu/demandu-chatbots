/**
 * LLEGA UNA UBICACIÓN POR EL CHAT. ¿A QUÉ PEDIDO ES?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA ES LA FORMA BUENA DE PEDIRLA, Y NO ES LA DE LA TIENDA.
 *
 * En la tienda hay que enseñar un botón, explicar qué hace y esperar que el
 * cliente entienda que se le está pidiendo una coordenada. En WhatsApp no hay
 * nada que enseñar: el botón de ubicación lleva ahí una década, la gente lo usa
 * todos los días para quedar con sus amigos, y lo que manda es exacto.
 *
 * Y encaja con lo que YA pasa: el escaparate abre `wa.me` con el pedido dentro,
 * así que el cliente termina escribiéndole al WhatsApp del negocio. La
 * conversación existe. Solo faltaba no tirar el dato.
 *
 * Porque hoy se tira: el motor ve un mensaje de tipo `location`, lo apunta en
 * la Bandeja como «📍 Ubicación» y la latitud y la longitud se pierden ahí
 * mismo. El cliente hizo exactamente lo que había que hacer y no sirvió de nada.
 *
 * ── POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO UNA CONSULTA ────────────────────
 *
 * Porque «¿a qué pedido va?» tiene cuatro respuestas distintas y tres de ellas
 * son fáciles de equivocar. Metida dentro del motor no se puede probar ni una;
 * aquí se prueban las cuatro sin base de datos y sin WhatsApp delante.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Ubicacion } from "./asap";

export type PedidoQueEspera = {
  id: string;
  numero: number;
  estado: string;
  created_at: string;
  entrega_lat?: number | null;
  entrega_long?: number | null;
  /** Si ya tiene, el mensajero salió: la ubicación vieja ya está en la calle. */
  envio_id?: string | null;
};

export type QueHacer =
  | { que: "guardar"; pedido: PedidoQueEspera; corrige: boolean; mensaje: string }
  | { que: "nada"; mensaje: string };

/**
 * Cuánto tiempo atrás se mira.
 *
 * TRES DÍAS. Alguien que manda su ubicación por costumbre —o que le da al botón
 * sin querer— no puede acabar cambiándole el destino a un pedido de hace tres
 * semanas que quedó a medias. Y tres días cubre de sobra el caso real: se pide,
 * se paga, se pregunta la ubicación, se manda. Eso pasa el mismo día casi
 * siempre, y como mucho al siguiente si el negocio prepara por encargo.
 */
export const VENTANA_UBICACION_HORAS = 72;

/** Un pedido cerrado ya no espera nada. */
const CERRADOS = ["entregado", "cancelado"];

/**
 * ¿Este pedido YA tiene ubicación?
 *
 * EL CERO OTRA VEZ, Y ESTA VEZ ME PILLÓ UNA PRUEBA. `Number(null)` es 0 y
 * `Number.isFinite(0)` es verdadero, así que un pedido con la columna vacía
 * contestaba «sí, ya la tengo». Consecuencia: la ubicación que el cliente
 * acababa de mandar se iba al pedido equivocado —o se trataba como una
 * corrección de algo que nunca existió— y el pedido que la estaba esperando
 * seguía sin poder despacharse.
 *
 * Se mira que el campo VENGA antes de convertirlo a número. Es la misma trampa
 * que ya está documentada en `coordenada` y en `estadoDeCodigo`: en este
 * módulo, cero es un valor legítimo y «vacío» no puede parecerse a él.
 */
function tieneUbicacion(p: PedidoQueEspera): boolean {
  const hay = (v: unknown) =>
    v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  return hay(p?.entrega_lat) && hay(p?.entrega_long);
}

/**
 * A qué pedido va la ubicación que acaba de llegar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE ELIGE EL QUE LA NECESITA, NO EL MÁS NUEVO.
 *
 * Parece lo mismo y no lo es. Si alguien tiene dos pedidos abiertos —uno de
 * ayer al que le falta la ubicación y uno de hoy que ya la trae— el más nuevo
 * es el de hoy, y guardarla ahí la pisaría encima de una que ya estaba bien
 * mientras el pedido de ayer se queda igual de parado. Entre los que la
 * necesitan, sí manda el más nuevo.
 *
 * Y SI NINGUNO LA NECESITA, ES UNA CORRECCIÓN. «Me equivoqué, esta es mi casa»
 * es un caso real y frecuente. Se acepta, pero se dice que se cambió — pisar
 * una ubicación en silencio es cómo un pedido acaba en la dirección de otro día.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function aQuePedidoVa(
  pedidos: PedidoQueEspera[] | null | undefined,
  ahora: Date = new Date(),
): QueHacer {
  const limite = ahora.getTime() - VENTANA_UBICACION_HORAS * 3600_000;

  const abiertos = (pedidos ?? [])
    .filter((p) => p && !CERRADOS.includes(String(p.estado ?? "")))
    .filter((p) => {
      const t = Date.parse(String(p.created_at ?? ""));
      // UNA FECHA ILEGIBLE NO ENTRA. `Date.parse` devuelve NaN y toda
      // comparación con NaN es falsa, así que un `t < limite` mal escrito la
      // dejaría pasar sin que nada avisara.
      return Number.isFinite(t) && t >= limite;
    })
    .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)));

  if (!abiertos.length) {
    return {
      que: "nada",
      mensaje:
        "¡Gracias! Pero ahora mismo no tengo ningún pedido tuyo abierto donde guardarla. " +
        "Cuando hagas tu pedido te la pido y ahí sí me sirve. 🙂",
    };
  }

  const sinUbicacion = abiertos.filter((p) => !tieneUbicacion(p));
  const elegido = sinUbicacion[0] ?? abiertos[0];
  const corrige = !sinUbicacion.length;

  // UNA UBICACIÓN NUEVA NO CAMBIA UN ENVÍO QUE YA SALIÓ. El mensajero va en la
  // calle con la dirección de antes: guardarla y callar dejaría al negocio
  // viendo una ubicación en pantalla que no es a la que va la moto.
  if (String(elegido.envio_id ?? "").trim()) {
    return {
      que: "nada",
      mensaje:
        `Tu pedido ${elegido.numero} ya va en camino con la ubicación anterior, así que esta no la puedo cambiar sola. ` +
        "Escríbeme y lo vemos con el mensajero. 🛵",
    };
  }

  return {
    que: "guardar",
    pedido: elegido,
    corrige,
    mensaje: corrige
      ? `Listo, cambié la ubicación de tu pedido ${elegido.numero}. 📍`
      : `¡Gracias! Ya guardé tu ubicación para el pedido ${elegido.numero}. 📍`,
  };
}

/**
 * La ubicación que trae un mensaje de WhatsApp, si es que trae alguna.
 *
 * SE COMPRUEBA AQUÍ Y NO EN EL MOTOR porque es donde se puede probar. WhatsApp
 * manda `location: { latitude, longitude, name, address }`, y los dos últimos
 * son opcionales: llegan cuando la persona elige un sitio del buscador y NO
 * llegan cuando manda «mi ubicación actual», que es el caso más común.
 */
export function ubicacionDelMensaje(
  location: unknown,
): { punto: Ubicacion; nombre: string } | null {
  const l = (location ?? {}) as Record<string, unknown>;
  const lat = Number(l.latitude);
  const long = Number(l.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;
  if (lat < -90 || lat > 90 || long < -180 || long > 180) return null;
  // (0,0) otra vez: es lo que llega cuando el dato se perdió por el camino.
  if (lat === 0 && long === 0) return null;

  const nombre = [l.name, l.address]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  return { punto: { lat, long }, nombre };
}
