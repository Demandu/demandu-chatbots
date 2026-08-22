/**
 * Google Sheets: leer qué hojas tiene el cliente y añadirle filas.
 *
 * POR QUÉ SHEETS ES LA PRIMERA INTEGRACIÓN NATIVA: para la mayoría de las PyMEs
 * latinoamericanas la hoja de cálculo ES el CRM. No es un paso intermedio hacia
 * un sistema serio: es donde de verdad miran sus leads, donde los ordenan y
 * desde donde llaman. Llevarles ahí lo que entra por el chat vale más que
 * cualquier sincronización con un CRM que no usan.
 */

const DRIVE_LISTA = "https://www.googleapis.com/drive/v3/files";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export type HojaDeCalculo = { id: string; nombre: string };

/**
 * Las hojas que el cliente puede elegir.
 *
 * Con el permiso `drive.file` solo se ven los archivos que él mismo autorizó,
 * no todo su Drive. Es menos cómodo —la lista puede salir vacía la primera
 * vez— y es lo correcto: no tenemos por qué poder leer sus documentos.
 */
export async function listarHojas(token: string): Promise<HojaDeCalculo[]> {
  const url = new URL(DRIVE_LISTA);
  url.searchParams.set("q", "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("orderBy", "modifiedTime desc");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("[sheets] listar:", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  const j = await res.json();
  return ((j?.files ?? []) as any[]).map((f) => ({ id: f.id, nombre: f.name }));
}

/** Crea una hoja nueva ya con los encabezados puestos. */
export async function crearHoja(token: string, titulo: string): Promise<HojaDeCalculo | null> {
  const res = await fetch(SHEETS, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title: titulo } }),
  });
  if (!res.ok) {
    console.error("[sheets] crear:", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const j = await res.json();
  const id = j?.spreadsheetId as string;
  if (!id) return null;

  await añadirFila(token, id, ENCABEZADOS);
  return { id, nombre: titulo };
}

export const ENCABEZADOS = [
  "Fecha",
  "Nombre",
  "Teléfono",
  "Correo",
  "Empresa",
  "País",
  "Canal",
  "Etiquetas",
];

/**
 * Añade una fila al final.
 *
 * `INSERT_ROWS` y no `OVERWRITE`: si el cliente tiene fórmulas o una tabla
 * debajo, sobrescribir le destrozaría su hoja. Insertar respeta lo que ya hay.
 *
 * `USER_ENTERED` hace que Google interprete los valores como si los hubiera
 * tecleado una persona — así una fecha se ve como fecha y un teléfono con «+»
 * no se convierte en una fórmula rota.
 */
export async function añadirFila(
  token: string,
  hojaId: string,
  valores: (string | number)[],
): Promise<{ ok: boolean; error?: string }> {
  const url = `${SHEETS}/${hojaId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [valores] }),
  });

  if (res.ok) return { ok: true };

  const cuerpo = await res.text().catch(() => "");
  console.error("[sheets] añadir fila:", res.status, cuerpo.slice(0, 300));

  // Los dos fallos que de verdad le pasan al cliente, dichos en su idioma.
  if (res.status === 404) {
    return { ok: false, error: "La hoja ya no existe o le quitaste el permiso a Demandu." };
  }
  if (res.status === 403) {
    return { ok: false, error: "Google no nos deja escribir en esa hoja. Vuelve a conectarla." };
  }
  return { ok: false, error: "Google no aceptó la fila." };
}

/** La fila que se manda por cada contacto nuevo, en el orden de ENCABEZADOS. */
export function filaDeContacto(c: any): string[] {
  return [
    new Date(c.created_at ?? Date.now()).toLocaleString("es-MX"),
    c.name ?? "",
    c.phone ?? "",
    c.email ?? "",
    c.company ?? "",
    c.country ?? "",
    c.channel ?? "",
    Array.isArray(c.tags) ? c.tags.join(", ") : "",
  ];
}
