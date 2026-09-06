"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const TRIGGERS = new Set(["new_contact", "tag_added", "manual"]);
const UNITS = new Set(["minutes", "hours", "days"]);

/** Crea un seguimiento (drip) para un chatbot. */
export async function createDrip(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  if (!orgId || !botId) return;

  const rawT = String(formData.get("trigger_type") ?? "new_contact");
  const trigger_type = TRIGGERS.has(rawT) ? rawT : "new_contact";
  const name = String(formData.get("name") ?? "").trim() || "Nuevo seguimiento";
  const tag_name = String(formData.get("tag_name") ?? "").trim() || null;

  await createClient().from("drips").insert({
    org_id: orgId,
    bot_id: botId,
    name,
    trigger_type,
    tag_name: trigger_type === "tag_added" ? tag_name : null,
    enabled: true,
  });

  revalidatePath(`/bots/${botId}/drips`);
}

/** Prende o apaga un seguimiento. */
export async function toggleDrip(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;
  await createClient().from("drips").update({ enabled: !enabled }).eq("id", id);
  revalidatePath(`/bots/${botId}/drips`);
}

export async function deleteDrip(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("drips").delete().eq("id", id);
  revalidatePath(`/bots/${botId}/drips`);
}

/** Agrega un mensaje (paso) al seguimiento, al final de la secuencia. */
export async function addDripStep(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const dripId = String(formData.get("drip_id") ?? "");
  if (!orgId || !dripId) return;

  const supabase = createClient();
  const { data: last } = await supabase
    .from("drip_steps")
    .select("position")
    .eq("drip_id", dripId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = ((last?.position as number) ?? 0) + 1;
  const delay_value = Math.max(0, Number(formData.get("delay_value") ?? 1) || 0);
  const rawU = String(formData.get("delay_unit") ?? "days");
  const delay_unit = UNITS.has(rawU) ? rawU : "days";
  const template = String(formData.get("template") ?? "");
  const [template_name, template_language] = template.split("|");

  if (!template_name) return;

  await supabase.from("drip_steps").insert({
    org_id: orgId,
    drip_id: dripId,
    position,
    delay_value,
    delay_unit,
    template_name,
    template_language: template_language || "es",
  });

  revalidatePath(`/bots/${botId}/drips`);
}

export async function deleteDripStep(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("drip_steps").delete().eq("id", id);
  revalidatePath(`/bots/${botId}/drips`);
}
