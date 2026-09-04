/**
 * Qué se vende encendido y qué se vende aparte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS PLANES PASARON DE VENDER CANTIDAD A VENDER CAPACIDAD. Antes eran el mismo
 * producto en tres tamaños —3.000, 6.000 y 12.000 mensajes— y nadie sube de
 * plan por «más de lo mismo»: se sube cuando el de arriba HACE ALGO que el tuyo
 * no hace.
 *
 * ── NO ES UNA CUOTA, ES UN INTERRUPTOR ────────────────────────────────────
 *
 * Este proyecto YA TUVO un contador de mensajes de IA y lo quitó a propósito
 * (el porqué está en `billing/usage.ts`: el límite protegía un margen que no
 * estaba en riesgo, a cambio de un concepto que nadie entendía). Aquí no vuelve
 * ninguna cuota: sigue habiendo UNA bolsa de mensajes y lo que se enciende o se
 * apaga es la capacidad.
 *
 * ── DÓNDE SE DECIDE DE VERDAD ─────────────────────────────────────────────
 *
 * EN LA BASE, con `org_features()`. Este archivo es solo los NOMBRES y los
 * TEXTOS: qué se llama cada cosa, qué se le dice a quien no la tiene y cómo la
 * consigue. Si el freno viviera aquí, cualquiera llamaría la acción por debajo
 * y usaría la IA gratis.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ClaveFeature = "ia" | "tienda";

export type Feature = {
  clave: ClaveFeature;
  nombre: string;
  /** Qué es, para quien no la tiene todavía. */
  que: string;
  /** El plan más barato que la incluye. */
  desdeElPlan: string;
  /** El complemento que la desbloquea sin cambiar de plan. */
  complemento: string;
  /** Qué se pierde por no tenerla. Es lo que de verdad convence. */
  sinElla: string;
};

export const FEATURES: Record<ClaveFeature, Feature> = {
  ia: {
    clave: "ia",
    nombre: "Lana IA",
    que:
      "Tu chatbot contesta con inteligencia artificial usando la información de tu negocio, en vez " +
      "de seguir solo el guion que armaste.",
    desdeElPlan: "Crece",
    complemento: "Lana IA",
    sinElla:
      "Sin ella tu chatbot solo puede contestar lo que previste. La pregunta que no está en el " +
      "flujo se queda sin respuesta hasta que alguien de tu equipo la vea.",
  },
  tienda: {
    clave: "tienda",
    nombre: "Tienda en WhatsApp",
    que:
      "Tu catálogo, tus pedidos y tu cobro por Yappy, con su propia dirección y sin comisión por " +
      "venta.",
    desdeElPlan: "Profesional",
    complemento: "Tienda en WhatsApp",
    sinElla:
      "Sin ella los pedidos siguen llegando por chat, escritos a mano, y cobrar es mandar un " +
      "enlace y confiar en que alguien revise si pagaron.",
  },
};

export function feature(clave: string): Feature | null {
  return (FEATURES as Record<string, Feature>)[clave] ?? null;
}

/**
 * ¿Está esta capacidad en la lista?
 *
 * ANTE LA DUDA, NO. Una lista que no se pudo leer no puede leerse como «lo
 * tiene todo»: eso convertiría un fallo de la base en barra libre. Al revés, el
 * cliente ve la función apagada y escribe — que es molesto pero se arregla.
 */
export function tiene(features: unknown, clave: ClaveFeature): boolean {
  return Array.isArray(features) && features.includes(clave);
}
