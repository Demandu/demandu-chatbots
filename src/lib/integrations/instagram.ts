/**
 * Conectar una cuenta de Instagram.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CAMINO SE USA Y POR QUÉ. Meta tiene DOS integraciones distintas con
 * nombres casi iguales, y elegir mal significa reescribirlo todo:
 *
 *   · «Instagram API con Facebook Login» — la cuenta cuelga de una página de
 *     Facebook y se manda como la página, con el token de la página.
 *   · «Instagram API con Instagram Login» — ES LA QUE USAMOS. La persona entra
 *     con SU CUENTA DE INSTAGRAM, sin pasar por ninguna página.
 *
 * SE ELIGIÓ LA SEGUNDA POR UN MOTIVO DE NEGOCIO, NO TÉCNICO: el cliente NO
 * necesita página de Facebook. Muchas PYMES de LATAM tienen el Instagram vivo y
 * la página abandonada o inexistente, y con el otro camino cada una de esas
 * altas es una llamada a soporte explicando cómo ligar una página que no
 * quieren tener.
 *
 * OJO CON LAS CREDENCIALES: este camino usa el **App ID y el secreto de
 * INSTAGRAM**, que son distintos de los de Facebook que usa WhatsApp. Están en
 * Panel de apps → Instagram → Configuración de la API con inicio de sesión con
 * Instagram. Confundirlos da un error de «client_id inválido» que no dice en
 * ningún sitio que hay dos identificadores.
 *
 * Los tres anfitriones tampoco son el mismo, y también verificado contra la
 * documentación de Meta (1 sep 2026):
 *   www.instagram.com/oauth/authorize   → pedir permiso
 *   api.instagram.com/oauth/access_token → canjear el código
 *   graph.instagram.com                  → todo lo demás
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AUTORIZAR = "https://www.instagram.com/oauth/authorize";
const CANJE = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

/**
 * Solo lo que de verdad se usa.
 *
 * Meta ofrece además `instagram_business_content_publish` y
 * `..._manage_insights`, y su URL de ejemplo los incluye. NO se piden: cada
 * permiso extra es un permiso más que justificar con vídeo en la revisión de
 * la app, y un permiso que no se usa es imposible de justificar.
 */
export const PERMISOS_INSTAGRAM = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

export function origenPublico(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * TIENE QUE COINCIDIR AL CARÁCTER con la URI guardada en el panel de Meta.
 * Meta compara la cadena entera, no el dominio: una barra de más al final y el
 * login falla con un error que no explica por qué.
 */
export function urlDeRetorno(req: Request): string {
  return `${origenPublico(req)}/api/integrations/instagram/callback`;
}

export function urlDeConsentimiento(req: Request, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? "",
    redirect_uri: urlDeRetorno(req),
    response_type: "code",
    scope: PERMISOS_INSTAGRAM,
    state,
    // Obliga a entrar con las credenciales de la cuenta profesional aunque ya
    // haya una sesión de Instagram abierta en ese navegador. Sin esto, quien
    // conecta desde el móvil con su Instagram personal abierto conecta LA
    // CUENTA EQUIVOCADA sin darse cuenta — y lo descubre cuando los mensajes
    // de sus clientes empiezan a llegar a su cuenta personal.
    force_reauth: "true",
  });
  return `${AUTORIZAR}?${p.toString()}`;
}

export type CuentaConectada = {
  igUserId: string;
  username: string | null;
  token: string;
  caduca: string | null;
  permisos: string[];
};

/**
 * Canjea el código por un token de LARGA duración, en dos pasos.
 *
 * POR QUÉ DOS PASOS Y NO UNO. El canje directo devuelve un token de **1 hora**.
 * Guardarlo sería construir una bomba de relojería: la conexión funcionaría en
 * la demo y se caería sola esa misma tarde, sin ningún error que lo explicara.
 * El segundo paso lo cambia por uno de 60 días, que además se puede renovar.
 */
