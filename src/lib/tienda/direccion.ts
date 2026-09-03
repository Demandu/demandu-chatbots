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
