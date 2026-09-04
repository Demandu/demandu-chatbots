/**
 * Las plantillas con las que se avisa cuando ya pasaron las 24 horas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL AGUJERO QUE TAPA ESTE ARCHIVO. Los avisos de pedido salían siempre como
 * texto libre, y WhatsApp solo entrega texto libre dentro de las 24 h
 * siguientes al último mensaje DEL CLIENTE. Pasado ese rato Meta lo rechaza con
 * el error 131047 y no pasa nada más: el pedido avanza, el negocio lo ve
 * avanzar, y el cliente no se entera.
 *
 * Y es justo cuando más importa. Alguien que pidió anoche y recibe su paquete
 * hoy a mediodía lleva catorce horas sin escribir: el «va en camino» y el
 * «entregado» —los dos avisos que de verdad esperan— caían siempre fuera.
 *
 * ── POR QUÉ SOLO FUERA DE LA VENTANA, Y NO SIEMPRE ────────────────────────
 *
 * Dentro de las 24 h el texto libre llega igual, se lee como un mensaje normal
 * y NO CUESTA. Fuera, Meta abre una conversación de servicio facturable. Mandar
 * plantilla siempre sería pagarle a Meta por mensajes que ya podían salir
 * gratis, y que además se leen peor.
 *
 * ── LO QUE MÁS SORPRENDE DE LAS PLANTILLAS ────────────────────────────────
 *
 * VIVEN EN LA CUENTA DE WHATSAPP DE CADA CLIENTE, no en la nuestra. Meta las
 * aprueba por WABA. Así que estas siete no se «configuran»: hay que CREARLAS en
 * el WhatsApp de cada negocio que encienda la tienda, y esperar a que Meta las
 * apruebe. Este archivo es la definición única con la que se crean allá y con
 * la que se mandan aquí — escritas en dos sitios, un día se dirían distinto y
 * el envío fallaría con «number of parameters does not match».
 *
 * ── LAS DOS REGLAS DE META QUE ROMPEN ESTO ────────────────────────────────
 *
 * 1. UNA VARIABLE NO PUEDE IR AL PRINCIPIO NI AL FINAL del cuerpo. Ya nos
 *    rechazó `pedido_entregado` por acabar en «…{{2}}!». Hay una prueba.
 * 2. HAY QUE MANDAR TANTOS VALORES COMO VARIABLES TENGA. Ni uno menos, ni uno
 *    más, o rechaza el envío entero.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { MomentoAviso } from "./avisos";

/** Adónde lleva el botón de la plantilla, si lleva. */
export type DestinoBoton = "tienda" | "pago";

export type PlantillaDePedido = {
  /** El nombre en Meta. En minúsculas y con guiones bajos: es su regla. */
  nombre: string;
  /** Qué pasó, para la pantalla de estado. */
  etiqueta: string;
  /**
   * El cuerpo con `{{1}}`, `{{2}}`… tal y como lo aprueba Meta.
   *
   * SE ESCRIBE NEUTRO A PROPÓSITO. Es la misma plantilla para una veterinaria y
   * para una pastelería: el nombre del negocio entra como variable. El texto
   * con personalidad es el de dentro de la ventana, que sí lo escribe cada
   * negocio.
   */
  cuerpo: string;
  /** Qué va en cada hueco, en orden. Solo para saber cuántos y qué son. */
  variables: ("numero" | "tienda" | "total")[];
  /** El botón de enlace, cuando hay algo que hacer. */
  boton?: { texto: string; a: DestinoBoton };
};

/**
 * Las siete. `preparando` NO tiene, y es a propósito: viene apagado de fábrica
 * porque es el único paso que no le dice al cliente nada que no supiera, y una
 * plantilla que casi nadie usa es una plantilla más que aprobar en cada cuenta.
 */
export const PLANTILLAS: Partial<Record<MomentoAviso, PlantillaDePedido>> = {
  pagado: {
    nombre: "pedido_pago_recibido",
    etiqueta: "Pago recibido",
    cuerpo: "Recibimos tu pago del pedido #{{1}} en {{2}} por {{3}}. Ya lo estamos procesando.",
    variables: ["numero", "tienda", "total"],
  },
  confirmado: {
    nombre: "pedido_confirmado",
    etiqueta: "Confirmado",
    cuerpo: "Tu pedido #{{1}} en {{2}} quedó confirmado. Te avisamos cuando salga.",
    variables: ["numero", "tienda"],
  },
  en_camino: {
    nombre: "pedido_en_camino",
    etiqueta: "En camino",
    cuerpo: "Tu pedido #{{1}} de {{2}} ya va en camino. Llega en breve.",
    variables: ["numero", "tienda"],
  },
  entregado: {
    nombre: "pedido_entregado",
    // LA VARIABLE NO PUEDE IR AL FINAL. Meta rechazó la primera versión de esta
    // plantilla por terminar en «…{{2}}!». Por eso cierra con texto fijo.
    etiqueta: "Entregado",
    cuerpo: "Tu pedido #{{1}} de {{2}} fue entregado. ¡Gracias por tu compra!",
    variables: ["numero", "tienda"],
  },
  cancelado: {
    nombre: "pedido_cancelado",
    etiqueta: "Cancelado",
    cuerpo: "Tu pedido #{{1}} en {{2}} quedó cancelado. Si fue un error, escríbenos y lo resolvemos.",
    variables: ["numero", "tienda"],
  },
  enlace_vencido: {
    nombre: "pedido_enlace_vencido",
    etiqueta: "Se venció el enlace de pago",
    cuerpo:
      "Se venció el enlace de pago de tu pedido #{{1}} en {{2}}, así que quedó cancelado. " +
      "Puedes volver a pedirlo cuando quieras.",
    variables: ["numero", "tienda"],
    boton: { texto: "Volver a pedir", a: "tienda" },
  },
  pago_no_completado: {
    nombre: "pedido_pago_no_completado",
    etiqueta: "El pago no se completó",
    cuerpo:
      "No se completó el pago de tu pedido #{{1}} en {{2}}. Tu pedido sigue guardado y puedes " +
      "intentarlo otra vez.",
    variables: ["numero", "tienda"],
    boton: { texto: "Pagar de nuevo", a: "pago" },
  },
};