export async function conectarConCodigo(req: Request, code: string): Promise<CuentaConectada> {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? "";
  const secreto = process.env.INSTAGRAM_APP_SECRET ?? "";
  if (!appId || !secreto) throw new Error("Faltan las credenciales de Instagram en el servidor");

  // ── 1. Código → token corto (1 hora) ─────────────────────────────────────
  // Va como formulario, NO como JSON: este punto de conexión rechaza JSON.
  const cuerpo = new URLSearchParams({
    client_id: appId,
    client_secret: secreto,
    grant_type: "authorization_code",
    redirect_uri: urlDeRetorno(req),
    code,
  });
  const r1 = await fetch(CANJE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cuerpo.toString(),
    cache: "no-store",
  });
  const j1 = await r1.json().catch(() => ({}));
  const tokenCorto = j1?.access_token as string | undefined;
  const igUserId = j1?.user_id != null ? String(j1.user_id) : "";
  if (!tokenCorto || !igUserId) {
    throw new Error(j1?.error_message ?? j1?.error?.message ?? "Instagram no devolvió el token");
  }

  // ── 2. Token corto → token de 60 días ────────────────────────────────────
  const p2 = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: secreto,
    access_token: tokenCorto,
  });
  const r2 = await fetch(`${GRAPH}/access_token?${p2.toString()}`, { cache: "no-store" });
  const j2 = await r2.json().catch(() => ({}));
  const token = (j2?.access_token as string | undefined) ?? tokenCorto;
  const segundos = Number(j2?.expires_in ?? 0);
  const caduca = segundos > 0 ? new Date(Date.now() + segundos * 1000).toISOString() : null;

  // El nombre de usuario es para que la Bandeja no muestre un número. Si
  // falla, la conexión sigue siendo válida: no se tumba por un adorno.
  let username: string | null = null;
  try {
    const r3 = await fetch(
      `${GRAPH}/v25.0/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const j3 = await r3.json();
    username = j3?.username ?? null;
  } catch { /* el adorno no manda */ }

  const permisos = Array.isArray(j1?.permissions)
    ? j1.permissions.map((x: any) => String(x))
    : String(j1?.permissions ?? "").split(",").filter(Boolean);

  return { igUserId, username, token, caduca, permisos };
}

/**
 * Suscribe la app a los avisos de ESA cuenta.
 *
 * SIN ESTO NO LLEGA NADA, y es el paso que más veces se olvida. Configurar el
 * webhook en el panel de Meta solo dice **a dónde** mandar los avisos; esta
 * llamada dice **de quién**. El síntoma cuando falta es el más desconcertante
 * que existe: la pantalla dice «conectado», todo parece correcto, y el webhook
 * no suena nunca.
 */
export async function suscribirCuenta(
  igUserId: string, token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = new URLSearchParams({
      subscribed_fields: "messages,messaging_postbacks,message_reactions,comments,live_comments",
      access_token: token,
    });
    const r = await fetch(`${GRAPH}/v25.0/${igUserId}/subscribed_apps?${p.toString()}`, {
      method: "POST",
    });
    const j = await r.json().catch(() => ({}));
    if (j?.success === true) return { ok: true };
    return { ok: false, error: j?.error?.message ?? "Instagram no confirmó la suscripción" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo suscribir la cuenta" };
  }
}

/**
 * Renueva un token de 60 días por otros 60.
 *
 * Todavía NO lo llama nadie: hace falta una tarea programada que lo haga sobre
 * los 50 días. Se deja escrito y probado para que ese día sea añadir el cron y
 * no reconstruir esto — pero **está pendiente**, y mientras no exista, una
 * cuenta conectada deja de funcionar a los dos meses.
 */
export async function renovarToken(token: string): Promise<{ token: string; caduca: string } | null> {
  try {
    const p = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
    const r = await fetch(`${GRAPH}/refresh_access_token?${p.toString()}`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.access_token) return null;
    const segundos = Number(j?.expires_in ?? 0);
    return {
      token: j.access_token as string,
      caduca: new Date(Date.now() + (segundos || 60 * 86400) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}
