/**
 * ¿ESTE ENVÍO ES EL MISMO QUE EL DE HACE UN SEGUNDO?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Aquí solo vive la DECISIÓN, sin base de datos, para poder probarla de verdad.
 * Quién pregunta es `campaigns/actions.ts`.
 *
 * Ver la migración 0117: el 9 de septiembre un doble clic mandó la misma
 * plantilla dos veces a los mismos contactos, y el 2 de septiembre había pasado
 * lo mismo sin que nadie lo viera.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Cuánto tiempo después sigue siendo «el mismo envío».
 *
 * Los dos casos reales fueron a 1,5 y a 8,4 segundos. Sesenta deja sitio de
 * sobra para una segunda pulsación impaciente y sigue muy por debajo de lo que
 * tarda alguien en decidir a conciencia que quiere repetir una difusión.
 */
export const VENTANA_SEGUNDOS = 60;

/**
 * El choque contra `campaigns_idem_unico`.
 *
 * NO ES UN FALLO: es el candado haciendo su trabajo. Significa que este mismo
 * formulario ya creó su campaña, así que hay que llevar a esa y no crear otra.
 *
 * Se mira el código antes que el texto porque el texto de Postgres cambia con
 * el idioma del servidor, y un candado que depende del idioma no es un candado.
 */
export function esChoqueDeUnico(error: unknown): boolean {
  if (!error) return false; // solo `null`/`undefined` revientan al mirar dentro
  const e = error as { code?: unknown; message?: unknown };
  if (String(e.code ?? "") === "23505") return true;
  const texto = String(e.message ?? "").toLowerCase();
  return texto.includes("duplicate key") || texto.includes("campaigns_idem_unico");
}

/**
 * Sin identificador de formulario —una pestaña abierta desde antes del cambio—
 * queda esta red: una campaña igual, del mismo bot y la misma plantilla, creada
 * hace nada, es la misma.
 *
 * Es más floja que el índice único a propósito: compara por parecido, no por
 * identidad. Por eso es el respaldo y no el candado.
 */
export function esRepetidaPorTiempo(
  creadaEn: string | null | undefined,
  ahora: number,
  ventanaSegundos: number = VENTANA_SEGUNDOS,
): boolean {
  const pasado = ahora - Date.parse(String(creadaEn ?? ""));
  /* ANTE LA DUDA SE MANDA. Un reloj adelantado deja `pasado` en negativo y una
   * fecha ilegible lo deja en NaN: por aquí salen los dos, y los dos salen como
   * «no es repetida». Es el lado bueno del que equivocarse — el otro es una
   * difusión que el negocio pulsó y nunca salió, sin que nada lo diga. */
  if (!(pasado >= 0)) return false;
  return pasado <= ventanaSegundos * 1000;
}
