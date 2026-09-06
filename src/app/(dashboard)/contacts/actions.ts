"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function createContact(formData: FormData) {
  const name = s(formData.get("name"));
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient().from("contacts").insert({
    org_id: orgId,
    name,
    phone: s(formData.get("phone")) || null,
    email: s(formData.get("email")) || null,
    channel: s(formData.get("channel")) || null,
  });
  revalidatePath("/contacts");
}

/**
 * Borra contactos junto con sus conversaciones y mensajes.
 *
 * Se hace en este orden a propósito: si solo borráramos el contacto, sus
 * conversaciones quedarían huérfanas en la Bandeja (el enlace se pone en
 * nulo, no se borra) y aparecerían como chats sin dueño.
 */
export async function deleteContacts(
  _estado: { ok: boolean; mensaje: string },
  formData: FormData,
): Promise<{ ok: boolean; mensaje: string }> {
  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!ids.length) return { ok: false, mensaje: "No seleccionaste ningún contacto." };

  const supabase = createClient();

  // RLS ya limita a la organización del usuario; esto solo confirma qué existe.
  const { data: propios } = await supabase.from("contacts").select("id").in("id", ids);
  const validos = ((propios as any[]) ?? []).map((c) => c.id as string);
  if (!validos.length) return { ok: false, mensaje: "Esos contactos ya no existen." };

  const { data: convos } = await supabase.from("conversations").select("id").in("contact_id", validos);
  const convIds = ((convos as any[]) ?? []).map((c) => c.id as string);

  if (convIds.length) {
    await supabase.from("messages").delete().in("conversation_id", convIds);
    await supabase.from("conversations").delete().in("id", convIds);
  }

  const { error } = await supabase.from("contacts").delete().in("id", validos);
  if (error) return { ok: false, mensaje: "No se pudieron eliminar. Intenta de nuevo." };

  revalidatePath("/contacts");
  revalidatePath("/inbox");
  return {
    ok: true,
    mensaje:
      validos.length === 1
        ? "Contacto eliminado."
        : `${validos.length} contactos eliminados.`,
  };
}
