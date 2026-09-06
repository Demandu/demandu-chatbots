import { createAdminClient } from "@/lib/supabase/admin";
import { identificar, sinPermiso } from "@/lib/api/llave";

export const dynamic = "force-dynamic";

/**
 * Contactos, para Zapier, Make y quien quiera programar contra Demandu.
 *
 * ⚠️ TODA consulta de este archivo filtra por `org_id`. Se usa el cliente de
 * administración, que se salta RLS por diseño; un `.eq("org_id", …)` olvidado
 * aquí significa que un cliente ve los datos de otro. No hay excepción.
 *
 * GET  — la lista, más reciente primero. `desde` permite a Zapier preguntar
 *        "¿qué hay nuevo?" cada pocos minutos, que es como funcionan sus
 *        disparadores por sondeo. Sin ese parámetro no se pueden hacer Zaps que
 *        arranquen con un lead nuevo.
 * POST — crear o actualizar. Se busca por teléfono o correo antes de insertar:
 *        si no, cada mensaje de un formulario crearía un contacto repetido y en
 *        una semana la lista del cliente sería impresentable.
 */

const CAMPOS = "id, name, phone, email, company, country, channel, tags, created_at";

export async function GET(req: Request) {
  const quien = await identificar(req);
  if (!quien) return sinPermiso();

  const url = new URL(req.url);
  const desde = url.searchParams.get("desde");
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? 50), 1), 200);

  let q = createAdminClient()
    .from("contacts")
    .select(CAMPOS)
    .eq("org_id", quien.orgId)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (desde && !Number.isNaN(Date.parse(desde))) q = q.gt("created_at", desde);

  const { data, error } = await q;
  if (error) {
    console.error("[api/v1/contactos] GET:", error.message);
    return Response.json({ error: "No se pudo leer la lista." }, { status: 500 });
  }

  return Response.json({ contactos: data ?? [] });
}

export async function POST(req: Request) {
  const quien = await identificar(req);
  if (!quien) return sinPermiso();

  const body = await req.json().catch(() => ({} as any));
  const nombre = String(body?.nombre ?? "").trim();
  const telefono = String(body?.telefono ?? "").replace(/[^\d+]/g, "").trim();
  const correo = String(body?.email ?? "").trim().toLowerCase();

  if (!telefono && !correo) {
    return Response.json(
      { error: "Hace falta al menos un teléfono o un correo para identificar al contacto." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Buscar antes de insertar. Es lo que evita que el mismo cliente aparezca
  // cinco veces por haber rellenado cinco formularios.
  let existente: any = null;
  if (telefono) {
    const { data } = await admin
      .from("contacts").select("id").eq("org_id", quien.orgId).eq("phone", telefono).maybeSingle();
    existente = data;
  }
  if (!existente && correo) {
    const { data } = await admin
      .from("contacts").select("id").eq("org_id", quien.orgId).eq("email", correo).maybeSingle();
    existente = data;
  }

  const campos: Record<string, any> = {};
  if (nombre) campos.name = nombre;
  if (telefono) campos.phone = telefono;
  if (correo) campos.email = correo;
  if (body?.empresa) campos.company = String(body.empresa).trim();
  if (body?.pais) campos.country = String(body.pais).trim();

  if (existente) {
    // Al actualizar NO se pisa lo que ya había con vacíos: si alguien manda
    // solo el teléfono, el nombre que un agente escribió a mano se conserva.
    const { data, error } = await admin
      .from("contacts").update(campos).eq("id", existente.id).eq("org_id", quien.orgId)
      .select(CAMPOS).maybeSingle();
    if (error) {
      console.error("[api/v1/contactos] update:", error.message);
      return Response.json({ error: "No se pudo actualizar." }, { status: 500 });
    }
    return Response.json({ contacto: data, creado: false });
  }

  const { data, error } = await admin
    .from("contacts")
    .insert({ org_id: quien.orgId, channel: String(body?.canal ?? "api"), ...campos })
    .select(CAMPOS)
    .maybeSingle();

  if (error) {
    console.error("[api/v1/contactos] insert:", error.message);
    return Response.json({ error: "No se pudo crear el contacto." }, { status: 500 });
  }

  return Response.json({ contacto: data, creado: true }, { status: 201 });
}
