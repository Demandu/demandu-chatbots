"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Guarda la configuración de IA (personalidad y comportamiento) del chatbot. */
export async function saveAiSettings(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  if (!botId) return;

  const words = Number(formData.get("maxWords") ?? 80);

  const ai = {
    enabled: formData.get("enabled") === "on",
    persona: String(formData.get("persona") ?? "").trim(),
    style: String(formData.get("style") ?? "").trim(),
    fallback: String(formData.get("fallback") ?? "").trim(),
    maxWords: Number.isFinite(words) ? Math.min(300, Math.max(20, words)) : 80,
    // Que la IA conteste cuando el cliente se sale del guion del flujo.
    // Encendido por defecto: es lo que evita que el bot repita el saludo o
    // conteste "no entendí" a una pregunta legítima.
    fallback_flujo: formData.get("fallback_flujo") === "on",
  };

  await createClient().from("bots").update({ ai }).eq("id", botId);
  revalidatePath(`/bots/${botId}/ai`);
}
