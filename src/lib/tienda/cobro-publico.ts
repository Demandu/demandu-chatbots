import { createAdminClient } from "@/lib/supabase/admin";
import { CDN_YAPPY, esAmbiente } from "./yappy";

/**
 * Lo ÚNICO que el escaparate público necesita saber del cobro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS COSAS, Y NINGUNA ES UN SECRETO: si esta tienda cobra con Yappy, y de qué
 * entorno cargar el botón. Nada más sale de aquí.
 *
 * SE LEE CON `service_role` PORQUE `tienda_cobros` NO TIENE PERMISO ANÓNIMO, y
 * eso está bien: ahí vive el secreto de comercio de cada negocio. La forma de
 * que esa decisión siga siendo segura no es confiar en que nadie escriba
 * `secreto` en una consulta, es que la consulta viva en un solo archivo, corto,
 * que se pueda leer entero en diez segundos — y una prueba estática que falla
 * si alguien nombra el secreto aquí o en el escaparate.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function cobroPublico(
  tiendaId: string,
): Promise<{ yappy: boolean; cdn: string }> {
  // SI ESTO FALLA, LA TIENDA SIGUE VENDIENDO. Es una consulta de adorno —dice
  // si se pinta un botón— y hacerla obligatoria para que el escaparate cargue
  // sería tumbar el catálogo entero de un negocio por un problema al cobrar.
  try {
    const { data } = await createAdminClient()
      .from("tienda_cobros")
      .select("activo,ambiente,comercio")
      .eq("tienda_id", tiendaId)
      .eq("proveedor", "yappy")
      .maybeSingle();

    // Sin número de comercio no hay cobro posible, diga lo que diga la casilla:
    // enseñar el botón sería llevar al cliente hasta el final para nada.
    const yappy = Boolean(data?.activo && data?.comercio);
    return { yappy, cdn: CDN_YAPPY[esAmbiente(data?.ambiente)] };
  } catch {
    return { yappy: false, cdn: CDN_YAPPY.prueba };
  }
}
