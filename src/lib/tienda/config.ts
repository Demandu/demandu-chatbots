/**
 * Cómo se ve y qué pregunta una tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO SE INVENTÓ. Sale de mirar una tienda que hoy está en el aire y
 * vendiendo (eshop.demandu.tech/pawsathome): sus colores de verdad, su
 * cabecera, su pie, y sobre todo SU FORMULARIO, que resultó ser lo más
 * importante de todo el asunto.
 *
 * EL FORMULARIO NO ES FIJO. En el sistema actual las preguntas del pedido se
 * llaman `pr_preg1`…`pr_preg10` y cada tienda decide qué son. En la tienda que
 * revisé eran:
 *
 *     Nombre Completo*      (texto, obligatorio)
 *     Nombre PH*            (texto, obligatorio)   ← un edificio, en Panamá
 *     Número Apto / Casa*   (texto, obligatorio)
 *     Forma de Pago:*       (lista: Pago en local con Tarjeta / Yappy / MercadoPago)
 *     Delivery              (lista: zonas de entrega)
 *
 * Una veterinaria pregunta el nombre del perro; una panadería, la hora de
 * recogida. Por eso las preguntas son DATOS y no campos de una tabla: en el
 * momento en que se fijen, la mitad de los negocios no caben.
 *
 * El asterisco del final del texto es como el sistema viejo marca lo
 * obligatorio. Aquí se guarda aparte (`obligatoria`) para no obligar a nadie a
 * escribir un asterisco, pero al importar se entiende y se quita.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TipoPregunta = "texto" | "parrafo" | "lista" | "telefono";

export type PreguntaPedido = {
  /** Estable: es lo que se guarda con el pedido. No cambia al renombrar. */
  id: string;
  /** Lo que lee el cliente: «Nombre Completo», «Número Apto / Casa». */
  etiqueta: string;
  tipo: TipoPregunta;
  obligatoria: boolean;
  /** Solo con `lista`. */
  opciones?: string[];
  /** Texto gris dentro del campo. */
  ayuda?: string;
};

export type BannerTienda = {
  imagen_url: string;
  /** Adónde lleva al pulsarlo. Vacío = no lleva a ninguna parte. */
  enlace?: string;
  /** Para quien no ve la imagen, y para Google. */
  alt?: string;
};

export type ConfigTienda = {
  /** Lo que se lee arriba. Puede no ser el nombre legal del negocio. */
  titulo: string;
  logo_url?: string;
  /** Foto ancha de cabecera, detrás del logo. */
  portada_url?: string;
  /** Rotan solos. Vacío = no se pinta la franja. */
  banners: BannerTienda[];

  colores: {
    /** Botones, precios, lo que hay que mirar. */
    principal: string;
    /** El acento: ofertas, el contador del carrito. */
    acento: string;
    fondo: string;
    texto: string;
    /** El botón de WhatsApp. Se separa porque el verde de WhatsApp es una
     *  marca reconocible y muchos negocios lo quieren tal cual. */
    whatsapp: string;
  };

  /** A dónde se manda el pedido. Sin esto la tienda no sirve para nada. */
  whatsapp: {
    /** Solo dígitos, con código de país: «50762381138». */
    numero: string;
    /** Lo que dice el botón flotante. */
    texto_boton: string;
  };

  contacto: {
    horario?: string;
    instagram?: string;
    facebook?: string;
    direccion?: string;
    correo?: string;
  };

  /** Símbolo delante del precio. Panamá usa el dólar; Argentina no. */
  moneda: string;

  /** Las preguntas del pedido, en orden. */
  preguntas: PreguntaPedido[];

  /** Deja que el cliente escriba una nota en cada producto. */
  aclaraciones: boolean;

  /** En centavos, como todo el dinero de aquí. 0 = sin mínimo. */
  minimo_pedido: number;

  /** Lo que va abajo del todo, debajo del «Powered by». */
  pie?: string;
};

/**
 * Una tienda recién creada tiene que verse bien SIN que nadie configure nada.
 *
 * Una pantalla en blanco con veinte campos vacíos es donde se abandona el
 * producto. Estos valores son los de la tienda real que ya funciona, salvo el
 * teléfono: ese no se puede adivinar y sin él no hay pedido, así que se queda
 * vacío a propósito para que la pantalla lo pueda reclamar.
 */
export const CONFIG_POR_DEFECTO: ConfigTienda = {
  titulo: "",
  banners: [],
  colores: {
    principal: "#00043C",
    acento: "#F5247D",
    fondo: "#FFFFFF",
    texto: "#00043C",
    whatsapp: "#25D366",
  },
  whatsapp: { numero: "", texto_boton: "Enviar pedido por WhatsApp" },
  contacto: {},
  moneda: "$",
  preguntas: [
    { id: "nombre", etiqueta: "Nombre completo", tipo: "texto", obligatoria: true },
    { id: "telefono", etiqueta: "Teléfono", tipo: "telefono", obligatoria: true },
    { id: "direccion", etiqueta: "Dirección de entrega", tipo: "parrafo", obligatoria: true },
  ],
  aclaraciones: true,
  minimo_pedido: 0,
  pie: "",
};

