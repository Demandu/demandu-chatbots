import { getTranslations } from "next-intl/server";

/**
 * Los mensajes de las salidas que una persona lee, en su idioma.
 *
 * Van en un archivo aparte de `salidas.ts` por dos razones: ese archivo es
 * `"use server"` y solo puede exportar funciones asíncronas (no constantes), y
 * así el texto nuevo nace traducido en vez de sumarse al español escrito a mano
 * que todavía queda ahí.
 */
export async function mensajeDestinoRepetido(): Promise<string> {
  const t = await getTranslations("salidas");
  return t("destinoRepetido");
}
