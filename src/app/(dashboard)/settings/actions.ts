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
  // Un grupo es «una pregunta»: Calificación, Temperatura, Tamaño de cuenta…
  // Dentro de un grupo solo puede haber UNA etiqueta puesta a la vez. Vacío =
  // etiqueta suelta, de las que se acumulan («vip», «habla inglés»).
  const grupo = s(formData.get("grupo")) || null;
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient().from("tags").insert({ org_id: orgId, name, color, grupo });
  revalidatePath("/settings/tags");
}

/**
 * Cambiar a qué grupo pertenece una etiqueta.
 *
 * SE PUEDE CAMBIAR DESPUÉS a propósito: casi nadie crea las tres etiquetas de
 * calificación pensando que son «una pregunta con tres respuestas». Lo
 * descubren el día que un contacto aparece en dos niveles a la vez — que es
 * exactamente como lo descubrimos nosotros.
 */
export async function agruparTag(formData: FormData) {
  const id = s(formData.get("id"));
  const grupo = s(formData.get("grupo")) || null;
  if (!id) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  // El filtro por organización es la comprobación de verdad: aunque llegue un
  // id de otra cuenta, no hay ninguna fila que tocar.
  await createClient().from("tags").update({ grupo }).eq("id", id).eq("org_id", orgId);
  revalidatePath("/settings/tags");
}

export async function deleteTag(formData: FormData) {
  await createClient().from("tags").delete().eq("id", s(formData.get("id")));
  revalidatePath("/settings/tags");
}

// ── Calificación automática ──────────────────────────────────────────────────
/**
 * «Si el ingreso es menos de 890, ponle lead-bajo.»
 *
 * ESTO NO ES UNA INSTRUCCIÓN PARA LA IA: es una regla que aplica la base en
 * cuanto el dato entra en la ficha, lo escriba quien lo escriba. La IA solo
 * tiene que capturar el número —que es lo que hace bien—; decidir la etiqueta
 * ya no depende de que se acuerde.
 */
export async function crearReglaDeCalificacion(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const campo = s(formData.get("campo"));
  const operador = s(formData.get("operador"));
  const valor = s(formData.get("valor"));
  const etiquetaId = s(formData.get("etiqueta_id"));
  if (!campo || !operador || !etiquetaId) return;

  await createClient().from("reglas_de_calificacion").insert({
    org_id: orgId,
    campo,
    operador,
    valor: valor || null,
    etiqueta_id: etiquetaId,
    // Las más nuevas mandan. Gana la primera regla que se cumple, así que el
    // orden ES la regla: quien acaba de escribirla espera que pese más.
    prioridad: Math.floor(Date.now() / 1000) % 100000,
  });

  revalidatePath("/settings/tags");
}

export async function quitarReglaDeCalificacion(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const id = s(formData.get("id"));
  if (!id) return;
  await createClient().from("reglas_de_calificacion").delete().eq("id", id).eq("org_id", orgId);
  revalidatePath("/settings/tags");
}

// ── Reglas de reparto por etiqueta ───────────────────────────────────────────
/**
 * «Si el lead es alto, que le toque a Darwin.»
 *
 * El destino llega como `persona:<id>` o `equipo:<id>` en un solo campo. Así
 * el formulario no puede mandar los dos —la base lo rechazaría— ni ninguno.
 */
export async function crearReglaDeReparto(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const tagId = s(formData.get("tag_id"));
  const destino = s(formData.get("destino"));
  if (!tagId || !destino) return;

  const [tipo, id] = destino.split(":");
  if (!id) return;

  await createClient().from("reglas_de_reparto").insert({
    org_id: orgId,
    tag_id: tagId,
    member_id: tipo === "persona" ? id : null,
    team_id: tipo === "equipo" ? id : null,
    // Las más nuevas mandan sobre las viejas si dos etiquetas del mismo
    // contacto tienen regla. Es lo que espera quien acaba de escribir una.
    prioridad: Math.floor(Date.now() / 1000) % 100000,
  });

  revalidatePath("/settings/assignment");
}

export async function quitarReglaDeReparto(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const id = s(formData.get("id"));
  if (!id) return;
  // El filtro por organización es la comprobación de verdad.
  await createClient().from("reglas_de_reparto").delete().eq("id", id).eq("org_id", orgId);
  revalidatePath("/settings/assignment");
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
// `outcome` es lo que hace posible medir la efectividad de cierre: la
// plataforma no puede adivinar si "En proceso" es una venta o no, así que lo
// dice el cliente. La base solo acepta estos tres valores.
const RESULTADOS = new Set(["abierto", "ganado", "perdido"]);
function leerResultado(v: FormDataEntryValue | null): string {
  const r = s(v);
  return RESULTADOS.has(r) ? r : "abierto";
}

export async function createState(formData: FormData) {
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) || "#3A85FF";
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  await createClient()
    .from("conversation_states")
    .insert({
      org_id: orgId, name, color, is_default: false, sort: 100,
      outcome: leerResultado(formData.get("outcome")),
      pipeline_id: s(formData.get("pipeline_id")) || null,
    });
  revalidatePath("/settings/states");
  revalidatePath("/analytics");
}
export async function updateState(formData: FormData) {
  const id = s(formData.get("id"));
  const name = s(formData.get("name"));
  const color = s(formData.get("color")) || "#3A85FF";
  if (!id || !name) return;
  await createClient()
    .from("conversation_states")
    .update({ name, color, outcome: leerResultado(formData.get("outcome")) })
    .eq("id", id);
  revalidatePath("/crm");
  revalidatePath("/settings/states");
  revalidatePath("/analytics");
  revalidatePath("/crm");
}
export async function deleteState(formData: FormData) {
  await createClient()
    .from("conversation_states")
    .delete()
    .eq("id", s(formData.get("id")));
  revalidatePath("/settings/states");
  revalidatePath("/analytics");
}

