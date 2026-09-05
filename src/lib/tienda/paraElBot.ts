/**
 * Lo que el chatbot sabe decir sobre la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HASTA HOY EL MOTOR NO SABÍA QUE EXISTÍA LA TIENDA. El bloque «Catálogo» habla
 * del catálogo de Meta Commerce —SKUs subidos a Facebook—, no de los productos
 * del cliente; y el bloque «Pago» solo pega un enlace escrito a mano. Para
 * mandar la tienda había que copiar la dirección dentro de un bloque de
 * Mensaje, y el día que el negocio cambiara su dirección el flujo seguiría
 * mandando la vieja sin que nadie se enterara.
 *
 * ── POR QUÉ ESTE ARCHIVO ES PURO ──────────────────────────────────────────
 *
 * Porque hay DOS motores y no comparten nada: el de WhatsApp e Instagram vive
 * en Deno (`supabase/functions/whatsapp/index.ts`) y el del widget web en Node
 * (`src/lib/flow/webRuntime.ts`). Lo único que se puede compartir de verdad es
 * la decisión, no la consulta. Aquí vive QUÉ se dice; cada motor pone CÓMO lo
 * trae de la base y cómo lo manda.
 *
 * Y es lo único que se puede probar sin base de datos ni red, que con textos
 * que van a leer clientes reales es justo lo que hay que probar.
 *
 * ── LA REGLA QUE MÁS IMPORTA ──────────────────────────────────────────────
 *
 * UNA TIENDA APAGADA NO SE MANDA. `tiendas.activa` existe porque el negocio la
 * apaga cuando está de vacaciones, cuando se le acabó el inventario o cuando
 * todavía la está montando. Mandarle a un cliente el enlace de una tienda
 * apagada es peor que no mandarle nada: hace el viaje y se encuentra una
 * pantalla muerta. Por eso cada bloque tiene una salida para «no hay tienda» y
 * el flujo puede seguir por otro lado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { enlaceDeTienda } from "@/lib/tienda/direccion";

/* ── Qué tienda le toca a este bot ─────────────────────────────────────────── */

export type TiendaDelBot = {
  id: string;
  slug: string;
  nombre: string;
  activa: boolean;
  /** `config.moneda`, que es donde vive. */
  moneda?: string | null;
};

/**
 * La tienda que puede anunciar este flujo, o `null`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO HACE FALTA CONFIGURAR EL BLOQUE, y esa es la gracia. `tiendas.bot_id` ya
 * vincula cada tienda con su chatbot desde que existe la tienda: pedirle al
 * negocio que vuelva a elegirla en cada bloque sería preguntarle algo que la
 * plataforma ya sabe.
 *
 * ── PERO CON VARIAS TIENDAS, EL ALFABETO NO ES UNA RESPUESTA ──────────────
 *
 * Antes, con dos tiendas apuntando al mismo bot, se cogía la primera por
 * nombre. El comentario decía «no debería pasar, pero si pasa tiene que ser
 * estable». Estable sí era; correcta no: un negocio con «Boutique» y
 * «Zapatería» servía SIEMPRE el catálogo de Boutique, y el síntoma —el bot
 * enseña productos que no son— no se parece en nada a la causa.
 *
 * Ahora el agente puede decir con cuál trabaja, y esa elección manda. El
 * alfabeto se queda como último recurso: sigue siendo mejor una tienda
 * estable que una distinta cada día.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function tiendaDelBot(
  tiendas: TiendaDelBot[] | null | undefined,
  soloActivas = true,
  /** La tienda que eligió el agente. Nulo = como se decidía antes. */
  elegida?: string | null,
): TiendaDelBot | null {
  const todas = (Array.isArray(tiendas) ? tiendas : []).filter((t) => t && t.slug);
  const buenas = soloActivas ? todas.filter((t) => t.activa) : todas;
  if (!buenas.length) return null;

  // LA ELEGIDA SOLO GANA SI ESTÁ ENTRE LAS BUENAS. Si el negocio eligió una
  // tienda y luego la apagó, esto NO devuelve null: se cae al criterio de
  // siempre. Quedarse sin tienda por una elección vieja es peor que servir la
  // otra — y en la pantalla se ve cuál está apagada.
  const id = String(elegida ?? "").trim();
  if (id) {
    const suya = buenas.find((t) => t.id === id);
    if (suya) return suya;
  }

  return [...buenas].sort((a, b) => String(a.nombre ?? "").localeCompare(String(b.nombre ?? "")))[0];
}

