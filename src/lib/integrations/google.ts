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
  const { data } = await supabase
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
    await supabase
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
): Promise<{ id: string; htmlLink: string }> {
  const body: any = {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.startISO, timeZone: ev.timeZone },
    end: { dateTime: ev.endISO, timeZone: ev.timeZone },
  };
  if (ev.attendeeEmail) body.attendees = [{ email: ev.attendeeEmail }];
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`createEvent failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, htmlLink: j.htmlLink };
}
