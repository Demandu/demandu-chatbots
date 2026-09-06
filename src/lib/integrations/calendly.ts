import "server-only";
import crypto from "crypto";

/**
 * Calendly: conectar, ver huecos, agendar y enterarse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO PUEDE EXISTIR HOY Y NO EL AÑO PASADO. Hasta octubre de 2025 la
 * API de Calendly era de solo lectura: se podían leer los tipos de evento y los
 * huecos, pero NO agendar — la reserva tenía que hacerla la persona en la
 * página de Calendly. Con la API de agendamiento (`POST /invitees`) ya se puede
 * reservar desde el chat, que es la diferencia entre «te mando un enlace» y «te
 * agendo la cita».
 *
 * ── LAS TRES COSAS QUE HAY QUE HACER BIEN ─────────────────────────────────
 *
 * 1. PKCE ES OBLIGATORIO. Calendly lo exige para TODAS las aplicaciones, no
 *    solo para las móviles. Sin `code_challenge` la autorización se rechaza.
 *
 * 2. EL REFRESH TOKEN ROTA EN CADA USO, y el anterior queda revocado al
 *    instante. Esto no es un detalle: es la diferencia entre una conexión que
 *    dura y una que se cae sola a los dos días. Ver `tokenValido`.
 *
 * 3. LA API DE AGENDAR PIDE PLAN DE PAGO en Calendly. Quien esté en el gratis
 *    puede leer sus huecos pero no reservar por API. En vez de dejarlo sin
 *    servicio, se detecta y el bloque manda su enlace. Ver `necesitaPlanDePago`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const AUTORIZAR = "https://auth.calendly.com/oauth/authorize";
export const TOKEN = "https://auth.calendly.com/oauth/token";
export const API = "https://api.calendly.com";

/** Lo mínimo para leer tipos de evento, agendar y suscribir avisos. */
export const PERMISOS = ["default"];

/* ── PKCE ──────────────────────────────────────────────────────────────────── */

/**
 * El par de PKCE.
 *
 * SE GUARDA EL VERIFICADOR EN UNA COOKIE, no en la base: vive noventa segundos
 * y pertenece a ESE navegador. Meterlo en una tabla obligaría a limpiarla y a
 * decidir qué pasa si alguien empieza dos conexiones a la vez.
 *
 * `base64url` sin relleno es lo que pide el estándar; con `+`, `/` o `=` el
 * reto no cuadra y Calendly rechaza el intercambio con un error que no explica
 * nada.
 */
export function nuevoVerificador(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function retoDe(verificador: string): string {
  return crypto.createHash("sha256").update(verificador).digest("base64url");
}

/** La dirección a la que se manda al cliente para que autorice. */
export function urlDeAutorizacion(d: {
  clientId: string;
  redirect: string;
  state: string;
  reto: string;
}): string {
  const u = new URL(AUTORIZAR);
  u.searchParams.set("client_id", d.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", d.redirect);
  u.searchParams.set("state", d.state);
  u.searchParams.set("code_challenge", d.reto);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/* ── Tokens ────────────────────────────────────────────────────────────────── */

export type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  owner?: string;
  organization?: string;
};

async function pedirToken(cuerpo: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(cuerpo).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    // EL CÓDIGO DE ERROR VIAJA EN EL MENSAJE porque arriba hay que distinguir
    // «hay que volver a conectar» de «Calendly tuvo un mal minuto», y son dos
    // arreglos completamente distintos.
    throw new Error(`${j?.error ?? res.status}: ${j?.error_description ?? "Calendly rechazó el token"}`);
  }
  return j as Tokens;
}

export function intercambiarCodigo(d: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirect: string;
  verificador: string;
}): Promise<Tokens> {
  return pedirToken({
    grant_type: "authorization_code",
    client_id: d.clientId,
    client_secret: d.clientSecret,
    code: d.code,
    redirect_uri: d.redirect,
    code_verifier: d.verificador,
  });
}

/** ¿Este fallo significa «hay que volver a conectar»? */
export function hayQueReconectar(e: unknown): boolean {
  return /invalid_grant|invalid_token|unauthorized/i.test(String((e as Error)?.message ?? e));
}

