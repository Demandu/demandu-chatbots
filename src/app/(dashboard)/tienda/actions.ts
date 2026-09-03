"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { aDireccion, direccionValida } from "@/lib/tienda/direccion";

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

  const botId = s(formData.get("bot_id"));

  const { error } = await createClient().from("tiendas").insert({
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
  return { ok: true, mensaje: `Tienda creada. Su dirección es eshop.demandu.tech/${slug}` };
}
