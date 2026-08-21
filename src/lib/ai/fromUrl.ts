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
      // SE PIDE COMO UN NAVEGADOR, A PROPÓSITO.
      //
      // Antes iba como "DemanduBot/1.0" y no funcionaba con sitios normales:
      // Cloudflare y casi cualquier cortafuegos rechazan de entrada un agente
      // desconocido, así que devolvían 403 y el cliente veía que "no pasa nada"
      // con su propia página, que en el navegador abre perfecto.
      //
      // No es un truco: pedimos la misma página pública que serviría a
      // cualquier visitante, y solo cuando el dueño del sitio nos lo pide.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    clearTimeout(timer);

    if (!res.ok) {
      // Cada número quiere decir algo distinto para quien lo lee, y "respondió
      // 403" no le dice nada a un dueño de negocio.
      if (res.status === 403 || res.status === 401) {
        return { ok: false, error: "El sitio bloqueó la lectura automática. Copia y pega el texto a mano, o pídele a quien lo administra que permita el acceso." };
      }
      if (res.status === 404) {
        return { ok: false, error: "Esa dirección no existe. Revisa que esté bien escrita." };
      }
      if (res.status === 429) {
        return { ok: false, error: "El sitio pidió esperar un momento. Inténtalo de nuevo en un minuto." };
      }
      if (res.status >= 500) {
        return { ok: false, error: "El sitio está fallando ahora mismo. No es tu configuración; inténtalo más tarde." };
      }
      return { ok: false, error: `La página respondió con un error (${res.status}).` };
    }

    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html") && !ctype.includes("text")) {
      return { ok: false, error: "Esa dirección no es una página de texto (parece un archivo o una imagen)." };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return { ok: false, error: "La página es demasiado pesada." };

    // La codificación sale de la cabecera; si no la declara, utf-8. Sin esto,
    // una página en latin-1 entra con los acentos rotos y el chatbot repite la
    // basura tal cual al cliente.
    const juego = /charset=([\w-]+)/i.exec(ctype)?.[1]?.toLowerCase() || "utf-8";
    let html: string;
    try {
      html = new TextDecoder(juego).decode(buf);
    } catch {
      html = new TextDecoder("utf-8").decode(buf);
    }

    const { title, text } = htmlToText(html);

    // Un muro anti-bots devuelve HTML con texto, así que pasa el filtro de
    // longitud y entraría como "conocimiento del negocio". Sería peor que
    // fallar: el chatbot repetiría "verifica que eres humano" a los clientes.
    if (esMuroDeSeguridad(title, text)) {
      return { ok: false, error: "El sitio pidió verificar que no somos un robot, así que no se pudo leer. Copia y pega el texto a mano." };
    }

    if (text.length < 80) {
      return {
        ok: false,
        error: "No se encontró texto legible. Si la página carga su contenido con JavaScript, copia y pega el texto a mano.",
      };
    }

    return { ok: true, title: title || url.hostname, text, url: url.toString() };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false, error: "La página tardó demasiado en responder (más de 15 segundos)." };
    }
    return { ok: false, error: "No se pudo abrir la página. Revisa que la dirección sea correcta y que el sitio esté en línea." };
  }
}

/** ¿Lo que llegó es una pantalla de "demuestra que eres humano"? */
function esMuroDeSeguridad(title: string, text: string): boolean {
  const t = `${title}\n${text}`.toLowerCase().slice(0, 1500);
  const señales = [
    "just a moment",
    "checking your browser",
    "verifying you are human",
    "verify you are human",
    "attention required",
    "cloudflare",
    "enable javascript and cookies to continue",
    "ddos protection",
    "acceso denegado",
  ];
  // Los muros son páginas CORTAS: un sitio de verdad que mencione Cloudflare en
  // su blog no debe confundirse con uno bloqueado.
  return text.length < 1200 && señales.some((s) => t.includes(s));
}
