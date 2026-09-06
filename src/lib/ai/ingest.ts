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

/** ¿Hay búsqueda por significado disponible? */
export function embeddingsConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
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

/** Genera vectores para varios textos. Devuelve null si no hay servicio. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key || !texts.length) return null;

  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: texts.slice(0, 128), input_type: "document" }),
    });
    if (!res.ok) {
      console.error("[embeddings] error:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const j = await res.json();
    const out = (j?.data ?? []).map((d: any) => d.embedding).filter(Boolean);
    return out.length ? out : null;
  } catch (e: any) {
    console.error("[embeddings] fallo de red:", e?.message ?? e);
    return null;
  }
}

/** Vector de una consulta (para buscar, no para guardar). */
export async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY;
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
