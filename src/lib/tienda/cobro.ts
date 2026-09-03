/**
 * El estado del cobro, contado como lo entiende el negocio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIVE APARTE DE `yappy.ts` A PROPÓSITO. Ese archivo firma con `crypto` de
 * Node, y esto lo pinta el tablero, que es una pantalla de navegador: si el
 * tablero importara de allí, el paquete del cliente arrastraría el módulo que
 * maneja secretos. Separarlo no es orden por gusto, es que lo de firmar no
 * pueda acabar en el navegador ni por accidente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Cuánto tiempo se le da a un cobro antes de dejar de darlo por vivo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * YAPPY LE DA CINCO MINUTOS AL CLIENTE para confirmar en su app; pasados esos,
 * la transacción queda rechazada. Aquí se esperan diez: el doble, para que un
 * aviso que llegue tarde —red mala, reintento— siga cayendo dentro.
 *
 * ESTO EXISTE PORQUE NO HAY A QUIÉN PREGUNTARLE. Yappy no publica ninguna
 * consulta de estado, así que si el aviso no llega no hay forma de averiguarlo:
 * lo único que queda es el reloj.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const VENTANA_COBRO_MIN = 10;

/**
 * Qué decirle al negocio sobre el cobro de un pedido.
 *
 * «Pago iniciado» eterno es la peor de las respuestas: en un tablero se lee
 * como «está por entrar», y el negocio prepara el pedido esperando un dinero
 * que ya no va a llegar. Pasada la ventana, se dice lo que de verdad se sabe:
 * que no hubo confirmación.
 */
export function estadoDelCobro(
  pago: string,
  iniciadoEn: string | null | undefined,
  ahora: Date = new Date(),
): "sin_cobro" | "esperando" | "sin_confirmar" | "pagado" | "fallido" {
  if (pago === "pagado") return "pagado";
  if (pago === "rechazado" || pago === "cancelado" || pago === "expirado") return "fallido";
  if (pago !== "pendiente") return "sin_cobro";

  // Un pendiente sin fecha viene de antes de que se guardara la hora: se trata
  // como sin confirmar, que es lo prudente — no como recién empezado.
  const t = iniciadoEn ? Date.parse(iniciadoEn) : NaN;
  if (!Number.isFinite(t)) return "sin_confirmar";

  const minutos = (ahora.getTime() - t) / 60000;
  return minutos <= VENTANA_COBRO_MIN ? "esperando" : "sin_confirmar";
}