/** Un color que se pueda pintar sin romper la tienda. */
export function colorValido(v: unknown): boolean {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

/**
 * Un teléfono para `wa.me`: SOLO DÍGITOS, con código de país.
 *
 * La gente lo escribe como lo dice: «+507 6238-1138», «(507) 6238 1138». Todas
 * esas formas rompen el enlace de WhatsApp en silencio —abre y no encuentra a
 * nadie— así que se normaliza aquí y no se le pide a nadie que teclee bonito.
 */
export function soloDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Lee lo que venga guardado y devuelve algo que la tienda puede pintar.
 *
 * NUNCA DEVUELVE A MEDIAS. La configuración vive en un `jsonb` que puede haber
 * escrito una versión anterior, un importador o una persona con la consola
 * abierta. Si el escaparate confiara en que están todas las claves, un campo
 * que falta sería una tienda en blanco para un cliente de verdad. Falta algo →
 * se usa el valor por defecto, y la tienda sigue vendiendo.
 */
export function leerConfig(crudo: unknown): ConfigTienda {
  const c = (crudo ?? {}) as Partial<ConfigTienda> & Record<string, unknown>;
  const d = CONFIG_POR_DEFECTO;

  const colores = (c.colores ?? {}) as Partial<ConfigTienda["colores"]>;
  const elegirColor = (v: unknown, porDefecto: string) =>
    colorValido(v) ? (v as string).trim() : porDefecto;

  const wa = (c.whatsapp ?? {}) as Partial<ConfigTienda["whatsapp"]>;

  const preguntas = Array.isArray(c.preguntas)
    ? (c.preguntas as PreguntaPedido[])
        .filter((p) => p && typeof p.etiqueta === "string" && p.etiqueta.trim())
        .map((p, i) => ({
          id: String(p.id ?? "").trim() || `pregunta_${i + 1}`,
          etiqueta: p.etiqueta.trim(),
          tipo: (["texto", "parrafo", "lista", "telefono"] as const).includes(p.tipo)
            ? p.tipo
            : "texto",
          obligatoria: p.obligatoria === true,
          // Una lista sin opciones es un desplegable vacío: el cliente no
          // puede contestar y no puede seguir. Se degrada a texto libre.
          ...(p.tipo === "lista" && Array.isArray(p.opciones) && p.opciones.length
            ? { opciones: p.opciones.map((o) => String(o).trim()).filter(Boolean) }
            : p.tipo === "lista"
              ? { tipo: "texto" as TipoPregunta }
              : {}),
          ...(p.ayuda ? { ayuda: String(p.ayuda) } : {}),
        }))
    : d.preguntas;

  return {
    titulo: String(c.titulo ?? "").trim(),
    logo_url: c.logo_url ? String(c.logo_url) : undefined,
    portada_url: c.portada_url ? String(c.portada_url) : undefined,
    banners: Array.isArray(c.banners)
      ? (c.banners as BannerTienda[])
          .filter((b) => b && typeof b.imagen_url === "string" && b.imagen_url.trim())
          .map((b) => ({
            imagen_url: b.imagen_url.trim(),
            ...(b.enlace ? { enlace: String(b.enlace) } : {}),
            ...(b.alt ? { alt: String(b.alt) } : {}),
          }))
      : [],
    colores: {
      principal: elegirColor(colores.principal, d.colores.principal),
      acento: elegirColor(colores.acento, d.colores.acento),
      fondo: elegirColor(colores.fondo, d.colores.fondo),
      texto: elegirColor(colores.texto, d.colores.texto),
      whatsapp: elegirColor(colores.whatsapp, d.colores.whatsapp),
    },
    whatsapp: {
      numero: soloDigitos(wa.numero),
      texto_boton: String(wa.texto_boton ?? "").trim() || d.whatsapp.texto_boton,
    },
    contacto: {
      horario: c.contacto?.horario || undefined,
      instagram: c.contacto?.instagram || undefined,
      facebook: c.contacto?.facebook || undefined,
      direccion: c.contacto?.direccion || undefined,
      correo: c.contacto?.correo || undefined,
    },
    moneda: String(c.moneda ?? "").trim() || d.moneda,
    preguntas: preguntas.length ? preguntas : d.preguntas,
    aclaraciones: c.aclaraciones !== false,
    minimo_pedido: Number.isFinite(Number(c.minimo_pedido))
      ? Math.max(0, Math.round(Number(c.minimo_pedido)))
      : 0,
    pie: c.pie ? String(c.pie) : "",
  };
}

/**
 * ¿Puede esta tienda recibir un pedido?
 *
 * Se pregunta ANTES de dejar publicar. Una tienda sin número de WhatsApp se ve
 * perfecta y no vende nada: el cliente llena el carrito, pulsa el botón y no
 * pasa nada. Es el fallo más caro posible porque nadie se entera.
 */
export function loQueFaltaParaVender(c: ConfigTienda): string[] {
  const falta: string[] = [];
  if (!c.titulo.trim()) falta.push("el nombre que se lee arriba");
  if (!c.whatsapp.numero) falta.push("el WhatsApp al que llegan los pedidos");
  if (c.whatsapp.numero && c.whatsapp.numero.length < 8) {
    falta.push("el WhatsApp completo, con código de país");
  }
  if (!c.preguntas.length) falta.push("al menos una pregunta en el formulario");
  return falta;
}
