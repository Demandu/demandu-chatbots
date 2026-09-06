import { prefijoDesdeTelefono } from "@/lib/phoneCountry";

/**
 * El teléfono del pedido, en el mismo formato que usa WhatsApp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO ES LO QUE UNE LA TIENDA CON LA BANDEJA. Un pedido y una conversación de
 * WhatsApp son la misma persona solo si los dos apuntan al mismo contacto, y el
 * contacto de WhatsApp se guarda por su número con prefijo país y sin signos
 * (`50761234567`). Si aquí normalizamos distinto, cada cliente queda partido en
 * dos fichas: una que compra y otra que escribe. Y eso no se arregla después
 * sin adivinar cuál era cuál.
 *
 * EL CLIENTE ESCRIBE SU NÚMERO COMO QUIERE —local, con prefijo, con guiones— y
 * casi nunca pone el país: en su cabeza es obvio. El país que falta se toma del
 * número de la propia tienda, que sí lo tiene.
 *
 * PERO NO SE ADIVINA A CIEGAS: un número que ya viene completo se respeta,
 * incluso si es de otro país. Una panadería panameña también le vende a alguien
 * con número colombiano, y ponerle 507 delante crearía un contacto que no
 * existe y una conversación que nunca va a llegar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo mínimo que puede medir un número nacional para darlo por completo. */
const MINIMO_NACIONAL = 7;

export function aWhatsapp(telefonoCliente: string, telefonoTienda: string): string {
  const d = String(telefonoCliente ?? "").replace(/\D+/g, "").replace(/^0+/, "");
  if (!d) return "";

  const prefijoTienda = prefijoDesdeTelefono(telefonoTienda);

  // Ya trae el prefijo de la tienda y suficiente número detrás: está completo.
  if (prefijoTienda && d.startsWith(prefijoTienda) && d.length >= prefijoTienda.length + MINIMO_NACIONAL) {
    return d;
  }

  // No es de aquí, pero es reconocible y suficientemente largo: es de fuera y
  // se respeta tal cual.
  if (d.length >= 11 && prefijoDesdeTelefono(d)) return d;

  // Es un número local: se le pone el país de la tienda.
  if (prefijoTienda) return prefijoTienda + d;

  // Sin país de referencia no se inventa nada: es mejor un pedido sin contacto
  // que un contacto equivocado, que ensucia la Bandeja de alguien de verdad.
  return "";
}

/**
 * ¿Vale la pena crear un contacto con esto?
 *
 * Un número de cuatro dígitos no es un teléfono, es un cliente distraído, y
 * crear una ficha por cada uno llena el CRM de basura que alguien tendrá que
 * limpiar a mano.
 */
export function telefonoUtil(v: string): boolean {
  return /^\d{10,15}$/.test(String(v ?? ""));
}
