"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const POSITIONS = new Set(["right", "left"]);

/** Guarda la apariencia del widget web de un chatbot. */
export async function saveWidget(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  if (!botId) return;

  const rawPos = String(formData.get("position") ?? "right");
  const color = String(formData.get("color") ?? "#6E42FF").trim();

  const widget = {
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#6E42FF",
    position: POSITIONS.has(rawPos) ? rawPos : "right",
    title: String(formData.get("title") ?? "").trim() || "¿Podemos ayudarte?",
    subtitle: String(formData.get("subtitle") ?? "").trim(),
    launcher: String(formData.get("launcher") ?? "").trim() || "Chatea con nosotros",
    greeting: String(formData.get("greeting") ?? "").trim(),
  };

  await createClient().from("bots").update({ widget }).eq("id", botId);
  revalidatePath(`/bots/${botId}/appearance`);
}
