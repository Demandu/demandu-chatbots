/**
 * QUIÉN ES, en las tres claves que TODO `lead.datos` tiene que llevar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL MISMO EVENTO SIGNIFICABA COSAS DISTINTAS SEGÚN EL CANAL. El motor de
 * WhatsApp mandaba `telefono`; la web y el panel mandaban `contacto_id` y ya.
 * Así que un CRM conectado a `lead.datos` podía identificar al lead cuando
 * escribía por WhatsApp y se quedaba sin saber de quién le hablaban cuando
 * escribía por la web — con el mismo evento y el mismo contrato.
 *
 * Se vio con Zoho: su acción de buscar un lead va por correo o por id, nunca
 * por teléfono. Sin estas tres claves juntas, las etiquetas llegaban al CRM y
 * no había a quién pegárselas.
 *
 * ── POR QUÉ EL RESPALDO MIRA EL CANAL ───────────────────────────────────────
 *
 * `external_id` es el identificador de la persona en su canal. En WhatsApp ESE
 * identificador es su teléfono, así que vale de respaldo. En Instagram no lo
 * es: mandar un identificador de Instagram dentro de un campo llamado
 * «teléfono» es peor que mandarlo vacío, porque el CRM lo guarda como bueno y
 * alguien acaba marcándolo.
 *
 * Es la misma regla que la migración 0131 escribió para las citas. Aquí está en
 * una función porque la usan tres sitios y no puede divergir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los canales donde el identificador de la persona ES su teléfono. */
const CANALES_CON_TELEFONO = ["whatsapp"];

export type FichaMinima = {
  id: string;
  name?: string | null;
  phone?: string | null;
  external_id?: string | null;
  channel?: string | null;
};

export function quienEs(c: FichaMinima | null | undefined): {
  contacto_id: string | null;
  telefono: string | null;
  nombre: string | null;
} {
  if (!c) return { contacto_id: null, telefono: null, nombre: null };
  const respaldo = CANALES_CON_TELEFONO.includes(String(c.channel ?? ""))
    ? (c.external_id ?? "").trim()
    : "";
  return {
    contacto_id: c.id ?? null,
    telefono: (c.phone ?? "").trim() || respaldo || null,
    nombre: (c.name ?? "").trim() || null,
  };
}
