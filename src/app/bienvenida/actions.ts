"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

/**
 * Guardar el nombre del negocio que el cliente acaba de escribir.
 *
 * Marca `nombre_confirmado` en el mismo update: es lo que hace que la pantalla
 * no vuelva a salir. Si se guardara solo el nombre, el cliente quedaría
 * atrapado escribiéndolo una y otra vez.
 */
export async function confirmarNombre(formData: FormData) {
  const nombre = String(formData.get("negocio") ?? "").trim().slice(0, 80);
  if (!nombre) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/login");

  await createClient()
    .from("organizations")
    .update({ name: nombre, nombre_confirmado: true })
    .eq("id", orgId);

  // El nombre sale en el marco de TODAS las pantallas, no solo en el panel.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
