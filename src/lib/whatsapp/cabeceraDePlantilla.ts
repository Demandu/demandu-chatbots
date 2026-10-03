/**
 * El encabezado de una plantilla, para poder mandarlo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 2 oct 2026, EN LA CUENTA DE VENTAS DE DEMANDU. La plantilla `capac` —imagen
 * arriba, aprobada por Meta, usada para prospectar en el evento de CAPAC— no
 * salía nunca:
 *
 *     (#132012) Parameter format does not match format in the created template
 *
 * El motivo: su `HEADER` es de formato `IMAGE`, y Meta exige la imagen EN CADA
 * ENVÍO. `enviarPlantilla` armaba `body` y `button`, y la palabra «header» no
 * aparecía ni una vez en todo el código que arma plantillas.
 *
 * Lo peor no era el fallo, era el orden: el constructor SÍ deja crear
 * plantillas con encabezado de imagen y Meta las aprueba. O sea que dejábamos
 * crear plantillas que luego no podíamos enviar. El cliente la ve en verde en
 * su lista y cada envío falla.
 *
 * ── EL TIPO SALE DE LA PLANTILLA, LA IMAGEN SE GUARDA APARTE ──────────────
 *
 * El formato (IMAGE / VIDEO / DOCUMENT / TEXT) lo dice el propio `components`
 * que ya sincronizamos de Meta: esa es la verdad y no se copia a otro sitio.
 * Lo único que guardamos nosotros es la DIRECCIÓN de la imagen que se manda
 * (`whatsapp_templates.encabezado_url`), porque Meta no la da: el
 * `example.header_handle` que viene en la plantilla es solo la muestra de la
 * aprobación, es una dirección firmada de `scontent.whatsapp.net` con fecha de
 * caducidad dentro (`oe=`), y usarla para enviar deja de funcionar sin avisar.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/* ═══ COPIA LITERAL COMPARTIDA (src/lib/whatsapp/cabeceraDePlantilla.ts ↔ motor) · INICIO ═══ */
/** Los encabezados que llevan un archivo y por tanto hay que mandar. */
export const ENCABEZADOS_CON_ARCHIVO = ["IMAGE", "VIDEO", "DOCUMENT"] as const;
export type EncabezadoConArchivo = (typeof ENCABEZADOS_CON_ARCHIVO)[number];

/** Qué formato tiene el encabezado de esta plantilla, o `null` si no tiene. */
export function formatoDelEncabezado(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  const h = components.find((c: any) => String(c?.type ?? "").toUpperCase() === "HEADER");
  if (!h) return null;
  return String((h as any)?.format ?? "").toUpperCase() || null;
}

/** ¿El encabezado de esta plantilla lleva un archivo que hay que mandar? */
export function llevaArchivo(components: unknown): EncabezadoConArchivo | null {
  const f = formatoDelEncabezado(components);
  return (ENCABEZADOS_CON_ARCHIVO as readonly string[]).includes(f ?? "")
    ? (f as EncabezadoConArchivo)
    : null;
}

/**
 * ¿Esta plantilla NO se puede mandar todavía?
 *
 * SE PREGUNTA ANTES DE ENVIAR, NO DESPUÉS. Sin esto, el único aviso es el
 * #132012 de Meta, que llega cuando el mensaje ya se dio por enviado y que no
 * dice qué parámetro falta — hace revisar el cuerpo, que no era el problema.
 */
export function faltaElArchivoDelEncabezado(components: unknown, url?: string | null): boolean {
  return !!llevaArchivo(components) && !String(url ?? "").trim();
}


/**
 * El componente `header` tal y como lo quiere Meta, o `null` si no hace falta.
 *
 * El nombre del archivo solo lo admite `document`; en imagen y video Meta lo
 * rechaza, así que no se manda aunque lo tengamos.
 */
export function cabeceraParaEnviar(
  components: unknown,
  url?: string | null,
  nombreDelArchivo?: string | null,
): { type: "header"; parameters: any[] } | null {
  const formato = llevaArchivo(components);
  const enlace = String(url ?? "").trim();
  if (!formato || !enlace) return null;

  const clave = formato.toLowerCase() as "image" | "video" | "document";
  const archivo: any = { link: enlace };
  const nombre = String(nombreDelArchivo ?? "").trim();
  if (clave === "document" && nombre) archivo.filename = nombre;

  return { type: "header", parameters: [{ type: clave, [clave]: archivo }] };
}

/* ═══ COPIA LITERAL COMPARTIDA (src/lib/whatsapp/cabeceraDePlantilla.ts ↔ motor) · FIN ═══ */

/** Lo que hay que decirle a quien intenta mandarla sin su archivo. */
export function porQueNoSePuedeMandar(components: unknown): string {
  const f = llevaArchivo(components);
  const comoSeLlama =
    f === "VIDEO" ? "un video" : f === "DOCUMENT" ? "un documento" : "una imagen";
  return (
    `Esta plantilla lleva ${comoSeLlama} arriba y todavía no tiene cuál mandar. ` +
    `Súbela en la plantilla y vuelve a intentarlo: sin ella WhatsApp rechaza el envío.`
  );
}
