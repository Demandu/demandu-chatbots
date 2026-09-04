"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { puedeUsar } from "@/lib/planes/tiene";
import { aDireccion, direccionValida, enlaceLegible } from "@/lib/tienda/direccion";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export type EstadoTienda = { ok: boolean; mensaje: string };

export async function crearTienda(
  _estado: EstadoTienda,
  formData: FormData,
): Promise<EstadoTienda> {
  const nombre = s(formData.get("nombre"));
  if (!nombre) return { ok: false, mensaje: "Ponle un nombre a la tienda." };

  // Si no escribió dirección, se saca del nombre: es lo que espera cualquiera
  // y ahorra el único paso técnico de esta pantalla.
  const slug = aDireccion(s(formData.get("slug")) || nombre);
  if (!direccionValida(slug)) {
    return {
      ok: false,
      mensaje: "La dirección necesita al menos 3 letras o números. Por ejemplo: pawsathome",
    };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "Vuelve a iniciar sesión e inténtalo otra vez." };

  /* ── EL FRENO DE VERDAD ESTÁ AQUÍ, NO EN LA PANTALLA ───────────────────
   *
   * La pantalla enseña la tienda apagada con su mensaje, y eso es lo correcto
   * de cara al cliente. Pero una pantalla apagada no impide nada: esta acción
   * se puede llamar por debajo sin pasar por ningún botón. Si el candado
   * viviera solo allá, no habría candado. */
  if (!(await puedeUsar("tienda"))) {
    return {
      ok: false,
      mensaje:
        "Tu plan no incluye la Tienda en WhatsApp. Puedes activarla desde Configuración → Mi plan.",
    };
  }

  const botId = s(formData.get("bot_id"));

  const sb = createClient();

  // UNA DIRECCIÓN ABANDONADA NO QUEDA LIBRE. Si otro negocio pudiera tomarla,
  // se quedaría con el tráfico —y con los enlaces de cobro— del que la tuvo
  // antes, que siguen vivos en los chats de sus clientes.
  const { data: usada } = await sb
    .from("tienda_direcciones_previas")
    .select("slug")
    .eq("slug", slug)
    .maybeSingle();

  if (usada) {
    return {
      ok: false,
      mensaje: `La dirección «${slug}» ya estuvo en uso. Prueba con otra, por ejemplo ${slug}-pty.`,
    };
  }

  const { error } = await sb.from("tiendas").insert({
    org_id: orgId,
    nombre,
    slug,
    bot_id: botId || null,
  });

  if (error) {
    // 23505 = ya existe. Las direcciones son únicas en TODA la plataforma —dos
    // negocios no pueden reclamar el mismo enlace— así que el choque puede ser
    // contra la tienda de otro cliente, a quien obviamente no podemos nombrar.
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        mensaje: `La dirección «${slug}» ya está ocupada. Prueba con otra, por ejemplo ${slug}-pty.`,
      };
    }
    return { ok: false, mensaje: "No se pudo crear la tienda. Inténtalo de nuevo." };
  }

  revalidatePath("/tienda");
  return { ok: true, mensaje: `Tienda creada. Su dirección es ${enlaceLegible(slug)}` };
}