/** El enlace público, o `null` si no hay tienda que mandar. */
export function enlaceDelBot(t: TiendaDelBot | null): string | null {
  return t ? enlaceDeTienda(t.slug) : null;
}

/* ── Bloque «Mi tienda» ────────────────────────────────────────────────────── */

/** Lo que dice el bloque si el negocio no escribió nada. */
export const TEXTO_TIENDA = "Mira nuestro catálogo completo y haz tu pedido aquí 👇";
export const BOTON_TIENDA = "Ver la tienda";

/**
 * El mensaje del bloque «Mi tienda».
 *
 * EL TEXTO DEL NEGOCIO MANDA, pero nunca queda vacío: un bloque recién soltado
 * que manda un mensaje en blanco es un fallo silencioso — el cliente ve llegar
 * un mensaje vacío y el negocio no entiende por qué.
 */
export function mensajeDeTienda(
  t: TiendaDelBot | null,
  texto?: string | null,
  boton?: string | null,
): { texto: string; enlace: string; boton: string } | null {
  const enlace = enlaceDelBot(t);
  if (!enlace || !t) return null;

  const cuerpo = String(texto ?? "").trim() || TEXTO_TIENDA;
  const etiqueta = String(boton ?? "").trim() || BOTON_TIENDA;
  return {
    texto: cuerpo,
    enlace,
    // WHATSAPP CORTA A 20 CARACTERES, y no avisa: manda el mensaje con el texto
    // recortado a media palabra. Mejor recortarlo aquí, donde se ve al probar.
    boton: etiqueta.slice(0, 20),
  };
}

/* ── Bloque «Catálogo» ─────────────────────────────────────────────────────── */

export type ProductoDelBot = {
  id: string;
  nombre: string;
  precio: number;
  categoria?: string | null;
  oculto?: boolean | null;
  stock?: number | null;
  orden?: number | null;
};

/** «$7.50». Los precios viven en centavos enteros en toda la plataforma. */
export function precioDelBot(centavos: number, moneda = "$"): string {
  const n = Number(centavos);
  if (!Number.isFinite(n)) return `${moneda}0.00`;
  return `${moneda}${(n / 100).toFixed(2)}`;
}

/**
 * Qué productos puede enseñar el bot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO OCULTO NO SE ENSEÑA, Y LO AGOTADO TAMPOCO. Son dos cosas distintas y las
 * dos acaban igual de mal: `oculto` es el negocio diciendo «esto no lo enseñes»
 * —lo usa para productos de temporada, para pruebas, para lo que ya no vende— y
 * `stock: 0` es agotado de verdad. Ofrecer por chat algo que no se puede
 * comprar es una conversación que termina en disculpa.
 *
 * OJO CON EL STOCK NULO: es «no llevo control de existencias», NO es cero. Es
 * el valor por defecto de la mayoría de los productos, y tratarlo como agotado
 * vaciaría el catálogo entero de casi todas las tiendas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function productosQueSePuedenOfrecer(
  productos: ProductoDelBot[] | null | undefined,
): ProductoDelBot[] {
  return (Array.isArray(productos) ? productos : [])
    .filter((p) => p && p.id && String(p.nombre ?? "").trim())
    .filter((p) => !p.oculto)
    .filter((p) => p.stock === null || p.stock === undefined || Number(p.stock) > 0)
    .sort((a, b) => {
      const d = (Number(a.orden) || 0) - (Number(b.orden) || 0);
      return d !== 0 ? d : String(a.nombre).localeCompare(String(b.nombre));
    });
}

export type CategoriaDelBot = { nombre: string; cuantos: number };

/**
 * Las categorías, con cuántos productos tiene cada una.
 *
 * LO QUE NO TIENE CATEGORÍA NO INVENTA UNA. Un producto suelto entra en «Otros»
 * solo si hay categorías de verdad; si NINGÚN producto está categorizado, no se
 * enseña ninguna categoría — enseñar una sola llamada «Otros» con todo dentro
 * es un paso de más que no informa de nada.
 */
