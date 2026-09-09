import { asegurarAtributosDeAgenda } from "@/lib/agendaAtributos";
import { asegurarPlantillas } from "@/lib/whatsapp/mandarDeLaCasa";
import { PARA_LA_AGENDA } from "@/lib/whatsapp/plantillasDeLaCasa";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import {
  exchangeCode, fetchUserEmail, fetchCalendars, publicOrigin,
} from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

/** Callback del OAuth de Google: intercambia el código y guarda la conexión. */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const settings = `${origin}/settings/integrations`;

  if (err) return NextResponse.redirect(`${settings}?error=${encodeURIComponent(err)}`);

  // Verifica el state anti-CSRF
  const cookieState = cookies().get("g_oauth_state")?.value;
  cookies().delete("g_oauth_state");
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${settings}?error=invalid_state`);
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.redirect(`${origin}/login`);

  try {
    const tokens = await exchangeCode(req, code);
    const [email, calendars] = await Promise.all([
      fetchUserEmail(tokens.access_token),
      fetchCalendars(tokens.access_token),
    ]);

    const supabase = createClient();
    // Conserva el refresh_token previo si Google no lo devuelve esta vez
    let refresh = tokens.refresh_token ?? null;
    if (!refresh) {
      const { data: prev } = await createAdminClient()
        .from("integrations")
        .select("refresh_token")
        .eq("org_id", orgId)
        .eq("provider", "google_calendar")
        .maybeSingle();
      refresh = (prev?.refresh_token as string | undefined) ?? null;
    }

    const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    /* ── SE GUARDA CON LA LLAVE DE SERVICIO, Y SE MIRA SI GUARDÓ ────────────
     *
     * 9 SEP 2026. La pantalla dijo «✅ Google Calendar se conectó
     * correctamente» y la fila NO estaba en la base. Tres veces seguidas. El
     * calendario quedó desconectado y el dueño reconectando en bucle sin
     * entender nada.
     *
     * La causa era esta línea: `await supabase.from(...).upsert(...)` SIN
     * capturar `error`. PostgREST devolvía el fallo, nadie lo leía, y el código
     * seguía derecho hasta el `?connected=1`. Un error convertido en una
     * mentira, en la pantalla donde más caro sale: quien se fía deja de tener
     * agenda y no se entera.
     *
     * DOS CAMBIOS, Y LOS DOS HACEN FALTA:
     *
     * 1. Se escribe con el cliente ADMIN. Aquí se guardan `access_token` y
     *    `refresh_token`, que son secretos: escribirlos con la sesión del
     *    usuario nunca fue lo correcto, y además metía el RLS de por medio en
     *    un guardado que el propio servidor está autorizando.
     *
     * 2. SE MIRA EL ERROR. Si no guardó, no se dice que sí. Se vuelve con el
     *    motivo y queda apuntado en `conexiones_fallidas` para poder verlo
     *    después, que es lo que hoy no existía. */
    const { error: errGuardar } = await createAdminClient().from("integrations").upsert(
      {
        org_id: orgId,
        provider: "google_calendar",
        account_email: email,
        access_token: tokens.access_token,
        refresh_token: refresh,
        token_expiry: expiry,
        scope: tokens.scope ?? null,
        data: { calendars },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,provider" }
    );

    if (errGuardar) {
      console.error("[google callback] no se guardó la conexión:", errGuardar);
      try {
        await createAdminClient().from("conexiones_fallidas").insert({
          org_id: orgId,
          canal: "google_calendar",
          paso: "guardar_conexion",
          // El mensaje de Postgres, nunca los tokens.
          detalle: String(errGuardar.message ?? errGuardar).slice(0, 500),
        });
      } catch { /* apuntar el fallo no puede provocar otro */ }
      return NextResponse.redirect(
        `${settings}?error=${encodeURIComponent("No se pudo guardar la conexión: " + (errGuardar.message ?? "error al escribir"))}`,
      );
    }
    void supabase;

    // CONECTAR ES ENCENDER. Los dos datos que hace falta pedirle a la persona
    // para que la cita salga completa quedan creados aquí: sin ellos la cita
    // se crea sin invitación y nadie se entera. Ver `agendaAtributos.ts`.
    await asegurarAtributosDeAgenda(orgId);

    /* ── Y LA PLANTILLA DEL RECORDATORIO SE MANDA SOLA ──────────────────────
     *
     * El recordatorio de una cita solo sale con una plantilla aprobada en la
     * cuenta de Meta DEL NEGOCIO, y aprobarla tarda hasta un día. Pedirle a un
     * dentista que entre al Administrador de WhatsApp y la escriba con la
     * categoría correcta y dos botones de texto exacto es pedirle que no use la
     * función.
     *
     * Se manda aquí, al conectar la agenda: cuando quiera usar el recordatorio,
     * ya estará aprobada.
     *
     * NO PUEDE BLOQUEAR LA CONEXIÓN. Si Meta no contesta o todavía no hay
     * WhatsApp conectado, la agenda queda conectada igual — que es lo que la
     * persona vino a hacer. Solo se apunta. */
    try {
      const r = await asegurarPlantillas(createAdminClient(), orgId, PARA_LA_AGENDA);
      console.log("[agenda] plantillas de la casa:", JSON.stringify(r));
    } catch (e: any) {
      console.error("[agenda] no se pudieron mandar las plantillas:", e?.message ?? e);
    }

    // Y se vuelve a donde estaba. Quien conectó su calendario desde la pantalla
    // de su asistente quiere seguir configurando su asistente, no aterrizar en
    // Ajustes preguntándose qué pasó.
    const volver = cookies().get("g_oauth_volver")?.value ?? "";
    cookies().delete("g_oauth_volver");
    if (volver.startsWith("/") && !volver.startsWith("//")) {
      return NextResponse.redirect(`${publicOrigin(req)}${volver}?agenda=1`);
    }

    return NextResponse.redirect(`${settings}?connected=1`);
  } catch (e: any) {
    return NextResponse.redirect(`${settings}?error=${encodeURIComponent(e?.message ?? "oauth_failed")}`);
  }
}
