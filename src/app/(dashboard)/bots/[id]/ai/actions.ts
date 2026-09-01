"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accionesDelPrompt } from "@/lib/ai/acciones";

/** Las herramientas que puede tener un agente. El motor conoce estos mismos nombres. */
const HERRAMIENTAS = [
  "ver_horarios",
  "agendar_cita",
  "etiquetar",
  "guardar_dato",
  "pasar_a_humano",
  "consultar_sistema",
] as const;

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

    // ── EL AGENTE ────────────────────────────────────────────────────────────
    // Qué puede HACER, además de hablar. Vacío = solo conversa, que es como se
    // comportaba antes de que existieran las herramientas.
    // Lo marcado en las casillas MÁS lo que pide el prompt con «/».
    //
    // Se unen porque son dos formas de decir lo mismo y ninguna debe pisar a
    // la otra: quien marcó casillas no las pierde por escribir un prompt, y
    // quien escribe `/etiquetar` no tiene que acordarse de venir a marcar
    // nada. Antes hacían falta las dos cosas, y el resultado real fue un
    // prompt de dos páginas pidiendo etiquetar con cero herramientas activas.
    herramientas: [...new Set([
      ...HERRAMIENTAS.filter((h) => formData.get(`h_${h}`) === "on"),
      ...accionesDelPrompt(String(formData.get("persona") ?? "")),
    ])],
    // Cuándo etiquetar, cuándo calificar, cuándo pasar con alguien. En español
    // y escrito por el cliente: es lo que hace que el mismo código sirva para
    // una clínica y para una inmobiliaria.
    criterios: String(formData.get("criterios") ?? "").trim(),
    sistemaUrl: String(formData.get("sistemaUrl") ?? "").trim(),
    sistemaDescripcion: String(formData.get("sistemaDescripcion") ?? "").trim(),
  };

  const { error } = await createClient().from("bots").update({ ai }).eq("id", botId);

  revalidatePath(`/bots/${botId}/ai`);

  // DECIRLO. Antes esto guardaba y no pasaba NADA en pantalla: misma página,
  // mismos campos, cero señal. El dueño del negocio le daba a Guardar, no veía
  // nada y concluía que el botón estaba roto — cuando lo único roto era que
  // nadie le contestaba. Y si de verdad falla, ahora también se entera, en vez
  // de irse creyendo que quedó configurado.
  if (error) {
    console.error("[ia] no se pudo guardar la configuración:", error.message);
    redirect(`/bots/${botId}/ai?guardado=no`);
  }
  redirect(`/bots/${botId}/ai?guardado=si`);
}
