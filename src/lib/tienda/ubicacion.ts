/**
 * DÓNDE VIVE EL CLIENTE, EN NÚMEROS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES UNA PREGUNTA MÁS Y NO UNA COLUMNA NUEVA DEL FORMULARIO.
 *
 * El formulario de cada tienda ya es DATO: una lista de preguntas que el
 * negocio arma como quiere («Nombre PH», «Número de apto», «Forma de pago»).
 * Meter la ubicación por fuera de esa lista habría creado un segundo sistema de
 * preguntas —uno configurable y otro fijo— y el negocio no podría ni moverla de
 * sitio ni quitarla si recoge en tienda.
 *
 * Así que es un tipo de pregunta más, `ubicacion`, y su respuesta viaja como
 * texto por la misma cañería de siempre: se guarda en `pedidos.respuestas`, se
 * ve en el panel, sale en el texto que lee el negocio. Lo único que hace este
 * archivo es traducir ese texto a dos números cuando hace falta.
 *
 * ── LAS TRES FORMAS EN QUE LLEGA, Y LAS TRES SON REALES ───────────────────
 *
 *   1. El botón «Usar mi ubicación» del navegador → «9.0136814,-79.4796534».
 *   2. Un enlace de Google Maps pegado. Es lo que hace la gente en Panamá:
 *      «te mando mi ubicación» y llega un enlace.
 *   3. Dos números escritos a mano, con o sin espacio.
 *
 * Aceptar solo la primera habría dejado fuera la que más se usa.
 *
 * ── EL ENLACE CORTO NO SE PUEDE ABRIR, Y HAY QUE DECIRLO ──────────────────
 *
 * `maps.app.goo.gl/AbC123` no lleva las coordenadas dentro: hay que pedírselas
 * a Google. Tragárselo en silencio dejaría al cliente creyendo que mandó su
 * ubicación y al negocio con un pedido que no se puede despachar. Se reconoce y
 * se dice qué hacer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ubicacionDe, type Ubicacion } from "./asap";

export type { Ubicacion };

/** El separador. Se dice una vez para que leer y escribir no puedan discrepar. */
const COMA = ",";

/**
 * Los números, como se guardan en la respuesta.
 *
 * SE RECORTA A SIETE DECIMALES. Un GPS de teléfono da quince y los últimos ocho
 * son ruido: siete decimales son once centímetros, más precisión de la que
 * tiene el aparato. Guardar el chorro entero solo hace que la respuesta se vea
 * como un error de programa en el panel del negocio.
 */
export function comoRespuesta(u: Ubicacion): string {
  const corto = (n: number) => String(Number(n.toFixed(7)));
  return `${corto(u.lat)}${COMA}${corto(u.long)}`;
}

/** Lo que se reconoce como «esto es un enlace acortado y no se puede abrir». */
const ACORTADORES = /(maps\.app\.goo\.gl|goo\.gl\/maps)/i;

export function esEnlaceAcortado(texto: string | null | undefined): boolean {
  return ACORTADORES.test(String(texto ?? ""));
}

