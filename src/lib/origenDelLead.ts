/**
 * DE QUÉ PUBLICIDAD LLEGÓ ESTA PERSONA.
 *
 * Casi todos los clientes de nuestros clientes llegan pagando: un anuncio de
 * «click to WhatsApp», un anuncio que abre el DM de Instagram, una campaña de
 * Google que cae en la web y abre el chat. Quien paga esos anuncios hace una
 * sola pregunta —«¿cuál de ellos trae gente que compra?»— y sin el dato pegado
 * al lead no hay forma de contestarla.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE ────────────────────────────────────────────
 *
 * WhatsApp ya lo tenía resuelto dentro del motor: Meta manda un `referral` en
 * el webhook y el motor lo guarda con `guardar_origen`. Pero el chat web no
 * capturaba NADA (ni un `utm_` en todo el proyecto) e Instagram tiraba a la
 * basura el `referral` de los anuncios que abren el DM.
 *
 * Son tres canales con tres formas distintas de decir lo mismo. Si cada uno se
 * lo arma como quiere, la ficha del lead acaba pintando tres cosas distintas y
 * el informe por campaña no suma. Así que la forma del dato se decide AQUÍ,
 * una vez, y aquí se prueba.
 *
 * LA REGLA DE QUÉ SE PISA Y QUÉ NO **NO ESTÁ AQUÍ**: vive en la base, en
 * `guardar_origen` (migración 0065), porque hay dos motores en dos runtimes y
 * esa regla no puede divergir. El primer toque del contacto no se sobrescribe
 * nunca; el de la conversación sí.
 */

/** Los `utm_` de siempre. Son los que manda cualquier gestor de anuncios. */
export const CLAVES_UTM = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
] as const;

/**
 * Los identificadores de clic que cada plataforma cuelga de la URL.
 *
 * VALEN AUNQUE NO HAYA NI UN `utm_`, y por un motivo muy concreto: Google Ads
 * con «etiquetado automático» añade `gclid` y NADA más. Un cliente que no
 * configuró sus UTMs a mano —la mayoría— se quedaría sin atribución si solo
 * mirásemos los `utm_`.
 */
export const CLAVES_CLIC = [
  "gclid", "wbraid", "gbraid", "fbclid", "ttclid", "msclkid", "li_fat_id", "twclid",
] as const;

/** Un medio así lo escribe quien está pagando por el clic. */
const MEDIOS_PAGADOS = /^(cpc|ppc|paid|cpm|cpv|ads?|paid[_-]?social|display|retargeting|remarketing)$/i;

export type OrigenDelLead = {
  /** `ad`, `post`, `comentario`, `campana`, `referido`, `enlace`… */
  tipo: string;
  anuncio_id?: string | null;
  titular?: string | null;
  cuerpo?: string | null;
  /** La URL del anuncio, o la página donde abrió el chat. */
  url?: string | null;
  /** `google`, `meta`, `tiktok`… para poder agrupar el informe. */
  plataforma?: string | null;
  /** Por dónde entró: `whatsapp`, `instagram`, `webchat`. */
  canal?: string | null;
  utm?: Record<string, string> | null;
  clic?: Record<string, string> | null;
  /** Qué sitio lo mandó, cuando lo dice el navegador. */
  referente?: string | null;
  visto_en?: string | null;
  [otros: string]: unknown;
};

const texto = (v: unknown): string => String(v ?? "").trim();

/**
 * Los parámetros de una URL, en minúsculas y sin los vacíos.
 *
 * NO REVIENTA CON UNA URL MAL FORMADA. Lo que llega aquí lo escribió el
 * navegador de un visitante en la web de un cliente: puede llegar cortado, con
 * espacios o siendo cualquier cosa. Un fallo aquí dejaría al visitante sin
 * chat, que es infinitamente peor que quedarse sin saber de qué anuncio vino.
 */
