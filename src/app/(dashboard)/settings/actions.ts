"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// ── Horario laboral (a nivel organización) ───────────────────────────────────
export async function updateBusinessHours(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const business_hours: Record<string, any> = {};
  for (const d of DAYS) {
    business_hours[d] = {
      enabled: formData.get(`${d}_enabled`) === "on",
      open: s(formData.get(`${d}_open`)) || "09:00",
      close: s(formData.get(`${d}_close`)) || "18:00",
    };
  }
  const timezone = s(formData.get("timezone")) || "America/Mexico_City";
  await createClient().from("organizations").update({ business_hours, timezone }).eq("id", orgId);
  revalidatePath("/settings/hours");
  redirect("/settings/hours?saved=1");
}

// ── Etiquetas ────────────────────────────────────────────────────────────────
export async function createTag(formData: FormData) {
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) || "#F64A97";
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient().from("tags").insert({ org_id: orgId, name, color });
  revalidatePath("/settings/tags");
}
export async function deleteTag(formData: FormData) {
  await createClient().from("tags").delete().eq("id", s(formData.get("id")));
  revalidatePath("/settings/tags");
}

// ── Equipos ──────────────────────────────────────────────────────────────────
export async function createTeam(formData: FormData) {
  const name = s(formData.get("name"));
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient().from("teams").insert({ org_id: orgId, name });
  revalidatePath("/settings/teams");
}
export async function deleteTeam(formData: FormData) {
  await createClient().from("teams").delete().eq("id", s(formData.get("id")));
  revalidatePath("/settings/teams");
}

// ── Miembros ─────────────────────────────────────────────────────────────────
export async function createMember(formData: FormData) {
  const name = s(formData.get("name"));
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const team_id = s(formData.get("team_id")) || null;
  await createClient().from("team_members").insert({
    org_id: orgId,
    name,
    email: s(formData.get("email")) || null,
    phone: s(formData.get("phone")) || null,
    team_id,
  });
  revalidatePath("/settings/teams");
}
export async function deleteMember(formData: FormData) {
  await createClient().from("team_members").delete().eq("id", s(formData.get("id")));
  revalidatePath("/settings/teams");
}

// ── Grupos de leads ──────────────────────────────────────────────────────────
export async function createLeadGroup(formData: FormData) {
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) || "#6E42FF";
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient().from("lead_groups").insert({
    org_id: orgId,
    name,
    description: s(formData.get("description")) || null,
    color,
  });
  revalidatePath("/settings/lead-groups");
}
export async function deleteLeadGroup(formData: FormData) {
  await createClient().from("lead_groups").delete().eq("id", s(formData.get("id")));
  revalidatePath("/settings/lead-groups");
}

// ── Estados de conversación ──────────────────────────────────────────────────
export async function createState(formData: FormData) {
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) || "#3A85FF";
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient()
    .from("conversation_states")
    .insert({ org_id: orgId, name, color, is_default: false, sort: 100 });
  revalidatePath("/settings/states");
}
export async function updateState(formData: FormData) {
  const id = s(formData.get("id"));
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) || "#3A85FF";
  if (!id || !name) return;
  await createClient()
    .from("conversation_states")
    .update({ name, color })
    .eq("id", id);
  revalidatePath("/settings/states");
}
export async function deleteState(formData: FormData) {
  await createClient()
    .from("conversation_states")
    .delete()
    .eq("id", s(formData.get("id")));
  revalidatePath("/settings/states");
}

// ── Atributos personalizados ─────────────────────────────────────────────────
const ATTR_TYPES = new Set(["string", "number", "float", "email", "phone", "date", "boolean", "list"]);
const ATTR_PURPOSES = new Set(["chatbot", "api", "agent"]);

/** Convierte un nombre en una clave de máquina segura (snake_case ascii). */
function slugKey(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "atributo";
}

export async function createAttribute(formData: FormData) {
  const name = s(formData.get("name"));
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const rawKey = s(formData.get("key"));
  const key = slugKey(rawKey || name);
  const type = ATTR_TYPES.has(s(formData.get("type"))) ? s(formData.get("type")) : "string";
  const purpose = ATTR_PURPOSES.has(s(formData.get("purpose"))) ? s(formData.get("purpose")) : "chatbot";
  await createClient().from("custom_attributes").insert({
    org_id: orgId, name, key, type, purpose, visible: true, sort: 100,
  });
  revalidatePath("/settings/attributes");
}

export async function updateAttribute(formData: FormData) {
  const id = s(formData.get("id"));
  const name = s(formData.get("name"));
  if (!id || !name) return;
  const type = ATTR_TYPES.has(s(formData.get("type"))) ? s(formData.get("type")) : "string";
  const purpose = ATTR_PURPOSES.has(s(formData.get("purpose"))) ? s(formData.get("purpose")) : "chatbot";
  await createClient().from("custom_attributes").update({ name, type, purpose }).eq("id", id);
  revalidatePath("/settings/attributes");
}

export async function toggleAttributeVisibility(formData: FormData) {
  const id = s(formData.get("id"));
  const visible = s(formData.get("visible")) === "true";
  if (!id) return;
  await createClient().from("custom_attributes").update({ visible: !visible }).eq("id", id);
  revalidatePath("/settings/attributes");
}

export async function deleteAttribute(formData: FormData) {
  await createClient().from("custom_attributes").delete().eq("id", s(formData.get("id")));
  revalidatePath("/settings/attributes");
}

// ── Integraciones ────────────────────────────────────────────────────────────
export async function disconnectIntegration(formData: FormData) {
  const provider = s(formData.get("provider"));
  if (!provider) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();
  // Intenta revocar el token en Google (best-effort)
  if (provider === "google_calendar") {
    const { data } = await supabase
      .from("integrations")
      .select("access_token, refresh_token")
      .eq("org_id", orgId)
      .eq("provider", provider)
      .maybeSingle();
    const token = (data?.refresh_token as string) || (data?.access_token as string);
    if (token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
      } catch {
        /* best-effort */
      }
    }
  }
  await supabase.from("integrations").delete().eq("org_id", orgId).eq("provider", provider);
  revalidatePath("/settings/integrations");
}

// ── WhatsApp Cloud API ───────────────────────────────────────────────────────
export async function saveWhatsappChannel(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const phone_number_id = s(formData.get("phone_number_id"));
  const access_token = s(formData.get("access_token"));
  if (!phone_number_id || !access_token) return;
  await createClient().from("whatsapp_channels").upsert(
    {
      org_id: orgId,
      phone_number_id,
      waba_id: s(formData.get("waba_id")) || null,
      display_number: s(formData.get("display_number")) || null,
      access_token,
      bot_id: s(formData.get("bot_id")) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );
  revalidatePath("/settings/integrations");
}

export async function disconnectWhatsapp(_formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient().from("whatsapp_channels").delete().eq("org_id", orgId);
  revalidatePath("/settings/integrations");
}

// ── Apariencia del chat (color de las burbujas que enviamos) ─────────────────
export async function guardarColorBurbuja(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  // Solo aceptamos un color hex válido: nada de texto libre en el estilo.
  const raw = s(formData.get("bubble_out"));
  const color = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "#e7ddff";

  const supabase = createClient();
  const { data: org } = await supabase.from("organizations").select("branding").eq("id", orgId).maybeSingle();
  const branding = { ...(((org as any)?.branding ?? {}) as Record<string, unknown>), bubble_out: color };

  await supabase.from("organizations").update({ branding }).eq("id", orgId);
  revalidatePath("/settings/chat");
  revalidatePath("/inbox");
}