/**
 * Dos números sacados de lo que sea que haya escrito o pegado el cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ORDEN ES SIEMPRE LATITUD PRIMERO, y NO se intenta adivinar si vienen al
 * revés. Sería tentador —en Panamá la longitud es negativa y la latitud no—
 * pero la tienda no es solo de Panamá, y una regla que acierta en un país y
 * falla en otro es peor que no tener regla: el día que falle, manda la moto a
 * otro continente sin avisar. Google, WhatsApp y el navegador ponen los tres la
 * latitud delante; con eso basta.
 *
 * SE DESCARTA EL ZOOM. `@9.0136,-79.4796,17z` trae TRES números y el tercero es
 * el nivel de acercamiento del mapa. Tomar los tres primeros números que
 * aparezcan en la cadena es exactamente cómo se acaba con el zoom metido en una
 * coordenada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function leerUbicacion(texto: string | null | undefined): Ubicacion | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;

  // AQUÍ NO HAY UN GUARDIÁN PARA LOS ENLACES CORTOS, Y ES A PROPÓSITO.
  //
  // Lo había, y un mutante demostró que no hacía nada: quitándolo no fallaba ni
  // una prueba, porque un `maps.app.goo.gl/AbC123` no encaja en ninguno de los
  // tres patrones de abajo — no lleva las coordenadas dentro, que es justo el
  // problema. Un guardián que no puede saltar es lo mismo que una prueba que no
  // puede fallar: da una seguridad que no existe y esconde dónde está la de
  // verdad.
  //
  // La que está de verdad es `porQueNoSirve`, que SÍ distingue el enlace corto
  // de un texto cualquiera — porque ahí es donde importa: en lo que se le dice
  // al cliente para que sepa qué hacer.
  const par = (a: unknown, b: unknown) => ubicacionDe(a, b);

  // 1. Enlace de Google/WhatsApp con `?q=`, `?ll=` o `?query=`: es el que manda
  //    WhatsApp al compartir una ubicación, y el más fiable de todos.
  //
  //    `query` ESTÁ EN LA LISTA PORQUE ES EL NUESTRO. `enlaceDeMapa` genera
  //    `...search/?api=1&query=lat,long`, que es el enlace que le mandamos al
  //    negocio por WhatsApp. Sin leerlo, el cliente que copia el enlace que le
  //    enseñamos y lo vuelve a pegar recibe «no pude leer esa ubicación» — con
  //    nuestro propio enlace delante.
  const q = t.match(/[?&](?:query|q|ll|daddr|destination)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  if (q) {
    const u = par(q[1], q[2]);
    if (u) return u;
  }

  // 2. Enlace con `@lat,long,zoom`. El `,17z` se queda fuera por construcción.
  const arroba = t.match(/@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (arroba) {
    const u = par(arroba[1], arroba[2]);
    if (u) return u;
  }

  // 3. Dos números sueltos. SE EXIGE QUE SEAN LOS DOS PRIMEROS de la cadena y
  //    que no haya nada raro delante: así «llegar en 15,20 minutos» no se
  //    convierte en una coordenada.
  const sueltos = t.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (sueltos) {
    const u = par(sueltos[1], sueltos[2]);
    if (u) return u;
  }

  return null;
}

/**
 * Lo que se le dice al cliente cuando lo que pegó no sirve.
 *
 * CADA MOTIVO TIENE SU FRASE. «Ubicación no válida» no le dice a nadie qué
 * hacer; «ese enlace es de los cortos, ábrelo y cópiame el de la barra» sí.
 */
export function porQueNoSirve(texto: string | null | undefined): string {
  const t = String(texto ?? "").trim();
  if (!t) return "Falta la ubicación.";
  if (esEnlaceAcortado(t)) {
    return "Ese enlace es de los cortos y no lleva la ubicación dentro. Ábrelo en el mapa y cópiame el enlace que quede en la barra de arriba.";
  }
  return "No pude leer esa ubicación. Puedes pulsar «Usar mi ubicación», o pegarme el enlace de Google Maps.";
}

/**
 * El enlace para MIRAR un punto en el mapa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES LA ÚNICA CONFIRMACIÓN QUE TIENE EL CLIENTE, y por eso existe. Un botón que
 * dice «ubicación guardada ✓» y nada más es un acto de fe: el GPS de un
 * teléfono dentro de un edificio se equivoca por cuadras enteras, y el cliente
 * no tiene forma de saberlo hasta que la moto no aparece.
 *
 * Se abre en Google Maps a propósito, aunque no sea nuestro: es el mapa que la
 * persona ya tiene instalado y sabe leer. Y no lleva ninguna llave de API — es
 * una dirección web normal, no cuesta nada y no se puede quedar sin cuota.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function enlaceDeMapa(u: Ubicacion): string {
  return `https://www.google.com/maps/search/?api=1&query=${comoRespuesta(u)}`;
}

/**
 * Cómo se lee una ubicación en el panel del negocio.
 *
 * Los números crudos no le dicen nada a nadie. Lo que necesita quien prepara el
 * pedido es poder pulsar y ver dónde es.
 */
export function comoSeLee(u: Ubicacion): string {
  return `${comoRespuesta(u)} · ver en el mapa`;
}

/* ── La precisión ──────────────────────────────────────────────────────────── */

