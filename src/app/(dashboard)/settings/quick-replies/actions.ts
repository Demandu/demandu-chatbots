"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { limpiarAtajo } from "@/lib/quickReplies";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const RUTA = "/settings/quick-replies";

type Estado = { ok: boolean; mensaje: string };

/** Crea o actualiza una respuesta rápida. Si viene `id`, actualiza. */
export async function guardarRespuesta(_estado: Estado, formData: FormData): Promise<Estado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "No pudimos identificar tu cuenta." };

  const id = s(formData.get("id"));
  const title = s(formData.get("title")).slice(0, 80);
  const body = s(formData.get("body")).slice(0, 4000);
  const category = s(formData.get("category")).slice(0, 40) || null;
  const shortcut = limpiarAtajo(s(formData.get("shortcut")) || title);

  if (!title) return { ok: false, mensaje: "Ponle un nombre para reconocerla." };
  if (!body) return { ok: false, mensaje: "Falta el mensaje." };
  if (!shortcut) return { ok: false, mensaje: "El atajo debe tener letras o números." };

  const supabase = createClient();

  // El atajo no se puede repetir: si no, al escribir "/" no sabríamos cuál usar.
  const { data: choque } = await supabase
    .from("quick_replies")
    .select("id")
    .eq("org_id", orgId)
    .ilike("shortcut", shortcut)
    .maybeSingle();
  if (choque && choque.id !== id) {
    return { ok: false, mensaje: `Ya usas el atajo /${shortcut} en otra respuesta.` };
  }

  if (id) {
    const { error } = await supabase
      .from("quick_replies")
      .update({ shortcut, title, body, category, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, mensaje: "No se pudo guardar." };
    revalidatePath(RUTA);
    return { ok: true, mensaje: "Respuesta actualizada" };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("quick_replies").insert({
    org_id: orgId,
    shortcut,
    title,
    body,
    category,
    created_by: user?.id ?? null,
  });
  if (error) return { ok: false, mensaje: "No se pudo crear." };

  revalidatePath(RUTA);
  return { ok: true, mensaje: "Respuesta creada" };
}

export async function borrarRespuesta(formData: FormData) {
  const id = s(formData.get("id"));
  if (!id) return;
  await createClient().from("quick_replies").delete().eq("id", id);
  revalidatePath(RUTA);
}