/**
 * Un access token que sirve, refrescándolo si hace falta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AQUÍ ESTÁ TODO EL CUIDADO DE ESTE ARCHIVO, y es por la rotación.
 *
 * Calendly REVOCA el refresh token en cuanto lo usas y te da uno nuevo. Eso
 * abre una carrera que no existe con Google: si dos peticiones refrescan a la
 * vez —el motor contestando un mensaje y el panel abriendo una pantalla— una
 * gana, la otra usa un token ya revocado, recibe `invalid_grant`, y si eso se
 * tomara como «la conexión murió», el cliente se quedaría desconectado sin
 * haber hecho nada.
 *
 * Lo que se hace:
 *
 * 1. Se refresca solo si de verdad falta poco (dos minutos de margen).
 * 2. Se GUARDA EL TOKEN NUEVO ANTES DE DEVOLVERLO. Si el proceso se cae entre
 *    refrescar y guardar, el refresh token nuevo se pierde y la conexión queda
 *    rota de verdad. Guardar primero es lo que hace que el peor caso sea «una
 *    llamada falla» y no «hay que reconectar a mano».
 * 3. Si el refresco falla con `invalid_grant`, SE VUELVE A LEER LA FILA antes
 *    de rendirse: casi siempre otra petición ya rotó y dejó un token bueno.
 *    Solo si tampoco eso sirve se marca la conexión como caída.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function tokenValido(orgId: string): Promise<string | null> {
  // EL CLIENTE DE SUPABASE SE PIDE AQUÍ DENTRO, no arriba del archivo. Todo lo
  // demás de este módulo es puro —PKCE, la ventana de días, la firma— y eso es
  // lo que se prueba. Un `import` arriba obligaría a tener `node_modules` al
  // día para poder importar el archivo, y unas pruebas que necesitan instalar
  // media plataforma para correr son unas pruebas que dejan de correrse.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const sb = createAdminClient();

  const leer = async () => {
    const { data } = await sb
      .from("integrations")
      .select("access_token, refresh_token, token_expiry")
      .eq("org_id", orgId)
      .eq("provider", "calendly")
      .maybeSingle();
    return data as
      | { access_token: string | null; refresh_token: string | null; token_expiry: string | null }
      | null;
  };

  const fila = await leer();
  if (!fila?.access_token) return null;

  const caduca = fila.token_expiry ? Date.parse(fila.token_expiry) : 0;
  const MARGEN = 120_000;
  if (caduca - Date.now() > MARGEN) return fila.access_token;

  if (!fila.refresh_token) return fila.access_token;

  const id = process.env.CALENDLY_CLIENT_ID ?? "";
  const secreto = process.env.CALENDLY_CLIENT_SECRET ?? "";
  if (!id || !secreto) return fila.access_token;

  try {
    const t = await pedirToken({
      grant_type: "refresh_token",
      client_id: id,
      client_secret: secreto,
      refresh_token: fila.refresh_token,
    });

    await sb
      .from("integrations")
      .update({
        access_token: t.access_token,
        // EL NUEVO REFRESH TOKEN SE GUARDA SIEMPRE. El anterior ya está muerto:
        // no guardarlo deja la conexión sin forma de renovarse nunca más.
        refresh_token: t.refresh_token ?? fila.refresh_token,
        token_expiry: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("provider", "calendly");

    return t.access_token;
  } catch (e) {
    if (hayQueReconectar(e)) {
      // OTRA PETICIÓN PUDO GANAR LA CARRERA. Se vuelve a leer: si ya hay un
      // token fresco, esto no fue un fallo, fue una coincidencia.
      const otra = await leer();
      const otraCaduca = otra?.token_expiry ? Date.parse(otra.token_expiry) : 0;
      if (otra?.access_token && otraCaduca - Date.now() > 0) return otra.access_token;
    }
    console.error("[calendly] no pude refrescar el token:", (e as Error)?.message);
    return null;
  }
}

/* ── La API ────────────────────────────────────────────────────────────────── */

