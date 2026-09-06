import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { IDIOMAS } from "@/lib/idiomas";

export const dynamic = "force-dynamic";

const GOOGLE_URL = "https://translation.googleapis.com/language/translate/v2/detect";

/**
 * En qué idioma escribe el lead.
 *
 * SE LE MANDAN VARIOS MENSAJES, NO UNO. Con un solo texto corto —"ok",
 * "gracias", "👍"— la detección se equivoca constantemente, y equivocarse aquí
 * significa contestarle en indonesio a alguien que escribe en español. Con
 * varios mensajes se toma el idioma que más se repite, que es mucho más
 * estable.
 *
 * SOLO SE DEVUELVEN IDIOMAS DE NUESTRA LISTA: Google conoce más de cien y
 * muchos son imposibles de verificar para el agente. Si detecta algo que no
 * ofrecemos, se devuelve null y la plataforma no propone traducir — mejor no
 * ofrecer nada que ofrecer algo que no podemos sostener.
 */
export async function POST(req: Request) {
  try {
    const { textos } = await req.json();

    const lista = (Array.isArray(textos) ? textos : [])
      .map((t: unknown) => String(t ?? "").trim())
      // Los textos muy cortos ensucian la detección más de lo que ayudan.
      .filter((t: string) => t.length >= 12)
      .slice(-8);

    if (!lista.length) return NextResponse.json({ idioma: null });

    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) return NextResponse.json({ idioma: null, noConfigurado: true });

    const res = await fetch(`${GOOGLE_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: lista }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error("[detectar]", res.status, detalle.slice(0, 200));
      return NextResponse.json({ idioma: null });
    }

    const j = await res.json();
    // Google devuelve un array por cada texto; el primero es el más probable.
    const codigos: string[] = (j?.data?.detections ?? [])
      .map((d: any) => String(d?.[0]?.language ?? "").split("-")[0])
      .filter(Boolean);

    if (!codigos.length) return NextResponse.json({ idioma: null });

    const cuenta = new Map<string, number>();
    for (const c of codigos) cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    const ganador = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];

    return NextResponse.json({
      idioma: IDIOMAS.some((i) => i.code === ganador) ? ganador : null,
    });
  } catch {
    return NextResponse.json({ idioma: null });
  }
}
