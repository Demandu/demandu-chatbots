"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { abrirSoporte } from "@/lib/soporte";

/**
 * Entrar a la cuenta de un cliente desde el panel del vendedor o partner.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO Y NO SE REUSA EL DEL SUPERADMIN. Es la misma
 * operación, pero el sitio al que se vuelve cuando algo falla es distinto: al
 * superadmin se le devuelve a la ficha del cliente, y un vendedor no tiene
 * acceso a esa pantalla — acabaría rebotado en `/dashboard` sin entender nada.
 *
 * QUIÉN PUEDE ENTRAR A QUÉ NO SE DECIDE AQUÍ. Lo decide `abrirSoporte`, que es
 * el único sitio donde vive esa regla: un partner solo entra a los suyos y solo
 * si el cliente lo autorizó; un vendedor con cartera limitada, solo a los que
 * le tocan. Repetir esas comprobaciones aquí sería crear una segunda verdad
 * que algún día se desincroniza de la primera.
 */
export async function entrarComoSoporteDesdeElPanel(formData: FormData): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login");

  const org = String(formData.get("org_id") ?? "").trim();
  if (!org) return;

  const r = await abrirSoporte(user.id, org);
  if (!r.ok) redirect(`/panel?error=${encodeURIComponent(r.error)}`);

  // Al panel del cliente: la idea es ver exactamente lo que él ve. El aviso de
  // que estás dentro de una cuenta ajena lo pinta el marco y no se puede quitar.
  redirect("/dashboard");
}
