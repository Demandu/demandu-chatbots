/**
 * Los enlaces de redes y contacto del pie de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL NEGOCIO ESCRIBE LO QUE LE SALE, Y LAS DOS FORMAS SON RAZONABLES. Uno pega
 * `https://www.facebook.com/zapateriamaxi` y otro escribe `zapateriamaxi`. Las
 * dos tienen que acabar en un enlace que funcione: rechazar una de las dos es
 * hacerle un examen de informática a quien solo quiere poner su página.
 *
 * NO SE INVENTA UN ENLACE CON CUALQUIER COSA. Si lo escrito no puede ser ni una
 * dirección ni un nombre de usuario —lleva espacios, una arroba de correo, una
 * barra en medio— se devuelve nulo y el pie no pinta nada. Un enlace roto en la
 * tienda de un cliente es peor que un hueco: el visitante lo pulsa, cae en una
 * página de error, y el que queda mal es el negocio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Un nombre de usuario de Facebook: letras, números, puntos y guiones. */
const USUARIO = /^[A-Za-z0-9._-]{3,64}$/;

export function enlaceDeFacebook(valor: string | null | undefined): string | null {
  const v = String(valor ?? "").trim();
  if (!v) return null;

  // Ya es una dirección: se acepta solo si es de Facebook. Un enlace a otro
  // sitio bajo la etiqueta «Facebook» confunde más que ayuda.
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (host !== "facebook.com" && host !== "m.facebook.com" && host !== "fb.com") return null;
      // Sin nada detrás del dominio no lleva a ninguna página concreta.
      if (u.pathname.replace(/\/+$/, "") === "") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  // «facebook.com/algo» sin el protocolo: es lo que más se pega por error.
  const sinProtocolo = v.replace(/^(?:www\.|m\.)?(?:facebook\.com|fb\.com)\//i, "");
  if (sinProtocolo !== v) {
    const limpio = sinProtocolo.replace(/\/+$/, "").trim();
    return limpio ? `https://www.facebook.com/${limpio}` : null;
  }

  // Un nombre de usuario, con o sin arroba delante.
  const usuario = v.replace(/^@/, "");
  return USUARIO.test(usuario) ? `https://www.facebook.com/${usuario}` : null;
}

/** Cómo se lee en pantalla: el nombre, no la dirección entera. */
export function comoSeLeeFacebook(valor: string | null | undefined): string | null {
  const enlace = enlaceDeFacebook(valor);
  if (!enlace) return null;
  try {
    const trozo = new URL(enlace).pathname.replace(/^\/+|\/+$/g, "");
    return trozo || null;
  } catch {
    return null;
  }
}

/* ── EL CORREO NO SE VUELVE A ESCRIBIR AQUÍ ─────────────────────────────
 *
 * `correoValido` YA EXISTÍA en `agendaHorarios.ts`, escrita para que «no
 * tengo» o el nombre de la persona no acabaran en el campo de invitado de una
 * cita de Google. Escribí una segunda y las pruebas chocaron con el nombre
 * repetido — que es exactamente lo que impide que nazcan dos criterios para
 * lo mismo y que un día uno acepte lo que el otro rechaza.
 *
 * Se reexporta desde aquí para que el escaparate no tenga que importar de un
 * archivo que habla de agendas, pero la regla vive en un solo sitio. */
export { correoValido } from "@/lib/agendaHorarios";
