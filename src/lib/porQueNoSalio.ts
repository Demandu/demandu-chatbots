/**
 * POR QUÉ NO SALIÓ UN MENSAJE.
 *
 * Cuando WhatsApp o Instagram rechazan un envío, la plataforma guarda en
 * `payload.no_entregado` lo que contestó Meta: un código y una frase en inglés.
 * Esa frase es correcta y es inútil. «Parameter format does not match format in
 * the created template» no le dice a nadie que lo que hay que hacer es subir
 * una imagen en otra pantalla — y mientras no se sepa eso, el agente reintenta
 * el mismo envío que va a volver a fallar.
 *
 * Aquí se traduce el código a UNA causa y UN arreglo. Lo que no se reconoce se
 * dice que no se reconoce: inventar una causa es peor que no dar ninguna,
 * porque manda a alguien a arreglar lo que no estaba roto.
 *
 * Este archivo NO tiene textos: devuelve claves, y los textos viven en
 * `messages/es.json`, `en.json` y `pt-BR.json`. Así el aviso sale en el idioma
 * de quien lo lee.
 */

export type FalloDeEnvio = {
  motivo?: string | null;
  code?: number | string | null;
} | null | undefined;

export type ClaveDeFallo =
  | "plantillaSinArchivo"
  | "faltanDatos"
  | "plantillaNoExiste"
  | "plantillaPausada"
  | "ventanaCerrada"
  | "noSeLePuedeEntregar"
  | "tipoNoSoportado"
  | "archivoNoValido"
  | "limiteDeMarketing"
  | "demasiadoSeguido"
  | "numeroBloqueado"
  | "desconocido";

export type Explicacion = {
  clave: ClaveDeFallo;
  /** El código de Meta, si vino uno. */
  codigo: number | null;
  /** Lo que contestó Meta, tal cual. NUNCA se esconde: es la única pista cuando no reconocemos el código. */
  textoDeMeta: string;
  /** Nombre de la plantilla del intento, si lo llevaba. */
  plantilla: string | null;
  /** Si hay un arreglo que decir. `desconocido` no lo tiene, y callarse es lo correcto. */
  hayArreglo: boolean;
};

/**
 * El código, en número.
 *
 * `Number(null)` es 0 y 0 ES finito, así que una comprobación perezosa
 * convertiría «no vino código» en «código 0». Ya pasó en `sortAlFinal` y
 * dejaba tarjetas al principio de la columna. Aquí dejaría una explicación
 * inventada colgada de un código que nadie mandó.
 */
export function codigoDeFallo(code: number | string | null | undefined): number | null {
  if (code === null || code === undefined) return null;
  if (typeof code === "string" && code.trim() === "") return null;
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/** Códigos de Meta que sabemos leer. Uno por causa, no uno por código. */
const POR_CODIGO: Record<number, ClaveDeFallo> = {
  132012: "plantillaSinArchivo",
  132000: "faltanDatos",
  132001: "plantillaNoExiste",
  132015: "plantillaPausada",
  132016: "plantillaPausada",
  131047: "ventanaCerrada",
  470: "ventanaCerrada",
  131026: "noSeLePuedeEntregar",
  131051: "tipoNoSoportado",
  131053: "archivoNoValido",
  131049: "limiteDeMarketing",
  130472: "limiteDeMarketing",
  130429: "demasiadoSeguido",
  131056: "demasiadoSeguido",
  368: "numeroBloqueado",
};

/** El 100 de Meta es «un parámetro no vale» y no dice cuál: la pista está en el texto. */
function esDelArchivo(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    t.includes("uri") ||
    t.includes("url") ||
    t.includes("link") ||
    t.includes("media") ||
    t.includes("image") ||
    t.includes("video") ||
    t.includes("document")
  );
}

export function explicacionDeFallo(fallo: FalloDeEnvio, plantilla?: string | null): Explicacion | null {
  if (!fallo) return null;

  const codigo = codigoDeFallo(fallo.code);
  const textoDeMeta = String(fallo.motivo ?? "").trim();
  const nombre = typeof plantilla === "string" && plantilla.trim() !== "" ? plantilla.trim() : null;

  let clave: ClaveDeFallo = "desconocido";
  if (codigo !== null && POR_CODIGO[codigo]) clave = POR_CODIGO[codigo];
  else if (codigo === 100 && esDelArchivo(textoDeMeta)) clave = "archivoNoValido";

  return {
    clave,
    codigo,
    textoDeMeta,
    plantilla: nombre,
    hayArreglo: clave !== "desconocido",
  };
}
