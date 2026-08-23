"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reenviarFactura } from "@/lib/billing/facturas";

/**
 * Reenvía una factura al correo del cliente.
 *
 * Se vuelve a comprobar el permiso aquí aunque el marco de /superadmin ya lo
 * compruebe: una acción de servidor se puede invocar por su propia dirección
 * sin pasar por ninguna pantalla.
 */
export async function reenviar(formData: FormData): Promise<void> {
  const { data: esAdmin } = await createClient().rpc("is_platform_admin");
  if (!esAdmin) return;

  const id = String(formData.get("factura_id") ?? "");
  const org = String(formData.get("org_id") ?? "");
  if (!id) return;

  const r = await reenviarFactura(id);

  // El resultado se lleva en la dirección, no en un estado del servidor: así
  // sobrevive a la recarga y quien lo ve sabe qué pasó de verdad. Si Stripe
  // se negó, se enseña SU mensaje — inventar un "listo" es cómo alguien
  // acaba jurándole a un cliente que le mandó algo que nunca salió.
  const q = r.ok ? "enviada=1" : `error=${encodeURIComponent(r.error)}`;
  revalidatePath(`/superadmin/clientes/${org}`);

  const { redirect } = await import("next/navigation");
  redirect(`/superadmin/clientes/${org}?${q}`);
}
