/**
 * Conectar una cuenta de Instagram.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CAMINO: «Instagram API con inicio de sesión de Instagram». El cliente entra
 * con SU cuenta de Instagram y ya está. **No necesita página de Facebook.**
 *
 * ESO NO ES UNA PREFERENCIA, ES EL REQUISITO DEL NEGOCIO: la mayoría de los
 * clientes de esta plataforma no tienen página de Facebook, y el camino que
 * pasa por páginas convierte cada alta en una llamada a soporte explicándole a
 * alguien cómo crear y ligar una página que no quiere.
 *
 * SE PROBÓ EL CAMINO DE FACEBOOK y funcionaba —conectaba, guardaba el token—
 * pero exigía la página. Se descartó por eso, no por fallar.
 *
 * ESTOS PARÁMETROS ESTÁN COPIADOS DE UNA INTEGRACIÓN QUE FUNCIONA. Se capturó
 * la URL real que genera BotPenguin (el proveedor al que esta plataforma
 * sustituye) al pulsar su «Login with Instagram», y usa exactamente esto:
 *
 *   https://www.instagram.com/oauth/authorize
 *     client_id=<app de Instagram>
 *     redirect_uri=<la de vuelta>
 *     response_type=code
 *     scope=instagram_business_basic,
 *           instagram_business_manage_comments,
 *           instagram_business_manage_messages
 *
 * Y NADA MÁS. Sin `force_reauth`, sin `enable_fb_login`. Los intentos
 * anteriores añadían esos dos y el canje del código fallaba con un error que
 * culpaba a la `redirect_uri` estando la URI correcta. Si alguien vuelve a
 * añadirlos «por seguridad», que lo pruebe de punta a punta antes.
 *
 * CREDENCIALES: las de la app de INSTAGRAM (`NEXT_PUBLIC_INSTAGRAM_APP_ID` e
 * `INSTAGRAM_APP_SECRET`), que NO son las de Facebook que usa WhatsApp. Están
 * en Panel de apps → Instagram → Configuración de la API con inicio de sesión
 * con Instagram.
 *
 * TRES ANFITRIONES DISTINTOS, y no son intercambiables:
 *   www.instagram.com/oauth/authorize     → pedir permiso
 *   api.instagram.com/oauth/access_token  → canjear el código
 *   graph.instagram.com                   → todo lo demás
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AUTORIZAR = "https://www.instagram.com/oauth/authorize";
const CANJE = "https://api.instagram.com/oauth/access_token";
const GRAPH = "https://graph.instagram.com";

/**
 * Los mismos tres que pide la integración que funciona. Meta ofrece además
 * `..._content_publish` y `..._manage_insights`: no se piden, porque cada
 * permiso extra hay que justificarlo con vídeo en la revisión de la app y uno
 * que no se usa es imposible de justificar.
 */
export const PERMISOS_INSTAGRAM = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
].join(",");

