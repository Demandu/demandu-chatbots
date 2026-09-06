/**
 * Respuestas rápidas: mensajes que el equipo escribe una vez y reutiliza
 * en el chat en vivo, como en WhatsApp Business.
 */

export type RespuestaRapida = {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  category: string | null;
  sort: number;
  uses: number;
};

/** Variables que se reemplazan al insertar la respuesta en el chat. */
export const VARIABLES: { clave: string; etiqueta: string }[] = [
  { clave: "nombre", etiqueta: "Nombre del cliente" },
  { clave: "primerNombre", etiqueta: "Solo su primer nombre" },
  { clave: "telefono", etiqueta: "Su teléfono" },
  { clave: "empresa", etiqueta: "Su empresa" },
  { clave: "agente", etiqueta: "Tu nombre" },
];

/** Deja el atajo en su forma canónica: sin barra, sin espacios, en minúsculas. */
export function limpiarAtajo(s: string): string {
  return String(s ?? "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 30);
}

/** Reemplaza {{variables}} con los datos reales. Lo que no exista se quita. */
export function rellenar(texto: string, datos: Record<string, string | null | undefined>): string {
  return String(texto ?? "")
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => datos[k] ?? "")
    .replace(/([,;:])\s*([!?.…])/g, "$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}

/** Busca por atajo, título o contenido. Sin acentos ni mayúsculas. */
export function filtrar(lista: RespuestaRapida[], q: string): RespuestaRapida[] {
  const t = String(q ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!t) return lista;
  const norm = (s: string) =>
    String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Los que empiezan por el texto salen primero: es lo que uno espera al teclear.
  const puntua = (r: RespuestaRapida) => {
    if (norm(r.shortcut).startsWith(t)) return 0;
    if (norm(r.title).startsWith(t)) return 1;
    if (norm(r.shortcut).includes(t) || norm(r.title).includes(t)) return 2;
    if (norm(r.body).includes(t)) return 3;
    return 99;
  };
  return lista
    .map((r) => ({ r, p: puntua(r) }))
    .filter((x) => x.p < 99)
    .sort((a, b) => a.p - b.p || a.r.sort - b.r.sort)
    .map((x) => x.r);
}
