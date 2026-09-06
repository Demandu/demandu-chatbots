import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { abrirPagoDePlan } from "@/lib/billing/suscripcion";

export const dynamic = "force-dynamic";

/**
 * Empieza la suscripción a un plan.
 *
 * Del navegador solo llega el CÓDIGO del plan. El precio, si está activo y si
 * esa cuenta puede contratarlo se resuelve entero en el servidor.
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "no_autenticado" }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ error: "sin_organizacion" }, { status: 403 });

    // Contratar es de quien lleva la facturación, no de cualquiera del equipo.
    const { permisos } = await misPermisos();
    if (!permisos.has("plan")) {
      return NextResponse.json(
        { error: "Solo quien lleva el plan y la facturación puede contratar." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const planCode = typeof body?.plan === "string" ? body.plan : "";
    if (!planCode) return NextResponse.json({ error: "Falta el plan." }, { status: 400 });

    const origin = new URL(req.url).origin;
    const r = await abrirPagoDePlan({
      admin: createAdminClient(),
      orgId,
      planCode,
      email: user.email ?? null,
      successUrl: `${origin}/settings/plan?pago=ok`,
      cancelUrl: `${origin}/settings/plan?pago=cancelado`,
    });

    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ url: r.url });
  } catch (e: any) {
    console.error("[checkout plan]", e?.message ?? e);
    return NextResponse.json({ error: "Ocurrió un error. Inténtalo de nuevo." }, { status: 500 });
  }
}
