"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { leerAtajos } from "@/lib/flow/shortcuts";

/**
 * Guarda los atajos del chatbot (palabras para reiniciar o pedir una persona).
 * El formulario manda el objeto ya armado como JSON; aquí se sanea antes de
 * guardarlo, para que nunca entre basura a la base.
 */
export async function guardarAtajos(
  _estado: { ok: boolean; mensaje: string },
  formData: FormData,
): Promise<{ ok: boolean; mensaje: string }> {
  const botId = String(formData.get("bot_id") ?? "").trim();
  if (!botId) return { ok: false, mensaje: "Falta el chatbot." };

  let crudo: any = {};
  try {
    crudo = JSON.parse(String(formData.get("atajos") ?? "{}"));
  } catch {
    return { ok: false, mensaje: "No se pudo leer la configuración." };
  }

  const a = leerAtajos(crudo);
  const limpiarPalabras = (ws: unknown) =>
    Array.from(
      new Set(
        (Array.isArray(ws) ? ws : [])
          .map((w) => String(w ?? "").trim())
          .filter((w) => w.length > 0 && w.length <= 40),
      ),
    ).slice(0, 20);

  const atajos = {
    reset: {
      enabled: !!a.reset.enabled,
      words: limpiarPalabras(a.reset.words),
      reply: String(a.reset.reply ?? "").slice(0, 400),
    },
    agent: {
      enabled: !!a.agent.enabled,
      words: limpiarPalabras(a.agent.words),
      reply: String(a.agent.reply ?? "").slice(0, 400),
    },
    hint: {
      enabled: !!a.hint.enabled,
      text: String(a.hint.text ?? "").slice(0, 300),
      onStart: !!a.hint.onStart,
      onOptions: !!a.hint.onOptions,
    },
  };

  // Un atajo encendido sin palabras nunca se activaría: mejor avisar.
  if (atajos.reset.enabled && !atajos.reset.words.length) {
    return { ok: false, mensaje: "“Volver al inicio” está encendido pero no tiene palabras." };
  }
  if (atajos.agent.enabled && !atajos.agent.words.length) {
    return { ok: false, mensaje: "“Hablar con una persona” está encendido pero no tiene palabras." };
  }
  // Una misma palabra no puede hacer dos cosas.
  const choque = atajos.reset.words.find((w) =>
    atajos.agent.words.some((x) => x.toLowerCase() === w.toLowerCase()),
  );
  if (choque) {
    return { ok: false, mensaje: `“${choque}” está en los dos atajos. Déjala solo en uno.` };
  }

  const { error } = await createClient().from("bots").update({ shortcuts: atajos }).eq("id", botId);
  if (error) return { ok: false, mensaje: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath(`/bots/${botId}/settings`);
  return { ok: true, mensaje: "Atajos guardados" };
}
