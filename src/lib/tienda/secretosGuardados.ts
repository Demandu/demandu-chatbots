import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿HAY UN SECRETO GUARDADO? Sí o no. Nunca cuál.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NACIÓ DE UN FALLO QUE LLEVABA TIEMPO VIVO Y NADIE VEÍA.
 *
 * La pantalla de la tienda preguntaba «¿hay secreto de Yappy?» así, con la
 * sesión del usuario:
 *
 *     sb.from("tienda_cobros").select("id", {count:"exact", head:true})
 *       .neq("secreto", "")
 *
 * Y `secreto` NO está entre las columnas que `authenticated` puede leer — es
 * justo el punto de la migración 0092: los secretos solo los ve el servidor.
 * Postgres no distingue entre leer una columna y filtrar por ella: las dos
 * necesitan permiso. Así que esa consulta devolvía «permission denied», el
 * código ignoraba el error, el contador se quedaba en nulo, y el resultado era
 * SIEMPRE «no hay secreto».
 *
 * ── LO QUE ESO PROVOCABA ──────────────────────────────────────────────────
 *
 * `paws-at-home` tiene su Yappy configurado, validado el 7 de septiembre, y
 * cobrando de verdad. Y su pantalla decía, todos los días: «Esta tienda
 * todavía no puede recibir pedidos. Le falta el cobro con Yappy».
 *
 * Una alarma falsa es peor que ninguna alarma. Enseña al dueño a ignorar el
 * aviso — y ese aviso es justo el que tiene que avisar el día que falte algo
 * de verdad. Y de paso, la pantalla de Cobros decía «no hay secreto guardado»
 * a alguien que sí lo había guardado, invitándole a pegarlo otra vez.
 *
 * ── POR QUÉ LA LLAVE DE SERVICIO Y POR QUÉ AQUÍ ───────────────────────────
 *
 * La llave de servicio no tiene restricciones de columna, así que puede
 * PREGUNTAR sin poder enseñar: lo que sale de estas funciones es un booleano.
 * El secreto no entra en el servidor de la pantalla, no viaja al navegador y no
 * se puede escapar por un `props`.
 *
 * Y va en un archivo aparte para que la pregunta se haga en un solo sitio. La
 * próxima tabla con secretos —ya van tres— no puede repetir el error.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** ¿Tiene esta tienda el secreto de Yappy guardado? */
export async function tieneSecretoDeYappy(admin: SupabaseClient, tiendaId: string): Promise<boolean> {
  try {
    const { count, error } = await admin
      .from("tienda_cobros")
      .select("id", { count: "exact", head: true })
      .eq("tienda_id", tiendaId)
      .eq("proveedor", "yappy")
      .neq("secreto", "");
    // EL ERROR NO SE TRAGA. Tragárselo es exactamente lo que dejó el fallo
    // anterior escondido durante semanas: un `?? 0` silencioso convertía «no
    // pude preguntar» en «no hay», y las dos cosas no son la misma.
    if (error) {
      console.error("[tienda] no pude comprobar el secreto de Yappy:", error.message);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (e) {
    console.error("[tienda] no pude comprobar el secreto de Yappy:", e);
    return false;
  }
}

/** Cuáles de las tres credenciales de ASAP están puestas. */
export async function credencialesDeAsap(
  admin: SupabaseClient,
  tiendaId: string,
): Promise<{ llave: boolean; token: boolean; secreto: boolean }> {
  const vacio = { llave: false, token: false, secreto: false };
  try {
    const { data, error } = await admin
      .from("tienda_envios")
      .select("api_key, user_token, shared_secret")
      .eq("tienda_id", tiendaId)
      .eq("proveedor", "asap")
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("[tienda] no pude comprobar las llaves de ASAP:", error.message);
      return vacio;
    }
    // SE DEVUELVE SI HAY, NO LO QUE HAY. Los valores mueren en esta función.
    const hay = (v: unknown) => String(v ?? "").trim() !== "";
    return {
      llave: hay((data as any).api_key),
      token: hay((data as any).user_token),
      secreto: hay((data as any).shared_secret),
    };
  } catch (e) {
    console.error("[tienda] no pude comprobar las llaves de ASAP:", e);
    return vacio;
  }
}
