/**
 * Qué medida tiene que tener cada imagen de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO EXISTE PARA QUE LA INSTRUCCIÓN Y EL RECORTE NO PUEDAN SEPARARSE.
 * La medida que se le dice al negocio y la proporción con la que la pantalla
 * recorta la foto salen del MISMO número. Escritas en dos sitios, el día que
 * alguien cambie el diseño la ayuda seguirá diciendo lo de antes — y el cliente
 * mandará una imagen que se ve cortada haciendo exactamente lo que le pedimos.
 *
 * DOS PROPORCIONES Y NADA MÁS: cuadrado, o 4 a 1. No es una limitación técnica,
 * es que la instrucción tiene que caber en un mensaje de WhatsApp. «Todo
 * cuadrado, menos la portada y los banners que son 4 a 1» se sigue; una tabla
 * de cinco medidas distintas no la sigue nadie, y acabamos recibiendo cinco
 * fotos mal cortadas.
 *
 * LOS PÍXELES SON UN MÍNIMO CÓMODO, no un requisito: se pide el doble de lo que
 * ocupa en pantalla porque los teléfonos de hoy tienen pantallas de doble
 * densidad y una foto justa se ve borrosa en ellos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type FormaImagen = "cuadrada" | "ancha";

export type MedidaImagen = {
  clave: "logo" | "portada" | "banner" | "categoria" | "producto";
  titulo: string;
  forma: FormaImagen;
  ancho: number;
  alto: number;
  /** Qué pasa con lo que sobra. Es lo que de verdad hay que explicar. */
  recorte: string;
};

/** La proporción de cada forma, como la escribe CSS: «4 / 1». */
export const PROPORCION: Record<FormaImagen, string> = {
  cuadrada: "1 / 1",
  // CUATRO A UNO Y NO TRES: con 3:1 la portada se comía media pantalla del
  // teléfono y empujaba el catálogo fuera de la vista. Una tienda es un
  // catálogo con una portada, no una portada con un catálogo debajo.
  ancha: "4 / 1",
};

export const MEDIDAS: MedidaImagen[] = [
  {
    clave: "logo",
    titulo: "Logo",
    forma: "cuadrada",
    ancho: 512,
    alto: 512,
    // DOS CASOS OPUESTOS, Y EL NEGOCIO ELIGE. Un logo con el nombre dentro
    // pierde justo el nombre si se recorta al círculo; uno cuadrado con su
    // propio fondo queda como una estampilla si no lo llena. Lo decide la
    // casilla «Mi logo tiene su propio fondo» del editor.
    recorte:
      "Va dentro de un círculo. Si tiene fondo transparente (PNG) se ve entero; si es cuadrado " +
      "y de color, marca «Mi logo tiene su propio fondo» y llena el círculo.",
  },
  {
    clave: "portada",
    titulo: "Portada",
    forma: "ancha",
    ancho: 1200,
    alto: 300,
    // YA NO SE RECORTA, Y ESTE TEXTO TIENE QUE DECIRLO. Antes se recortaba a
    // 4:1 y a quien subía otra proporción le desaparecía media pieza: el logo
    // de arriba, el texto de abajo. Ahora la portada se ve entera y esta medida
    // es la que MEJOR queda, no la única que funciona.
    recorte:
      "Se ve entera, no se recorta. A 4 a 1 llena la banda justa; más alta se ve completa " +
      "con franjas del color de tu tienda. Deja el logo del negocio fuera de la esquina de " +
      "abajo a la izquierda: ahí se apoya la foto de perfil.",
  },
  {
    clave: "banner",
    titulo: "Banners",
    forma: "ancha",
    ancho: 1200,
    alto: 300,
    recorte: "Se ven enteros. El texto que lleven dentro, grande: se leen en un teléfono.",
  },
  {
    clave: "categoria",
    titulo: "Foto de categoría",
    forma: "cuadrada",
    ancho: 500,
    alto: 500,
    // SE RECORTA AL CÍRCULO, al revés que el logo: aquí es una foto, no una
    // marca, y llenar el círculo se ve mucho mejor que dejar aire alrededor.
    recorte: "Se recorta en círculo: deja el motivo al centro.",
  },
  {
    clave: "producto",
    titulo: "Foto de producto",
    forma: "cuadrada",
    ancho: 1000,
    alto: 1000,
    recorte:
      "Se ve entera, sin recortar: un saco alto no pierde la marca ni el peso. Fondo blanco o liso.",
  },
];

