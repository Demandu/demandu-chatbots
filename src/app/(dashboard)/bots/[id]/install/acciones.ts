"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { desconectarCanalIg } from "@/lib/integrations/instagram";

/**
 * DESCONECTAR LA CUENTA DE INSTAGRAM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACÍA FALTA, Y NO ES UN CAPRICHO.
 *
 * La plataforma sabía conectar y no sabía desconectar. Un negocio que cambia de
 * cuenta, que cierra la vieja o que simplemente se arrepiente no tenía ningún
 * botón: había que pedírnoslo y tocarlo nosotros en la base. Eso ya es feo con
 * un cliente; con VEINTE no se sostiene.
 *
 * Y hay una razón más concreta: en la solicitud de revisión que Meta va a leer
 * dice, con estas palabras, que el negocio «puede desconectarla cuando quiera».
 * Un revisor que entre a comprobarlo y no encuentre el botón no está viendo un
 * detalle de usabilidad: está viendo una afirmación falsa en la solicitud.
 *
 * ── EL PERMISO SE COMPRUEBA AQUÍ, NO EN LA PANTALLA ───────────────────────
 *
 * Esconder el botón no prohíbe nada: una acción de servidor se puede llamar sin
 * pasar por la pantalla. Quien no tiene «conexiones» —un agente que solo atiende
 * chats— no puede dejar sin Instagram a toda la organización.
 *
 * ── SE AVISA A META ANTES DE BORRAR, Y SI FALLA SE SIGUE ──────────────────
 *
 * La suscripción vive en Meta. Sin darla de baja, Instagram seguiría mandando
 * cada mensaje de esa cuenta a nuestro webhook aunque el negocio ya no la tenga
 * conectada. Pero si Meta no contesta, la desconexión sigue: lo que el negocio
 * pidió es no tenerla conectada, y un fallo de red al otro lado no puede
 * impedírselo — se quedaría atrapado con una cuenta que no quiere.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function desconectarInstagram(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  if (!botId) return;

  const { permisos } = await misPermisos();
  if (!permisos.has("conexiones")) redirect(`/bots/${botId}/install?error=sin_permiso`);

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/login");

  // Que el chatbot sea de esta cuenta lo comprueba la propia base: esta consulta
  // va con la sesión, así que RLS no deja ver los de otra organización.
  const { data: bot } = await createClient().from("bots").select("id").eq("id", botId).maybeSingle();
  if (!bot) redirect("/bots");

  // EL TOKEN NO PASA POR AQUÍ. Se le entrega la llave de servicio a la función
  // que sabe hacerlo; esta acción solo decide QUIÉN puede pedirlo.
  await desconectarCanalIg(createAdminClient(), orgId, botId);

  revalidatePath(`/bots/${botId}/install`);
  revalidatePath(`/bots/${botId}`);
  redirect(`/bots/${botId}/install?ig=desconectado`);
}
