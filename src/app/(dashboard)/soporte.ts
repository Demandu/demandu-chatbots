"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cerrarSoporte } from "@/lib/soporte";

/**
 * Salir de la cuenta de un cliente.
 *
 * No comprueba ningún permiso a propósito: solo puede cerrar SU PROPIA sesión
 * de soporte, y salir nunca puede ser algo que se le impida a nadie. Si no
 * había ninguna abierta, no pasa nada.
 */
export async function salirDeSoporte(): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login");

  const { orgId } = await cerrarSoporte(user.id);

  revalidatePath("/", "layout");

  // A DÓNDE SE VUELVE DEPENDE DE QUIÉN SALE. Antes se devolvía a todo el mundo
  // a `/superadmin/clientes`, y eso solo funcionaba para el dueño: un vendedor
  // o un partner no tiene acceso a esa pantalla, así que al salir de una cuenta
  // el marco del superadmin lo rebotaba a `/dashboard` — una organización que
  // no es suya y de la que acababa de salir. Terminaba dando vueltas sin
  // entender qué había pasado.
  const { data: esAdmin } = await createClient().rpc("is_platform_admin");
  if (esAdmin) {
    redirect(orgId ? `/superadmin/clientes/${orgId}` : "/superadmin/clientes");
  }
  redirect("/panel");
}
