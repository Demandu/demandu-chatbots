import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { exportarContactos, exportarConversaciones } from "@/lib/billing/baja";

export const dynamic = "force-dynamic";

/**
 * Llevarse sus datos.
 *
 * VA ANTES QUE EL BOTÓN DE BORRAR, y por eso existe: borrar es seguro solo
 * cuando el cliente pudo llevarse lo suyo primero. Sin esto, «borra todo» es
 * una trampa por muy bien explicada que esté.
 *
 * No hace falta estar cancelando para usarlo: son sus datos, siempre.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_autenticado" }, { status: 401 });

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ error: "sin_organizacion" }, { status: 403 });

  // Exportar es llevarse TODA la base de contactos: no es para cualquiera del
  // equipo. Se pide el mismo permiso que para contactos.
  const { permisos } = await misPermisos();
  if (!permisos.has("contactos")) {
    return NextResponse.json({ error: "No tienes permiso para exportar." }, { status: 403 });
  }

  const que = new URL(req.url).searchParams.get("que") ?? "contactos";
  const admin = createAdminClient();

  const csv =
    que === "conversaciones"
      ? await exportarConversaciones(admin, orgId)
      : await exportarContactos(admin, orgId);

  const nombre = `demandu-${que}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
