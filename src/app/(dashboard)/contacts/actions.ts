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

export async function deleteContact(formData: FormData) {
  await createClient().from("contacts").delete().eq("id", s(formData.get("id")));
  revalidatePath("/contacts");
}
