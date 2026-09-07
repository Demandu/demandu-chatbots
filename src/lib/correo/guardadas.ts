import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlantillaBienvenida } from "./plantillas";

/**
 * LEER EL TEXTO GUARDADO DE UN CORREO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SI ALGO FALLA, DEVUELVE NADA — Y ESO ESTÁ BIEN.
 *
 * Quien llama junta lo que salga de aquí con el texto de respaldo del código
 * (`laPlantilla`). Así que una tabla que no está, una fila que no existe o una
 * base que no contesta terminan en el mismo sitio: se manda el correo de
 * siempre.
 *
 * Lo contrario —lanzar una excepción— pararía la tarea de bienvenida entera por
 * no poder leer un texto que ya sabemos. Un cliente nuevo se quedaría sin su
 * correo por un problema que no tiene nada que ver con él.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function leerPlantilla(
  sb: SupabaseClient,
  clave: string,
): Promise<Partial<PlantillaBienvenida> | null> {
  try {
    const { data, error } = await sb
      .from("correos_plantillas")
      .select("asunto, titulo, cuerpo, boton")
      .eq("clave", clave)
      .maybeSingle();

    if (error) {
      // Se apunta porque un texto que alguien editó y no está saliendo es
      // justo el tipo de fallo que nadie nota: el correo sale, sale bien, y
      // sale con el texto viejo.
      console.error(`[correo] no pude leer la plantilla «${clave}»:`, error.message);
      return null;
    }
    return (data as Partial<PlantillaBienvenida> | null) ?? null;
  } catch (e) {
    console.error(`[correo] no pude leer la plantilla «${clave}»:`, e);
    return null;
  }
}
