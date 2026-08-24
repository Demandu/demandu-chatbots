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
  redirect(orgId ? `/superadmin/clientes/${orgId}` : "/superadmin/clientes");
}
