"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/**
 * El mismo teléfono escrito de siete maneras es la misma persona.
 *
 * «+507 6017-0269», «507 6017 0269» y «50760170269» son el mismo número, y una
 * búsqueda por texto los ve distintos. Se guardan y se comparan SOLO los
 * dígitos — que es además como llega el número desde WhatsApp, así que así el
 * contacto que escribe por WhatsApp y el que alguien apuntó a mano son el
 * mismo y no dos.
 */
function soloDigitos(v: string): string {
  return v.replace(/\D+/g, "");
}

/**
 * Agrega un contacto, o dice que ya lo tenías.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * 25 sep 2026, CertifiedPrime: el mismo «Darwin Bracho» con el mismo teléfono y
 * el mismo correo, QUINCE VECES, creado en 43 segundos. Ninguno con
 * conversación, etiquetas ni grupo: quince fichas vacías idénticas.
 *
 * Esto insertaba a pelo. Sin mirar si ya existía, sin mirar el error del
 * `insert`, y sin nada en la base que lo impidiera: el índice único de
 * `contacts` es `(org_id, channel, external_id)`, y para un contacto escrito a
 * mano `external_id` es NULL. **En Postgres un NULL nunca es igual a otro
 * NULL**, así que ese índice no estorba ni una sola vez.
 *
 * Quien pulsa «Agregar contacto» dos veces porque la primera no pareció hacer
 * nada se merece que la segunda le diga «ya lo tenías», no otra ficha.
 *
 * ── NO SE PISA LO QUE YA HABÍA ────────────────────────────────────────────
 *
 * Si la persona ya existe, se rellenan solo los huecos: un contacto que llegó
 * por WhatsApp sin correo gana el correo, pero nadie le cambia el nombre que ya
 * tenía por el que se acaba de teclear. Lo viejo manda porque lleva más tiempo
 * siendo cierto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export async function createContact(
  _estado: { ok: boolean; mensaje?: string } | undefined,
  formData: FormData,
): Promise<{ ok: boolean; mensaje?: string }> {
  const name = s(formData.get("name"));
  if (!name) return { ok: false, mensaje: "Ponle un nombre al contacto." };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "No encontré tu cuenta." };

  const telefono = soloDigitos(s(formData.get("phone")));
  const correo = s(formData.get("email")).toLowerCase();
  const canal = s(formData.get("channel")) || null;
  const sb = createClient();

  /* SE BUSCA POR TELÉFONO Y, SI NO HAY, POR CORREO. El teléfono manda: es lo
     que identifica a alguien en WhatsApp, que es por donde llega casi todo. */
  let yaEsta: { id: string; name: string | null; phone: string | null; email: string | null } | null = null;
  if (telefono) {
    const { data, error } = await sb
      .from("contacts").select("id, name, phone, email")
      .eq("org_id", orgId).eq("phone", telefono).limit(1).maybeSingle();
    if (error) console.error("[contactos] no pude mirar si ya existía el teléfono:", error.message);
    yaEsta = (data as any) ?? null;
  }
  if (!yaEsta && correo) {
    const { data, error } = await sb
      .from("contacts").select("id, name, phone, email")
      .eq("org_id", orgId).eq("email", correo).limit(1).maybeSingle();
    if (error) console.error("[contactos] no pude mirar si ya existía el correo:", error.message);
    yaEsta = (data as any) ?? null;
  }

  if (yaEsta) {
    // Solo los huecos. Lo que ya tenía se queda como estaba.
    const huecos: Record<string, string> = {};
    if (!yaEsta.phone && telefono) huecos.phone = telefono;
    if (!yaEsta.email && correo) huecos.email = correo;
    if (Object.keys(huecos).length) {
      const { error } = await sb.from("contacts").update(huecos).eq("id", yaEsta.id);
      if (error) console.error("[contactos] no pude completar la ficha:", error.message);
    }
    revalidatePath("/contacts");
    return {
      ok: true,
      mensaje: `Ya tenías a ${yaEsta.name || "esta persona"} en tus contactos. No creé otra ficha.`,
    };
  }

  const { error } = await sb.from("contacts").insert({
    org_id: orgId,
    name,
    phone: telefono || null,
    email: correo || null,
    channel: canal,
  });
  if (error) {
    console.error("[contactos] no se pudo crear:", error.message);
    return { ok: false, mensaje: "No se pudo agregar el contacto. Inténtalo de nuevo." };
  }

  revalidatePath("/contacts");
  return { ok: true, mensaje: `${name} quedó agregado.` };
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
