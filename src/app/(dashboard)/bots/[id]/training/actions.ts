"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { fetchPageText } from "@/lib/ai/fromUrl";
import { ingestText } from "@/lib/ai/ingest";
import { checkQuota } from "@/lib/billing/quota";
import { extraerTexto, porQueNoSeAcepta } from "@/lib/ai/extraerTexto";
import { comoSeGuarda, partesDeAdjunto } from "@/lib/adjuntos";

/**
 * Agrega un dato del negocio a la base de conocimiento del chatbot.
 *
 * Devuelve estado (en vez de no devolver nada) para que el formulario pueda
 * vaciarse y confirmar. Antes los campos se quedaban con lo ya guardado y era
 * fácil agregar el mismo dato dos veces sin darse cuenta.
 */
export async function addKnowledge(
  _estado: { ok: boolean; mensaje?: string } | undefined,
  formData: FormData,
): Promise<{ ok: boolean; mensaje?: string }> {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!orgId || !botId || !title || !content) {
    return { ok: false, mensaje: "Faltan el tema o el contenido." };
  }

  const supabase = createClient();
  const quota = await checkQuota(supabase, orgId, Buffer.byteLength(content, "utf8"));
  if (!quota.ok) return { ok: false, mensaje: quota.message };

  const { error } = await supabase.from("bot_knowledge").insert({
    org_id: orgId,
    bot_id: botId,
    title,
    content,
    source_type: String(formData.get("source_type") ?? "text"),
  });
  if (error) return { ok: false, mensaje: "No se pudo guardar. Inténtalo otra vez." };

  revalidatePath(`/bots/${botId}/training`);
  return { ok: true, mensaje: `Listo, tu chatbot ya sabe sobre "${title}".` };
}

/** Misma alta, para los botones de ejemplo (formulario sin estado). */
export async function addKnowledgeSimple(formData: FormData) {
  await addKnowledge(undefined, formData);
}

/** Lee una página web del cliente y carga su contenido como conocimiento. */
export async function importFromUrl(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  if (!orgId || !botId || !url) return;

  // SE VUELVE A LA PESTAÑA DESDE LA QUE SE PULSÓ. Sin el `?t=web`, importar una
  // página devolvía al Resumen: el cliente perdía de vista la lista de fuentes
  // que acababa de cambiar y creía que no había pasado nada.
  // `ruta` es la dirección a secas —lo que necesita `revalidatePath`— y `base`
  // ya lleva la pestaña. Los avisos se pegan con `&` porque `base` YA tiene una
  // interrogación: con `?` saldría `?t=web?error=…` y el aviso no se leería.
  const ruta = `/bots/${botId}/training`;
  const base = `${ruta}?t=web`;
  const page = await fetchPageText(url);

  if (!page.ok) {
    redirect(`${base}&error=${encodeURIComponent(page.error)}`);
  }

  // ¿Cabe en el plan del cliente?
  const quota = await checkQuota(createClient(), orgId, Buffer.byteLength(page.text, "utf8"));
  if (!quota.ok) {
    redirect(`${base}&error=${encodeURIComponent(quota.message)}`);
  }

  const n = await ingestText({
    admin: createAdminClient(),
    orgId,
    botId,
    title: page.title,
    text: page.text,
    sourceType: "url",
    sourceUrl: page.url,
    sourceName: page.url,
    replaceSourceName: true,
  });

  revalidatePath(ruta);
  redirect(n > 0 ? `${base}&imported=${n}` : `${base}&error=${encodeURIComponent("No se pudo guardar el contenido.")}`);
}

/** Borra de golpe todo lo que vino de una misma fuente. */
export async function deleteSource(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const sourceName = String(formData.get("source_name") ?? "");
  if (!botId || !sourceName) return;
  await createClient().from("bot_knowledge").delete().eq("bot_id", botId).eq("source_name", sourceName);
  revalidatePath(`/bots/${botId}/training`);
}

