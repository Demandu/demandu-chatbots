"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const GRAPH = "https://graph.facebook.com/v20.0";

/** Sincroniza los formularios (WhatsApp Flows) de la cuenta de ese chatbot. */
export async function syncForms(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  if (!orgId || !botId) return;

  const supabase = createClient();
  const { data: ch } = await supabase
    .from("whatsapp_channels")
    .select("waba_id, access_token")
    .eq("bot_id", botId)
    .maybeSingle();

  if (!ch?.waba_id || !ch?.access_token) {
    redirect(`/bots/${botId}/forms?error=sin_canal`);
  }

  let errParam = "";
  try {
    const res = await fetch(
      `${GRAPH}/${ch.waba_id}/flows?fields=id,name,status,categories&limit=200&access_token=${ch.access_token}`,
    );
    const j = await res.json();
    if (!res.ok || !Array.isArray(j?.data)) {
      errParam = j?.error?.message ?? "meta_error";
    } else {
      for (const f of j.data) {
        await supabase.from("whatsapp_forms").upsert(
          {
            org_id: orgId,
            bot_id: botId,
            waba_id: ch.waba_id,
            meta_flow_id: String(f.id ?? ""),
            name: f.name ?? "Formulario",
            status: f.status ?? "DRAFT",
            categories: Array.isArray(f.categories) ? f.categories : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bot_id,meta_flow_id" },
        );
      }
    }
  } catch {
    errParam = "red";
  }

  revalidatePath(`/bots/${botId}/forms`);
  if (errParam) redirect(`/bots/${botId}/forms?error=${encodeURIComponent(errParam)}`);
  redirect(`/bots/${botId}/forms?synced=1`);
}

/** Quita un formulario de la lista local (no lo borra en Meta). */
export async function removeForm(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("whatsapp_forms").delete().eq("id", id);
  revalidatePath(`/bots/${botId}/forms`);
}
