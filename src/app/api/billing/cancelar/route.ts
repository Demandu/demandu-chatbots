import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { cancelarSuscripcion, reactivarSuscripcion } from "@/lib/billing/suscripcion";

export const dynamic = "force-dynamic";

/**
 * Cancelar el plan — o deshacer la cancelación.
 *
 * Las dos cosas en la misma ruta a propósito: son el mismo interruptor, y
 * tenerlas juntas evita que una se quede desactualizada respecto de la otra.
 *
 * `{ reactivar: true }` deshace. Sin eso, cancela.
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "no_autenticado" }, { status: 401 });

    const orgId = await getCurrentOrgId();
    if (!orgId) return NextResponse.json({ error: "sin_organizacion" }, { status: 403 });

    // Cancelar le quita el servicio a todo el equipo: es de quien lleva el plan.
    const { permisos } = await misPermisos();
    if (!permisos.has("plan")) {
      return NextResponse.json(
        { error: "Solo quien lleva el plan y la facturación puede cancelar." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const admin = createAdminClient();

    const r = body?.reactivar
      ? await reactivarSuscripcion({ admin, orgId })
      : await cancelarSuscripcion({ admin, orgId });

    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, hasta: r.hasta ?? null });
  } catch (e: any) {
    console.error("[cancelar]", e?.message ?? e);
    return NextResponse.json({ error: "Ocurrió un error. Inténtalo de nuevo." }, { status: 500 });
  }
}