/** Edita un dato ya guardado. */
export async function updateKnowledge(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!id || !title || !content) return;

  await createClient()
    .from("bot_knowledge")
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/bots/${botId}/training`);
}

export async function deleteKnowledge(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await createClient().from("bot_knowledge").delete().eq("id", id);
  revalidatePath(`/bots/${botId}/training`);
}

/** Activa o desactiva un dato sin borrarlo. */
export async function toggleKnowledge(formData: FormData) {
  const botId = String(formData.get("bot_id") ?? "");
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;
  await createClient()
    .from("bot_knowledge")
    .update({ enabled: !enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath(`/bots/${botId}/training`);
}

/**
 * ENTRENAR CON UN DOCUMENTO QUE EL NEGOCIO YA TIENE ESCRITO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El PDF de precios, el Word de políticas, el CSV del catálogo. Es la forma más
 * rápida de que un chatbot sepa del negocio: nadie va a reescribir a mano lo
 * que ya tiene en un archivo.
 *
 * ── EL ARCHIVO NO VIAJA POR AQUÍ, Y NO ES UN DETALLE ────────────────────────
 *
 * Lo sube el NAVEGADOR al almacén, igual que hace la Bandeja con los adjuntos,
 * y a esta acción solo le llega la dirección. Mandar el archivo dentro del
 * formulario parece más simple y está roto de fábrica: las acciones de servidor
 * de Next traen un tope de **1 MB** y `next.config` no lo sube, así que
 * cualquier PDF de verdad se rechazaría con un error del framework que no dice
 * nada y que el negocio leería como «la plataforma no sirve».
 *
 * ── SOLO SE LEEN DIRECCIONES DE NUESTRO ALMACÉN, Y DE ESTA CUENTA ───────────
 *
 * Esta función baja lo que le digan. Sin comprobarlo, cualquiera con sesión
 * podría pasarle `http://169.254.169.254/...` y usar nuestro servidor para leer
 * cosas de la red interna, o la carpeta de OTRO cliente para llevarse su
 * catálogo. Por eso la dirección se descifra con `partesDeAdjunto` —que solo
 * reconoce NUESTROS dos almacenes— y la primera carpeta de la ruta tiene que
 * ser la de su propia organización.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function importFromFile(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!orgId || !botId || !url || !nombre) return;

  const ruta = `/bots/${botId}/training`;
  const base = `${ruta}?t=archivos`;
  const fallar = (m: string) => redirect(`${base}&error=${encodeURIComponent(m)}`);

  const noSirve = porQueNoSeAcepta(nombre, Number(formData.get("bytes") ?? 1));
  if (noSirve) fallar(noSirve);

  // ── EL CANDADO, Y POR QUÉ YA NO SE MIRA EL TEXTO DE LA DIRECCIÓN ──────────
  //
  // Esto comparó durante meses contra una dirección PÚBLICA de `media`, armada
  // aquí con una plantilla de texto. El día que los documentos de entrenamiento
  // se mudaron al almacén privado, la comparación dejó de cuadrar y TODAS las
  // subidas murieron en «No pude leer ese archivo. Vuelve a subirlo.»
  //
  // Y no hubo un solo error en los registros: desde el punto de vista del
  // código la dirección era ajena y el rechazo estaba funcionando. El negocio
  // lo intentó siete veces y acabó escribiendo su información a mano.
  //
  // Ahora la dirección se DESCIFRA con el mismo lector que usan la Bandeja y el
  // motor, y el candado se pone donde de verdad está la cuenta: la primera
  // carpeta de la ruta, que es también lo que comprueba la regla del almacén.
  const donde = partesDeAdjunto(url);
  if (!donde || donde.ruta.split("/")[0] !== orgId) {
    console.error("[entrenamiento] dirección fuera del almacén de la cuenta:", url.slice(0, 120));
    fallar("No pude leer ese archivo. Vuelve a subirlo.");
    return; // `fallar` no vuelve, pero TypeScript necesita verlo escrito.
  }

  let datos: Uint8Array;
  try {
    // Con la llave de servicio. El almacén privado no se alcanza con un `fetch`
    // a secas, y firmar un enlace para bajarnos nosotros mismos un archivo que
    // ya es nuestro sería dar un rodeo por internet para nada.
    const { data, error: eBajada } = await createAdminClient()
      .storage.from(donde.almacen)
      .download(donde.ruta);
    // Sin mensaje inventado: lo útil en el registro es QUÉ archivo vino vacío.
    if (eBajada || !data) throw new Error(eBajada?.message ?? comoSeGuarda(donde.almacen, donde.ruta));
    datos = new Uint8Array(await data.arrayBuffer());
  } catch (e) {
    console.error("[entrenamiento] no pude bajar el archivo:", (e as Error)?.message);
    return fallar("Se subió el archivo pero no pude volver a leerlo. Inténtalo otra vez.");
  }

  const leido = await extraerTexto(datos, nombre);
  // Aquí está el caso que importa: un PDF escaneado llega hasta este punto
  // perfectamente y sin una sola palabra dentro. Si se guardara igual, la
  // pantalla diría «listo» sobre un documento que el chatbot no puede leer.
  if (!leido.ok) fallar(leido.motivo);

  const texto = (leido as { ok: true; texto: string }).texto;

  // Se mide el TEXTO, no el archivo: un PDF de 8 MB puede tener dos párrafos, y
  // lo que ocupa en el entrenamiento es lo que se guarda, no lo que se subió.
  const cabe = await checkQuota(createClient(), orgId, Buffer.byteLength(texto, "utf8"));
  if (!cabe.ok) fallar(cabe.message);

  const n = await ingestText({
    admin: createAdminClient(),
    orgId,
    botId,
    title: nombre,
    text: texto,
    sourceType: "file",
    // La ruta normalizada, no el texto crudo del navegador: así
    // `partesDeAdjunto` la vuelve a entender el día que haga falta.
    sourceUrl: comoSeGuarda(donde.almacen, donde.ruta),
    sourceName: nombre,
    // Subir otra vez el mismo nombre REEMPLAZA lo anterior. Es lo que espera
    // quien corrige su lista de precios: si se acumulara, el chatbot tendría
    // los precios viejos y los nuevos a la vez y elegiría cualquiera.
    replaceSourceName: true,
  });

  revalidatePath(ruta);
  redirect(
    n > 0
      ? `${base}&imported=${n}`
      : `${base}&error=${encodeURIComponent("No pude guardar el contenido de ese archivo.")}`,
  );
}