/** «1200 × 300 px», para ponerlo en una etiqueta. */
export function comoMedida(m: MedidaImagen): string {
  return `${m.ancho} × ${m.alto} px`;
}

export function medida(clave: MedidaImagen["clave"]): MedidaImagen {
  const m = MEDIDAS.find((x) => x.clave === clave);
  // No puede faltar: las claves son un tipo cerrado. Si un día falta, es mejor
  // un cuadrado que una pantalla rota.
  return m ?? MEDIDAS[0];
}

/** La proporción CSS de una pieza: lo que usa la pantalla para recortar. */
export function proporcionDe(clave: MedidaImagen["clave"]): string {
  return PROPORCION[medida(clave).forma];
}

/**
 * La instrucción entera, para copiarla y mandársela al cliente.
 *
 * SE COPIA Y SE PEGA EN WHATSAPP: por eso va en texto plano y sin tablas, que
 * es como de verdad viaja esta información entre el negocio y quien le hace las
 * artes.
 */
export function instruccionesDeImagenes(): string {
  const linea = (m: MedidaImagen) => `· ${m.titulo}: ${comoMedida(m)}. ${m.recorte}`;
  return [
    "Medidas de las imágenes de la tienda:",
    "",
    ...MEDIDAS.map(linea),
    "",
    "En resumen: todo cuadrado, menos la portada y los banners que son 4 a 1 (cuatro veces más anchos que altos).",
    "La portada es la única que admite cualquier proporción sin cortarse: 4 a 1 es la que mejor queda.",
    "Formato JPG o PNG, menos de 1 MB cada una.",
  ].join("\n");
}

/* ══════════════════════════════════════════════════════════════════════════
 * ¿ESTO ES UN ENLACE A UNA IMAGEN, O ES TEXTO QUE ALGUIEN ESCRIBIÓ AHÍ?
 *
 * El editor del escaparate acepta cualquier cosa no vacía como enlace de una
 * imagen. Y lo que un negocio escribe en un campo que dice «Banners — uno por
 * línea» es, la mitad de las veces, «banner de verano» o el nombre del archivo
 * que tiene en el escritorio.
 *
 * Entonces la tienda pública pinta un `<img>` con eso dentro, y el visitante ve
 * el icono de imagen rota en la cabecera del negocio. No hay ningún error, ni
 * en la pantalla del dueño ni en ningún registro: la tienda simplemente se ve
 * mal, y el dueño se entera cuando se lo dice un cliente.
 *
 * QUÉ SE ACEPTA:
 *   · `https://…`  — lo normal, y lo único que recomendamos.
 *   · `http://…`   — se acepta y la pantalla lo avisa: en una página https el
 *                    navegador lo bloquea de todas formas, así que decir que
 *                    «no es un enlace» sería mentir sobre el motivo.
 *   · `/algo`      — una ruta de la propia plataforma.
 *   · `data:image/…` — una imagen pegada dentro del propio enlace.
 *
 * TODO LO DEMÁS SE CAE, en `leerConfig`, antes de llegar a la pantalla. No se
 * guarda tampoco: la pantalla del editor dice cuántas se cayeron y por qué, y
 * eso es la diferencia entre un dato mal puesto y una tienda rota en silencio.
 * ══════════════════════════════════════════════════════════════════════════ */
export function esEnlaceDeImagen(v: unknown): boolean {
  const t = String(v ?? "").trim();
  if (!t) return false;
  // Un espacio en medio no aparece en ningún enlace de verdad y sí en todas
  // las frases: es lo que separa «banner de verano» de una dirección.
  if (/\s/.test(t)) return false;
  if (t.startsWith("/")) return !t.startsWith("//");
  if (/^data:image\//i.test(t)) return true;
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    // Sin punto no hay dominio: `https://banner` no lleva a ninguna parte.
    return u.hostname.includes(".") && u.hostname.length > 3;
  } catch {
    return false;
  }
}

/** Lo mismo, pero devolviendo el valor limpio o nada. */
export function enlaceDeImagen(v: unknown): string | undefined {
  const t = String(v ?? "").trim();
  return esEnlaceDeImagen(t) ? t : undefined;
}
