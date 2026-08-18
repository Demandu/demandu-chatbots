import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiAnswer, aiConfigured, AI_DEFAULTS } from "@/lib/ai/answer";

export const dynamic = "force-dynamic";

/**
 * Probar la IA del chatbot desde el panel, sin tener que abrir WhatsApp.
 *
 * SEGURIDAD: primero se consulta el bot con la sesión del usuario (RLS),
 * así solo puede probar los chatbots de SU organización. El cliente con
 * permisos elevados se usa después, y siempre acotado a ese org_id + bot_id,
 * que es lo que mantiene el conocimiento de cada cliente separado.
 */
export async function POST(req: Request) {
  try {
    const { botId, pregunta } = await req.json();
    const q = String(pregunta ?? "").trim();
    if (!botId || !q) {
      return NextResponse.json({ error: "Escribe una pregunta." }, { status: 400 });
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

    // RLS decide: si el bot no es de su organización, no aparece.
    const { data: bot } = await supabase
      .from("bots")
      .select("id, org_id, ai")
      .eq("id", botId)
      .maybeSingle();
    if (!bot) return NextResponse.json({ error: "Chatbot no encontrado." }, { status: 404 });

    if (!aiConfigured()) {
      const ai = { ...AI_DEFAULTS, ...(((bot as any).ai as any) ?? {}) };
      return NextResponse.json({ respuesta: ai.fallback, disponible: false });
    }

    const respuesta = await aiAnswer({
      admin: createAdminClient(),
      botId: bot.id as string,
      orgId: bot.org_id as string,
      question: q,
      settings: ((bot as any).ai as any) ?? null,
      logUsage: false, // una prueba desde el panel no se le cobra al cliente
    });

    return NextResponse.json({ respuesta, disponible: true });
  } catch (e: any) {
    console.error("[ai/probar]", e?.message ?? e);
    return NextResponse.json({ error: "No se pudo probar ahora mismo." }, { status: 500 });
  }
}
