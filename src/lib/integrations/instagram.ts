/**
 * Conectar una cuenta de Instagram.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CAMINO SE USA Y POR QUÉ. Meta tiene DOS integraciones con nombres casi
 * iguales para lo mismo:
 *
 *   · «Instagram API con Instagram Login» — la persona entra con su cuenta de
 *     Instagram, sin páginas de por medio.
 *   · «Instagram API con Facebook Login» — ES LA QUE USAMOS. La persona entra
 *     con Facebook y elige la página que tiene su Instagram ligado.
 *
 * SE INTENTÓ PRIMERO EL DE INSTAGRAM LOGIN y no cuajó en esta app: el canje del
 * código devolvía siempre un error del dialecto de Facebook aunque todo lo
 * enviado fuera correcto (URI idéntica, App ID de Instagram, secreto de 32
 * caracteres sin espacios). Esta app es de tipo Negocios y está construida
 * sobre «Inicio de sesión con Facebook para empresas» — es lo que usa WhatsApp
 * — y ese es el camino con el que se lleva bien.
 *
 * LO QUE ESTO LE CUESTA AL CLIENTE: su Instagram tiene que estar ligado a una
 * página de Facebook. Es un requisito más al dar de alta, y se dice en la
 * pantalla de conexión antes de empezar, no en un error después.
 *
 * LAS CREDENCIALES SON LAS DE FACEBOOK, las mismas que ya usa WhatsApp
 * (`NEXT_PUBLIC_META_APP_ID` y `META_APP_SECRET`). Ya no hace falta el par de
 * Instagram: una cosa menos que configurar y una menos que equivocar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const DIALOGO = "https://www.facebook.com/v21.0/dialog/oauth";

/**
 * La configuración de «Inicio de sesión con Facebook para empresas» que define
 * qué activos y qué permisos se piden. Se creó a mano en el panel de Meta con:
 * activos Páginas + Cuentas de Instagram, token de usuario, y los permisos
 * `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`,
 * `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`.
 *
 * CON `config_id` NO SE MANDA `scope`: los permisos los define la
 * configuración, no la URL. Mandar los dos es lo que hace que Meta ignore uno
 * de ellos sin avisar.
 *
 * El valor por defecto está escrito aquí a propósito: es una constante de la
 * plataforma —la misma para todos los clientes, y pública— y tenerlo aquí
 * evita otra vuelta de «añade una variable y vuelve a publicar». Se puede
 * sobrescribir por entorno el día que haga falta.
 */
const CONFIG_ID = process.env.NEXT_PUBLIC_META_CONFIG_ID_IG ?? "1071969529023369";

export function origenPublico(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * TIENE QUE COINCIDIR AL CARÁCTER con una de las «URI de redireccionamiento de
 * OAuth válidas» del panel de Meta. Meta compara la cadena entera.
 */
export function urlDeRetorno(req: Request): string {
  return `${origenPublico(req)}/api/integrations/instagram/callback`;
}

export function urlDeConsentimiento(req: Request, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_META_APP_ID ?? "",
    config_id: CONFIG_ID,
    redirect_uri: urlDeRetorno(req),
    response_type: "code",
    state,
  });
  return `${DIALOGO}?${p.toString()}`;
}

export type CuentaConectada = {
  igUserId: string;
  username: string | null;
  pageId: string;
  pageName: string | null;
  /** El token DE LA PÁGINA: es con el que se manda y se recibe. */
  token: string;
  caduca: string | null;
  permisos: string[];
};

/**
 * Canjea el código y encuentra la cuenta de Instagram del cliente.
 *
 * TRES LLAMADAS, y las tres hacen falta:
 *   1. código → token de usuario (corto)
 *   2. token corto → token de usuario de LARGA duración
 *   3. token largo → las páginas del cliente y el Instagram ligado a cada una
 *
 * EL PASO 2 NO ES OPCIONAL aunque el token corto ya funcione. Los tokens de
 * página que se derivan de un token de usuario de larga duración **no
 * caducan**; los derivados de uno corto mueren en una hora. Saltárselo daría
 * una conexión que funciona en la demo y se cae esa misma tarde, sin ningún
 * error que lo explique.
 */