async function get(token: string, ruta: string): Promise<any> {
  const res = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${j?.message ?? j?.title ?? "Calendly no contestó bien"}`);
  return j;
}

/** Quién es el dueño de esta conexión. */
export async function quienSoy(token: string): Promise<{
  uri: string; nombre: string; correo: string; organizacion: string; agenda: string;
}> {
  const j = await get(token, "/users/me");
  const r = j?.resource ?? {};
  return {
    uri: String(r.uri ?? ""),
    nombre: String(r.name ?? ""),
    correo: String(r.email ?? ""),
    organizacion: String(r.current_organization ?? ""),
    // La página pública del usuario: es el enlace de respaldo para quien esté
    // en el plan gratis y no pueda agendar por API.
    agenda: String(r.scheduling_url ?? ""),
  };
}

export type TipoDeEvento = {
  uri: string;
  nombre: string;
  duracion: number;
  activo: boolean;
  enlace: string;
};

export async function tiposDeEvento(token: string, usuarioUri: string): Promise<TipoDeEvento[]> {
  const j = await get(token, `/event_types?user=${encodeURIComponent(usuarioUri)}&count=100`);
  return ((j?.collection ?? []) as any[])
    .map((e) => ({
      uri: String(e.uri ?? ""),
      nombre: String(e.name ?? ""),
      duracion: Number(e.duration) || 30,
      activo: e.active !== false,
      enlace: String(e.scheduling_url ?? ""),
    }))
    .filter((e) => e.uri && e.nombre);
}

/**
 * Cuántos días se pueden pedir de una vez.
 *
 * TREINTA Y UNO ES EL TOPE DE CALENDLY y no avisa bonito: rechaza la consulta
 * entera. Se recorta aquí, en el único sitio por el que pasan todas las
 * peticiones de huecos, en vez de confiar en que cada sitio que llame se
 * acuerde.
 */
export const MAX_DIAS = 31;

export function ventanaDeBusqueda(desde: Date, dias: number): { inicio: string; fin: string } {
  // «NO ME DIJERON» Y «ME DIJERON CERO» NO SON LO MISMO, y escribirlo como
  // `Math.floor(dias) || 7` los mezclaba: sin dato daba 7 —bien— pero un 0
  // explícito TAMBIÉN daba 7, mientras que un -5 daba 1. Dos caminos para el
  // mismo disparate, con resultados distintos.
  //
  // Sin dato usable, una semana. Con dato, se respeta lo que pidieron dentro
  // de lo que Calendly acepta.
  const pedidos = Math.floor(Number(dias));
  const d = Number.isFinite(pedidos) ? Math.min(Math.max(1, pedidos), MAX_DIAS) : 7;
  // Calendly rechaza un `start_time` en el pasado. Se pide desde dentro de un
  // minuto para que el reloj de su lado no lo considere ya pasado.
  const inicio = new Date(Math.max(desde.getTime(), Date.now()) + 60_000);
  return {
    inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + d * 86_400_000).toISOString(),
  };
}

export async function horariosDisponibles(
  token: string,
  eventTypeUri: string,
  desde: Date,
  dias: number,
): Promise<string[]> {
  const { inicio, fin } = ventanaDeBusqueda(desde, dias);
  const j = await get(
    token,
    `/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}` +
      `&start_time=${encodeURIComponent(inicio)}&end_time=${encodeURIComponent(fin)}`,
  );
  return ((j?.collection ?? []) as any[])
    .filter((s) => s?.status === "available" || s?.status === undefined)
    .map((s) => String(s.start_time ?? ""))
    .filter(Boolean);
}

/**
 * ¿Este fallo es «tu Calendly es del plan gratis»?
 *
 * SE MIRA EL TEXTO PORQUE NO HAY UN CÓDIGO LIMPIO. Calendly contesta 403 con
 * un mensaje sobre el plan, y 403 también significa otras cosas. Distinguirlo
 * importa: con el plan gratis el bloque manda el enlace y la cita se hace
 * igual; con cualquier otro 403 hay algo que arreglar y hay que decirlo.
 */
export function necesitaPlanDePago(mensaje: string): boolean {
  return /paid plan|upgrade|subscription|not.*available.*plan|plan.*required/i.test(mensaje);
}

export type Reservado =
  | { ok: true; uri: string; enlaceCancelar: string; enlaceCambiar: string }
  | { ok: false; error: string; planGratis: boolean };

/**
 * Agenda de verdad.
 *
 * EL CORREO ES OBLIGATORIO PARA CALENDLY, y esa es la diferencia práctica más
 * grande con Google: allá el invitado es opcional. Un flujo que agende con
 * Calendly TIENE que haber capturado el correo antes; si no, esto falla y hay
 * que decirlo con esas palabras, no con el error de Calendly.
 */
export async function reservar(
  token: string,
  d: {
    eventTypeUri: string;
    inicioISO: string;
    nombre: string;
    correo: string;
    zona: string;
    respuestas?: { question: string; answer: string }[];
  },
): Promise<Reservado> {
  if (!d.correo?.trim()) {
    return {
      ok: false,
      planGratis: false,
      error: "Calendly necesita el correo de quien agenda. Pídelo antes en el flujo.",
    };
  }

  try {
    const res = await fetch(`${API}/invitees`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: d.eventTypeUri,
        // CON LA Z AL FINAL Y EN UTC: Calendly rechaza cualquier otra forma.
        start_time: new Date(d.inicioISO).toISOString().replace(/\.\d{3}Z$/, "Z"),
        invitee: {
          name: d.nombre || "Cliente",
          email: d.correo.trim(),
          // La zona tiene que ser IANA («America/Panama»), no un desfase.
          timezone: d.zona || "America/Panama",
        },
        ...(d.respuestas?.length ? { questions_and_answers: d.respuestas } : {}),
      }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(j?.message ?? j?.title ?? `Calendly respondió ${res.status}`);
      return { ok: false, planGratis: res.status === 403 && necesitaPlanDePago(msg), error: msg };
    }

    const r = j?.resource ?? {};
    return {
      ok: true,
      uri: String(r.uri ?? ""),
      enlaceCancelar: String(r.cancel_url ?? ""),
      enlaceCambiar: String(r.reschedule_url ?? ""),
    };
  } catch (e: any) {
    return { ok: false, planGratis: false, error: e?.message ?? "No se pudo conectar con Calendly." };
  }
}

/* ── Avisos de Calendly hacia nosotros ─────────────────────────────────────── */

/** Ventana de tolerancia del reloj. Fuera de esto, el aviso se rechaza. */
export const TOLERANCIA_SEG = 180;

/**
 * ¿Este aviso lo mandó Calendly de verdad?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE FIRMA `timestamp.cuerpo`, con los BYTES EXACTOS que llegaron. Volver a
 * serializar el JSON cambia un espacio y la firma deja de cuadrar — el mismo
 * cuidado que ya lleva el webhook de Meta.
 *
 * Y FALLA CERRADO: sin clave, sin cabecera o con el reloj corrido, se rechaza.
 * Lo contrario deja a cualquiera metiendo citas falsas en la Bandeja de
 * cualquier cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function firmaValida(cuerpo: string, cabecera: string | null, clave: string): boolean {
  if (!clave || !cabecera) return false;

  const partes = Object.fromEntries(
    cabecera.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = partes.t;
  const v1 = partes.v1;
  if (!t || !v1) return false;

  const segundos = Number(t);
  if (!Number.isFinite(segundos)) return false;
  if (Math.abs(Date.now() / 1000 - segundos) > TOLERANCIA_SEG) return false;

  const esperada = crypto.createHmac("sha256", clave).update(`${t}.${cuerpo}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(v1));
  } catch {
    // Longitudes distintas: `timingSafeEqual` lanza en vez de devolver false.
    return false;
  }
}