/**
 * A partir de cuántos metros de error la ubicación deja de servir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CIEN METROS. No es un número redondo por gusto: por debajo de eso el
 * mensajero ya está en la cuadra y encuentra la casa con la dirección escrita;
 * por encima, el navegador está adivinando por la red wifi o por la antena de
 * teléfono, y eso en una ciudad se equivoca por barrios enteros.
 *
 * Y AQUÍ NO SE FALLA EN SILENCIO: si la precisión es mala se acepta igual —es
 * mejor que nada, y a veces es todo lo que hay— pero se le dice al cliente para
 * que pueda salir al balcón y volver a intentarlo. Rechazarla dejaría a quien
 * pide desde un sótano sin poder pedir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const PRECISION_BUENA = 100;

export function precisionDudosa(metros: unknown): boolean {
  const n = Number(metros);
  if (!Number.isFinite(n) || n <= 0) return false; // no la dijo: no se opina
  return n > PRECISION_BUENA;
}

export function comoSeLeeLaPrecision(metros: unknown): string {
  const n = Number(metros);
  if (!Number.isFinite(n) || n <= 0) return "";
  const m = Math.round(n);
  if (m > PRECISION_BUENA) {
    return `Precisión aproximada (±${m} m). Si puedes, sal a una ventana y vuelve a pulsarlo.`;
  }
  return `Precisión ±${m} m.`;
}

/* ── La pregunta de ubicación dentro del formulario ────────────────────────── */

type PreguntaMinima = { id: string; tipo?: string | null; etiqueta?: string | null };
type RespuestaGuardada = { id?: string | null; valor?: string | null };

/**
 * Cuál de las preguntas es la del mapa.
 *
 * SE DEVUELVE LA PRIMERA Y SOLO UNA. Un formulario con dos preguntas de
 * ubicación es un error de configuración, no una función: el pedido tiene un
 * destino, y elegir «la que tenga valor» haría que el mismo formulario mandara
 * la moto a un sitio u otro según cuál rellenara el cliente.
 */
export function preguntaDeUbicacion<T extends PreguntaMinima>(
  preguntas: T[] | null | undefined,
): T | null {
  return (preguntas ?? []).find((p) => p?.tipo === "ubicacion") ?? null;
}

/** La ubicación que trae un pedido ya guardado, leída de sus respuestas. */
export function ubicacionDeLasRespuestas(
  preguntas: PreguntaMinima[] | null | undefined,
  respuestas: RespuestaGuardada[] | null | undefined,
): Ubicacion | null {
  const p = preguntaDeUbicacion(preguntas);
  if (!p) return null;
  const r = (respuestas ?? []).find((x) => String(x?.id ?? "") === p.id);
  return leerUbicacion(r?.valor);
}

/**
 * La dirección escrita, para acompañar a la coordenada.
 *
 * SE BUSCA POR TIPO Y LUEGO POR NOMBRE, en ese orden. Casi todas las tiendas
 * llaman «Dirección de entrega» a un campo de párrafo —es lo que trae la
 * configuración de fábrica— pero una la llamó «Nombre PH» y otra «A dónde lo
 * llevamos». Buscar solo por el nombre exacto habría funcionado en la tienda
 * que miré y en ninguna otra.
 *
 * Se toma el párrafo más largo porque es donde la gente escribe la referencia
 * de verdad («casa azul frente al parque»), que es justo lo que el mensajero
 * necesita cuando el pin cae en la acera de enfrente.
 */
