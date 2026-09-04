"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

const GRAPH = "https://graph.facebook.com/v20.0";
/**
 * Tope de una difusión.
 *
 * NO ES UN LÍMITE TÉCNICO NUESTRO —la cola aguanta lo que le echen— sino el
 * recordatorio de que Meta tiene su propio tope de clientes distintos cada 24 h
 * según el nivel del número. Pasado ese, los envíos empiezan a rebotar uno a
 * uno y la campaña sale a medias sin que se entienda por qué.
 */
const MAX_RECIPIENTS = 5000;

/** Lee el canal de WhatsApp de un BOT (waba_id, phone_number_id, token). */
async function getChannel(supabase: ReturnType<typeof createClient>, botId: string) {
  const { data } = await supabase
    .from("whatsapp_channels")
    .select("waba_id, phone_number_id, display_number")
    .eq("bot_id", botId)
    .maybeSingle();
  if (!data) return null;

  // ── EL TOKEN POR SU PROPIA PUERTA ──────────────────────────────────────
  // La columna dejó de ser legible con la sesión de un usuario: cualquier
  // miembro de la cuenta la leía desde la consola del navegador. Ahora la
  // entrega una función que comprueba el permiso de conexiones.
  const { data: token } = await supabase.rpc("token_de_whatsapp", { p_bot_id: botId });

  return { ...(data as any), access_token: (token as string | null) ?? null } as
    | { waba_id: string | null; phone_number_id: string | null; access_token: string | null; display_number: string | null }
    | null;
}

/** Del arreglo de components de Meta saca el texto del BODY y cuántas variables tiene. */
function parseTemplate(components: any[]): { body: string; variables: number } {
  const body = (components ?? []).find((c) => c.type === "BODY");
  const text: string = body?.text ?? "";
  const matches = text.match(/\{\{\s*\d+\s*\}\}/g);
  return { body: text, variables: matches ? matches.length : 0 };
}