/** Los avisos que nos interesan. Los demás se ignoran sin ruido. */
export const EVENTOS = ["invitee.created", "invitee.canceled"];

/**
 * Se suscribe a los avisos de esa organización.
 *
 * SE HACE AL CONECTAR, no la primera vez que haga falta: una cita agendada
 * desde el enlace de Instagram tiene que entrar igual que una del chat, y para
 * eso la suscripción tiene que existir desde el minuto uno.
 *
 * DEVUELVE LA CLAVE DE FIRMA, que es lo único con lo que después se puede
 * comprobar que un aviso es de verdad. Si se pierde, hay que volver a
 * suscribirse.
 */
export async function suscribirse(
  token: string,
  d: { organizacion: string; url: string; clave: string },
): Promise<{ ok: boolean; uri?: string; error?: string }> {
  try {
    const res = await fetch(`${API}/webhook_subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: d.url,
        events: EVENTOS,
        organization: d.organizacion,
        scope: "organization",
        signing_key: d.clave,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      // ── «YA EXISTE» ES UN ERROR AQUÍ, Y DE LOS MALOS ──────────────────
      //
      // La tentación es darlo por bueno: la suscripción existe, los avisos
      // llegan. Pero la que existe se creó con OTRA clave de firma —la de la
      // conexión anterior— y la que se acaba de guardar es nueva. Cada aviso
      // llegaría con una firma que no cuadra, `firmaValida` lo rechazaría, y
      // como rechazar es lo correcto NADIE SE ENTERA: las citas dejan de
      // entrar a la Bandeja y no hay ni un error a la vista.
      //
      // Por eso `limpiarSuscripciones` corre ANTES de suscribir. Si aun así
      // llega hasta aquí, se dice.
      const msg = String(j?.message ?? j?.title ?? `Calendly respondió ${res.status}`);
      return { ok: false, error: msg };
    }
    return { ok: true, uri: String(j?.resource?.uri ?? "") };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "No se pudo suscribir a los avisos." };
  }
}

/**
 * Borra las suscripciones que apuntan a nuestra dirección.
 *
 * Corre en dos momentos y por dos motivos distintos:
 *
 * — AL CONECTAR, antes de suscribir: si quedaba una de una conexión anterior,
 *   tiene una clave de firma vieja y envenenaría todos los avisos (ver arriba).
 *
 * — AL DESCONECTAR: quien desconecta espera que dejemos de recibir sus citas.
 *   Sin esto Calendly nos seguiría avisando de cada cita de esa empresa para
 *   siempre, y la única defensa sería que ya no sabemos comprobar la firma.
 *   «No sé leerlo» no es lo mismo que «no me lo mandes».
 *
 * Es best-effort a propósito: ni conectar ni desconectar pueden quedarse a
 * medias porque Calendly no conteste.
 */
export async function limpiarSuscripciones(
  token: string,
  d: { organizacion: string; url: string },
): Promise<number> {
  try {
    const q = new URLSearchParams({
      organization: d.organizacion,
      scope: "organization",
      count: "100",
    });
    const res = await fetch(`${API}/webhook_subscriptions?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 0;
    const j = await res.json().catch(() => ({}));
    const mias = (Array.isArray(j?.collection) ? j.collection : []).filter(
      (s: any) => String(s?.callback_url ?? "") === d.url,
    );
    let borradas = 0;
    for (const s of mias) {
      const uri = String(s?.uri ?? "");
      if (!uri) continue;
      const r = await fetch(uri, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) borradas++;
    }
    return borradas;
  } catch {
    return 0;
  }
}

/**
 * Revoca el token en Calendly al desconectar.
 *
 * Borrar la fila de nuestra base deja de darnos acceso a nosotros; revocar se
 * lo quita al token, que es lo que el cliente cree que está haciendo cuando
 * pulsa «Desconectar». Best-effort: la fila se borra igual.
 */
export async function revocar(clientId: string, clientSecret: string, token: string): Promise<void> {
  try {
    await fetch("https://auth.calendly.com/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token }),
    });
  } catch {
    /* best-effort */
  }
}

/** Una clave de firma nueva. Se guarda con la conexión y no sale de ahí. */
export function nuevaClaveDeFirma(): string {
  return crypto.randomBytes(32).toString("hex");
}
