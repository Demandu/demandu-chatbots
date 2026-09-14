/**
 * LOS IDIOMAS DE LA PLATAFORMA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA LISTA ESTÁ REPETIDA EN POSTGRES, en el `check` de `organizations.idioma`
 * y `memberships.idioma` (migración 0123). SI SE AÑADE UNO AQUÍ, HAY QUE
 * AMPLIARLO ALLÁ — y al revés. Una regla estática lo comprueba.
 *
 * No es duplicación por descuido: la base tiene que poder rechazar un idioma
 * que no existe. Un idioma inválido no revienta con un error, deja la pantalla
 * sin traducir; ese estado es de los más difíciles de rastrear y lo mejor es
 * que no pueda existir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const IDIOMAS = ["es", "pt-BR", "en"] as const;
export type Idioma = (typeof IDIOMAS)[number];

/** El de siempre. Es el que ve quien todavía no eligió. */
export const IDIOMA_DE_FABRICA: Idioma = "es";

/** Cómo se llama cada uno EN SU PROPIO IDIOMA — nunca traducido. */
export const COMO_SE_LLAMA: Record<Idioma, string> = {
  es: "Español",
  "pt-BR": "Português (Brasil)",
  en: "English",
};

/**
 * Un idioma de verdad, o el de fábrica.
 *
 * NO ADIVINA. «pt» no se convierte en «pt-BR» y «es-MX» no se convierte en
 * «es»: si llega algo que no está en la lista, se usa el de fábrica. Adivinar
 * aquí es cómo se acaba sirviendo portugués de Portugal a un brasileño.
 */
export function idiomaValido(v: unknown): Idioma {
  return (IDIOMAS as readonly string[]).includes(String(v ?? "")) ? (v as Idioma) : IDIOMA_DE_FABRICA;
}
