import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { soltarWhatsapp, registrarBaja } from "@/lib/billing/baja";

export const dynamic = "force-dynamic";

/**
 * Borrar los datos de la cuenta. No se puede deshacer.
 *
 * CUATRO CANDADOS antes de tocar nada, y ninguno sobra:
 *
 *  1. Sesión iniciada.
 *  2. Permiso de plan y facturación — borrar afecta a todo el equipo.
 *  3. **Escribir el nombre exacto del negocio.** No una casilla: teclearlo.
 *     Una casilla se marca sin leer; escribir obliga a mirar qué cuenta es.
 *     Es la protección contra el clic en caliente y contra la pestaña
 *     equivocada.
 *  4. Aceptar el consentimiento, que se guarda tal cual quedó aceptado.
 *
 * El orden importa: primero se deja constancia de la baja, luego se suelta
 * WhatsApp, y al final se borra. Si el borrado falla a mitad, el registro ya
 * existe y sabemos qué pasó; al revés nos quedaríamos sin saber nada.
 */
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
        { error: "Solo quien lleva el plan y la facturación puede borrar la cuenta." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const escrito = String(body?.confirmacion ?? "").trim();
    const acepto = body?.acepto === true;

    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("name, datos_borrados_at")
      .eq("id", orgId)
      .maybeSingle();

    if (org?.datos_borrados_at) {
      return NextResponse.json({ error: "Los datos de esta cuenta ya se borraron." }, { status: 400 });
    }

    const nombre = (org?.name ?? "").trim();
    // Sin distinguir mayúsculas ni acentos: la barrera es que LEA y ESCRIBA el
    // nombre, no que acierte la tilde. Ser tiquismiquis aquí solo frustra a
    // quien ya decidió, y no protege más.
    const normal = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

    if (!nombre || normal(escrito) !== normal(nombre)) {
      return NextResponse.json(
        { error: `Para confirmar, escribe el nombre de tu negocio tal como aparece: «${nombre}».` },
        { status: 400 },
      );
    }
    if (!acepto) {
      return NextResponse.json({ error: "Falta aceptar el consentimiento." }, { status: 400 });
    }

    // 1) Constancia primero.
    await registrarBaja(admin, orgId, {
      motivo: body?.motivo ?? null,
      comentario: body?.comentario ?? null,
      borroDatos: true,
      quien: user.email ?? user.id,
    });

    // 2) Soltar la cuenta de WhatsApp de nuestra app de Meta.
    const { soltada } = await soltarWhatsapp(admin, orgId);

    // 3) La purga. Descubre sola las tablas: una tabla nueva queda cubierta
    //    el día que nace, sin que nadie tenga que acordarse.
    const { data: res, error } = await admin.rpc("purgar_datos_de_org", { p_org_id: orgId });
    if (error) {
      console.error("[borrar] purga:", error.message);
      return NextResponse.json(
        { error: "No se pudo completar el borrado. Escríbenos y lo resolvemos a mano." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, whatsappSoltada: soltada, detalle: res });
  } catch (e: any) {
    console.error("[borrar]", e?.message ?? e);
    return NextResponse.json({ error: "Ocurrió un error. Inténtalo de nuevo." }, { status: 500 });
  }
}