/** Sincroniza las plantillas de la WABA de ESE bot desde Meta. */
export async function syncTemplates(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const botId = String(formData.get("bot_id") ?? "");
  if (!botId) return;
  const supabase = createClient();
  const ch = await getChannel(supabase, botId);
  if (!ch || !ch.waba_id || !ch.access_token) {
    redirect(`/bots/${botId}/templates?error=sin_canal`);
    // `redirect` lanza, pero TypeScript no lo sabe aquí: sin este `return` el
    // resto del cuerpo se compila creyendo que `ch` puede ser nulo.
    return;
  }

  let errParam = "";
  try {
    // Se piden los campos a mano: por defecto Meta NO devuelve `rejected_reason`
    // ni `quality_score`, y sin ellos el cliente ve un "Rechazada" mudo.
    const campos = "id,name,language,category,status,components,rejected_reason,quality_score";
    const res = await fetch(
      `${GRAPH}/${ch.waba_id}/message_templates?limit=200&fields=${campos}&access_token=${ch.access_token}`,
    );
    const j = await res.json();
    if (!res.ok || !Array.isArray(j?.data)) {
      errParam = j?.error?.message ?? "meta_error";
    } else {
      for (const t of j.data) {
        const { body, variables } = parseTemplate(t.components);
        await supabase.from("whatsapp_templates").upsert(
          {
            org_id: orgId,
            bot_id: botId,
            waba_id: ch.waba_id,
            meta_id: String(t.id ?? ""),
            name: t.name,
            language: t.language ?? "es",
            category: t.category ?? null,
            status: t.status ?? "PENDING",
            body,
            components: t.components ?? null,
            variables,
            rejected_reason: t.rejected_reason ?? null,
            quality: t?.quality_score?.score ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bot_id,name,language" },
        );
      }
    }
  } catch {
    errParam = "red";
  }

  revalidatePath(`/bots/${botId}/templates`);
  if (errParam) redirect(`/bots/${botId}/templates?error=${encodeURIComponent(errParam)}`);
  redirect(`/bots/${botId}/templates?synced=1`);
}

/**
 * Encola una difusión. NO la envía.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES ENVIABA AQUÍ MISMO, con un `for` que llamaba a Meta una vez por
 * contacto mientras el navegador esperaba. Con cuarenta pasaba; con mil, la
 * función se corta a mitad —nadie mantiene una petición abierta un minuto— y el
 * resultado es el peor posible: unos recibieron, otros no, NADIE SABE QUIÉNES,
 * y volver a pulsar «enviar» se lo repite a los que ya lo tenían.
 *
 * Hay clientes que van a mandar más de mil.
 *
 * AHORA ESTO SOLO ESCRIBE LA LISTA y contesta. El reloj de la base va sacando
 * lotes cada minuto (`/api/campanas/enviar`) y cada intento queda apuntado en
 * su fila: si algo se cae, se ve exactamente dónde se quedó y quién sí recibió.
 *
 * LA AUDIENCIA SE CONGELA AL ENCOLAR, y es deliberado. Si se calculara al
 * enviar, alguien que se etiqueta mientras la difusión está saliendo entraría a
 * mitad — y la campaña diría 400 y habrían salido 430. Lo que se ve al pulsar
 * es lo que se manda.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function sendCampaign(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;
  const supabase = createClient();

  const botId = String(formData.get("bot_id") ?? "");
  const templateId = String(formData.get("template_id") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Difusión";
  const tag = String(formData.get("tag") ?? "").trim();
  if (!botId) return;

  const ch = await getChannel(supabase, botId);
  if (!ch?.phone_number_id || !ch?.access_token) {
    redirect(`/bots/${botId}/broadcasts?error=sin_canal`);
  }

  const { data: tpl } = await supabase
    .from("whatsapp_templates")
    .select("name, language")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl) redirect(`/bots/${botId}/broadcasts?error=sin_plantilla`);

  // Audiencia: contactos de WhatsApp no dados de baja (opcional por etiqueta).
  // `opted_out` se filtra AQUÍ y no al enviar: quien pidió no recibir mensajes
  // no puede ni siquiera entrar en la lista, porque una fila en la cola es una
  // fila que alguien puede reintentar después.
  let q = supabase
    .from("contacts")
    .select("id, name, phone")
    .eq("org_id", orgId)
    .eq("channel", "whatsapp")
    .eq("opted_out", false);
  if (tag) q = q.contains("tags", [tag]);
  const { data: contacts } = await q.limit(MAX_RECIPIENTS);
  const audience = (contacts ?? []).filter((c) => c.phone);

  if (!audience.length) redirect(`/bots/${botId}/broadcasts?error=sin_audiencia`);

  const { data: campaign } = await supabase
    .from("campaigns")
    .insert({
      org_id: orgId,
      bot_id: botId,
      name,
      template_name: (tpl as any).name,
      template_language: (tpl as any).language,
      status: "encolada",
      audience_count: audience.length,
    })
    .select("id")
    .single();
  if (!campaign) redirect(`/bots/${botId}/broadcasts?error=no_campaign`);

  // POR TROZOS: mil filas en un solo `insert` es una petición enorme que puede
  // rebotar por tamaño. En trozos de doscientos entra siempre, y si uno falla
  // los anteriores ya están encolados y saldrán igual.
  const filas = audience.map((c) => ({
    campaign_id: (campaign as any).id,
    org_id: orgId,
    contact_id: c.id,
    phone: c.phone,
    name: c.name,
    status: "pendiente",
  }));

  let encolados = 0;
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await supabase.from("campaign_recipients").insert(filas.slice(i, i + 200));
    if (error) break;
    encolados += Math.min(200, filas.length - i);
  }

  // EL NÚMERO QUE SE ENSEÑA ES EL QUE DE VERDAD ESTÁ EN LA COLA. Si un trozo
  // falló, la campaña no puede decir que va a mandar mil.
  if (encolados !== filas.length) {
    await supabase.from("campaigns").update({ audience_count: encolados }).eq("id", (campaign as any).id);
  }

  revalidatePath(`/bots/${botId}/broadcasts`);
  redirect(`/campaigns/${(campaign as any).id}`);
}
