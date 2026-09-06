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
 *
 * «Anulado» va aparte de «fallido» A PROPÓSITO: un pago que nunca entró y uno
 * que entró y se devolvió se arreglan de formas distintas, y confundirlos hace
 * que el negocio reclame lo que no debe.
 */
export function estadoDelCobro(
  pago: string,
  iniciadoEn: string | null | undefined,
  ahora: Date = new Date(),
): "sin_cobrar" | "esperando" | "sin_confirmar" | "pagado" | "fallido" | "anulado" {
  if (pago === "pagado") return "pagado";
  if (pago === "anulado") return "anulado";
  if (pago === "rechazado" || pago === "cancelado" || pago === "expirado") return "fallido";
  // ── «SIN COBRAR» NO ES UN ESTADO NEUTRO, ES UN PROBLEMA ──────────────────
  //
  // Aquí SIEMPRE se cobra antes de preparar, y siempre por Yappy: no existe la
  // tienda que cobra al entregar. Así que un pedido que nunca llegó a tener un
  // cobro es un pedido que no debería prepararse — o el cobro falló al crearse,
  // o la tienda no tiene Yappy configurado.
  //
  // ANTES ESTO NO PINTABA NADA en el tablero, y por eso era peligroso: un
  // pedido sin cobrar se veía exactamente igual que uno normal. Hay dos así en
  // la base ahora mismo, por $32,50.
  if (pago !== "pendiente") return "sin_cobrar";

  // Un pendiente sin fecha viene de antes de que se guardara la hora: se trata
  // como sin confirmar, que es lo prudente — no como recién empezado.
  const t = iniciadoEn ? Date.parse(iniciadoEn) : NaN;
  if (!Number.isFinite(t)) return "sin_confirmar";

  const minutos = (ahora.getTime() - t) / 60000;
  return minutos <= VENTANA_COBRO_MIN ? "esperando" : "sin_confirmar";
}