export async function conectarConCodigo(req: Request, code: string): Promise<CuentaConectada> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? "";
  const secreto = process.env.META_APP_SECRET ?? "";
  if (!appId || !secreto) throw new Error("Faltan las credenciales de Meta en el servidor");

  const retorno = urlDeRetorno(req);

  // ── 1. Código → token de usuario ─────────────────────────────────────────
  const p1 = new URLSearchParams({
    client_id: appId,
    client_secret: secreto,
    redirect_uri: retorno,
    code,
  });
  const r1 = await fetch(`${GRAPH}/oauth/access_token?${p1.toString()}`, { cache: "no-store" });
  const j1 = await r1.json().catch(() => ({}));
  const tokenCorto = j1?.access_token as string | undefined;
  if (!tokenCorto) {
    // La forma de lo enviado, nunca su contenido: del secreto solo el largo y
    // si trae espacios pegados. Esto acaba guardado en la base.
    const forma = `uri=${retorno} app=${appId} secreto_largo=${secreto.length} secreto_sin_espacios=${secreto === secreto.trim()} code_largo=${code.length}`;
    throw new Error(
      [`HTTP ${r1.status}`, j1?.error?.type, j1?.error?.code, j1?.error?.message, `— enviado: ${forma}`]
        .filter(Boolean).join(" · "),
    );
  }

  // ── 2. Token corto → token de usuario de larga duración ──────────────────
  const p2 = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: secreto,
    fb_exchange_token: tokenCorto,
  });
  const r2 = await fetch(`${GRAPH}/oauth/access_token?${p2.toString()}`, { cache: "no-store" });
  const j2 = await r2.json().catch(() => ({}));
  const tokenLargo = (j2?.access_token as string | undefined) ?? tokenCorto;
  const segundos = Number(j2?.expires_in ?? 0);
  const caduca = segundos > 0 ? new Date(Date.now() + segundos * 1000).toISOString() : null;

  // ── 3. Las páginas del cliente, y el Instagram de cada una ───────────────
  const r3 = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(tokenLargo)}`,
    { cache: "no-store" },
  );
  const j3 = await r3.json().catch(() => ({}));
  if (j3?.error) throw new Error(j3.error?.message ?? "Meta no devolvió las páginas");

  // Una página sin Instagram ligado no sirve aquí, y no es un error: mucha
  // gente tiene páginas sueltas. Se filtran en silencio.
  const conIg = ((j3?.data as any[]) ?? []).filter(
    (p) => p?.instagram_business_account?.id && p?.access_token,
  );
  if (!conIg.length) {
    throw new Error(
      "SIN_CUENTAS: ninguna de las páginas autorizadas tiene una cuenta de Instagram ligada",
    );
  }

  // Se conecta la primera. Elegir entre varias es una pantalla más; cuando
  // algún cliente tenga dos, aquí es donde va.
  const p = conIg[0];
  return {
    igUserId: String(p.instagram_business_account.id),
    username: p.instagram_business_account.username ?? null,
    pageId: String(p.id),
    pageName: p.name ?? null,
    token: String(p.access_token),
    caduca,
    permisos: [],
  };
}

/**
 * Suscribe la app a los avisos de esa página.
 *
 * SIN ESTO NO LLEGA NADA, y es el paso que más veces se olvida. Configurar el
 * webhook en el panel de Meta solo dice **a dónde** mandar los avisos; esta
 * llamada dice **de quién**. El síntoma cuando falta es el más desconcertante
 * que existe: la pantalla dice «conectado» y el webhook no suena jamás.
 */
export async function suscribirCuenta(
  pageId: string, pageToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = new URLSearchParams({
      subscribed_fields: "messages,messaging_postbacks,message_reactions,messaging_referral",
      access_token: pageToken,
    });
    const r = await fetch(`${GRAPH}/${pageId}/subscribed_apps?${p.toString()}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (j?.success === true) return { ok: true };
    return { ok: false, error: j?.error?.message ?? "Meta no confirmó la suscripción" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo suscribir la página" };
  }
}