export function categoriasDelBot(productos: ProductoDelBot[]): CategoriaDelBot[] {
  const cuenta = new Map<string, number>();
  let conCategoria = 0;

  for (const p of productos) {
    const c = String(p.categoria ?? "").trim();
    if (c) conCategoria++;
    const clave = c || "Otros";
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }

  if (!conCategoria) return [];
  return [...cuenta.entries()]
    .map(([nombre, cuantos]) => ({ nombre, cuantos }))
    .sort((a, b) => (a.nombre === "Otros" ? 1 : b.nombre === "Otros" ? -1 : 0) || a.nombre.localeCompare(b.nombre));
}

/**
 * Cuántas filas caben en una lista interactiva de WhatsApp.
 *
 * DIEZ, Y NO ES NEGOCIABLE: Meta rechaza el mensaje entero si te pasas, con un
 * error que no dice cuál es el problema. Un catálogo de 48 productos —que es el
 * tamaño de una tienda real de las nuestras— hay que partirlo sí o sí.
 */
export const MAX_FILAS_LISTA = 10;

/**
 * Una página del catálogo, en filas listas para pintar.
 *
 * SE PAGINA CON UNA FILA QUE DICE «Ver más», no con números de página. Nadie
 * escribe «página 3» en un chat de WhatsApp, y una lista que se corta en el
 * décimo producto sin decirlo hace creer que la tienda tiene diez cosas.
 */
export type FilaDeLista = { id: string; titulo: string; descripcion?: string };

export function paginaDeCatalogo(
  productos: ProductoDelBot[],
  desde = 0,
  moneda = "$",
  enlaceVerTodo?: string | null,
): { filas: FilaDeLista[]; hayMas: boolean; siguiente: number } {
  const inicio = Math.max(0, Math.floor(Number(desde) || 0));
  // Se deja hueco para la fila de «Ver más» solo cuando de verdad hay más, para
  // no desperdiciar una de las diez cuando el catálogo cabe justo.
  const restantes = productos.length - inicio;
  const hayMas = restantes > MAX_FILAS_LISTA;
  const cuantos = hayMas ? MAX_FILAS_LISTA - 1 : MAX_FILAS_LISTA;

  const filas: FilaDeLista[] = productos.slice(inicio, inicio + cuantos).map((p) => ({
    id: `prod-${p.id}`,
    // MADRE DE TODOS LOS RECHAZOS: Meta corta el título a 24 y la descripción a
    // 72, y si te pasas rechaza el mensaje entero.
    titulo: String(p.nombre).slice(0, 24),
    descripcion: [precioDelBot(p.precio, moneda), p.categoria ? String(p.categoria) : ""]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 72),
  }));

  if (hayMas) {
    filas.push({
      id: `mas-${inicio + cuantos}`,
      titulo: "Ver más productos",
      descripcion: enlaceVerTodo ? "O abre la tienda completa" : undefined,
    });
  }

  return { filas, hayMas, siguiente: inicio + cuantos };
}

