"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reenviarFactura } from "@/lib/billing/facturas";
import { crearCliente, nuevaContrasenaTemporal } from "@/lib/clientes/alta";

/**
 * Cada acción vuelve a comprobar el permiso aunque el marco de /superadmin ya
 * lo haga: una acción de servidor se puede invocar por su propia dirección sin
 * pasar por ninguna pantalla.
 */
async function soyDelEquipo(): Promise<boolean> {
  const { data } = await createClient().rpc("is_platform_admin");
  return !!data;
}

/** Reenvía una factura al correo del cliente. */
export async function reenviar(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const id = String(formData.get("factura_id") ?? "");
  const org = String(formData.get("org_id") ?? "");
  if (!id) return;

  const r = await reenviarFactura(id);

  // El resultado viaja en la dirección, no en un estado del servidor: así
  // sobrevive a la recarga. Si Stripe se negó, se enseña SU mensaje —
  // inventar un «listo» es cómo alguien acaba jurándole a un cliente que le
  // mandó algo que nunca salió.
  const q = r.ok ? "enviada=1" : `error=${encodeURIComponent(r.error)}`;
  revalidatePath(`/superadmin/clientes/${org}`);
  redirect(`/superadmin/clientes/${org}?${q}`);
}

/**
 * Alta manual de un cliente.
 *
 * LA CLAVE TEMPORAL VIAJA EN LA DIRECCIÓN Y NO SE GUARDA EN NINGUNA PARTE.
 * Es fea pero es lo correcto: guardarla en la base para «poder consultarla
 * después» sería justo lo que estamos evitando. Se enseña una vez, quien dio
 * el alta se la dicta al cliente, y al recargar ya no está.
 */
export async function crear(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const { data: { user } } = await createClient().auth.getUser();

  const r = await crearCliente({
    empresa: String(formData.get("empresa") ?? ""),
    contactoNombre: String(formData.get("contacto") ?? ""),
    email: String(formData.get("email") ?? ""),
    telefono: String(formData.get("telefono") ?? ""),
    notas: String(formData.get("notas") ?? ""),
    creadoPor: user?.id ?? null,
  });

  if (!r.ok) {
    redirect(`/superadmin/clientes/nuevo?error=${encodeURIComponent(r.error)}`);
  }

  revalidatePath("/superadmin/clientes");
  redirect(`/superadmin/clientes/${r.orgId}?clave=${encodeURIComponent(r.contrasena)}`);
}

/** Le genera otra clave temporal al dueño de una cuenta. */
export async function restablecer(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const org = String(formData.get("org_id") ?? "");
  if (!org) return;

  const r = await nuevaContrasenaTemporal(org);
  const q = r.ok
    ? `clave=${encodeURIComponent(r.contrasena)}&reset=1`
    : `error=${encodeURIComponent(r.error)}`;

  revalidatePath(`/superadmin/clientes/${org}`);
  redirect(`/superadmin/clientes/${org}?${q}`);
}
