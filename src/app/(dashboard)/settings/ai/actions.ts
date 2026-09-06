"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { checkQuota } from "@/lib/billing/quota";

/**
 * Enseñarle a Lana algo que no supo contestar.
 *
 * EL TÍTULO ES LA PREGUNTA TAL CUAL LA ESCRIBIÓ EL CLIENTE, y no un resumen
 * nuestro. Dos razones: es como la volverán a escribir otros clientes, así que
 * es lo que mejor recupera la búsqueda; y es lo que permite marcar la fila como
 * atendida después, comparando por ese mismo texto.
 *
 * Va al conocimiento DE ESE CHATBOT, nunca a otro. Cada bot sabe lo suyo y no
 * se mezcla con los demás — es la promesa de la plataforma y no se rompe ni
 * por comodidad.
 */
export async function ensenarle(datos: {
  botId: string;
  pregunta: string;
  respuesta: string;
}): Promise<{ ok: boolean; mensaje?: string }> {
  const pregunta = (datos.pregunta ?? "").trim().slice(0, 300);
  const respuesta = (datos.respuesta ?? "").trim();
  if (!datos.botId || !pregunta || !respuesta) {
    return { ok: false, mensaje: "Falta la respuesta." };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "No encuentro tu organización." };

  const supabase = createClient();

  const quota = await checkQuota(supabase, orgId, Buffer.byteLength(respuesta, "utf8"));
  if (!quota.ok) return { ok: false, mensaje: quota.message };

  const { error } = await supabase.from("bot_knowledge").insert({
    org_id: orgId,
    bot_id: datos.botId,
    title: pregunta,
    content: respuesta,
    source_type: "text",
  });
  if (error) return { ok: false, mensaje: "No se pudo guardar. Inténtalo otra vez." };

  revalidatePath("/settings/ai");
  revalidatePath(`/bots/${datos.botId}/training`);
  return { ok: true, mensaje: "Listo. La próxima vez que se lo pregunten, ya lo sabe." };
}
