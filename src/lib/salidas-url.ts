/**
 * La dirección a la que le mandamos los leads a un cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO SE ESCRIBIÓ PORQUE PASÓ.
 *
 * El 19 de septiembre, configurando Zoho, la dirección entró PEGADA DOS VECES:
 * 292 caracteres, `https://…https://…`. El formulario la aceptó sin decir
 * nada —`type="url"` del navegador la da por buena— y quedaron cuatro salidas,
 * tres de ellas apuntando a ninguna parte. Nadie se enteró hasta que se miró
 * la tabla a mano.
 *
 * Y el otro lado del mismo problema: cuando la dirección NO valía, la acción
 * del servidor devolvía `void` en silencio. Se pulsaba «Conectar» y no pasaba
 * nada: ni salida, ni error, ni una pista. Para quien lo usa, eso es la
 * plataforma rota.
 *
 * ── QUÉ SE RECHAZA Y POR QUÉ ────────────────────────────────────────────────
 *
 * 1. Lo que no es `https`. Por http, los datos del lead —nombre, teléfono,
 *    correo— viajan en claro por media internet.
 * 2. La dirección pegada dos veces. Un `://` después del primero no existe en
 *    ninguna dirección legítima de webhook.
 * 3. Las direcciones de la propia red: `localhost`, `127.*`, `10.*`,
 *    `192.168.*`, `172.16-31.*`, `169.254.*`, `::1`, `.internal`, `.local`.
 *    Quien manda la petición somos NOSOTROS, desde nuestros servidores: una
 *    dirección así no lleva el aviso al CRM de nadie, lleva nuestra petición a
 *    nuestra propia red. `169.254.169.254` es, en casi todas las nubes, donde
 *    vive la información de la máquina.
 *
 * Dato puro, sin imports: lo usan la acción del servidor y las pruebas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo más larga que puede ser. Una pegada dos veces suele pasar de esto. */
export const LARGO_MAXIMO = 500;

const RED_DE_CASA = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^0\.0\.0\.0$/,
  /\.internal$/i,
  /\.local$/i,
];

export type Revision =
  | { ok: true; url: string }
  | { ok: false; motivo: string };

export function revisarDireccion(crudo: string | null | undefined): Revision {
  const t = String(crudo ?? "").trim();
  if (!t) return { ok: false, motivo: "Falta la dirección a la que quieres que te mandemos." };

  if (t.length > LARGO_MAXIMO) {
    return {
      ok: false,
      motivo: `Esa dirección tiene ${t.length} caracteres y es demasiado larga. ` +
        "¿Se pegó dos veces?",
    };
  }

  // El `://` de más se mira ANTES de `new URL`, porque `new URL` da por buena
  // `https://a.com/https://b.com` — para él, la segunda mitad es la ruta.
  const dobles = t.split("://").length - 1;
  if (dobles > 1) {
    return {
      ok: false,
      motivo: "Parece que la dirección se pegó dos veces. Déjala una sola vez.",
    };
  }

  if (/\s/.test(t)) {
    return { ok: false, motivo: "La dirección lleva espacios. Revísala." };
  }

  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, motivo: "Eso no parece una dirección. Tiene que empezar por https://" };
  }

  if (u.protocol !== "https:") {
    return {
      ok: false,
      motivo: "Solo direcciones https: por http, los datos de tus leads viajarían sin cifrar.",
    };
  }

  if (RED_DE_CASA.some((p) => p.test(u.hostname))) {
    return {
      ok: false,
      motivo: "Esa dirección es de una red privada y desde nuestros servidores no lleva a ninguna parte.",
    };
  }

  // Se devuelve lo normalizado por `URL`: minúsculas en el dominio y sin
  // rarezas. Así dos personas que escriban lo mismo con distinta caja no
  // acaban con dos salidas que parecen distintas.
  return { ok: true, url: u.toString() };
}
