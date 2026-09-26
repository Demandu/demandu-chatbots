"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { fetchPageText } from "@/lib/ai/fromUrl";
import { ingestText, embed, embedConDetalle, embeddingsConfigured } from "@/lib/ai/ingest";
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

  /* NACE CON SU VECTOR, igual que lo que sube por documento.
   *
   * Esto insertaba a pelo y se saltaba el único sitio que calcula vectores
   * (`ingestText`). Un dato escrito a mano quedaba fuera de la búsqueda por
   * significado para siempre, y desde la pantalla se veía igual que los
   * demás. Si no hay llave, `embed` devuelve null y se guarda como antes. */
  const vector = (await embed([content]))?.[0] ?? null;

  const { error } = await supabase.from("bot_knowledge").insert({
    org_id: orgId,
    bot_id: botId,
    title,
    content,
    embedding: vector,
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

/**
 * RE-INDEXAR: ponerle su vector a lo que ya está subido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HIZO FALTA. Los vectores solo se calculaban AL SUBIR. Así que el día
 * que se puso la llave de búsqueda por significado, todo lo subido antes siguió
 * ciego — y desde la pantalla no había forma de notarlo: el mismo fragmento, la
 * misma letra, y el bot sin encontrarlo.
 *
 * El 26 de septiembre de 2026 se midió: 142 de 142 fragmentos de la plataforma,
 * en los cinco chatbots, guardados sin vector desde agosto. Ninguna cuenta tenía
 * búsqueda por significado, y el síntoma que llegaba era «el bot no sabe lo que
 * sí está en su entrenamiento».
 *
 * ── POR QUÉ VA POR TANDAS Y NO DE UNA ──────────────────────────────────────
 *
 * Esto corre dentro de una petición web, que tiene su reloj. Una cuenta con
 * ochocientos fragmentos lo agotaría a la mitad y se quedaría sin saber cuántos
 * llegaron a guardarse. Se hace una tanda, se dice cuántos faltan y se vuelve a
 * pulsar. Es repetible y nunca deja la mitad a oscuras sin avisar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const POR_TANDA = 50;
/* Cuántas filas se miran de una vez para encontrar las que van sin vector.
   Con más de esto en una cuenta, hacen falta varias pulsaciones — y el botón
   dice cuántas faltan, así que no se pierde nadie por el camino. */
const MIRAR_HASTA = 400;

export async function reindexarConocimiento(
  _estado: { ok: boolean; mensaje?: string } | undefined,
  formData: FormData,
): Promise<{ ok: boolean; mensaje?: string }> {
  const orgId = await getCurrentOrgId();
  const botId = String(formData.get("bot_id") ?? "");
  if (!orgId || !botId) return { ok: false, mensaje: "Falta el chatbot." };

  if (!embeddingsConfigured()) {
    return {
      ok: false,
      mensaje: "Todavía no está activada la búsqueda por significado en la plataforma.",
    };
  }

  /* SE PIDE LA LISTA IGUAL QUE LA PANTALLA, Y SE FILTRA AQUÍ.
   *
   * Aquí ponía `.is("embedding", null)` y la consulta volvía VACÍA teniendo 85
   * filas sin vector: el botón contestaba «todo tu entrenamiento ya se busca
   * por significado» sin haber tocado nada. Medido el 26 de septiembre de 2026,
   * con la pantalla de al lado contando los 85 en la misma petición.
   *
   * No se averiguó por qué PostgREST no filtra esa columna —es de un tipo que
   * no es suyo, `vector`— y da igual: lo que no se puede hacer es CREER una
   * consulta cuyo «no hay nada» es indistinguible de «no supe mirar». La
   * pantalla ya pide estas filas así y le funcionan, así que se piden igual y
   * el filtro se hace aquí, donde se puede ver.
   *
   * Un «ya está todo» falso es el peor resultado posible: el dueño deja de
   * mirar y su chatbot se queda ciego para siempre. */
  const supabase = createClient();
  const { data: filas, error } = await supabase
    .from("bot_knowledge")
    .select("id, content, embedding")
    .eq("bot_id", botId)
    .order("created_at")
    .limit(MIRAR_HASTA);
  if (error) return { ok: false, mensaje: "No pude leer el entrenamiento." };

  const todas = (filas ?? []) as { id: string; content: string; embedding: unknown }[];
  if (!todas.length) {
    // Ni una fila. Eso no es «ya está todo»: es que no hay entrenamiento o no
    // se pudo leer. Decir que está listo sería mentir.
    return { ok: false, mensaje: "No encontré entrenamiento en este chatbot." };
  }

  const ciegas = todas.filter((f) => !f.embedding);
  if (!ciegas.length) {
    return { ok: true, mensaje: "Todo tu entrenamiento ya se busca por significado." };
  }

  const tanda = ciegas.slice(0, POR_TANDA);
  const { vectores, fallo } = await embedConDetalle(tanda.map((f) => f.content));
  /* SI VUELVEN MENOS VECTORES QUE TEXTOS, NO SE REPARTE NINGUNO. Colocarlos por
   * posición cuando falta uno los correría a todos: cada fragmento quedaría con
   * el vector del siguiente y el buscador devolvería, con total seguridad, la
   * respuesta de otra pregunta. Es peor que no buscar. */
  if (!vectores || vectores.length !== tanda.length) {
    /* EL MOTIVO, NO «no se pudo». Tres averías distintas —la llave, el modelo,
     * el saldo— se arreglan en tres sitios distintos, y con una sola frase para
     * las tres hay que salir a buscarlo a unos registros que desde el panel no
     * se leen. Ver `embedConDetalle`. */
    const porQue = fallo ?? `vinieron ${vectores?.length ?? 0} vectores para ${tanda.length} textos`;
    return { ok: false, mensaje: `No cambié nada. ${porQue}.` };
  }

  let hechos = 0;
  for (let i = 0; i < tanda.length; i++) {
    const { error: eFila } = await supabase
      .from("bot_knowledge")
      .update({ embedding: vectores[i] })
      .eq("id", tanda[i].id);
    if (eFila) {
      console.error("[reindexar] no pude guardar el vector:", eFila.message);
      continue;
    }
    hechos++;
  }

  const faltan = ciegas.length - hechos;

  revalidatePath(`/bots/${botId}/training`);

  if (!hechos) {
    return { ok: false, mensaje: "No pude guardar ningún vector. Vuelve a intentarlo." };
  }
  return {
    ok: true,
    mensaje: faltan
      ? `Listos ${hechos}. Faltan ${faltan}: vuelve a pulsar para seguir.`
      : `Listo. Tus ${hechos} fragmentos ya se buscan por significado.`,
  };
}
