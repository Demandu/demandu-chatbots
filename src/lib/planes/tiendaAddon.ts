/**
 * Lo que se le dice a un negocio para que compre la Tienda en WhatsApp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO ES LO QUE VENDE, Y POR ESO VIVE EN CÓDIGO Y NO EN LA BASE. El precio y
 * si está activo son DATO —cambian sin desplegar—; el argumento de venta es
 * PRODUCTO: se revisa, se prueba y se cambia con el mismo cuidado que una
 * pantalla. Un `description` de una línea en una tabla no vende un producto de
 * 59 dólares al mes.
 *
 * ── LA REGLA DE ORO DE ESTE TEXTO ─────────────────────────────────────────
 *
 * TODO LO QUE DICE AQUÍ TIENE QUE ESTAR CONSTRUIDO. Es un texto que el cliente
 * lee ANTES de pagar, y cada promesa que no se cumpla se convierte en una baja
 * el mes siguiente — que cuesta mucho más que la venta que trajo. Nada de «muy
 * pronto», nada de «próximamente». Si no está hecho, no se escribe.
 *
 * ── CONTRA QUÉ SE COMPITE DE VERDAD ───────────────────────────────────────
 *
 * No contra otra plataforma de chatbots: contra las apps de delivery, que se
 * llevan entre el 25% y el 30% de cada pedido. Un restaurante que factura 3.000
 * al mes por ahí les regala unos 800. Ese es el número que hace que 59 dólares
 * parezcan gratis, y por eso va primero.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { DOMINIO_TIENDAS } from "@/lib/tienda/direccion";

export const CODIGO_TIENDA = "tienda";
/** Dólares al mes, por tienda activa. */
export const PRECIO_TIENDA = 59;

export type Beneficio = { titulo: string; texto: string };

export const GANCHO =
  "Tu catálogo, tus pedidos y tu cobro dentro de WhatsApp. Sin comisión por venta.";

/**
 * El argumento, en orden de lo que más mueve a comprar.
 *
 * EL PRIMERO ES EL DINERO QUE YA ESTÁ PERDIENDO. Los demás son lo que hace la
 * plataforma; ese es el que hace la resta.
 */
export const BENEFICIOS: Beneficio[] = [
  {
    titulo: "Deja de regalar el 25% de cada pedido",
    texto:
      "Las apps de delivery se quedan con una cuarta parte de lo que vendes. Aquí pagas una " +
      "cuota fija: vendas $500 o vendas $15.000, cuesta lo mismo. Con un solo pedido de $250 al " +
      "mes ya se paga sola.",
  },
  {
    titulo: "El pedido no llega a un correo: llega a tu Bandeja",
    texto:
      "Cada pedido entra como una conversación de WhatsApp, con su cliente, su historial y su " +
      "lugar en el embudo. Puedes escribirle sin buscar su número en ningún lado. Eso no lo hace " +
      "ninguna tienda suelta.",
  },
  {
    titulo: "Cobras ANTES de preparar, por Yappy",
    texto:
      "El cliente paga cuando hace el pedido, no cuando llega el motorizado. Se acabaron los " +
      "pedidos que nadie recibe y la comida que se pierde. Si no paga, el enlace vence solo y el " +
      "pedido se cancela sin que tengas que perseguir a nadie.",
  },
  {
    titulo: "Tu cliente sabe dónde va su pedido sin preguntarte",
    texto:
      "Cuando confirmas, cuando sale y cuando se entrega, le llega un WhatsApp automático. Es la " +
      "pregunta que más interrumpe el día de un negocio, y deja de llegar.",
  },
  {
    titulo: "Tu chatbot vende, no solo contesta",
    texto:
      "Lana consulta tus productos y precios REALES antes de responder. Cuando le preguntan " +
      "«¿tienen comida para cachorro?» contesta con lo que de verdad tienes y a cuánto, y manda " +
      "el enlace para pedir.",
  },
  {
    titulo: "Sabes quién te compró, quién no pagó y quién no ha vuelto",
    texto:
      "Un panel con lo vendido, lo cobrado y lo que quedó sin pagar, por el rango de fechas que " +
      "elijas. Y de cualquiera de esas listas sale una difusión: una encuesta a quienes ya " +
      "compraron, un recordatorio a quienes dejaron el pago a medias.",
  },
];

/** Lo que entra por los 59, dicho corto. Es lo que se compara de un vistazo. */
export const INCLUYE: string[] = [
  "Catálogo con fotos, categorías, variedades y precios",
  // EL DOMINIO NO SE ESCRIBE A MANO NI AQUÍ. Ya cambió una vez (`shop` →
  // `store`) antes de tener un cliente encima; escrito suelto en un texto de
  // venta, el día que vuelva a cambiar estaríamos vendiendo una dirección que
  // no existe. Hay una prueba estática que lo persigue por todo el proyecto.
  `Tu propia dirección: ${DOMINIO_TIENDAS}/tunegocio`,
  "Cobro con Yappy y conciliación automática",
  "Avisos de estado al cliente por WhatsApp",
  "Los pedidos en tu Bandeja y en tu embudo",
  "Panel de ventas con listas descargables",
  "Bloques de tienda para tus chatbots",
  "Productos ilimitados",
];

/** A quién le sirve. Sirve para que se reconozca. */
export const IDEAL_PARA: string[] = [
  "Restaurantes y comida a domicilio",
  "Tiendas de mascotas, minimercados y abarrotes",
  "Farmacias y tiendas de barrio",
  "Ropa, accesorios y ventas por Instagram",
];

/**
 * Lo que se cobra, explicado sin letra chica.
 *
 * SE DICE QUE ES POR TIENDA Y QUE APAGARLA DEJA DE COBRARSE. Una cadena tiene
 * que poder calcular su factura sola antes de preguntar, y quien cierra un
 * local tiene que poder dejar de pagarlo sin llamar a nadie. Enterarse de esto
 * DESPUÉS es de las cosas que más rápido rompen la confianza.
 */
export const LETRA_CHICA =
  "Se cobra por cada tienda activa. Si tienes varios locales, cada uno lleva su propio " +
  "inventario, su propio Yappy y sus propios pedidos. Una tienda apagada no se cobra.";

/** «$59 / mes por tienda», que es como se pone en un botón. */
export function precioEscrito(precio = PRECIO_TIENDA): string {
  return `$${precio} / mes por tienda`;
}

/**
 * Lo que le costaría la comisión de una app de delivery.
 *
 * ES LA CUENTA QUE HACE QUE SE VENDA, y por eso se calcula en vez de escribirse:
 * el negocio pone lo que factura y ve el número. Un 25% es el extremo bajo de
 * lo que cobran las apps en la región.
 */
export const COMISION_APPS = 0.25;

export function loQueTeAhorras(ventasAlMes: number, precio = PRECIO_TIENDA): number {
  const v = Number(ventasAlMes);
  if (!Number.isFinite(v) || v <= 0) return 0;
  // NUNCA SE ENSEÑA UN AHORRO NEGATIVO. A quien vende poco no se le dice «te
  // ahorras -$34»: se le dice cero, y que decida por lo demás. Prometer con un
  // número que insulta es peor que no poner la calculadora.
  return Math.max(0, Math.round(v * COMISION_APPS - precio));
}

/** Cuánto hay que vender para que la tienda se pague sola. */
export function desdeCuantoSePagaSola(precio = PRECIO_TIENDA): number {
  return Math.ceil(precio / COMISION_APPS);
}
