/**
 * Datos que además tienen su CASILLA PROPIA en la ficha del lead.
 *
 * Sin esto, el correo que se captura se guarda como «un atributo más» y la
 * casilla «Correo» de la ficha se queda vacía. Pasó tal cual: el bot pidió el
 * correo, la persona lo dio, el bot dijo «ya quedó registrado» y en la ficha no
 * había nada donde el equipo lo busca. Para el agente que abre esa ficha, el
 * dato no existe.
 *
 * Se guarda en LOS DOS SITIOS: en la casilla, que es donde se mira, y en los
 * atributos, que es de donde tiran los flujos y las plantillas.
 *
 * ── POR QUÉ ESTO VIVE SOLO ─────────────────────────────────────────────────
 *
 * Lo usan tres sitios: la herramienta `guardar_dato` de la IA, el bloque de
 * pregunta del canal web y el motor de WhatsApp (que tiene su copia en Deno,
 * vigilada por una regla). Cuando estaba dentro de `herramientas.ts`, el canal
 * web no podía usarlo sin arrastrar el archivo entero — y así es como se
 * termina con dos listas que dicen cosas distintas sobre qué es «correo».
 */
export const CASILLA_DE_LA_FICHA: Record<string, string> = {
  nombre: "name", name: "name", nombre_completo: "name",
  correo: "email", email: "email", mail: "email", correo_electronico: "email",
  telefono: "phone", phone: "phone", celular: "phone", movil: "phone",
  empresa: "company", company: "company", negocio: "company",
  pais: "country", country: "country",
};

/** La casilla propia de este dato, si la tiene. */
export function casillaDe(campo: string | null | undefined): string | null {
  return CASILLA_DE_LA_FICHA[String(campo ?? "").trim().toLowerCase()] ?? null;
}
