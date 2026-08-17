/**
 * Lee una página web y extrae su texto para alimentar el conocimiento del bot.
 * Sin dependencias externas: quita scripts, estilos y etiquetas a mano.
 */

const MAX_BYTES = 2_000_000; // 2 MB de HTML es más que suficiente

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Extrae título y texto legible de un HTML. */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1] ?? "").trim();

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ");

  // Los bloques se vuelven saltos de línea para conservar la estructura
  body = body
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(body)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

  return { title, text };
}

export type UrlResult =
  | { ok: true; title: string; text: string; url: string }
  | { ok: false; error: string };

/** Descarga una página y devuelve su texto. Nunca lanza excepción. */
export async function fetchPageText(rawUrl: string): Promise<UrlResult> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim().startsWith("http") ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  } catch {
    return { ok: false, error: "La dirección no es válida." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Solo se pueden leer páginas web (http o https)." };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": "DemanduBot/1.0 (+lectura de contenido para chatbot)" },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) return { ok: false, error: `La página respondió ${res.status}.` };

    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html") && !ctype.includes("text")) {
      return { ok: false, error: "Esa dirección no es una página de texto." };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return { ok: false, error: "La página es demasiado pesada." };

    const html = new TextDecoder("utf-8").decode(buf);
    const { title, text } = htmlToText(html);

    if (text.length < 80) {
      return {
        ok: false,
        error: "No se encontró texto legible. Si la página carga su contenido con JavaScript, copia y pega el texto a mano.",
      };
    }

    return { ok: true, title: title || url.hostname, text, url: url.toString() };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "La página tardó demasiado en responder." : "No se pudo abrir la página.";
    return { ok: false, error: msg };
  }
}