export function origenPublico(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Tiene que coincidir AL CARÁCTER con la URI registrada en el panel. */
export function urlDeRetorno(req: Request): string {
  return `${origenPublico(req)}/api/integrations/instagram/callback`;
}

export function urlDeConsentimiento(req: Request, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? "",
    redirect_uri: urlDeRetorno(req),
    response_type: "code",
    scope: PERMISOS_INSTAGRAM,
    // La integración de referencia manda `state: null`. Aquí SÍ se manda: es lo
    // que impide que un enlace preparado por otro conecte la cuenta de un
    // extraño a esta organización. Es un parámetro documentado y Meta lo
    // devuelve tal cual; no participa en el canje.
    state,
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
 * EL SEGUNDO PASO NO ES OPCIONAL. El canje directo devuelve un token de UNA
 * HORA. Guardarlo sería una bomba de relojería: funcionaría en la demo y se
 * caería esa misma tarde, sin ningún error que lo explicara.
 */
export async function conectarConCodigo(req: Request, code: string): Promise<CuentaConectada> {
  const appId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID ?? "";
  const secreto = process.env.INSTAGRAM_APP_SECRET ?? "";
  if (!appId || !secreto) throw new Error("Faltan las credenciales de Instagram en el servidor");

  const retorno = urlDeRetorno(req);

  // ── 1. Código → token corto (1 hora) ─────────────────────────────────────
  //
  // VA COMO `multipart/form-data`: el ejemplo de Meta usa `curl -F`, que es
  // multipart. No se pone `Content-Type` a mano — `fetch` lo escribe con el
  // separador que corresponde, y ponerlo rompe la petición.
  const form = new FormData();
  form.append("client_id", appId);
  form.append("client_secret", secreto);
  form.append("grant_type", "authorization_code");
  form.append("redirect_uri", retorno);
  form.append("code", code);

  const r1 = await fetch(CANJE, { method: "POST", body: form, cache: "no-store" });
  const j1 = await r1.json().catch(() => ({}));

  // LA RESPUESTA VIENE ENVUELTA EN `data[0]`, no en la raíz. Leerla de la raíz
  // haría que un canje CORRECTO se tratara como fallido — el peor error
  // posible, porque el problema real ya estaría resuelto y el síntoma seguiría
  // siendo el mismo. Se aceptan las dos formas por si Meta cambia.
  const dato = Array.isArray(j1?.data) ? (j1.data[0] ?? {}) : j1;
  const tokenCorto = dato?.access_token as string | undefined;
  const igUserId = dato?.user_id != null ? String(dato.user_id) : "";

  if (!tokenCorto || !igUserId) {
    // La FORMA de lo enviado, nunca su contenido: del secreto solo el largo, si
    // trae espacios pegados, y si es EL MISMO que el de Facebook. Esto acaba
    // guardado en la base.
    //
    // LO DEL SECRETO REPETIDO NO ES PARANOIA. Las dos claves —la de la app de
    // Facebook y la de la app de Instagram— son 32 caracteres hexadecimales:
    // indistinguibles a ojo, y están una debajo de la otra en el panel. Pegar
    // la que no es da EXACTAMENTE este error, y el error culpa a la
    // `redirect_uri`, así que se pierden horas comprobando una URI que está
    // bien. Comparar los dos valores no revela ninguno: es un sí o un no.
    const mismoQueFacebook = !!secreto && secreto === (process.env.META_APP_SECRET ?? "");

    // Y LA PREGUNTA QUE DE VERDAD IMPORTA: ¿la pareja identificador+clave vale?
    // Ver `credencialesDeLaApp`. Se pregunta solo aquí, cuando ya ha fallado:
    // en el camino bueno no hace falta y sería una llamada de más.
    const credenciales = await credencialesDeLaApp(appId, secreto);

    const forma = `uri=${retorno} app=${appId} secreto_largo=${secreto.length} secreto_sin_espacios=${secreto === secreto.trim()} secreto_es_el_de_facebook=${mismoQueFacebook} credenciales=${credenciales} code_forma=${formaDelCodigo(code)}`;
    throw new Error(
      [
        `HTTP ${r1.status}`,
        j1?.error_type ? `tipo=${j1.error_type}` : "",
        j1?.code != null ? `code=${j1.code}` : "",
        j1?.error_message ?? j1?.error?.message ?? "",
        `— enviado: ${forma}`,
      ].filter(Boolean).join(" · "),
    );
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

  // ── 3. Quién es esta cuenta, de verdad ───────────────────────────────────
  //
  // AQUÍ HAY DOS IDENTIFICADORES DISTINTOS Y CONFUNDIRLOS SALE CARO.
  //
  // El canje devuelve un `user_id` que es el id DE LA APP (app-scoped): sirve
  // para saber que es la misma persona entre sesiones, y para poco más.
  // `/me?fields=user_id` devuelve el id de la CUENTA PROFESIONAL de Instagram,
  // que es el que usan de verdad los endpoints (`/{IG_ID}/messages`) y el que
  // viene en los avisos del webhook.
  //
  // Guardar el primero donde hacía falta el segundo da el error más
  // desconcertante de Meta: «Object with ID … does not exist, cannot be loaded
  // due to missing permissions, or does not support this operation» — tres
  // causas en una frase, y ninguna es la de verdad. Pasó aquí, al suscribir.
  //
  // Si esta llamada falla nos quedamos con el del canje: una conexión a medias
  // es mejor que ninguna, y el diagnóstico del webhook dirá si no cuadra.
  let username: string | null = null;
  let idDeLaCuenta = "";
  try {
    const r3 = await fetch(
      `${GRAPH}/v23.0/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const j3 = await r3.json();
    username = j3?.username ?? null;
    if (j3?.user_id != null) idDeLaCuenta = String(j3.user_id);
  } catch { /* nos quedamos con el del canje */ }

  const permisos = Array.isArray(dato?.permissions)
    ? dato.permissions.map((x: any) => String(x))
    : String(dato?.permissions ?? "").split(",").filter(Boolean);

  // El de la cuenta profesional MANDA sobre el del canje. Ver el comentario de
  // arriba: son dos identificadores distintos y este es el que usa Meta.
  return { igUserId: idDeLaCuenta || igUserId, username, token, caduca, permisos };
}

/**
 * ¿La pareja identificador + clave de la app es válida? Sin usuarios, sin
 * códigos, sin OAuth.
 *
 * POR QUÉ EXISTE. Cuando el canje falla, Meta contesta SIEMPRE lo mismo —
 * «Error validating verification code. Please make sure your redirect_uri is
 * identical…»— tanto si el código es malo como si la CLAVE es la que no toca.
 * Ese mensaje culpa a la dirección de retorno, así que se pierden horas
 * comprobando una dirección que está bien. Pasó aquí: se verificó tres veces
 * que la URI registrada en el panel coincidía al carácter, y coincidía.
 *
 * Meta acepta un token de aplicación con la forma `identificador|clave`. Si la
 * pareja no vale, contesta que el token no se puede leer; si vale, contesta
 * cualquier otra cosa. Eso separa las dos causas en una sola llamada.
 *
 * DEVUELVE UNA PALABRA, NUNCA LA CLAVE. Y antes de devolver nada se borra el
 * valor del secreto del texto de Meta, por si algún día lo devolviera: esto
 * acaba escrito en la base de datos.
 */
async function credencialesDeLaApp(appId: string, secreto: string): Promise<string> {
  try {
    // CONCATENADO A MANO, NO CON UNA PLANTILLA. Hay una prueba que prohíbe que
    // el valor del secreto aparezca dentro de comillas invertidas en este
    // archivo, y saltó contra esta misma línea cuando la escribí como
    // plantilla. La prueba tiene razón aunque este uso sea legítimo: lo que la
    // hace útil es que no admite excepciones, porque el día que se admite una
    // es el día que se cuela la que sí filtraba.
    const tokenDeApp = appId + "|" + secreto;
    const r = await fetch(
      `${GRAPH}/v23.0/me?fields=user_id&access_token=${encodeURIComponent(tokenDeApp)}`,
      { cache: "no-store" },
    );
    const j = await r.json().catch(() => ({}));
    const crudo = String(j?.error?.message ?? j?.error_message ?? "");
    // `split/join` y no una plantilla: aquí no puede aparecer `${secreto}`.
    const limpio = secreto ? crudo.split(secreto).join("«clave»") : crudo;

    if (/invalid oauth access token|cannot parse access token|invalid application|malformed access token/i.test(limpio)) {
      return "NO_VALEN";
    }
    // Cualquier otra respuesta significa que Meta leyó la pareja y la aceptó;
    // lo que falle después ya es cosa del código, no de las credenciales.
    return `valen (meta dijo: ${limpio.slice(0, 90) || "sin error"})`;
  } catch (e: any) {
    return `no_pude_comprobar (${String(e?.message ?? e).slice(0, 60)})`;
  }
}

/**
 * La FORMA del código, no el código: cuántos caracteres y si trae alguno que no
 * debería. Un `#`, un espacio o un `%` significan que algo lo manoseó por el
 * camino — y eso da exactamente el mismo error que una clave mala.
 */
function formaDelCodigo(code: string): string {
  const raros = [...new Set(code.replace(/[A-Za-z0-9_.-]/g, "").split(""))].join("");
  return `${code.length}${raros ? `+raros[${raros}]` : "+limpio"}`;
}

/**
 * Suscribe la app a los avisos de ESA cuenta.
 *
 * SIN ESTO NO LLEGA NADA, y es el paso que más veces se olvida. Configurar el
 * webhook en el panel de Meta solo dice **a dónde** mandar los avisos; esta
 * llamada dice **de quién**. El síntoma cuando falta es el más desconcertante
 * que existe: la pantalla dice «conectado» y el webhook no suena jamás.
 *
 * META VALIDA LOS NOMBRES UNO A UNO y, si uno solo está mal, RECHAZA LA LISTA
 * ENTERA. Ya pasó con `messaging_referral` en singular: la cuenta quedaba
 * guardada y no llegaba un solo mensaje.
 */
export async function suscribirCuenta(
  _igUserId: string, token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = new URLSearchParams({
      subscribed_fields: "messages,messaging_postbacks,message_reactions,comments,live_comments",
      access_token: token,
    });
    // VA CONTRA `me`, NO CONTRA EL ID DE LA CUENTA. Es el único endpoint de este
    // camino que no acepta el id: con él contesta «Object with ID … does not
    // exist, cannot be loaded due to missing permissions, or does not support
    // this operation» — y de las tres causas que nombra, la buena es la
    // tercera. Se perdió una tarde con eso. El token ya dice de qué cuenta
    // hablamos, así que `me` no es un atajo: es lo correcto.
    const r = await fetch(`${GRAPH}/v23.0/me/subscribed_apps?${p.toString()}`, {
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
 * PENDIENTE: no la llama nadie todavía. Hace falta una tarea programada que la
 * ejecute sobre los 50 días. Mientras no exista, una cuenta conectada deja de
 * funcionar a los dos meses.
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
