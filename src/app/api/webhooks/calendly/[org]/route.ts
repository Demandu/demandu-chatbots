import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmaValida } from "@/lib/integrations/calendly";

export const dynamic = "force-dynamic";

/**
 * Las citas de Calendly entran a la plataforma.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ IMPORTA. Sin esto, una cita agendada desde el enlace de la biografía
 * de Instagram vive solo en Calendly: no hay contacto, no hay conversación, y
 * el equipo no se entera hasta que mira el calendario. Con esto, cada cita
 * —venga del chat o de donde sea— crea o encuentra a la persona y deja el
 * apunte en su conversación.
 *
 * ── EL CUERPO SE LEE COMO TEXTO ───────────────────────────────────────────
 *
 * La firma se calcula sobre los BYTES EXACTOS que mandó Calendly. Parsear y
 * volver a serializar cambia un espacio y la firma deja de cuadrar. Es el
 * mismo cuidado que ya llevan los webhooks de Meta y de Stripe.
 *
 * ── Y FALLA CERRADO ───────────────────────────────────────────────────────
 *
 * Sin clave, sin cabecera, con el reloj corrido o con una firma que no cuadra,
 * se rechaza. Un webhook que deja pasar cuando falta algo es una puerta para
 * meter citas y contactos falsos en la cuenta de cualquier cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request, { params }: { params: { org: string } }) {
  const crudo = await req.text();
  const orgId = String(params.org ?? "");
  if (!orgId) return new NextResponse("sin cliente", { status: 400 });

  const sb = createAdminClient();
  const { data: conexion } = await sb
    .from("integrations")
    .select("firma")
    .eq("org_id", orgId)
    .eq("provider", "calendly")
    .maybeSingle();

  // `integrations.firma` no está concedida a NADIE (ver la 0093): esta consulta
  // solo devuelve algo porque va con la llave de servicio. Si alguien copia
  // este código a una ruta con la sesión del usuario, no le devolverá la clave
  // —le devolverá un error— y eso es lo que se quiere.
  const clave = String((conexion as any)?.firma ?? "");
  if (!firmaValida(crudo, req.headers.get("calendly-webhook-signature"), clave)) {
    console.error("[calendly webhook] firma que no cuadra para", orgId);
    return new NextResponse("firma inválida", { status: 401 });
  }

  let cuerpo: any = null;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await atender(sb, orgId, cuerpo);
  } catch (e: any) {
    // NUNCA SE DEVUELVE ERROR A CALENDLY POR UN FALLO NUESTRO: reintentaría en
    // bucle. Se apunta y se sigue.
    console.error("[calendly webhook]", e?.message ?? e);
  }

  return NextResponse.json({ ok: true });
}

async function atender(sb: any, orgId: string, cuerpo: any): Promise<void> {
  const tipo = String(cuerpo?.event ?? "");
  if (tipo !== "invitee.created" && tipo !== "invitee.canceled") return;

  const p = cuerpo?.payload ?? {};
  const evento = p?.scheduled_event ?? {};
  const correo = String(p?.email ?? "").trim().toLowerCase();
  const nombre = String(p?.name ?? "").trim();

  // EL TELÉFONO ES LA LLAVE DE ESTA PLATAFORMA, no el correo: los contactos se
  // identifican por su WhatsApp. Calendly puede traerlo si el negocio pide el
  // recordatorio por SMS; si no, se ata por correo, y si tampoco hay, se crea
  // un contacto igual — perder la cita es peor que tener una ficha suelta.
  const telefono = String(p?.text_reminder_number ?? "").replace(/\D/g, "");

  let contactoId: string | null = null;

  if (telefono) {
    const { data } = await sb
      .from("contacts").select("id")
      .eq("org_id", orgId).eq("channel", "whatsapp").eq("external_id", telefono)
      .maybeSingle();
    contactoId = data?.id ?? null;
  }
  if (!contactoId && correo) {
    const { data } = await sb
      .from("contacts").select("id").eq("org_id", orgId).eq("email", correo).maybeSingle();
    contactoId = data?.id ?? null;
  }

  if (!contactoId) {
    const { data } = await sb
      .from("contacts")
      .insert({
        org_id: orgId,
        channel: telefono ? "whatsapp" : "calendly",
        external_id: telefono || correo || `cal-${Date.now()}`,
        ...(nombre ? { name: nombre } : {}),
        ...(correo ? { email: correo } : {}),
        ...(telefono ? { phone: telefono } : {}),
      })
      .select("id")
      .single();
    contactoId = data?.id ?? null;
  }
  if (!contactoId) return;

  // La conversación abierta de esa persona, o una nueva. El apunte tiene que
  // caer donde el equipo ya la está atendiendo, no en un hilo aparte.
  let { data: conv } = await sb
    .from("conversations")
    .select("id")
    .eq("org_id", orgId).eq("contact_id", contactoId).eq("status", "open")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) {
    const { data } = await sb
      .from("conversations")
      .insert({ org_id: orgId, contact_id: contactoId, channel: "calendly", status: "open", flow_state: {} })
      .select("id")
      .single();
    conv = data;
  }
  if (!conv) return;

  const cuando = String(evento?.start_time ?? "");
  const legible = cuando
    ? new Intl.DateTimeFormat("es-MX", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(cuando))
    : "sin fecha";

  const texto =
    tipo === "invitee.created"
      ? `📅 Agendó «${String(evento?.name ?? "cita")}» para el ${legible}.`
      : `❌ Canceló su cita de «${String(evento?.name ?? "cita")}» del ${legible}.`;

  // ENTRA COMO MENSAJE DEL SISTEMA, no como algo que dijo la persona: no lo
  // escribió ella, y ponerlo como suyo ensuciaría el historial y la IA.
  const { error } = await sb.from("messages").insert({
    conversation_id: conv.id,
    org_id: orgId,
    direction: "inbound",
    sender: "system",
    body: texto,
    payload: {
      calendly: {
        evento: tipo,
        cita_uri: String(evento?.uri ?? ""),
        invitado_uri: String(p?.uri ?? ""),
        inicio: cuando,
        fin: String(evento?.end_time ?? ""),
        cancelar: String(p?.cancel_url ?? ""),
        cambiar: String(p?.reschedule_url ?? ""),
      },
    },
  });
  if (error) console.error("[calendly webhook] no pude guardar el apunte:", error.message);
}
