import { cache } from "react";
import { membresiaDeLaSesion } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { IDIOMA_DE_FABRICA, idiomaValido, type Idioma } from "@/i18n/idiomas";

/**
 * El idioma de quien está mirando la pantalla.
 *
 * ── EL DE LA PERSONA MANDA SOBRE EL DE LA CUENTA ──────────────────────────
 *
 * Un equipo puede tener a alguien en Brasil y a alguien en México. Si el
 * idioma fuera solo de la cuenta, uno de los dos trabajaría siempre en un
 * idioma que no es el suyo.
 *
 * Quien no eligió (idioma nulo) hereda el de su organización, y quien no tiene
 * sesión —la pantalla de entrar, un enlace público— ve el de fábrica.
 */
export const idiomaDeLaSesion = cache(async function idiomaDeLaSesion(): Promise<Idioma> {
  try {
    const m = (await membresiaDeLaSesion()) as { org_id?: string; idioma?: string | null } | null;
    if (!m) return IDIOMA_DE_FABRICA;
    if (m.idioma) return idiomaValido(m.idioma);
    if (!m.org_id) return IDIOMA_DE_FABRICA;

    // El de la organización se lee con la llave de servicio: `organizations`
    // ya se lee así en el marco del panel y aquí el alcance es el mismo —el
    // `org_id` salió de la propia sesión de quien pregunta.
    const { data, error } = await createAdminClient()
      .from("organizations")
      .select("idioma")
      .eq("id", m.org_id)
      .maybeSingle();

    /* «No se pudo leer» y «no tiene idioma puesto» acaban los dos en español,
     * pero NO son lo mismo y no pueden verse igual desde fuera: si un día la
     * plataforma entera se pone en español, esta línea en los registros es la
     * diferencia entre encontrarlo en un minuto o en una tarde. */
    if (error) console.error("[idioma] no se pudo leer el de la cuenta:", error.message);
    return idiomaValido((data as any)?.idioma);
  } catch {
    // Un fallo de lectura no puede dejar la plataforma sin idioma.
    return IDIOMA_DE_FABRICA;
  }
});
