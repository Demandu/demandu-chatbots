/**
 * Conectar una cuenta de Instagram.
 *
 * QUÉ CAMINO SE USA Y POR QUÉ. Meta ofrece dos integraciones distintas con el
 * mismo nombre a medias: «Instagram API con Instagram Login» y «Instagram API
 * con Facebook Login». Aquí se usa la SEGUNDA, y no es indiferente:
 *
 *   · La cuenta del cliente ya está ligada a una página de Facebook (es
 *     requisito para vender por Instagram en serio), y ese es justo el caso
 *     que atiende el camino de Facebook.
 *   · La app ya tiene Messenger y «Inicio de sesión con Facebook para
 *     empresas» configurados para WhatsApp. Meter el otro camino sería una
 *     segunda forma de autenticar dentro de la misma app.
 *   · Los mensajes se mandan como la PÁGINA, con el token de la página. Por eso
 *     hace falta guardar `page_id` además del id de Instagram.
 *
 * NO SE USA EL POPUP DEL SDK como en WhatsApp: aquí basta un redirect normal,
 * que no depende de que cargue un script de Meta ni de que el navegador
 * permita ventanas emergentes.
 */

/** Lo mínimo para leer la cuenta, sus mensajes y sus comentarios. */
export const PERMISOS_INSTAGRAM = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "business_management",
].join(",");

const GRAPH = "https://graph.facebook.com/v21.0";

export function origenPublico(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export function urlDeRetorno(req: Request): string {
  return `${origenPublico(req)}/api/integrations/instagram/callback`;
}

export function urlDeConsentimiento(req: Request, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_META_APP_ID ?? "",
    redirect_uri: urlDeRetorno(req),
    response_type: "code",
    scope: PERMISOS_INSTAGRAM,
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p.toString()}`;
}

export type CuentaEncontrada = {
  igUserId: string;
  username: string | null;
  pageId: string;
  pageName: string | null;
  pageToken: string;
};

/** Cambia el código por un token de usuario. */
export async function canjearCodigo(req: Request, code: string): Promise<string> {
  const p = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    redirect_uri: urlDeRetorno(req),
    code,
  });
  const r = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`, { cache: "no-store" });
  const j = await r.json();
  if (!j?.access_token) throw new Error(j?.error?.message ?? "Meta no devolvió el token");
  return j.access_token as string;
}

/**
 * Las cuentas de Instagram que el usuario acaba de autorizar.
 *
 * SE PIDE POR PÁGINAS, no por Instagram: en este camino la cuenta de Instagram
 * cuelga de una página de Facebook, y el token con el que se manda es el DE LA
 * PÁGINA, no el del usuario. Un token de usuario caduca en semanas; el de la
 * página derivado de él dura mientras el permiso siga concedido.
 */
export async function cuentasDisponibles(tokenDeUsuario: string): Promise<CuentaEncontrada[]> {
  const r = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(tokenDeUsuario)}`,
    { cache: "no-store" },
  );
  const j = await r.json();
  if (j?.error) throw new Error(j.error?.message ?? "Meta no devolvió las páginas");

  return ((j?.data as any[]) ?? [])
    // Una página sin Instagram ligado no sirve aquí, y no es un error: mucha
    // gente tiene páginas sueltas. Se filtran en silencio.
    .filter((p) => p?.instagram_business_account?.id && p?.access_token)
    .map((p) => ({
      igUserId: String(p.instagram_business_account.id),
      username: p.instagram_business_account.username ?? null,
      pageId: String(p.id),
      pageName: p.name ?? null,
      pageToken: String(p.access_token),
    }));
}

/**
 * Suscribe la app a los avisos de esa página.
 *
 * SIN ESTO NO LLEGA NADA. Configurar el webhook en el panel de Meta solo dice
 * «a dónde»; esta llamada dice «de quién». Es el paso que más veces se olvida y
 * el que produce el síntoma más desconcertante: todo parece conectado y el
 * webhook nunca suena.
 */
export async function suscribirPagina(pageId: string, pageToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const campos = [
      "messages",
      "messaging_postbacks",
      "message_reactions",
      "comments",
      "live_comments",
      "mentions",
    ].join(",");
    const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed_fields: campos, access_token: pageToken }),
    });
    const j = await r.json();
    if (j?.success === true) return { ok: true };
    return { ok: false, error: j?.error?.message ?? "Meta no confirmó la suscripción" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo suscribir la página" };
  }
}
