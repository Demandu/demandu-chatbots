/**
 * La dirección pública de una tienda: lo que va detrás de eshop.demandu.tech/
 *
 * SE LIMPIA AQUÍ Y NO SE LE PIDE AL CLIENTE QUE LO ESCRIBA BIEN. La base tiene
 * una regla estricta (`^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`) y si dejáramos pasar
 * "Paws At Home" el error que vería sería el de Postgres, en inglés y sin
 * decirle qué hacer.
 *
 * LOS ACENTOS SE QUITAN A PROPÓSITO: «panadería» y «panaderia» tienen que
 * llevar al mismo sitio, porque nadie escribe la tilde al teclear una
 * dirección — y menos al dictarla por teléfono.
 *
 * Vive fuera de las acciones de servidor porque un archivo `"use server"` solo
 * puede exportar funciones asíncronas; y aparte, así se puede probar sola y
 * usarla también en el navegador para enseñar la dirección mientras se escribe.
 */
export function aDireccion(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Todo lo que no sea letra o número es un guion: espacios, puntos, «&»…
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    // El recorte a 50 puede dejar un guion colgando al final, y la regla de la
    // base lo rechaza. Se vuelve a limpiar DESPUÉS de cortar, no antes.
    .replace(/-+$/g, "");
}

/** ¿La aceptaría la base? Mismo criterio, dicho una sola vez. */
export function direccionValida(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug);
}

/**
 * El dominio donde viven las tiendas de la plataforma.
 *
 * NO ES `eshop.demandu.tech` A PROPÓSITO. Esa dirección la sirve hoy el
 * proveedor anterior y ahí están funcionando las tiendas de clientes reales:
 * apuntarla aquí las tumbaría todas de golpe. Las tiendas nuevas nacen en
 * `store` sin tocar nada, y las viejas se migran de una en una cuando su dueño
 * lo diga.
 *
 * VA EN UNA CONSTANTE, no repartido por las pantallas, porque ya cambió una vez
 * (`shop` → `store`) antes de tener un solo cliente encima. La próxima vez que
 * cambie tiene que ser este renglón y nada más — o el día que se olvide una
 * pantalla, esa mandará clientes a una tienda que no existe.
 *
 * Se puede cambiar por entorno para probar sin tocar el código.
 */
export const DOMINIO_TIENDAS =
  (process.env.NEXT_PUBLIC_DOMINIO_TIENDAS ?? "store.demandu.tech").trim().toLowerCase();

/** La dirección completa de una tienda, tal y como se comparte. */
export function enlaceDeTienda(slug: string): string {
  return `https://${DOMINIO_TIENDAS}/${slug}`;
}

/** Lo que se enseña en pantalla: sin `https://`, que no aporta nada al leerlo. */
export function enlaceLegible(slug: string): string {
  return `${DOMINIO_TIENDAS}/${slug}`;
}
