/**
 * Lo que el cliente recibe cuando su pedido se mueve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL RECORRIDO SE CORTABA JUSTO DESPUÉS DE PAGAR. El aviso de Yappy llega, el
 * pedido pasa solo a Confirmados, el negocio lo arrastra a «En camino»… y el
 * cliente no se entera de nada. Se queda mirando el chat. A los veinte minutos
 * escribe «¿ya salió?», y alguien del equipo tiene que contestar a mano algo
 * que el sistema ya sabía.
 *
 * ESTO NO ES LA IA, Y NO DEBE SERLO. Un aviso de estado no es una conversación:
 * es un hecho que ya ocurrió, con un texto que el negocio escribió antes y
 * revisó. Meter un modelo en medio solo añade la posibilidad de que un día diga
 * algo que no es verdad sobre un pedido de verdad.
 *
 * EL TEXTO ES DEL NEGOCIO, NO NUESTRO. Una veterinaria y una pastelería no
 * hablan igual, y el aviso que mandamos sale con el nombre del negocio. Por eso
 * los textos de aquí son solo el punto de partida: se pueden cambiar todos.
 *
 * CADA AVISO CUESTA. WhatsApp cobra las conversaciones que abre el negocio, y
 * el cliente que recibe cinco mensajes por un pedido silencia el chat. Por eso
 * «Preparando» viene apagado: es el único paso que casi nunca aporta algo que
 * el cliente no supiera ya.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los momentos en los que se le puede escribir al cliente. */
export type MomentoAviso =
  | "pagado"
  | "enlace_vencido"
  | "pago_no_completado"
  | "confirmado"
  | "preparando"
  | "en_camino"
  | "entregado"
  | "cancelado";

/**
 * El botón que acompaña al aviso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SOLO DONDE HAY ALGO QUE HACER. Un aviso de «va en camino» no necesita botón:
 * no hay nada que pulsar. Un cobro que no se completó sí — y la diferencia
 * entre poner el enlace o no ponerlo es la diferencia entre recuperar esa venta
 * y perderla.
 *
 * ADÓNDE LLEVA NO LO ELIGE EL NEGOCIO, lo decide el momento: un pedido
 * cancelado lleva a la tienda (a empezar de nuevo) y uno que sigue vivo lleva a
 * su propio cobro. Dejarlo configurable solo permitiría mandar al cliente a
 * pagar un pedido que ya no existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type BotonAviso = { texto: string; a: "tienda" | "pago" };

export type Aviso = {
  activo: boolean;
  texto: string;
};

export type AvisosTienda = {
  /** El interruptor general: apagado, no sale ni uno. */
  activo: boolean;
  momentos: Record<MomentoAviso, Aviso>;
};

/**
 * Los datos que se pueden meter dentro del texto.
 *
 * SON POCOS A PROPÓSITO. Cada hueco es algo que el negocio tiene que entender
 * de un vistazo; una lista de veinte variables no la usa nadie y se equivocan
 * todos.
 */
export type DatosAviso = {
  numero: number | string;
  tienda: string;
  /** Ya formateado: «$25.00». Aquí no se hacen cuentas. */
  total: string;
  codigo: string;
  /** Puede no saberse. El hueco desaparece limpio si falta. */
  cliente?: string;
};

export const HUECOS = ["numero", "tienda", "total", "codigo", "cliente"] as const;

/**
 * El catálogo de momentos, en el orden en el que ocurren.
 *
 * EL ORDEN IMPORTA EN LA PANTALLA: es el recorrido del pedido, de arriba abajo,
 * y así el negocio ve de un golpe qué le llega al cliente y qué no.
 */
