"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { sampleFlow } from "@/lib/flow/sample";

/** Crea un bot + su flujo inicial (semilla) y abre el editor. */
export async function createBot(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "Nuevo bot";
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();

  const { data: bot } = await supabase
    .from("bots")
    .insert({ org_id: orgId, name, status: "draft" })
    .select("id")
    .single();
  if (!bot) return;

  const seed = { nodes: sampleFlow.nodes, edges: sampleFlow.edges };
  await supabase.from("flows").insert({
    bot_id: bot.id,
    org_id: orgId,
    graph: seed,
    is_live: true,
    version: 1,
  });

  revalidatePath("/bots");
  redirect(`/bots/${bot.id}`);
}

export async function deleteBot(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("bots").delete().eq("id", id);
  revalidatePath("/bots");
}