export function direccionDeLasRespuestas(
  preguntas: PreguntaMinima[] | null | undefined,
  respuestas: RespuestaGuardada[] | null | undefined,
): string {
  const lista = preguntas ?? [];
  const valorDe = (id: string) =>
    String((respuestas ?? []).find((x) => String(x?.id ?? "") === id)?.valor ?? "").trim();

  const porNombre = lista.filter((p) =>
    /direcci|domicili|entrega|d[oó]nde/i.test(String(p?.etiqueta ?? "")),
  );
  const parrafos = lista.filter((p) => p?.tipo === "parrafo");

  const candidatos = [...porNombre, ...parrafos]
    .map((p) => valorDe(p.id))
    .filter(Boolean);

  // El más largo: es el que trae la referencia, no el que trae «apto 3».
  const directa = candidatos.sort((a, b) => b.length - a.length)[0] ?? "";
  if (directa) return directa;

  // ── NINGUNA PREGUNTA SE LLAMA «DIRECCIÓN». Y ES LO NORMAL ────────────────
  //
  // Esto lo encontré mirando la tienda que de verdad está vendiendo. Su
  // formulario es:
  //
  //     Nombre completo · Teléfono · Nombre de PH · Número Interior: · Calle:
  //
  // La dirección existe —está entera— pero repartida en tres campos, ninguno
  // llamado «dirección» y ninguno de texto largo. Buscar el campo de dirección
  // devolvía VACÍO, y con `desti_address` vacío ASAP rechaza el pedido aunque
  // las coordenadas estén perfectas. Un fallo mudo, en la única tienda real.
  //
  // Así que se arma juntando lo que hay, CON SUS ETIQUETAS: el mensajero lee
  // «Nombre de PH: Torre Mar, Número Interior: 12B, Calle: Av. Balboa» y sabe
  // qué es cada cosa. Sin las etiquetas sería «Torre Mar, 12B, Av. Balboa», que
  // en un edificio no dice si el 12B es el piso o la casa.
  //
  // QUÉ SE DEJA FUERA, Y POR QUÉ CADA UNO:
  //   · el teléfono   → ya viaja en su propio campo de ASAP.
  //   · la ubicación  → son las coordenadas; repetirlas como texto no ayuda.
  //   · las listas    → casi siempre son «Método de pago» o «Retiro / Delivery».
  //   · el nombre     → va en `desti_customer_name`, y es la MISMA regla que ya
  //     usa el pedido para sacarlo: la PRIMERA pregunta que lleva «nombre».
  //     Por eso «Nombre de PH» sí entra: no es la primera.
  const sinTilde = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const elNombre = lista.find((p) => p?.tipo !== "lista" && sinTilde(String(p?.etiqueta ?? "")).includes("nombre"));

  return lista
    .filter((p) => p !== elNombre)
    .filter((p) => p?.tipo !== "telefono" && p?.tipo !== "ubicacion" && p?.tipo !== "lista")
    .map((p) => {
      const valor = valorDe(p.id);
      if (!valor) return "";
      // «Número Interior:» ya trae los dos puntos escritos por el negocio.
      const etiqueta = String(p?.etiqueta ?? "").trim().replace(/[:\s]+$/, "");
      return etiqueta ? `${etiqueta}: ${valor}` : valor;
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * ¿HAY QUE PEDIRLE LA UBICACIÓN A ESTE CLIENTE?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL BOQUETE QUE SE VIO EN VIVO. Alex pagó un pedido de verdad y la conversación
 * siguió como si nada: el sistema ya sabía guardar una ubicación si el cliente
 * la mandaba, y ya sabía qué pedidos no la tenían, pero no había nadie que
 * juntara las dos cosas y la pidiera. La función existía entera y era invisible.
 *
 * ── NO SE LE PIDE A TODO EL MUNDO ─────────────────────────────────────────
 *
 * Hay tiendas que no llevan a domicilio: una barbería, una panadería donde se
 * recoge en el mostrador. Pedirle la ubicación a esa gente es un mensaje que no
 * sirve para nada — y en WhatsApp cada mensaje cuesta y cada mensaje de más es
 * un chat silenciado.
 *
 * Así que hacen falta DOS SEÑALES, y las dos las da el negocio a propósito:
 *
 *   · tiene los envíos con mensajero encendidos, o
 *   · puso la pregunta de ubicación en su formulario.
 *
 * Cualquiera de las dos significa «yo llevo a domicilio». Ninguna se adivina.
 *
 * Y NO SE PIDE SI YA LA HAY: quien la marcó en la tienda no tiene que volver a
 * mandarla por el chat.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function hayQuePedirLaUbicacion(v: {
  /** Lo que ya trae el pedido guardado. */
  lat?: unknown;
  long?: unknown;
  /** Las preguntas del formulario de la tienda. */
  preguntas?: PreguntaMinima[] | null;
  /** ¿La tienda tiene el mensajero encendido? */
  enviosActivos?: boolean | null;
}): boolean {
  if (ubicacionDe(v?.lat, v?.long)) return false;
  return v?.enviosActivos === true || !!preguntaDeUbicacion(v?.preguntas);
}
