import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿Esta dirección fue de alguna tienda antes?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES LO QUE IMPIDE QUE CAMBIAR EL NOMBRE MATE LOS COBROS. Dentro de cada enlace
 * de pago que ya está en el chat de un cliente va la dirección de la tienda del
 * día en que se mandó. Si el negocio la cambia, esos enlaces apuntan a algo que
 * ya no existe — y no fallan con un aviso, fallan con un 404 que nadie reporta.
 *
 * SE LEE CON `service_role` a propósito: la tabla no tiene permiso anónimo, y no
 * hace falta que lo tenga. Aquí se busca UNA dirección concreta y solo se
 * devuelve a qué tienda lleva, que es información pública de todas formas.
 *
 * SI FALLA, NO PASA NADA MALO: se contesta que no existe, que es exactamente lo
 * que habría pasado sin esta tabla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function direccionAnterior(slug: string): Promise<string | null> {
  const buscada = String(slug ?? "").trim().toLowerCase();
  if (!buscada) return null;

  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("tienda_direcciones_previas")
      .select("tienda_id")
      .eq("slug", buscada)
      .maybeSingle();

    if (!data?.tienda_id) return null;

    const { data: tienda } = await sb
      .from("tiendas")
      .select("slug,activa")
      .eq("id", data.tienda_id)
      .maybeSingle();

    // Una tienda cerrada no se resucita por la puerta de atrás.
    return tienda?.activa ? String(tienda.slug) : null;
  } catch {
    return null;
  }
}