// ── Embudos ──────────────────────────────────────────────────────────────────
// Un embudo agrupa etapas. La mayoría de los clientes va a tener uno solo
// ("Ventas"); los que venden cosas muy distintas quieren separarlos.
export async function createPipeline(formData: FormData) {
  const name = s(formData.get("name"));
  if (!name) return;
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const sb = createClient();
  const { count } = await sb.from("pipelines").select("id", { count: "exact", head: true });
  const { data: nuevo } = await sb
    .from("pipelines")
    .insert({ org_id: orgId, name, is_default: (count ?? 0) === 0, sort: count ?? 0 })
    .select("id")
    .single();

  // Un embudo sin etapas no sirve de nada: se estrena con las básicas.
  if (nuevo?.id) {
    await sb.from("conversation_states").insert([
      { org_id: orgId, pipeline_id: nuevo.id, name: "Nuevo",      color: "#3A85FF", sort: 1, outcome: "abierto" },
      { org_id: orgId, pipeline_id: nuevo.id, name: "Contactado", color: "#6E42FF", sort: 2, outcome: "abierto" },
      { org_id: orgId, pipeline_id: nuevo.id, name: "Ganada",     color: "#3DDC97", sort: 8, outcome: "ganado" },
      { org_id: orgId, pipeline_id: nuevo.id, name: "Perdida",    color: "#FF6B6B", sort: 9, outcome: "perdido" },
    ]);
  }
  revalidatePath("/settings/states");
  revalidatePath("/crm");
}

export async function updatePipeline(formData: FormData) {
  const id = s(formData.get("id"));
  const name = s(formData.get("name"));
  if (!id || !name) return;
  const sb = createClient();
  const orgId = await getCurrentOrgId();
  const porDefecto = formData.get("is_default") === "on";

  // Solo puede haber uno por defecto: es el que abre la pantalla de Embudo y
  // al que se enganchan las conversaciones nuevas.
  if (porDefecto && orgId) {
    await sb.from("pipelines").update({ is_default: false }).eq("org_id", orgId);
  }
  await sb
    .from("pipelines")
    .update({
      name,
      auto_create: formData.get("auto_create") === "on",
      // Van con el resto del formulario: son del embudo, no de la tienda. Un
      // negocio con dos embudos puede querer que solo uno cuente pedidos.
      pedidos_suman: formData.get("pedidos_suman") === "on",
      pedido_pagado_gana: formData.get("pedido_pagado_gana") === "on",
      is_default: porDefecto,
    })
    .eq("id", id);
  revalidatePath("/settings/states");
  revalidatePath("/crm");
}

export async function deletePipeline(formData: FormData) {
  const id = s(formData.get("id"));
  if (!id) return;
  const sb = createClient();
  const { count } = await sb.from("pipelines").select("id", { count: "exact", head: true });
  // Nunca dejar al cliente sin ningún embudo: se quedaría sin pantalla.
  if ((count ?? 0) <= 1) return;
  await sb.from("pipelines").delete().eq("id", id);
  revalidatePath("/settings/states");
  revalidatePath("/crm");
}

// ── Reparto automático de conversaciones ─────────────────────────────────────
export async function guardarReparto(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const entero = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
    const n = Number(s(v));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(Math.max(Math.round(n), min), max);
  };
  const estrategia = s(formData.get("strategy")) === "rueda" ? "rueda" : "menos_carga";

  await createClient()
    .from("assignment_settings")
    .upsert(
      {
        org_id: orgId,
        enabled: formData.get("enabled") === "on",
        strategy: estrategia,
        solo_en_linea: formData.get("solo_en_linea") === "on",
        // Vacío = sin tope. No se fuerza un número: obligar a poner uno haría
        // que un equipo chico dejara de recibir chats sin entender por qué.
        max_abiertas: entero(formData.get("max_abiertas"), 1, 500),
        team_id: s(formData.get("team_id")) || null,
        solo_horario: formData.get("solo_horario") === "on",
        espera_horas: entero(formData.get("espera_horas"), 1, 168) ?? 24,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  revalidatePath("/settings/assignment");
  revalidatePath("/inbox");
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
export async function guardarColorBurbuja(
  _estado: { ok: boolean; mensaje: string },
  formData: FormData,
): Promise<{ ok: boolean; mensaje: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "No pudimos identificar tu cuenta." };

  // Solo aceptamos un color hex válido: nada de texto libre en el estilo.
  const raw = s(formData.get("bubble_out"));
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return { ok: false, mensaje: "Ese color no es válido. Usa el selector." };
  }

  const supabase = createClient();
  const { data: org } = await supabase.from("organizations").select("branding").eq("id", orgId).maybeSingle();
  const branding = { ...(((org as any)?.branding ?? {}) as Record<string, unknown>), bubble_out: raw };

  const { error } = await supabase.from("organizations").update({ branding }).eq("id", orgId);
  if (error) return { ok: false, mensaje: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/settings/chat");
  revalidatePath("/inbox");
  return { ok: true, mensaje: "Color guardado" };
}
