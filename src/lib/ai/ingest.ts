/**
 * Ingesta de conocimiento: trocea un texto largo, lo convierte en vectores
 * y lo guarda para que el chatbot pueda buscarlo por significado.
 *
 * Todo degrada con gracia: si no hay servicio de embeddings configurado, el
 * conocimiento igual se guarda y se busca por palabras clave (full-text en
 * español), que ya funciona sin ninguna llave.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3";

/* LA LLAVE SE LIMPIA ANTES DE USARLA.

   Un salto de línea o un espacio pegados sin querer al copiarla se ven
   IDÉNTICOS en el panel de Netlify y hacen que el servicio conteste 401 — o
   sea, exactamente lo mismo que una llave revocada. Eso ya costó dos días en
   agosto de 2026 con la llave de Anthropic, y por eso aquella se lee con
   `.trim()` desde entonces. Esta no, y el 26 de septiembre volvió el 401.

   Ver `ia-llaves-y-configuracion-cliente.md`. */
function llaveVoyage(): string {
  return (process.env.VOYAGE_API_KEY ?? "").trim();
}

/** ¿Hay búsqueda por significado disponible? */
export function embeddingsConfigured(): boolean {
  return !!llaveVoyage();
}

/**
 * Parte el texto en trozos que quepan cómodos en una respuesta.
 * Corta por párrafos para no romper ideas a la mitad.
 */
export function chunkText(text: string, maxChars = 1200): string[] {
  const clean = (text ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    // Un párrafo gigante se parte por oraciones
    if (p.length > maxChars) {
      if (current) { chunks.push(current.trim()); current = ""; }
      const sentences = p.split(/(?<=[.!?])\s+/);
      let buf = "";
      for (const s of sentences) {
        if ((buf + " " + s).length > maxChars) {
          if (buf) chunks.push(buf.trim());
          buf = s.length > maxChars ? s.slice(0, maxChars) : s;
        } else {
          buf = buf ? buf + " " + s : s;
        }
      }
      if (buf) current = buf;
      continue;
    }

    if ((current + "\n\n" + p).length > maxChars) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 20);
}

/**
 * Genera vectores para varios textos, DICIENDO POR QUÉ si no pudo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES DEVOLVÍA `null` Y SE LLEVABA EL MOTIVO AL REGISTRO. Eso está bien
 * cuando esto corre dentro de una conversación —ahí nadie puede hacer nada con
 * el motivo y lo que importa es no cortarla—, pero es inservible cuando lo
 * pulsó una persona y está mirando la pantalla: leyó «no se pudo» y se quedó
 * sin saber si es la llave, el modelo o el saldo. Tres arreglos distintos y la
 * misma frase para los tres.
 *
 * Pasó el 26 de septiembre de 2026 con el botón de re-indexar: contestó «El
 * servicio de búsqueda no contestó bien» y hubo que salir a buscar el motivo a
 * los registros de Netlify, que desde el panel no se leen.
 *
 * Es la misma lección que el `?diag` del motor: 401 = la llave · 400/404 = el
 * modelo · 429 = saldo. Ver `ia-llaves-y-configuracion-cliente.md`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function embedConDetalle(
  texts: string[],
): Promise<{ vectores: number[][] | null; fallo?: string }> {
  const key = llaveVoyage();
  if (!key) return { vectores: null, fallo: "no hay llave de búsqueda por significado configurada" };
  if (!texts.length) return { vectores: null, fallo: "no había nada que convertir" };

  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: texts.slice(0, 128), input_type: "document" }),
    });
    if (!res.ok) {
      const cuerpo = (await res.text().catch(() => "")).slice(0, 200);
      console.error("[embeddings] error:", res.status, cuerpo);
      return { vectores: null, fallo: explicarVoyage(res.status, cuerpo) };
    }
    const j = await res.json();
    const out = (j?.data ?? []).map((d: any) => d.embedding).filter(Boolean);
    if (!out.length) return { vectores: null, fallo: "el servicio contestó sin vectores" };
    return { vectores: out };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error("[embeddings] fallo de red:", msg);
    return { vectores: null, fallo: `no se pudo conectar (${String(msg).slice(0, 80)})` };
  }
}

/** El código de Voyage traducido a qué hay que tocar. */
function explicarVoyage(estado: number, cuerpo: string): string {
  if (estado === 401 || estado === 403) {
    return `la llave VOYAGE_API_KEY no vale (${estado}). Revísala en Netlify`;
  }
  if (estado === 429) return "te quedaste sin saldo o hay demasiadas peticiones (429)";
  if (estado === 400 || estado === 404) {
    return `el modelo «${VOYAGE_MODEL}» no existe o no acepta esto (${estado}): ${cuerpo.slice(0, 90)}`;
  }
  return `el servicio contestó ${estado}: ${cuerpo.slice(0, 90)}`;
}

/** Genera vectores para varios textos. Devuelve null si no hay servicio. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  return (await embedConDetalle(texts)).vectores;
}

/** Vector de una consulta (para buscar, no para guardar). */
export async function embedQuery(text: string): Promise<number[] | null> {
  const key = llaveVoyage();
  if (!key || !text?.trim()) return null;
  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: [text], input_type: "query" }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Guarda un texto largo como conocimiento del bot (troceado + vectorizado).
 * Devuelve cuántos trozos se guardaron.
 */
export async function ingestText(opts: {
  admin: any;
  orgId: string;
  botId: string;
  title: string;
  text: string;
  sourceType: "text" | "url" | "file" | "sheet" | "faq";
  sourceUrl?: string | null;
  sourceName?: string | null;
  /** Reemplaza lo anterior de esta misma fuente (para re-sincronizar). */
  replaceSourceName?: boolean;
}): Promise<number> {
  const chunks = chunkText(opts.text);
  if (!chunks.length) return 0;

  const sourceId = crypto.randomUUID();
  const vectors = await embed(chunks);

  // Si es una re-sincronización, borramos lo viejo de esa misma fuente
  if (opts.replaceSourceName && opts.sourceName) {
    await opts.admin
      .from("bot_knowledge")
      .delete()
      .eq("bot_id", opts.botId)
      .eq("source_name", opts.sourceName);
  }

  const rows = chunks.map((c, i) => ({
    org_id: opts.orgId,
    bot_id: opts.botId,
    title: chunks.length > 1 ? `${opts.title} (${i + 1}/${chunks.length})` : opts.title,
    content: c,
    source_type: opts.sourceType,
    source_url: opts.sourceUrl ?? null,
    source_name: opts.sourceName ?? opts.title,
    source_id: sourceId,
    chunk_index: i,
    embedding: vectors?.[i] ?? null,
    enabled: true,
  }));

  const { error } = await opts.admin.from("bot_knowledge").insert(rows);
  if (error) {
    console.error("[ingest] no se pudo guardar:", error.message);
    return 0;
  }
  return rows.length;
}