/** La plantilla de un momento, o `null` si ese momento no tiene. */
export function plantillaDe(momento: MomentoAviso): PlantillaDePedido | null {
  return PLANTILLAS[momento] ?? null;
}

/** Los nombres de las siete, para pedirle a Meta su estado de una sola vez. */
export const NOMBRES_DE_PEDIDO: string[] = Object.values(PLANTILLAS).map((p) => p.nombre);

/**
 * Los valores que van en los huecos, EN ORDEN.
 *
 * NUNCA DEVUELVE UN HUECO VACÍO. Meta acepta el envío con una variable en
 * blanco y lo que llega es «Tu pedido # en …», que se lee como un error de la
 * plataforma. Antes de mandar nada hay que saber que están todos.
 */
export function valoresDe(
  p: PlantillaDePedido,
  datos: { numero: number | string; tienda: string; total: string },
): string[] {
  return p.variables.map((v) => String(datos[v] ?? "").trim());
}

/** ¿Se puede mandar esta plantilla con estos datos? */
export function faltaAlgunDato(p: PlantillaDePedido, valores: string[]): boolean {
  return valores.length !== p.variables.length || valores.some((v) => !v);
}

/* ── La ventana de 24 horas ────────────────────────────────────────────────── */

/** Las horas que da WhatsApp desde el último mensaje del cliente. */
export const VENTANA_HORAS = 24;

/**
 * Un margen de seguridad, y no es paranoia.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE DA POR CERRADA VEINTE MINUTOS ANTES. La hora que tenemos guardada es la de
 * NUESTRO reloj cuando llegó el mensaje, no la de Meta; entre el webhook, la
 * cola y la escritura pueden irse segundos, y los relojes de dos servidores
 * nunca son el mismo reloj.
 *
 * Equivocarse por cada lado cuesta distinto. Mandar plantilla cuando aún había
 * ventana cuesta unos centavos. Mandar texto libre cuando ya se cerró cuesta EL
 * AVISO ENTERO: Meta lo rechaza y el cliente no se entera de que su pedido va
 * en camino. Por eso el margen va hacia la plantilla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const MARGEN_MINUTOS = 20;

/**
 * ¿Se le puede escribir texto libre a esta persona?
 *
 * SIN MENSAJE SUYO NO HAY VENTANA. Quien pidió desde la tienda sin escribir
 * nunca por WhatsApp no tiene ventana abierta: ahí solo cabe plantilla, y
 * tratarlo como «recién escrito» sería mandar un texto que Meta va a rechazar.
 */
export function dentroDeLaVentana(
  ultimoMensajeDelCliente: string | Date | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!ultimoMensajeDelCliente) return false;
  const t = new Date(ultimoMensajeDelCliente as any).getTime();
  if (Number.isNaN(t)) return false;

  const limite = VENTANA_HORAS * 60 * 60 * 1000 - MARGEN_MINUTOS * 60 * 1000;
  const pasado = ahora.getTime() - t;
  // Una fecha en el futuro es un reloj desincronizado, no una ventana recién
  // abierta. Se trata como fuera: es el lado barato de equivocarse.
  if (pasado < 0) return false;
  return pasado < limite;
}

/**
 * El error con el que Meta dice «se acabó la ventana».
 *
 * SE COMPRUEBA AUNQUE YA MIREMOS LA HORA, porque los dos relojes pueden no
 * coincidir y porque el cliente puede haber borrado la conversación. Es el
 * respaldo: si el texto libre se rechaza por esto, se reintenta con plantilla en
 * el mismo momento en vez de dejar al cliente sin aviso.
 */
export const FUERA_DE_VENTANA = 131047;

export function esFueraDeVentana(codigo: unknown, mensaje?: unknown): boolean {
  if (Number(codigo) === FUERA_DE_VENTANA) return true;
  // Meta no siempre manda el código en el mismo sitio. El texto es el respaldo
  // del respaldo, y solo se mira en inglés porque su API contesta en inglés.
  return /24 hours|re-?engagement|outside.*window/i.test(String(mensaje ?? ""));
}