export const MOMENTOS: {
  clave: MomentoAviso;
  etiqueta: string;
  cuando: string;
  activo: boolean;
  texto: string;
  /** ¿Se alcanza moviendo la tarjeta en el tablero? */
  esEstado: boolean;
  boton?: BotonAviso;
}[] = [
  {
    clave: "pagado",
    etiqueta: "Pago recibido",
    cuando: "Cuando el banco confirma el pago.",
    activo: true,
    esEstado: false,
    texto:
      "¡Pago recibido! ✅ Tu pedido #{numero} en {tienda} quedó confirmado por {total}. Te vamos avisando por aquí.",
  },
  {
    clave: "enlace_vencido",
    etiqueta: "Se venció el enlace de pago",
    cuando: "Cuando pasan los minutos y el cobro caduca. El pedido se cancela solo.",
    activo: true,
    esEstado: false,
    texto:
      "Se venció el enlace de pago de tu pedido #{numero} en {tienda}, así que quedó cancelado. Si todavía lo quieres, puedes volver a pedirlo en un minuto.",
    boton: { texto: "Volver a pedir", a: "tienda" },
  },
  {
    clave: "pago_no_completado",
    etiqueta: "El pago no se completó",
    // ESTE NO CANCELA NADA, y es deliberado: cancelar en la app de Yappy es casi
    // siempre un dedazo, y el cliente lo reintenta a los diez segundos. Si el
    // pedido ya estuviera cancelado, ese dedazo le costaría el carrito entero.
    cuando: "Cuando el banco lo rechaza o el cliente lo cancela en su app. El pedido sigue vivo.",
    activo: true,
    esEstado: false,
    texto:
      "No se completó el pago de tu pedido #{numero} en {tienda}. Tu pedido sigue guardado: puedes intentarlo otra vez.",
    boton: { texto: "Pagar de nuevo", a: "pago" },
  },
  {
    clave: "confirmado",
    etiqueta: "Confirmado",
    cuando: "Cuando lo mueves a Confirmados.",
    activo: true,
    esEstado: true,
    texto: "Confirmamos tu pedido #{numero} en {tienda}. Ya lo tenemos anotado, {cliente}.",
  },
  {
    clave: "preparando",
    etiqueta: "Preparando",
    // Apagado de fábrica: ver la cabecera. No es un descuido.
    cuando: "Cuando lo mueves a Preparando.",
    activo: false,
    esEstado: true,
    texto: "Tu pedido #{numero} ya se está preparando.",
  },
  {
    clave: "en_camino",
    etiqueta: "En camino",
    cuando: "Cuando lo mueves a En camino.",
    activo: true,
    esEstado: true,
    texto: "¡Tu pedido #{numero} va en camino! 🛵",
  },
  {
    clave: "entregado",
    etiqueta: "Entregado",
    cuando: "Cuando lo mueves a Entregado.",
    activo: true,
    esEstado: true,
    texto: "Tu pedido #{numero} fue entregado. ¡Gracias por comprar en {tienda}!",
  },
  {
    clave: "cancelado",
    etiqueta: "Cancelado",
    cuando: "Cuando lo mueves a Cancelado.",
    activo: true,
    esEstado: true,
    texto:
      "Tu pedido #{numero} en {tienda} quedó cancelado. Si crees que es un error, escríbenos por aquí.",
  },
];

/**
 * Cuánto puede medir un aviso.
 *
 * No es el límite de WhatsApp (4096), es el del sentido común: esto se lee en
 * una notificación del teléfono. Lo que no cabe aquí es una conversación, y una
 * conversación la tiene una persona, no un aviso automático.
 */
export const MAX_AVISO = 700;

export const AVISOS_POR_DEFECTO: AvisosTienda = {
  activo: true,
  momentos: Object.fromEntries(
    MOMENTOS.map((m) => [m.clave, { activo: m.activo, texto: m.texto }]),
  ) as Record<MomentoAviso, Aviso>,
};

/**
 * Lee lo que haya guardado y devuelve algo con lo que se puede trabajar.
 *
 * NUNCA DEVUELVE UN MOMENTO A MEDIAS. Si falta una clave —porque la escribió
 * una versión anterior, o porque alguien tocó el JSON— se usa el texto de
 * fábrica en vez de mandarle al cliente un mensaje vacío. Un aviso en blanco es
 * peor que no avisar: llega, no dice nada, y el cliente escribe preguntando qué
 * fue eso.
 */
