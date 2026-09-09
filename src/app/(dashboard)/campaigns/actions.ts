"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { esChoqueDeUnico, esRepetidaPorTiempo } from "@/lib/campanas/repetida";

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
  // El identificador del formulario. Ver `repetida.ts` y la migración 0117.
  const idem = String(formData.get("idem") ?? "").trim() || null;
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

  /* ── AQUÍ SE CORTA EL ENVÍO DOBLE ────────────────────────────────────────
   *
   * 9 SEP 2026. Un doble clic creó DOS campañas idénticas con 1,5 segundos de
   * diferencia y los dos contactos recibieron el mismo mensaje dos veces. El 2
   * de septiembre había pasado igual con seis. Ver la migración 0117.
   *
   * Lo que lo permitía era que aquí no había nada que preguntara «¿esto ya lo
   * mandé?». El botón tampoco se desactivaba, pero desactivarlo es del
   * navegador, y el navegador no protege de una recarga ni de dos pestañas.
   *
   * El candado es el índice único `(org_id, idem)`: el segundo intento del
   * MISMO formulario no puede entrar. No se avisa de nada — se lleva a la
   * campaña que ya existe, que es lo que la persona quería ver. */
  if (idem) {
    const { data: yaEsta, error: errYaEsta } = await supabase
      .from("campaigns")
      .select("id")
      .eq("org_id", orgId)
      .eq("idem", idem)
      .maybeSingle();
    // Si esta consulta falla NO se para: el índice único de abajo sigue en pie
    // y es el que de verdad corta. Parar aquí convertiría un fallo de lectura
    // en una difusión que no sale.
    if (errYaEsta) console.error("[difusión] no se pudo mirar si ya existía:", errYaEsta.message);
    if (yaEsta) redirect(`/campaigns/${(yaEsta as any).id}`);
  } else {
    /* SIN IDENTIFICADOR —una pestaña abierta desde antes de este cambio— queda
     * la red de seguridad: una campaña igual creada hace nada es la misma. */
    const { data: parecidas, error: errParecidas } = await supabase
      .from("campaigns")
      .select("id, created_at")
      .eq("org_id", orgId)
      .eq("bot_id", botId)
      .eq("name", name)
      .eq("template_name", (tpl as any).name)
      .order("created_at", { ascending: false })
      .limit(1);
    /* AQUÍ SÍ SE PARA, y es lo contrario de lo de arriba a propósito: sin
     * `idem` no hay índice único detrás, así que esta consulta es el único
     * candado. Si no se puede mirar, no se sabe si es la segunda vez — y
     * mandar dos veces cuesta dinero y quema el número. Recargar la pantalla
     * da un `idem` y el envío vuelve a estar protegido de verdad. */
    if (errParecidas) {
      console.error("[difusión] no se pudo comprobar si era repetida:", errParecidas.message);
      redirect(`/bots/${botId}/broadcasts?error=${encodeURIComponent("No se pudo comprobar si esta difusión ya se mandó. Recarga la pantalla y vuelve a intentarlo.")}`);
    }
    const ultima = (parecidas ?? [])[0] as any;
    if (ultima && esRepetidaPorTiempo(ultima.created_at, Date.now())) {
      redirect(`/campaigns/${ultima.id}`);
    }
  }

  const { data: campaign, error: errCampaign } = await supabase
    .from("campaigns")
    .insert({
      org_id: orgId,
      bot_id: botId,
      name,
      template_name: (tpl as any).name,
      template_language: (tpl as any).language,
      status: "encolada",
      audience_count: audience.length,
      idem,
    })
    .select("id")
    .single();

  /* DOS PULSACIONES A LA VEZ LLEGAN AQUÍ LAS DOS. La comprobación de arriba no
   * basta cuando las dos corren a la vez: las dos miran, las dos no encuentran
   * nada, y las dos insertan. Solo una entra —el índice único— y la otra
   * termina en este `if`, que es el único punto donde el candado es de verdad
   * infalible. */
  if (errCampaign && esChoqueDeUnico(errCampaign) && idem) {
    const { data: laQueEntro, error: errBuscar } = await supabase
      .from("campaigns")
      .select("id")
      .eq("org_id", orgId)
      .eq("idem", idem)
      .maybeSingle();
    if (errBuscar) console.error("[difusión] choque de único y no pude ver cuál entró:", errBuscar.message);
    if (laQueEntro) redirect(`/campaigns/${(laQueEntro as any).id}`);
    /* Si no se encuentra, se sigue hacia abajo y se enseña el error de verdad.
     * Lo que NO se hace es inventarse un «ya estaba» y llevar a ningún sitio:
     * el candado cortó algo y hay que poder ver qué. */
  }

  // Un fallo al escribir la campaña se dice. Antes se caía al mismo sitio que
  // «no hay campaña» y quedaba un «no_campaign» mudo.
  if (errCampaign) {
    console.error("[difusión] no se pudo crear la campaña:", errCampaign);
    redirect(`/bots/${botId}/broadcasts?error=${encodeURIComponent(errCampaign.message ?? "no_campaign")}`);
  }
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
