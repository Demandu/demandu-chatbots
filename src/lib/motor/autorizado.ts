import "server-only";

/**
 * ¿Esta llamada viene del motor de WhatsApp?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO BASTA CON COMPARAR LA LLAVE CON LA DE ESTE LADO.
 *
 * Esto empezó siendo un `===` contra `SUPABASE_SERVICE_ROLE_KEY` y se cayó en
 * producción sin decir por qué: el motor mandaba una llave de servicio VÁLIDA
 * y aquí se rechazaba, porque Supabase convive con dos formatos de llave de
 * servicio —la antigua (un JWT, que es la que las Edge Functions reciben ya
 * puesta) y la nueva (`sb_secret_…`, que es la que uno copia hoy del panel al
 * configurar Netlify)—. Las dos mandan igual en el proyecto; como texto no se
 * parecen en nada.
 *
 * Comparar dos copias de un secreto que se configuran por separado es apostar
 * a que nadie las rote nunca por separado. Así que se comprueba lo que de
 * verdad importa: **¿esta llave manda en ESTE proyecto?** Se le pide algo que
 * solo `service_role` puede hacer. Si puede, es de los nuestros.
 *
 * Esto no abre nada: quien tenga una llave de servicio de este proyecto ya
 * tiene la base entera; pedirle además que adivine cuál de las dos guardamos
 * aquí no protegía de nadie, solo rompía el calendario.
 *
 * VIVE EN UN SOLO ARCHIVO desde que hubo una segunda puerta del motor. La
 * primera copia de una comprobación de permisos es donde empieza el agujero:
 * se arregla una y la otra se queda como estaba, y nadie mira la que no falla.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const YA_VERIFICADAS = new Map<string, number>();
const VALE_POR = 10 * 60_000;

export async function esDelMotor(req: Request): Promise<boolean> {
  const dado = (req.headers.get("x-demandu-motor") ?? "").trim();
  if (dado.length < 20) return false;

  const esperado = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (esperado && dado.length === esperado.length && dado === esperado) return true;

  const visto = YA_VERIFICADAS.get(dado);
  if (visto && visto > Date.now()) return true;

  // Un endpoint de administración: el `anon` no lo toca ni con permiso.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return false;
  try {
    const r = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { apikey: dado, Authorization: `Bearer ${dado}` },
    });
    if (!r.ok) return false;
    YA_VERIFICADAS.set(dado, Date.now() + VALE_POR);
    return true;
  } catch {
    return false;
  }
}
