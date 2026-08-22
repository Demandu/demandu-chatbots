import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessTokenForOrg } from "@/lib/integrations/google";
import { añadirFila, filaDeContacto } from "@/lib/integrations/sheets";

export const dynamic = "force-dynamic";

/** Cuántas filas se mandan por pasada. Suficiente para no quedarse atrás y
 *  poco para no agotar el tiempo de la función ni las cuotas de Google. */
const LOTE = 40;
/** Después de esto se deja de intentar: si falló tres veces, no es un tropiezo. */
const MAX_INTENTOS = 3;

/**
 * Vacía la cola de Sheets: coge los contactos pendientes y les añade su fila.
 *
 * LO LLAMA UNA TAREA PROGRAMADA, no un cliente. Por eso pide un secreto
 * compartido: sin él, cualquiera en internet podría dispararlo. No es que
 * pudiera robar datos —no devuelve ninguno— pero sí gastar las cuotas de
 * Google del cliente a base de llamadas.
 *
 * SE AGRUPA POR ORGANIZACIÓN para pedir el token de Google una sola vez por
 * cliente en vez de una por fila. Con veinte leads de un mismo negocio eso son
 * diecinueve viajes menos.
 */
export async function POST(req: Request) {
  const secreto = process.env.CRON_SECRET;
  const dado = req.headers.get("x-demandu-cron") ?? "";
  if (!secreto || dado !== secreto) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: pendientes } = await admin
    .from("sheets_cola")
    .select("id, org_id, contact_id, intentos")
    .is("enviado_at", null)
    .lt("intentos", MAX_INTENTOS)
    .order("created_at", { ascending: true })
    .limit(LOTE);

  const filas = (pendientes ?? []) as any[];
  if (!filas.length) return Response.json({ procesados: 0 });

  const porOrg = new Map<string, any[]>();
  for (const f of filas) {
    if (!porOrg.has(f.org_id)) porOrg.set(f.org_id, []);
    porOrg.get(f.org_id)!.push(f);
  }

  let enviadas = 0;
  let fallidas = 0;

  for (const [orgId, suyas] of porOrg) {
    const { data: cfg } = await admin
      .from("sheets_config")
      .select("hoja_id, activo")
      .eq("org_id", orgId)
      .maybeSingle();

    // Si apagaron la integración mientras había cosas en la cola, no se
    // escriben: se descartan. Lo contrario sería escribir en la hoja de alguien
    // que expresamente dijo que ya no.
    if (!cfg?.activo || !cfg.hoja_id) {
      await admin
        .from("sheets_cola")
        .update({ enviado_at: new Date().toISOString(), error: "integración apagada" })
        .in("id", suyas.map((s) => s.id));
      continue;
    }

    const token = await getValidAccessTokenForOrg(admin, orgId);
    if (!token) {
      await marcarFallo(admin, suyas, "Hay que volver a conectar Google.");
      await admin.from("sheets_config")
        .update({ ultimo_error: "Hay que volver a conectar Google.", updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
      fallidas += suyas.length;
      continue;
    }

    for (const item of suyas) {
      const { data: contacto } = await admin
        .from("contacts")
        .select("name, phone, email, company, country, channel, tags, created_at")
        .eq("id", item.contact_id)
        .maybeSingle();

      // El contacto pudo borrarse entre que se encoló y ahora. No es un error.
      if (!contacto) {
        await admin.from("sheets_cola")
          .update({ enviado_at: new Date().toISOString(), error: "el contacto ya no existe" })
          .eq("id", item.id);
        continue;
      }

      const r = await añadirFila(token, cfg.hoja_id, filaDeContacto(contacto));
      if (r.ok) {
        await admin.from("sheets_cola")
          .update({ enviado_at: new Date().toISOString(), error: null })
          .eq("id", item.id);
        enviadas++;
      } else {
        await marcarFallo(admin, [item], r.error ?? "falló");
        await admin.from("sheets_config")
          .update({ ultimo_error: r.error ?? null, updated_at: new Date().toISOString() })
          .eq("org_id", orgId);
        fallidas++;
      }
    }

    if (enviadas > 0) {
      await admin.from("sheets_config")
        .update({ ultimo_error: null, updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
    }
  }

  return Response.json({ procesados: filas.length, enviadas, fallidas });
}

/** Suma un intento y deja escrito el motivo, para poder mirarlo después. */
async function marcarFallo(admin: any, items: any[], motivo: string) {
  for (const i of items) {
    await admin
      .from("sheets_cola")
      .update({ intentos: (i.intentos ?? 0) + 1, error: motivo })
      .eq("id", i.id);
  }
}
