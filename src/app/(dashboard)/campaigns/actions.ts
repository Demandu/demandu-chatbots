"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const GRAPH = "https://graph.facebook.com/v20.0";
const MAX_RECIPIENTS = 500;

/** Lee el canal de WhatsApp de la org (waba_id, phone_number_id, token). */
async function getChannel(supabase: ReturnType<typeof createClient>, orgId: string) {
  const { data } = await supabase
    .from("whatsapp_channels")
    .select("waba_id, phone_number_id, access_token, display_number")
    .eq("org_id", orgId)
    .maybeSingle();
  return data as
    | { waba_id: string | null; phone_number_id: string | null; access_token: string | null; display_number: string | null }
    | null;
}

/** Del arreglo de components de Meta saca el texto del BODY y cuántas variables tiene. */
function parseTemplate(components: any[]): { body: string; variables: number } {
  const body = (components ?? []).find((c) => c.type === "BODY");
  const text: string = body?.text ?? "";
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
  return { body: text, variables: matches ? matches.length : 0 };
}

/** Sincroniza las plantillas aprobadas/pendientes de la WABA desde Meta. */
export async function syncTemplates() {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();
  const ch = await getChannel(supabase, orgId);
  if (!ch?.waba_id || !ch?.access_token) {
    redirect("/campaigns?tab=plantillas&error=sin_canal");
  }

  // OJO: redirect() lanza una excepción especial, así que NO debe ir dentro
  // del try/catch (el catch se la tragaría). Acumulamos el error y redirigimos
  // al final, fuera del try.
  let errParam = "";
  try {
    const res = await fetch(
      `${GRAPH}/${ch.waba_id}/message_templates?limit=200&access_token=${ch.access_token}`,
    );
    const j = await res.json();
    if (!res.ok || !Array.isArray(j?.data)) {
      errParam = j?.error?.message ?? "meta_error";
    } else {
      for (const t of j.data) {
        const { body, variables } = parseTemplate(t.components);
        await supabase.from("whatsapp_templates").upsert(
          {
            org_id: orgId,
            waba_id: ch.waba_id,
            meta_id: String(t.id ?? ""),
            name: t.name,
            language: t.language ?? "es",
            category: t.category ?? null,
            status: t.status ?? "PENDING",
            body,
            components: t.components ?? null,
            variables,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "org_id,name,language" },
        );
      }
    }
  } catch {
    errParam = "red";
  }

  revalidatePath("/campaigns");
  if (errParam) redirect(`/campaigns?tab=plantillas&error=${encodeURIComponent(errParam)}`);
  redirect("/campaigns?tab=plantillas&synced=1");
}

/** Crea una difusión y envía la plantilla a la audiencia por Cloud API. */
export async function sendCampaign(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();

  const templateId = String(formData.get("template_id") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Difusión";
  const tag = String(formData.get("tag") ?? "").trim(); // opcional

  const ch = await getChannel(supabase, orgId);
  if (!ch?.phone_number_id || !ch?.access_token) {
    redirect("/campaigns?tab=difusion&error=sin_canal");
  }

  const { data: tpl } = await supabase
    .from("whatsapp_templates")
    .select("name, language, variables")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl) redirect("/campaigns?tab=difusion&error=sin_plantilla");

  // Audiencia: contactos de WhatsApp no dados de baja (opcional por etiqueta)
  let q = supabase
    .from("contacts")
    .select("id, name, phone")
    .eq("org_id", orgId)
    .eq("channel", "whatsapp")
    .eq("opted_out", false);
  if (tag) q = q.contains("tags", [tag]);
  const { data: contacts } = await q.limit(MAX_RECIPIENTS + 1);
  const audience = (contacts ?? []).filter((c) => c.phone);

  // Crea la campaña
  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      org_id: orgId,
      name,
      template_name: (tpl as any).name,
      template_language: (tpl as any).language,
      status: "sending",
      audience_count: audience.length,
    })
    .select("id")
    .single();
  if (!campaign) redirect("/campaigns?tab=difusion&error=no_campaign");

  const vars = (tpl as any).variables ?? 0;
  let sent = 0;
  let failed = 0;

  for (const c of audience.slice(0, MAX_RECIPIENTS)) {
    const components =
      vars > 0
        ? [
            {
              type: "body",
              parameters: Array.from({ length: vars }, (_, i) => ({
                type: "text",
                text: i === 0 ? c.name || "" : "",
              })),
            },
          ]
        : undefined;

    let wamid: string | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(`${GRAPH}/${ch!.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ch!.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: c.phone,
          type: "template",
          template: {
            name: (tpl as any).name,
            language: { code: (tpl as any).language || "es" },
            ...(components ? { components } : {}),
          },
        }),
      });
      const j = await res.json();
      if (res.ok && j?.messages?.[0]?.id) {
        wamid = j.messages[0].id;
        sent++;
      } else {
        error = j?.error?.message ?? "error";
        failed++;
      }
    } catch (e) {
      error = (e as Error)?.message ?? "red";
      failed++;
    }

    await supabase.from("campaign_recipients").insert({
      campaign_id: (campaign as any).id,
      org_id: orgId,
      contact_id: c.id,
      phone: c.phone,
      name: c.name,
      wa_message_id: wamid,
      status: wamid ? "sent" : "failed",
      error,
      sent_at: wamid ? new Date().toISOString() : null,
    });
  }

  await supabase.from("campaigns").update({ status: "sent" }).eq("id", (campaign as any).id);

  revalidatePath("/campaigns");
  redirect(`/campaigns/${(campaign as any).id}`);
}
