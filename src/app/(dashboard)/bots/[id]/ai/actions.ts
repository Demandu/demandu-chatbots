"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accionesDelPrompt, CLAVES_DE_ACCION } from "@/lib/ai/acciones";

/**
 * Las herramientas que puede tener un agente.
 *
 * SALE DEL CATÁLOGO, NO DE UNA LISTA A MANO. La lista escrita aquí se había
 * quedado con SEIS de las nueve: las tres de la tienda —`ver_catalogo`,
 * `estado_de_pedido`, `enlace_de_tienda`— funcionaban perfectamente pero no
 * tenían casilla en ninguna pantalla. Solo se activaban si el cliente adivinaba
 * que había que escribir `/ver_catalogo` en el prompt.
 *
 * O sea: tres funciones construidas, probadas y desplegadas que ningún cliente
 * iba a encontrar nunca. Leyendo el catálogo, una herramienta nueva aparece
 * sola y esto no puede volver a pasar.
 */
const HERRAMIENTAS = CLAVES_DE_ACCION;

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

  // ─────────────────────────────────────────────────────────────────────────
  // SE GUARDA EN EL AGENTE, NO EN `bots.ai`.
  //
  // Un agente puede servir a VARIOS chatbots: el negocio escribe su forma de
  // hablar una vez y la usan WhatsApp, Instagram y la web. Antes escribía lo
  // mismo tres veces, y el día que cambiaba su horario lo cambiaba en tres
  // sitios — o se le quedaba uno viejo, que era siempre el que nadie miraba.
  //
  // El cliente no se entera de nada: sigue editando en esta misma pantalla. La
  // palabra «agente» solo aparece si quiere que otro canal hable igual.
  //
  // ── `bots.ai` SE QUEDA CONGELADO A PROPÓSITO ─────────────────────────────
  // Es la red por si el agente desaparece (la clave foránea pone `agente_id` a
  // nulo al borrarlo). NO se escribe también aquí: dos copias que se editan
  // por separado acaban discrepando, y entonces la red deja de ser una red y
  // pasa a ser una segunda verdad. Vale más una foto del día de la migración
  // —peor, pero honesta— que un bot mudo.
  // ─────────────────────────────────────────────────────────────────────────
  const supabase = createClient();
  const { data: bot } = await supabase
    .from("bots").select("id, org_id, name, agente_id").eq("id", botId).maybeSingle();
  if (!bot) return;

  const enElAgente = {
    ia_encendida: ai.enabled,
    prompt: ai.persona,
    tono: ai.style,
    respaldo: ai.fallback,
    max_palabras: ai.maxWords,
    herramientas: ai.herramientas,
    criterios: ai.criterios,
    sistema_url: ai.sistemaUrl,
    sistema_descripcion: ai.sistemaDescripcion,
    ia_de_respaldo: ai.fallback_flujo,
    updated_at: new Date().toISOString(),
  };

  let error: { message: string } | null = null;

  if (bot.agente_id) {
    ({ error } = await supabase.from("agentes").update(enElAgente).eq("id", bot.agente_id));
  } else {
    // UN BOT SIN AGENTE SE LO GANA AQUÍ, sin pedirle nada al cliente. Pasa con
    // los chatbots creados después de la migración. El nombre lleva sufijo si
    // ya existe uno igual: el nombre es único por cuenta y una pantalla que
    // revienta al guardar es peor que un nombre feo.
    const base = String(bot.name ?? "Agente").slice(0, 60);
    let nombre = base;
    for (let i = 2; i < 12; i++) {
      const { data: choca } = await supabase
        .from("agentes").select("id").eq("org_id", bot.org_id).eq("nombre", nombre).maybeSingle();
      if (!choca) break;
      nombre = `${base} (${i})`;
    }

    const { data: nuevo, error: e1 } = await supabase
      .from("agentes").insert({ org_id: bot.org_id, nombre, ...enElAgente })
      .select("id").single();
    error = e1;
    if (nuevo?.id) {
      const { error: e2 } = await supabase.from("bots").update({ agente_id: nuevo.id }).eq("id", botId);
      error = error ?? e2;
    }
  }

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


/**
 * Con qué tienda trabaja este agente.
 *
 * Solo hace falta cuando la cuenta tiene VARIAS tiendas apuntando al mismo
 * chatbot. Con una, no hay nada que elegir y la pantalla no lo enseña.
 *
 * SE COMPRUEBA QUE LA TIENDA SEA SUYA aunque la clave foránea compuesta ya lo
 * impida en la base: así el cliente recibe una pantalla que no cambia en vez
 * de un error de Postgres.
 */
export async function elegirTiendaDelAgente(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const pedida = String(formData.get("tienda_id") ?? "").trim();
  if (!botId) return;

  const supabase = createClient();
  const { data: bot } = await supabase
    .from("bots").select("id, org_id, agente_id").eq("id", botId).maybeSingle();
  if (!bot?.agente_id) return;

  let valor: string | null = null;
  if (pedida) {
    const { data: suya } = await supabase
      .from("tiendas").select("id").eq("id", pedida).eq("org_id", bot.org_id).maybeSingle();
    valor = suya ? pedida : null;
  }

  await supabase
    .from("agentes")
    .update({ tienda_id: valor, updated_at: new Date().toISOString() })
    .eq("id", bot.agente_id);

  revalidatePath(`/bots/${botId}/ai`);
}

/**
 * Que este chatbot use la personalidad de otro.
 *
 * ES EL ÚNICO SITIO DONDE APARECE LA PALABRA «AGENTE», y aparece solo cuando
 * sirve de algo: cuando el negocio ya tiene otro canal y quiere que hable
 * igual. Quien tiene un solo chatbot no lo ve nunca.
 */
export async function usarOtroAgente(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const agenteId = String(formData.get("agente_id") ?? "").trim();
  if (!botId || !agenteId) return;

  const supabase = createClient();
  const { data: bot } = await supabase
    .from("bots").select("id, org_id").eq("id", botId).maybeSingle();
  if (!bot) return;

  // De la misma cuenta, y se comprueba aquí para que el cliente vea la pantalla
  // sin cambios en vez de un error de la base.
  const { data: suyo } = await supabase
    .from("agentes").select("id").eq("id", agenteId).eq("org_id", bot.org_id).maybeSingle();
  if (!suyo) return;

  await supabase.from("bots").update({ agente_id: agenteId }).eq("id", botId);
  revalidatePath(`/bots/${botId}/ai`);
  redirect(`/bots/${botId}/ai?guardado=si`);
}
