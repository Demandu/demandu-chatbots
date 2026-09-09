import { createAdminClient } from "@/lib/supabase/admin";
/**
 * Helpers de OAuth 2.0 para Google Calendar.
 * El Client ID/Secret viven en variables de entorno (Netlify), nunca en el código.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
  // Hojas de cálculo. SOLO `drive.file`, y es una decisión deliberada.
  //
  // La API de Sheets acepta este permiso y la propia documentación de Google lo
  // marca como NO SENSIBLE y recomendado, mientras que `spreadsheets` es
  // sensible. La diferencia no es burocrática: es lo que el cliente lee en la
  // pantalla de Google al conectar. Con `spreadsheets` leería «ver, editar y
  // eliminar TODAS tus hojas de cálculo»; con esto, «solo los archivos que uses
  // con esta app». Pedir de menos aquí no nos cuesta ninguna función —las hojas
  // que creamos nosotros quedan cubiertas— y le ahorra al cliente el susto.
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

/** Origen público (https://dominio) desde los headers de la petición. */
export function publicOrigin(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export function redirectUri(req: Request): string {
  return `${publicOrigin(req)}/api/integrations/google/callback`;
}

export function buildAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export async function exchangeCode(req: Request, code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Refresca el access_token usando el refresh_token guardado. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = await res.json();
  return j.email ?? null;
}

export interface GCalItem {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
}

export async function fetchCalendars(accessToken: string): Promise<GCalItem[]> {
  const res = await fetch(CALENDAR_LIST_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return [];
  const j = await res.json();
  return (j.items ?? [])
    .filter((c: any) => c.accessRole === "owner" || c.accessRole === "writer")
    .map((c: any) => ({ id: c.id, summary: c.summary, primary: !!c.primary, accessRole: c.accessRole }));
}

/**
 * Devuelve un access_token válido para la organización, refrescándolo si expiró.
 * `supabase` es un cliente de servidor (con sesión del usuario). Retorna null si
 * la organización no tiene Google Calendar conectado.
 */
export async function getValidAccessTokenForOrg(supabase: any, orgId: string): Promise<string | null> {
  // ── EL TOKEN SE LEE CON LA LLAVE DE SERVICIO, NO CON LA SESIÓN ──────────
  //
  // `integrations.access_token` y `refresh_token` dejaron de ser legibles para
  // una sesión normal: cualquier miembro de la cuenta —un agente que solo
  // debería atender chats— podía leer el refresh token de Google desde la
  // consola del navegador, y con él entrar a la agenda y a las hojas del
  // cliente.
  //
  // NO SE ABRE NADA CON ESTO: quien llama ya resolvió `orgId` a partir de su
  // propia sesión, así que el alcance es el mismo de antes. Lo único que
  // cambia es que el token no viaja por un camino donde alguien pueda
  // interceptarlo con una consulta suelta.
  const sb = createAdminClient();
  const { data } = await sb
    .from("integrations")
    .select("access_token, refresh_token, token_expiry")
    .eq("org_id", orgId)
    .eq("provider", "google_calendar")
    .maybeSingle();
  if (!data) return null;

  const expiry = data.token_expiry ? new Date(data.token_expiry).getTime() : 0;
  // Si faltan más de 60s, el token sirve
  if (expiry - Date.now() > 60_000 && data.access_token) return data.access_token as string;

  // Refrescar
  if (!data.refresh_token) return (data.access_token as string) ?? null;
  try {
    const t = await refreshAccessToken(data.refresh_token as string);
    const newExpiry = new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString();
    // El refresco también con la llave de servicio: es la misma fila y el mismo
    // motivo. Con la sesión funcionaría (escribir sí está permitido), pero
    // dejar dos caminos para la misma columna es cómo se acaba abriendo uno.
    await sb
      .from("integrations")
      .update({ access_token: t.access_token, token_expiry: newExpiry, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("provider", "google_calendar");
    return t.access_token;
  } catch {
    return (data.access_token as string) ?? null;
  }
}

export interface BusyInterval { start: string; end: string }

export async function freeBusy(
  accessToken: string,
  calendarId: string,
  timeMinISO: string,
  timeMaxISO: string
): Promise<BusyInterval[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: timeMinISO, timeMax: timeMaxISO, items: [{ id: calendarId }] }),
  });
  if (!res.ok) throw new Error(`freeBusy failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.calendars?.[calendarId]?.busy ?? []) as BusyInterval[];
}

export interface EventoDeGoogle {
  id: string;
  titulo: string;
  inicio: string | null;
  fin: string | null;
  todoElDia: boolean;
  enlace: string;
  invitados: string[];
  cancelado: boolean;
}

/**
 * Los eventos de un calendario entre dos fechas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES LA ÚNICA FORMA DE ENSEÑAR LA AGENDA DE VERDAD. La tabla `citas` no es una
 * copia del calendario a propósito: solo sabe de las citas que agendó la
 * plataforma. Lo que el negocio ya tenía puesto a mano vive únicamente aquí.
 *
 * `singleEvents: true` expande las series repetidas en sus ocurrencias. Sin eso,
 * una reunión semanal aparece UNA vez —el día que se creó— y la pantalla miente
 * sobre lo que hay mañana.
 *
 * Un fallo aquí NO revienta la pantalla: se devuelve lista vacía y quien llama
 * decide qué contar. Pero no se confunde con «no tienes nada»: se devuelve
 * `null`, que significa «no se pudo mirar». Es la misma distinción que costó
 * tres pantallas mintiéndole a un cliente esta semana.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function listarEventos(
  accessToken: string,
  calendarId: string,
  desdeISO: string,
  hastaISO: string,
): Promise<EventoDeGoogle[] | null> {
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${encodeURIComponent(desdeISO)}&timeMax=${encodeURIComponent(hastaISO)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=250`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const j = await res.json();
    return ((j.items ?? []) as any[]).map((e) => ({
      id: String(e?.id ?? ""),
      titulo: String(e?.summary ?? "(sin título)"),
      // Un evento de todo el día trae `date` en vez de `dateTime`.
      inicio: e?.start?.dateTime ?? e?.start?.date ?? null,
      fin: e?.end?.dateTime ?? e?.end?.date ?? null,
      todoElDia: !e?.start?.dateTime,
      enlace: String(e?.htmlLink ?? ""),
      invitados: ((e?.attendees ?? []) as any[])
        .map((a) => String(a?.email ?? ""))
        .filter(Boolean),
      cancelado: e?.status === "cancelled",
    }));
  } catch {
    return null;
  }
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  ev: {
    summary: string;
    description?: string;
    startISO: string;
    endISO: string;
    timeZone: string;
    attendeeEmail?: string;
  }
): Promise<{ id: string; htmlLink: string; sinInvitacion?: boolean }> {
  const body: any = {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.startISO, timeZone: ev.timeZone },
    end: { dateTime: ev.endISO, timeZone: ev.timeZone },
  };
  const crear = async (cuerpo: any, conInvitado: boolean) =>
    fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
        (conInvitado ? "?sendUpdates=all" : ""),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      },
    );

  let res = await crear(
    ev.attendeeEmail ? { ...body, attendees: [{ email: ev.attendeeEmail }] } : body,
    !!ev.attendeeEmail,
  );

  /* ── SI EL INVITADO ES EL PROBLEMA, LA CITA SE CREA IGUAL ────────────────
   *
   * Google rechaza invitar a un correo externo en varias situaciones que no
   * dependen de nosotros: cuentas de Workspace con el compartir restringido,
   * dominios que no permiten invitados, cuentas sin permiso para convidar.
   *
   * Antes, cualquiera de esas tiraba TODA la reserva: el cliente eligió su
   * hora, dijo que sí, y no quedó nada — ni en el calendario ni en su correo.
   * Y el bot le contestó «parece que hay un problema técnico con esa hora»,
   * que además es mentira: la hora estaba libre.
   *
   * Una cita en el calendario sin invitación es infinitamente mejor que
   * ninguna cita: el negocio la ve, la atiende, y puede escribirle a la
   * persona por el mismo chat donde la agendó.
   */
  let sinInvitacion = false;
  if (!res.ok && ev.attendeeEmail) {
    const porQue = await res.text().catch(() => "");
    console.error(`[google] no aceptó el invitado (${res.status}): ${porQue.slice(0, 300)}`);
    res = await crear(body, false);
    sinInvitacion = res.ok;
  }

  if (!res.ok) throw new Error(`createEvent failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, htmlLink: j.htmlLink, sinInvitacion };
}

/**
 * Mueve una cita que ya existe.
 *
 * ── PATCH, NO BORRAR Y CREAR ──────────────────────────────────────────────
 *
 * Es la diferencia entre que al invitado le llegue «se cambió la hora de tu
 * cita» —con su misma entrada de calendario actualizada— o que le llegue una
 * cancelación y una invitación nueva, y se quede con dos huecos en su agenda si
 * no acepta la segunda.
 *
 * Además, borrar y crear cambia el identificador del evento, y entonces lo que
 * la plataforma tiene apuntado deja de existir: mover la cita dos veces
 * fallaría la segunda.
 *
 * `sendUpdates=all` para que el invitado se entere. Una cita movida en secreto
 * es una cita a la que no va nadie.
 */
export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  ev: { startISO: string; endISO: string; timeZone: string },
): Promise<{ id: string; htmlLink: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}` +
      `/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { dateTime: ev.startISO, timeZone: ev.timeZone },
        end: { dateTime: ev.endISO, timeZone: ev.timeZone },
      }),
    },
  );
  if (!res.ok) throw new Error(`updateEvent failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, htmlLink: j.htmlLink };
}

/**
 * Cancela una cita.
 *
 * ── UN 404 O UN 410 SON UN ÉXITO ──────────────────────────────────────────
 *
 * Significan que el evento ya no está: o el dueño lo borró desde su calendario,
 * o esta misma cancelación se reintentó. En los dos casos el resultado que la
 * persona pidió —que no haya cita— YA SE CUMPLIÓ, y contestarle «no pude
 * cancelar» la dejaría creyendo que sigue teniendo una cita que no existe.
 *
 * Es el único error que se traga, y a propósito: un 403 o un 500 sí se cuentan,
 * porque ahí la cita sigue viva.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}` +
      `/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.ok || res.status === 404 || res.status === 410) return;
  throw new Error(`deleteEvent failed: ${res.status} ${await res.text()}`);
}
