import type { MetadataRoute } from "next";

/**
 * Lo que necesita el teléfono para «añadir a la pantalla de inicio».
 *
 * ── POR QUÉ ESTO Y NO SOLO UN FAVICON ───────────────────────────────────────
 *
 * La Bandeja se atiende desde el celular: un agente que está en la calle no
 * abre el portátil para contestar. Sin manifiesto, «añadir a inicio» deja un
 * acceso directo con la captura de la página y la barra del navegador encima;
 * con manifiesto queda un icono de verdad y la app a pantalla completa.
 *
 * ── EL ICONO «MASKABLE» NO ES UN DUPLICADO ──────────────────────────────────
 *
 * Android RECORTA el icono con la forma que tenga el teléfono —círculo, gota,
 * cuadrado redondeado— y lo hace sobre el que le des. Con el icono normal se
 * comería la antena y las orejas del robot. El `maskable` es el mismo dibujo
 * más pequeño dentro del lienzo, para que sobreviva a cualquier recorte.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Demandu · Plataforma Conversacional",
    short_name: "Demandu",
    description: "Convierte conversaciones en clientes.",
    start_url: "/inbox",
    display: "standalone",
    // El mismo azul del icono: así la barra de estado no corta con otro color.
    background_color: "#00043C",
    theme_color: "#00043C",
    icons: [
      { src: "/iconos/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
