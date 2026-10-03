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

/* ── LOS DOMINIOS QUE SON FACEBOOK (3 oct 2026) ───────────────────────────
 *
 * La primera versión aceptaba solo `facebook.com`, `m.facebook.com` y
 * `fb.com`. Pero lo que la gente copia de la barra del navegador depende de
 * dónde está: `web.facebook.com` (muy común en Latinoamérica),
 * `es-la.facebook.com`, `business.facebook.com`… y el enlace corto `fb.me`.
 * Todos se rechazaban EN SILENCIO: el negocio guardaba y su Facebook no salía
 * — que es exactamente la queja del informe de clientes (issue 08).
 *
 * Cualquier subdominio de facebook.com se reescribe a `www.facebook.com`, que
 * abre bien en móvil y en computadora. `fb.me` se deja tal cual: es un enlace
 * corto que Facebook mismo redirige. */
function esDeFacebook(host: string): "largo" | "corto" | null {
  const h = host.toLowerCase();
  if (h === "facebook.com" || h.endsWith(".facebook.com")) return "largo";
  if (h === "fb.com" || h === "www.fb.com") return "largo";
  if (h === "fb.me" || h === "www.fb.me") return "corto";
  return null;
}

/** Lo que Facebook añade al compartir y no sirve para nada en la tienda. */
const RASTREO = /^(?:mibextid|rdid|share_url|ref|refid|__cft__|__tn__|_rdr|_rdc|paipv|eav|fbclid|locale)$/i;

export function enlaceDeFacebook(valor: string | null | undefined): string | null {
  let v = String(valor ?? "").trim();
  if (!v) return null;

  // «facebook.com/algo», «web.facebook.com/algo», «fb.me/algo» sin el
  // protocolo: es lo que más se pega por error. Se le pone y se trata igual.
  if (!/^https?:\/\//i.test(v) && /^(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.com|fb\.me)(?:[/?#]|$)/i.test(v)) {
    v = "https://" + v;
  }

  // Ya es una dirección: se acepta solo si es de Facebook. Un enlace a otro
  // sitio bajo la etiqueta «Facebook» confunde más que ayuda.
  if (/^https?:\/\//i.test(v)) {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return null;
    }
    const tipo = esDeFacebook(u.hostname);
    if (!tipo) return null;
    // Sin nada detrás del dominio no lleva a ninguna página concreta.
    const ruta = u.pathname.replace(/\/+$/, "");
    if (ruta === "") return null;
    if (tipo === "corto") return `https://fb.me${ruta}`;

    // `profile.php?id=…` es la ÚNICA dirección de Facebook que necesita algo
    // detrás del «?». El resto de lo que va ahí es rastreo de quien compartió.
    const params = new URLSearchParams();
    for (const [k, val] of u.searchParams) {
      if (RASTREO.test(k)) continue;
      if (ruta.toLowerCase() === "/profile.php" && k !== "id") continue;
      params.append(k, val);
    }
    if (ruta.toLowerCase() === "/profile.php" && !params.get("id")) return null;
    const q = params.toString();
    return `https://www.facebook.com${ruta}${q ? "?" + q : ""}`;
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
    // `profile.php` o `share/abc123` no son un nombre: se lee «Facebook», que
    // es lo que el visitante necesita saber para pulsarlo.
    if (!trozo || trozo.includes("/") || /\.php$/i.test(trozo) || new URL(enlace).hostname === "fb.me") {
      return "Facebook";
    }
    return trozo;
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
