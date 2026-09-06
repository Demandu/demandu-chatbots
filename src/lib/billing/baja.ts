/**
 * Darse de baja: exportar, borrar, y dejar constancia.
 *
 * LA FRASE QUE ESTE ARCHIVO TIENE QUE HACER CIERTA, palabra por palabra:
 *
 *   «Borramos todos tus datos de operación. Conservamos únicamente tus
 *    registros de facturación, porque la ley nos obliga.»
 *
 * Si borra de menos, le mentimos al cliente. Si borra de más, nos quedamos sin
 * poder facturar ni declarar. Las dos cosas son graves, y por eso el borrado en
 * sí vive en la base (`purgar_datos_de_org`), donde se descubre solo qué tablas
 * hay que vaciar en vez de fiarse de una lista escrita a mano que envejece.
 */

import { CONSENTIMIENTO } from "./consentimiento";

const GRAPH = "https://graph.facebook.com/v20.0";

/** Días que se conservan los datos tras terminar el periodo pagado. */
export const DIAS_ANTES_DE_PURGAR = 90;

/* ─── Exportar ────────────────────────────────────────────────────────────── */

/**
 * Escapa un valor para CSV.
 *
 * El punto y coma y las comillas rompen un CSV, pero el caso que de verdad
 * muerde es otro: Excel interpreta como fórmula cualquier celda que empiece
 * por `=`, `+`, `-` o `@`. Un contacto llamado "=cmd" se convierte en un
 * problema de seguridad al abrir el archivo. Por eso se antepone un apóstrofo.
 */
function celda(v: any): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function aCsv(filas: any[], columnas: { key: string; titulo: string }[]): string {
  const cabecera = columnas.map((c) => celda(c.titulo)).join(",");
  const cuerpo = filas.map((f) => columnas.map((c) => celda(f[c.key])).join(",")).join("\n");
  // El BOM es lo que hace que Excel abra los acentos bien en vez de "Ã±".
  return "﻿" + cabecera + "\n" + cuerpo;
}

export async function exportarContactos(admin: any, orgId: string): Promise<string> {
  const { data } = await admin
    .from("contacts")
    .select("name, wa_name, phone, email, company, country, channel, tags, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  return aCsv(
    ((data as any[]) ?? []).map((c) => ({
      ...c,
      tags: Array.isArray(c.tags) ? c.tags.join(", ") : "",
      created_at: c.created_at ? new Date(c.created_at).toLocaleString("es-MX") : "",
    })),
    [
      { key: "name", titulo: "Nombre" },
      { key: "wa_name", titulo: "Nombre en WhatsApp" },
      { key: "phone", titulo: "Teléfono" },
      { key: "email", titulo: "Correo" },
      { key: "company", titulo: "Empresa" },
      { key: "country", titulo: "País" },
      { key: "channel", titulo: "Canal" },
      { key: "tags", titulo: "Etiquetas" },
      { key: "created_at", titulo: "Alta" },
    ],
  );
}

export async function exportarConversaciones(admin: any, orgId: string): Promise<string> {
  // Se traen los mensajes con el contacto al que pertenecen. Un CSV de mensajes
  // sin saber de quién son no le sirve a nadie.
  const { data } = await admin
    .from("messages")
    .select("created_at, direction, sender, body, conversation:conversations(contact:contacts(name, phone))")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(50000);

  return aCsv(
    ((data as any[]) ?? []).map((m) => ({
      created_at: m.created_at ? new Date(m.created_at).toLocaleString("es-MX") : "",
      contacto: m.conversation?.contact?.name ?? "",
      telefono: m.conversation?.contact?.phone ?? "",
      quien: m.direction === "inbound" ? "Cliente" : m.sender === "bot" ? "Chatbot" : "Equipo",
      body: m.body ?? "",
    })),
    [
      { key: "created_at", titulo: "Fecha" },
      { key: "contacto", titulo: "Contacto" },
      { key: "telefono", titulo: "Teléfono" },
      { key: "quien", titulo: "Quién escribió" },
      { key: "body", titulo: "Mensaje" },
    ],
  );
}

/* ─── Soltar WhatsApp ─────────────────────────────────────────────────────── */

/**
 * Suelta la cuenta de WhatsApp del cliente de nuestra app de Meta.
 *
 * SU CUENTA NO SE BORRA — no es nuestra. Lo que se hace es darla de baja de
 * nuestra aplicación (`subscribed_apps`), que es lo que corta el flujo de
 * mensajes hacia nosotros, y tirar el token que teníamos guardado.
 *
 * Que su cuenta siga existiendo en Meta hay que DECÍRSELO, no dejar que lo
 * suponga: alguien que cree que borró su WhatsApp y no lo hizo se lleva una
 * sorpresa muy fea después.
 */
export async function soltarWhatsapp(admin: any, orgId: string): Promise<{ soltada: boolean }> {
  const { data: canal } = await admin
    .from("whatsapp_channels")
    .select("waba_id, access_token")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!canal?.waba_id || !canal?.access_token) return { soltada: false };

  try {
    await fetch(`${GRAPH}/${canal.waba_id}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${canal.access_token}` },
    });
    return { soltada: true };
  } catch (e) {
    // Que Meta falle no puede impedir el borrado: los datos son lo que importa.
    // La fila del canal —con su token— se borra igual en la purga.
    console.error("[baja] soltar whatsapp:", e);
    return { soltada: false };
  }
}

/* ─── El registro de la baja ──────────────────────────────────────────────── */

export type DatosBaja = {
  motivo?: string | null;
  comentario?: string | null;
  borroDatos: boolean;
  quien: string;
};

/** Deja constancia de la baja en el registro interno (churn). */
export async function registrarBaja(admin: any, orgId: string, d: DatosBaja) {
  const { data: org } = await admin
    .from("organizations")
    .select("name, plan, created_at")
    .eq("id", orgId)
    .maybeSingle();

  const { data: plan } = org?.plan
    ? await admin.from("plans").select("price_monthly").eq("code", org.plan).maybeSingle()
    : { data: null };

  const alta = org?.created_at ? new Date(org.created_at) : null;
  const meses = alta ? Math.max(0, Math.round((Date.now() - alta.getTime()) / (30 * 86400000))) : null;

  await admin.from("bajas").insert({
    org_id: orgId,
    negocio: org?.name ?? null,
    correo_facturacion: d.quien,
    plan_code: org?.plan ?? null,
    precio_mensual: (plan as any)?.price_monthly ?? null,
    alta_at: org?.created_at ?? null,
    meses_activo: meses,
    motivo: d.motivo ?? null,
    comentario: d.comentario ?? null,
    borro_datos: d.borroDatos,
    borrado_at: d.borroDatos ? new Date().toISOString() : null,
    consentimiento_texto: d.borroDatos ? CONSENTIMIENTO : null,
    consentimiento_por: d.borroDatos ? d.quien : null,
    consentimiento_at: d.borroDatos ? new Date().toISOString() : null,
  });
}
