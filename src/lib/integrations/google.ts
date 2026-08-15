/**
 * Helpers de OAuth 2.0 para Google Calendar.
 * El Client ID/Secret viven en variables de entorno (Netlify), nunca en el código.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar",
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