export function parametrosDe(url: unknown): Record<string, string> | null {
  const crudo = texto(url);
  if (!crudo) return null;

  let busca: URLSearchParams;
  try {
    busca = new URL(crudo).searchParams;
  } catch {
    // Sin host no es una URL para `new URL`, pero `/landing?utm_source=x` sí
    // trae lo que buscamos. Se le pone una base de usar y tirar.
    try {
      busca = new URL(crudo, "https://origen.invalido").searchParams;
    } catch {
      return null;
    }
  }

  const fuera: Record<string, string> = {};
  busca.forEach((valor, clave) => {
    const k = texto(clave).toLowerCase();
    const v = texto(valor);
    // El primero gana: `?utm_source=a&utm_source=b` es un enlace mal armado, y
    // quedarse con el último sería quedarse con el que menos se escribió.
    if (k && v && !(k in fuera)) fuera[k] = v.slice(0, 300);
  });
  return Object.keys(fuera).length ? fuera : null;
}

function soloEstas(params: Record<string, string> | null, claves: readonly string[]) {
  if (!params) return null;
  const fuera: Record<string, string> = {};
  for (const k of claves) if (params[k]) fuera[k] = params[k];
  return Object.keys(fuera).length ? fuera : null;
}

/** Los `utm_` de una URL, o nada si no trae ninguno. */
export function utmsDeLaUrl(url: unknown): Record<string, string> | null {
  return soloEstas(parametrosDe(url), CLAVES_UTM);
}

/** Los identificadores de clic de una URL, o nada. */
export function clicsDeLaUrl(url: unknown): Record<string, string> | null {
  return soloEstas(parametrosDe(url), CLAVES_CLIC);
}

/** El host de una URL, sin `www.` y en minúsculas. Vacío si no se puede leer. */
export function sitioDe(url: unknown): string {
  const crudo = texto(url);
  if (!crudo) return "";
  try {
    return new URL(crudo).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const POR_SITIO: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)(facebook|instagram|fb|messenger)\.com$/, "meta"],
  [/(^|\.)(tiktok)\.com$/, "tiktok"],
  [/(^|\.)(bing)\.com$/, "bing"],
  [/(^|\.)(linkedin|lnkd)\.(com|in)$/, "linkedin"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "x"],
];

const POR_FUENTE: [RegExp, string][] = [
  [/^(google|adwords|google[_-]?ads|gads|g)$/i, "google"],
  [/^(facebook|fb|ig|instagram|meta|fb[_-]?ads|meta[_-]?ads)$/i, "meta"],
  [/^(tiktok|tt|tiktok[_-]?ads)$/i, "tiktok"],
  [/^(bing|microsoft|msn)$/i, "bing"],
  [/^(linkedin|li)$/i, "linkedin"],
  [/^(youtube|yt)$/i, "youtube"],
  [/^(x|twitter)$/i, "x"],
];

/**
 * En qué plataforma se pagó este clic.
 *
 * El identificador de clic manda sobre el `utm_source` a propósito: lo pone la
 * plataforma y no se puede escribir mal. El `utm_source` lo escribe una persona
 * a mano y en los paneles reales está lleno de `Facebook`, `FB`, `fb-ads` y
 * `facebok`. Si no se reconoce ninguno se devuelve `enlace`: agrupar de menos
 * es honesto, inventarse la plataforma no.
 */
export function plataformaDeLaVisita(
  utm: Record<string, string> | null,
  clic: Record<string, string> | null,
  referente?: unknown,
): string {
  if (clic) {
    if (clic.gclid || clic.wbraid || clic.gbraid) return "google";
    if (clic.fbclid) return "meta";
    if (clic.ttclid) return "tiktok";
    if (clic.msclkid) return "bing";
    if (clic.li_fat_id) return "linkedin";
    if (clic.twclid) return "x";
  }

  const fuente = texto(utm?.utm_source);
  if (fuente) {
    for (const [patron, nombre] of POR_FUENTE) if (patron.test(fuente)) return nombre;
  }

  const sitio = sitioDe(referente);
  if (sitio) {
    for (const [patron, nombre] of POR_SITIO) if (patron.test(sitio)) return nombre;
  }

  return "enlace";
}

/**
 * El origen de alguien que abrió el chat de una página web.
 *
 * `pagina` es DÓNDE ESTABA CUANDO ENTRÓ AL SITIO, no donde pulsó el botón del
 * chat: los `utm_` viven en la página de aterrizaje y se pierden en el primer
 * clic interno. El widget la guarda al cargar, por eso.
 *
 * DEVUELVE NADA CUANDO NO HAY NADA QUE ATRIBUIR —ni UTMs, ni clic, ni un sitio
 * de fuera que lo mandara— y eso es deliberado: escribir «vino de la web» en la
 * ficha de todo el mundo llena la pantalla de una frase que no ayuda a decidir
 * nada, y encima pisaría el primer toque de verdad de quien ya lo tenía.
 */
