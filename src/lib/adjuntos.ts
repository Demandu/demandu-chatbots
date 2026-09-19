/**
 * De lo que hay guardado en un mensaje al archivo que hay que ir a buscar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS ALMACENES, Y NO ES BUROCRACIA.
 *
 *   · `media` es PÚBLICO y se queda así. Ahí vive lo que el negocio sube al
 *     bloque Multimedia del constructor, y esa dirección queda escrita DENTRO
 *     del flujo guardado. Volverla privada obligaría a reescribir los flujos de
 *     todos los clientes y a firmar cada imagen en el widget web. No hace falta:
 *     es contenido que el negocio manda a cualquiera que le escriba.
 *
 *   · `privado` es NUEVO y no es público. Ahí van los adjuntos de las
 *     conversaciones —lo que un cliente le manda a un negocio: fotos, recibos,
 *     documentos— y los archivos de entrenamiento. Eso no es contenido, son
 *     datos de una persona.
 *
 * ── TRES FORMAS GUARDADAS, Y LAS TRES TIENEN QUE SEGUIR VALIENDO ────────────
 *
 *   1. URL pública entera, de cuando todo era público → almacén `media`.
 *   2. Ruta pelada `<org>/whatsapp/…`, sin almacén → `media` (las de ayer).
 *   3. Ruta con almacén delante `privado/<org>/…` → las nuevas.
 *
 * Si se aceptaran solo las nuevas, el cambio habría borrado de la pantalla todo
 * el historial de adjuntos. Un arreglo de seguridad que hace desaparecer las
 * conversaciones de los clientes no es un arreglo: es otro incidente.
 *
 * ── POR QUÉ SE RECHAZA CUALQUIER OTRA DIRECCIÓN ─────────────────────────────
 *
 * Esto alimenta una ruta que redirige. Si aceptara una dirección cualquiera,
 * tendríamos un redirector abierto con nuestro dominio delante: justo lo que
 * sirve para que un correo de engaño enseñe `platform.demandu.tech` y acabe en
 * otro sitio. Solo se acepta lo que vive en NUESTRO almacén.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/*
 * LO QUE VIENE A CONTINUACIÓN ESTÁ DUPLICADO, A PROPÓSITO Y CON VIGILANCIA.
 *
 * El motor de WhatsApp corre en Deno, dentro de Supabase, y no puede importar
 * nada de `src/`. Pero necesita entender exactamente lo mismo que esta
 * pantalla: dónde vive un adjunto y cómo se guarda uno nuevo. Dos lecturas
 * distintas de la misma cadena y el archivo que se ve en la Bandeja no es el
 * que se manda por WhatsApp.
 *
 * Así que hay una copia literal en `supabase/functions/whatsapp/index.ts`, y
 * `scripts/pruebas/estatico.mjs` compara los dos bloques carácter a carácter.
 * Tocar uno sin el otro pone la prueba en rojo: la copia está permitida, la
 * divergencia no.
 */
/* ═══ COPIA LITERAL COMPARTIDA (src/lib/adjuntos.ts ↔ motor) · INICIO ═══ */
/** Los dos únicos almacenes que existen. Cualquier otro nombre no es nuestro. */
export const ALMACENES = ["media", "privado"] as const;
export type Almacen = (typeof ALMACENES)[number];

/** El almacén donde nacen los adjuntos nuevos: el que NO es público. */
export const ALMACEN_PRIVADO: Almacen = "privado";

const MARCAS = ["/storage/v1/object/public/", "/storage/v1/object/sign/"];

export type Adjuntado = { almacen: Almacen; ruta: string };

export function partesDeAdjunto(guardado: string | null | undefined): Adjuntado | null {
  const crudo = String(guardado ?? "").trim();
  if (!crudo) return null;

  let resto = crudo;
  let almacen: Almacen | null = null;

  if (/^https?:\/\//i.test(crudo)) {
    const marca = MARCAS.find((m) => crudo.includes(m));
    // Una dirección de fuera no se toca. Ver la cabecera: redirector abierto.
    if (!marca) return null;
    resto = crudo.slice(crudo.indexOf(marca) + marca.length);
    // Detrás de la marca viene `<almacen>/<ruta>`.
    const corte = resto.indexOf("/");
    if (corte < 1) return null;
    const nombre = resto.slice(0, corte);
    if (!(ALMACENES as readonly string[]).includes(nombre)) return null;
    almacen = nombre as Almacen;
    resto = resto.slice(corte + 1);
  }

  // Fuera lo que venga detrás de `?` (el token de una firma vieja, por ejemplo).
  resto = resto.split("?")[0].split("#")[0];

  try {
    resto = decodeURIComponent(resto);
  } catch {
    // Un `%` suelto rompe `decodeURIComponent`. Se deja como está: peor es
    // tirar el adjunto por un carácter raro en el nombre del archivo.
  }

  resto = resto.replace(/^\/+/, "");

  if (!almacen) {
    // Ruta pelada. Si empieza por el nombre de un almacén, ese es; si no, es
    // de las de ayer, cuando todo vivía en `media`.
    const corte = resto.indexOf("/");
    const primero = corte > 0 ? resto.slice(0, corte) : "";
    if ((ALMACENES as readonly string[]).includes(primero)) {
      almacen = primero as Almacen;
      resto = resto.slice(corte + 1);
    } else {
      almacen = "media";
    }
  }

  // `..` sale de la carpeta de la cuenta, que es justo lo que comprueba quien
  // llama. Sin esto, la comprobación de la primera carpeta no valdría nada.
  if (!resto || resto.includes("..")) return null;
  // Y tiene que tener al menos `<org>/<algo>`: una ruta de un solo trozo no
  // pertenece a ninguna cuenta.
  if (!resto.includes("/")) return null;

  return { almacen, ruta: resto };
}

/** Cómo se guarda un adjunto nuevo: con su almacén delante, sin ambigüedad. */
export function comoSeGuarda(almacen: Almacen, ruta: string): string {
  return `${almacen}/${ruta}`;
}

/* ═══ COPIA LITERAL COMPARTIDA (src/lib/adjuntos.ts ↔ motor) · FIN ═══ */

/**
 * La dirección que se pinta en la pantalla.
 *
 * Nunca la del almacén: siempre la nuestra, que comprueba de quién es el
 * archivo antes de firmarlo.
 */
export function enlaceDeAdjunto(guardado: string | null | undefined): string | null {
  const p = partesDeAdjunto(guardado);
  return p ? `/api/adjunto?r=${encodeURIComponent(comoSeGuarda(p.almacen, p.ruta))}` : null;
}