/** ¿Esta respuesta es «quiero ver más»? Devuelve desde dónde seguir. */
export function desdeDondeSigue(idElegido: string): number | null {
  const m = /^mas-(\d+)$/.exec(String(idElegido ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** ¿Esta respuesta es un producto? Devuelve su id. */
export function productoElegido(idElegido: string): string | null {
  const m = /^prod-(.+)$/.exec(String(idElegido ?? "").trim());
  return m ? m[1] : null;
}

/* ── Bloque «Estado del pedido» ────────────────────────────────────────────── */

export type PedidoDelBot = {
  numero: number;
  estado: string;
  pago?: string | null;
  total: number;
  created_at?: string | null;
  codigo?: string | null;
};

/**
 * Cómo se le cuenta a un cliente el estado de su pedido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SE DICE «recibido», SE DICE QUÉ SIGNIFICA. Los estados internos son
 * palabras del panel, no del cliente: «recibido» suena a que ya está todo bien
 * cuando en realidad todavía no lo confirmó nadie, y «confirmado» no dice si ya
 * salió. Un cliente que pregunta por su pedido quiere saber DÓNDE ESTÁ y SI
 * TIENE QUE HACER ALGO.
 *
 * Y EL PAGO SE DICE APARTE. Aquí se cobra antes de preparar: un pedido sin
 * pagar está parado, y esa es la información que de verdad necesita — no el
 * estado del pedido, sino que le falta pagar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function comoVaElPedido(p: PedidoDelBot, moneda = "$"): string {
  const n = `#${p.numero}`;
  const monto = precioDelBot(p.total, moneda);
  const pagado = String(p.pago ?? "").trim() === "pagado";

  if (p.estado === "cancelado") {
    return `Tu pedido ${n} fue cancelado. Si quieres volver a pedir, escríbenos y te ayudamos.`;
  }

  // EL IMPAGO MANDA SOBRE EL ESTADO. Da igual en qué punto esté: si no se
  // pagó, no avanza, y decirle «lo estamos preparando» sería mentirle.
  if (!pagado) {
    return `Tu pedido ${n} de ${monto} está esperando el pago. En cuanto se registre lo empezamos a preparar.`;
  }

  const segun: Record<string, string> = {
    recibido: `Tu pedido ${n} de ${monto} ya está pagado y lo vamos a confirmar en breve.`,
    confirmado: `Tu pedido ${n} de ${monto} está confirmado. Ya lo estamos preparando.`,
    preparando: `Tu pedido ${n} de ${monto} se está preparando 📦`,
    en_camino: `Tu pedido ${n} de ${monto} va en camino 🚚`,
    entregado: `Tu pedido ${n} de ${monto} fue entregado. ¡Gracias por tu compra!`,
  };

  return segun[p.estado] ?? `Tu pedido ${n} de ${monto} está pagado y en proceso.`;
}

/**
 * El pedido del que hay que hablar.
 *
 * EL ÚLTIMO, Y LOS CANCELADOS NO CUENTAN. Quien pregunta «¿dónde va mi pedido?»
 * pregunta por el que acaba de hacer. Contestarle con uno cancelado de hace un
 * mes —que suele ser el que tienen quienes prueban la tienda— es la respuesta
 * más confusa posible.
 */
export function pedidoDelQueHablar(
  pedidos: PedidoDelBot[] | null | undefined,
): PedidoDelBot | null {
  const todos = (Array.isArray(pedidos) ? pedidos : []).filter((p) => p && Number.isFinite(p.numero));
  const vivos = todos.filter((p) => p.estado !== "cancelado");
  const lista = vivos.length ? vivos : todos;
  if (!lista.length) return null;

  return [...lista].sort((a, b) => {
    const ta = new Date(String(a.created_at ?? "")).getTime();
    const tb = new Date(String(b.created_at ?? "")).getTime();
    // Sin fecha legible manda el número, que en una tienda siempre sube.
    if (Number.isNaN(ta) || Number.isNaN(tb)) return b.numero - a.numero;
    return tb - ta || b.numero - a.numero;
  })[0];
}