export function origenDeLaWeb(
  pagina: unknown,
  referente?: unknown,
  ahora: Date = new Date(),
): OrigenDelLead | null {
  const url = texto(pagina).slice(0, 1000);
  const utm = utmsDeLaUrl(url);
  const clic = clicsDeLaUrl(url);
  const deFuera = texto(referente).slice(0, 500);
  const sitio = sitioDe(deFuera);

  // Navegar por el propio sitio del cliente no es llegar de ningún sitio.
  const mismoSitio = !!sitio && sitio === sitioDe(url);
  const referidoUtil = !!sitio && !mismoSitio;

  if (!utm && !clic && !referidoUtil) return null;

  const plataforma = plataformaDeLaVisita(utm, clic, deFuera);
  const campana = texto(utm?.utm_campaign);
  const medio = texto(utm?.utm_medium);
  const pagado = !!clic || MEDIOS_PAGADOS.test(medio);

  const tipo = !utm && !clic ? "referido" : pagado ? "ad" : "campana";
  const idDelClic = clic ? texto(Object.values(clic)[0]) : "";

  return {
    tipo,
    // Con qué se agrupa el informe. `utm_id` es el que pone el gestor de
    // anuncios y apunta al anuncio concreto; `utm_campaign` agrupa la campaña.
    anuncio_id: texto(utm?.utm_id) || campana || idDelClic || null,
    titular: campana || texto(utm?.utm_source) || sitio || null,
    url: url || null,
    plataforma,
    canal: "webchat",
    utm: utm ?? null,
    clic: clic ?? null,
    referente: referidoUtil ? deFuera : null,
    visto_en: ahora.toISOString(),
  };
}

/**
 * El origen de un anuncio de Instagram que abre el mensaje directo.
 *
 * Meta manda esto con DOS nombres según por dónde venga: `source_id` en el
 * `referral` de WhatsApp y `ad_id` en el de Instagram y Messenger. Se leen los
 * dos porque es el mismo dato y porque el día que Meta unifique los nombres
 * esto sigue funcionando.
 *
 * `ref` es el código que el propio cliente escribió al montar el anuncio. Vale
 * por sí solo: en los anuncios con «referencia» puede ser lo ÚNICO que llegue.
 */
export function origenDeAnuncioDeInstagram(
  referral: unknown,
  ahora: Date = new Date(),
): OrigenDelLead | null {
  if (!referral || typeof referral !== "object") return null;
  const r = referral as Record<string, any>;

  const anuncioId = texto(r.ad_id) || texto(r.source_id);
  const codigo = texto(r.ref);
  const contexto = (r.ads_context_data ?? {}) as Record<string, any>;
  const publicacion = texto(contexto.post_id);

  // Sin anuncio, sin código y sin publicación no hay campaña que atribuir.
  if (!anuncioId && !codigo && !publicacion) return null;

  return {
    tipo: anuncioId ? "ad" : "post",
    anuncio_id: anuncioId || codigo || publicacion || null,
    titular: texto(contexto.ad_title) || texto(r.headline) || codigo || null,
    cuerpo: texto(r.body) || null,
    url: texto(r.source_url) || null,
    plataforma: "meta",
    canal: "instagram",
    imagen: texto(contexto.photo_url) || texto(contexto.video_url) || null,
    codigo: codigo || null,
    publicacion: publicacion || null,
    visto_en: ahora.toISOString(),
    crudo: r,
  };
}

const REDES: Record<string, string> = {
  google: "Google", meta: "Meta", tiktok: "TikTok", bing: "Bing",
  linkedin: "LinkedIn", youtube: "YouTube", x: "X", enlace: "",
};

const TIPOS: Record<string, string> = {
  ad: "Anuncio", anuncio: "Anuncio", post: "Publicación", comentario: "Comentario",
  comentario_vivo: "Comentario en directo", campana: "Campaña", referido: "Visita referida",
  enlace: "Enlace", dm: "Mensaje directo", mencion: "Mención", respuesta_historia: "Respuesta a una historia",
};

