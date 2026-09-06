"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cerrarSoporte } from "@/lib/soporte";

/**
 * Salir de la plataforma DE VERDAD.
 *
 * ESTO EXISTE POR UNA PERSONA ATRAPADA. El botón «Salir» del panel de ventas
 * era un enlace a `/login` y nada más: no cerraba la sesión. Con la sesión
 * viva, el camino se cerraba sobre sí mismo y no había manera de salir:
 *
 *     /panel → «Salir» → /login → (el middleware ve sesión) → /dashboard
 *            → (el marco ve que es del equipo y no tiene organización) → /panel
 *
 * Desde fuera parecía que el botón no hacía nada. Y no lo parecía: no hacía
 * nada. Un vendedor no podía cerrar sesión, ni entrar con otra cuenta, ni
 * salirse de la plataforma. Las tres pantallas se pasaban la pelota.
 *
 * POR QUÉ UNA ACCIÓN DE SERVIDOR Y NO UN ENLACE. Cerrar sesión es borrar la
 * galleta, y en Next eso solo se puede hacer desde una acción de servidor o una
 * ruta. Un `<Link>` no puede cerrar nada por mucho que apunte a `/login`.
 *
 * POR QUÉ VIVE EN LA RAÍZ Y NO DENTRO DE UNA SECCIÓN. La usan el panel de
 * ventas y el superadmin, que son dos casas distintas. Tenerla en una de las
 * dos obligaría a la otra a importar de la cocina del vecino, y acabaría
 * copiada — que es como se llega a dos formas de cerrar sesión que no hacen lo
 * mismo.
 */
export async function cerrarSesion(): Promise<void> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();

  if (user) {
    // SE CIERRA TAMBIÉN EL SOPORTE ABIERTO. Si alguien se va a casa estando
    // dentro de la cuenta de un cliente, ese acceso no puede quedarse vivo una
    // hora más sin nadie delante.
    //
    // Si esto falla, se sale igual: quedarse dentro de la plataforma por no
    // haber podido borrar una membresía temporal sería el peor final posible
    // para la función cuyo único trabajo es dejarte salir.
    try {
      await cerrarSoporte(user.id);
    } catch {}
    await sb.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
