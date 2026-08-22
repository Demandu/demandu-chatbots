import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { abrirPortal } from "@/lib/billing/suscripcion";

export const dynamic = "force-dynamic";

/** Manda al cliente al portal de Stripe: tarjeta, recibos y cancelación. */
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "no_autenticado" }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ error: "sin_organizacion" }, { status: 403 });

    const { permisos } = await misPermisos();
    if (!permisos.has("plan")) {
      return NextResponse.json(
        { error: "Solo quien lleva el plan y la facturación puede entrar aquí." },
        { status: 403 },
      );
    }

    const origin = new URL(req.url).origin;
    const r = await abrirPortal({
      admin: createAdminClient(),
      orgId,
      returnUrl: `${origin}/settings/plan`,
    });

    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ url: r.url });
  } catch (e: any) {
    console.error("[portal]", e?.message ?? e);
    return NextResponse.json({ error: "Ocurrió un error. Inténtalo de nuevo." }, { status: 500 });
  }
}