/** Cómo se llama la red donde se vio: «Instagram», «Google»… */
export function redDelOrigen(origen: OrigenDelLead | null | undefined): string {
  if (!origen) return "";
  // Meta no dice si el anuncio se vio en Facebook o en Instagram, pero si el
  // lead entró por Instagram lo honesto es decir Instagram: es lo que ve él.
  if (texto(origen.plataforma) === "meta" && texto(origen.canal) === "instagram") return "Instagram";
  return REDES[texto(origen.plataforma).toLowerCase()] ?? "";
}

/** «Anuncio de Instagram», «Campaña de Google», «Publicación». */
export function comoSeLlamaElOrigen(origen: OrigenDelLead | null | undefined): string {
  if (!origen) return "";
  const que = TIPOS[texto(origen.tipo).toLowerCase()] ?? "Anuncio";
  const red = redDelOrigen(origen);
  return red ? `${que} de ${red}` : que;
}

const NOMBRE_DEL_CLIC: Record<string, string> = {
  gclid: "Clic de Google", wbraid: "Clic de Google", gbraid: "Clic de Google",
  fbclid: "Clic de Meta", ttclid: "Clic de TikTok", msclkid: "Clic de Bing",
  li_fat_id: "Clic de LinkedIn", twclid: "Clic de X", ctwa_clid: "Clic de WhatsApp",
};

const NOMBRE_DEL_UTM: Record<string, string> = {
  utm_campaign: "Campaña", utm_source: "Fuente", utm_medium: "Medio",
  utm_content: "Anuncio (contenido)", utm_term: "Palabra clave", utm_id: "Id de la campaña",
};

/**
 * Las filas que pinta la ficha del lead, ya decididas y en orden.
 *
 * SE DECIDE AQUÍ Y NO EN EL COMPONENTE para poder probarlo: lo que no se ve en
 * la ficha no se puede atribuir, y una fila que se cae en silencio no la caza
 * nadie mirando la pantalla.
 *
 * No se repite lo que ya está arriba en grande: si el titular ES la campaña, la
 * fila «Campaña» no se pinta otra vez.
 */
export function lineasDelOrigen(
  origen: OrigenDelLead | null | undefined,
): { etiqueta: string; valor: string }[] {
  if (!origen) return [];

  const fuera: { etiqueta: string; valor: string }[] = [];
  const titular = texto(origen.titular);
  const vistos = new Set<string>([titular.toLowerCase()]);

  const poner = (etiqueta: string, valor: unknown) => {
    const v = texto(valor);
    if (!v || vistos.has(v.toLowerCase())) return;
    vistos.add(v.toLowerCase());
    fuera.push({ etiqueta, valor: v });
  };

  poner("Identificador", origen.anuncio_id);

  const utm = (origen.utm ?? {}) as Record<string, string>;
  for (const clave of CLAVES_UTM) poner(NOMBRE_DEL_UTM[clave] ?? clave, utm[clave]);

  const clic = { ...((origen.clic ?? {}) as Record<string, string>) };
  // El de WhatsApp no viaja en la URL: lo manda Meta en el webhook y vive
  // suelto en el origen. Se pinta igual, que para marketing es el mismo dato.
  if (texto(origen.ctwa_clid)) clic.ctwa_clid = texto(origen.ctwa_clid);
  for (const [clave, valor] of Object.entries(clic)) {
    poner(NOMBRE_DEL_CLIC[clave] ?? clave, valor);
  }

  poner("Publicación", origen.publicacion);
  poner("Página de entrada", origen.url);
  poner("Vino de", origen.referente);

  return fuera;
}

/**
 * ¿Son el mismo origen?
 *
 * La ficha pinta DOS: por dónde llegó la persona la primera vez y qué disparó
 * esta conversación. Casi siempre son el mismo, y pintarlo dos veces seguidas
 * haría que nadie se fijara el día que son distintos —que es justo el día que
 * importa, porque significa que el lead volvió por otra campaña.
 */
export function esElMismoOrigen(
  a: OrigenDelLead | null | undefined,
  b: OrigenDelLead | null | undefined,
): boolean {
  if (!a || !b) return false;
  const ida = texto(a.anuncio_id);
  const idb = texto(b.anuncio_id);
  if (ida || idb) return ida === idb;
  const ua = texto(a.url);
  const ub = texto(b.url);
  if (ua || ub) return ua === ub;
  return texto(a.titular) === texto(b.titular) && texto(a.tipo) === texto(b.tipo);
}
