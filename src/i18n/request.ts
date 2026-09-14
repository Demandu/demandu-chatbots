import { getRequestConfig } from "next-intl/server";
import { idiomaDeLaSesion } from "@/i18n/sesion";

/**
 * De dónde saca la plataforma el idioma en cada petición.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SALE DE LA BASE, NO DE UNA COOKIE. Una cookie sería más barata, pero se
 * desincroniza: alguien cambia su idioma en otro navegador y este sigue
 * enseñando el viejo hasta que la cookie caduque. El dato manda desde un solo
 * sitio y punto.
 *
 * No cuesta un viaje extra: `membresiaDeLaSesion()` va envuelta en `cache()` de
 * React, así que la carga del panel ya la hizo para saber en qué cuenta estás.
 *
 * PASE LO QUE PASE, DEVUELVE UN IDIOMA. Si esto lanzara, no habría pantalla que
 * enseñar — ni siquiera el error. Ante la duda, español.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default getRequestConfig(async () => {
  const locale = await idiomaDeLaSesion();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