export function sanearAvisos(crudo: unknown): AvisosTienda {
  const c = (crudo ?? {}) as Partial<AvisosTienda>;
  const dados = (c.momentos ?? {}) as Partial<Record<MomentoAviso, Partial<Aviso>>>;

  const momentos = {} as Record<MomentoAviso, Aviso>;
  for (const m of MOMENTOS) {
    const guardado = dados[m.clave] ?? {};
    const texto = String(guardado.texto ?? "").trim().slice(0, MAX_AVISO);
    momentos[m.clave] = {
      activo: guardado.activo === undefined ? m.activo : guardado.activo === true,
      texto: texto || m.texto,
    };
  }

  return { activo: c.activo !== false, momentos };
}

/**
 * Pone los datos dentro del texto.
 *
 * UN HUECO SIN VALOR SE VA ENTERO, y con él la coma y el espacio que le
 * sobraban. «Ya lo tenemos anotado, {cliente}.» sin nombre tiene que quedar
 * «Ya lo tenemos anotado.» y no «Ya lo tenemos anotado, .» — que es exactamente
 * el detalle por el que un mensaje automático se nota automático.
 *
 * UN HUECO QUE NO EXISTE SE DEJA A LA VISTA. Si el negocio escribe `{pedido}`
 * en vez de `{numero}`, verlo en la vista previa es lo que hace que lo corrija;
 * borrarlo en silencio deja un mensaje sin el dato más importante.
 */
export function rellenarAviso(texto: string, datos: DatosAviso): string {
  const valores: Record<string, string> = {
    numero: String(datos.numero ?? ""),
    tienda: String(datos.tienda ?? "").trim(),
    total: String(datos.total ?? "").trim(),
    codigo: String(datos.codigo ?? "").trim(),
    cliente: String(datos.cliente ?? "").trim(),
  };

  return String(texto ?? "")
    .replace(/\{(\w+)\}/g, (entero, hueco: string) =>
      hueco in valores ? valores[hueco] : entero,
    )
    // Los restos de un hueco vacío: « ,» «,,» y los espacios de más.
    .replace(/[ \t]+([,;.!?])/g, "$1")
    .replace(/,\s*([,.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * El texto que se le manda al cliente en este momento, o nada.
 *
 * DEVOLVER `null` ES UNA RESPUESTA VÁLIDA y es la que más se va a usar: el
 * interruptor general apagado, ese momento apagado, o un texto que quedó vacío.
 * Quien llama no tiene que saber por qué; solo que aquí no hay nada que mandar.
 */
export function textoDelAviso(
  momento: MomentoAviso,
  avisos: AvisosTienda,
  datos: DatosAviso,
): string | null {
  if (!avisos.activo) return null;
  const a = avisos.momentos[momento];
  if (!a || !a.activo) return null;

  const texto = rellenarAviso(a.texto, datos);
  return texto ? texto : null;
}

/**
 * ¿A qué aviso corresponde este estado del pedido?
 *
 * «RECIBIDO» NO AVISA, y no es un olvido: el cliente acaba de mandar el pedido
 * hace dos segundos. Contestarle «recibimos tu pedido» a la vez que su propio
 * mensaje es ruido, y encima abre una conversación facturable para no decir
 * nada.
 */
export function momentoDelEstado(estado: string): MomentoAviso | null {
  const e = String(estado ?? "").trim();
  // SOLO LOS QUE SE ALCANZAN ARRASTRANDO. «Pagado», «se venció el enlace» y «el
  // pago no se completó» los dispara el banco; si el tablero pudiera llegar
  // también a ellos habría dos caminos hacia el mismo mensaje.
  return MOMENTOS.some((m) => m.clave === e && m.esEstado) ? (e as MomentoAviso) : null;
}

/** El botón que lleva este aviso, si lleva alguno. */
export function botonDelAviso(momento: MomentoAviso): BotonAviso | null {
  return MOMENTOS.find((m) => m.clave === momento)?.boton ?? null;
}
