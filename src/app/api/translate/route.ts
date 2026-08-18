import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IDIOMAS } from "@/lib/idiomas";

export const dynamic = "force-dynamic";

const GOOGLE_URL = "https://translation.googleapis.com/language/translate/v2";
/** Google acepta hasta 128 textos por llamada; nos quedamos cortos a propósito. */
const LOTE = 100;

/** Google devuelve el texto con entidades HTML escapadas. */
function desescapar(t: string) {
  return String(t ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Traduce los mensajes de una conversación.
 *
 * Solo responde a usuarios con sesión, y no acepta textos de cualquier lado:
 * se le pasan los mensajes ya visibles en el chat. La llave de Google es de
 * Demandu y vive en el servidor — el navegador nunca la ve.
 */
export async function POST(req: Request) {
  try {
    const { textos, idioma } = await req.json();

    const lista = Array.isArray(textos) ? textos.map((t: unknown) => String(t ?? "")) : [];
    if (!lista.length) return NextResponse.json({ traducciones: [] });
    if (!IDIOMAS.some((i) => i.code === idioma)) {
      return NextResponse.json({ error: "Idioma no disponible." }, { status: 400 });
    }

    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "El traductor todavía no está activo en tu cuenta.", noConfigurado: true },
        { status: 503 },
      );
    }

    const traducciones: string[] = [];
    for (let i = 0; i < lista.length; i += LOTE) {
      const trozo = lista.slice(i, i + LOTE);
      const res = await fetch(`${GOOGLE_URL}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: trozo, target: idioma, format: "text" }),
      });

      if (!res.ok) {
        const detalle = await res.text().catch(() => "");
        console.error("[translate]", res.status, detalle.slice(0, 200));
        return NextResponse.json({ error: "No se pudo traducir ahora mismo." }, { status: 502 });
      }

      const j = await res.json();
      const parte = (j?.data?.translations ?? []).map((t: any) => desescapar(t?.translatedText ?? ""));
      // Si Google devolviera menos de los que mandamos, rellenamos para no
      // descuadrar la correspondencia mensaje ↔ traducción.
      while (parte.length < trozo.length) parte.push("");
      traducciones.push(...parte);
    }

    return NextResponse.json({ traducciones });
  } catch (e: any) {
    console.error("[translate]", e?.message ?? e);
    return NextResponse.json({ error: "No se pudo traducir ahora mismo." }, { status: 500 });
  }
}
