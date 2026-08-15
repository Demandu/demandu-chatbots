"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

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
  // Solo se permite borrar estados personalizados (no los de por defecto)
  await createClient()
    .from("conversation_states")
    .delete()
    .eq("id", s(formData.get("id")))
    .eq("is_default", false);
  revalidatePath("/settings/states");
}
