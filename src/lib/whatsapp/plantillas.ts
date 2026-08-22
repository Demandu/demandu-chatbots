/**
 * Plantillas de WhatsApp: reglas de Meta en un solo sitio.
 *
 * QUÉ ES UNA PLANTILLA Y POR QUÉ IMPORTA: pasadas 24 horas desde el último
 * mensaje del cliente, WhatsApp NO deja escribirle texto libre. Solo deja
 * enviarle una plantilla aprobada por Meta. Por eso toda difusión, todo
 * recordatorio y todo seguimiento pasa por aquí.
 *
 * ESTE ARCHIVO ES LA ÚNICA VERDAD sobre los límites. La pantalla valida contra
 * él, la vista previa dibuja contra él y el envío a Meta se arma con él. Si
 * Meta cambia un límite, se cambia aquí y las tres cosas quedan al día.
 *
 * Los números salen de la documentación de Meta (Template components,
 * Template review, Authentication templates). Están escritos con nombre para
 * que se lean solos: TOPE.cuerpo, no un 1024 suelto.
 */

export const GRAPH = "https://graph.facebook.com/v20.0";

/* ─── Límites de Meta ─────────────────────────────────────────────────────── */

export const TOPE = {
  nombre: 512,
  encabezadoTexto: 60,
  cuerpo: 1024,
  pie: 60,
  botonTexto: 25,
  botonUrl: 2000,
  botonTelefono: 20,
  codigoOferta: 15,
  botones: 10,
  botonesUrl: 2,
  botonesTelefono: 1,
  botonesCodigo: 1,
  respuestasRapidas: 10,
  /** Minutos que Meta acepta para la caducidad de un código. */
  caducidadMin: 1,
  caducidadMax: 90,
} as const;

/* ─── Categorías ──────────────────────────────────────────────────────────── */

export type Categoria = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export const CATEGORIAS: { valor: Categoria; titulo: string; explica: string; ejemplo: string }[] = [
  {
    valor: "UTILITY",
    titulo: "Seguimiento",
    explica:
      "Le da al cliente información sobre algo que él ya hizo: su pedido, su cita, su pago, su envío. Es la más barata y la que Meta aprueba más rápido.",
    ejemplo: "Tu pedido #1234 va en camino y llega hoy entre 2 y 4 pm.",
  },
  {
    valor: "MARKETING",
    titulo: "Promoción",
    explica:
      "Ofertas, novedades, invitaciones, recordatorios de carrito. Todo lo que busque que el cliente compre o vuelva. Cuesta más y Meta la revisa con más lupa.",
    ejemplo: "¡Hola Ana! Esta semana tenemos 25% en toda la tienda con el código VERANO25.",
  },
  {
    valor: "AUTHENTICATION",
    titulo: "Código de verificación",
    explica:
      "Solo para mandar códigos de un solo uso. El texto lo escribe Meta, tú únicamente eliges los ajustes. No admite links, ni imágenes, ni emojis.",
    ejemplo: "123456 es tu código de verificación.",
  },
];

/* ─── Idiomas ─────────────────────────────────────────────────────────────── */

/**
 * Ojo: para Meta `es` y `es_MX` son DOS plantillas distintas. Si envías una en
 * `es_MX` y el cliente configuró `es`, el envío falla con "la plantilla no
 * existe en ese idioma". Por eso la lista es corta y ordenada por lo que de
 * verdad usan nuestros clientes, con el resto detrás.
 */
export const IDIOMAS: { codigo: string; nombre: string }[] = [
  { codigo: "es_MX", nombre: "Español (México)" },
  { codigo: "es", nombre: "Español" },
  { codigo: "es_AR", nombre: "Español (Argentina)" },
  { codigo: "es_ES", nombre: "Español (España)" },
  { codigo: "pt_BR", nombre: "Portugués (Brasil)" },
  { codigo: "en_US", nombre: "Inglés (EE. UU.)" },
  { codigo: "en_GB", nombre: "Inglés (Reino Unido)" },
  { codigo: "en", nombre: "Inglés" },
  { codigo: "fr", nombre: "Francés" },
  { codigo: "it", nombre: "Italiano" },
  { codigo: "de", nombre: "Alemán" },
  { codigo: "nl", nombre: "Neerlandés" },
  { codigo: "pt_PT", nombre: "Portugués (Portugal)" },
  { codigo: "ru", nombre: "Ruso" },
  { codigo: "ar", nombre: "Árabe" },
  { codigo: "hi", nombre: "Hindi" },
  { codigo: "id", nombre: "Indonesio" },
  { codigo: "ja", nombre: "Japonés" },
  { codigo: "ko", nombre: "Coreano" },
  { codigo: "zh_CN", nombre: "Chino (simplificado)" },
  { codigo: "tr", nombre: "Turco" },
];

/* ─── Forma de la plantilla dentro de Demandu ─────────────────────────────── */

export type FormatoEncabezado = "NINGUNO" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

export type TipoBoton = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE";

export type Boton = {
  tipo: TipoBoton;
  texto: string;
  /** URL: puede llevar UNA variable, y solo al final. */
  url?: string;
  ejemploUrl?: string;
  /** Teléfono internacional sin «+». */
  telefono?: string;
  /** COPY_CODE: el código de ejemplo que ve Meta al revisar. */
  codigo?: string;
};

export type Borrador = {
  nombre: string;
  idioma: string;
  categoria: Categoria;

  encabezado: FormatoEncabezado;
  encabezadoTexto: string;
  /** Ejemplo de la variable del encabezado de texto (Meta lo exige). */
  encabezadoEjemplo: string;
  /** Identificador que devuelve Meta al subir la imagen/video/archivo. */
  encabezadoHandle: string;
  encabezadoNombreArchivo: string;

  cuerpo: string;
  /** Un ejemplo por variable, en orden. */
  ejemplos: string[];

  pie: string;
  botones: Boton[];

  /* Solo para «Código de verificación» */
  autRecomendacion: boolean;
  autCaducidad: number | null;
  autTipoCodigo: "copy_code" | "one_tap";
  autTextoBoton: string;
  autApps: { paquete: string; firma: string }[];
};

export const BORRADOR_VACIO: Borrador = {
  nombre: "",
  idioma: "es_MX",
  categoria: "UTILITY",
  encabezado: "NINGUNO",
  encabezadoTexto: "",
  encabezadoEjemplo: "",
  encabezadoHandle: "",
  encabezadoNombreArchivo: "",
  cuerpo: "",
  ejemplos: [],
  pie: "",
  botones: [],
  autRecomendacion: true,
  autCaducidad: 10,
  autTipoCodigo: "copy_code",
  autTextoBoton: "Copiar código",
  autApps: [],
};

/* ─── Variables ───────────────────────────────────────────────────────────── */

/**
 * Meta numera las variables {{1}}, {{2}}… y exige que vayan seguidas desde 1.
 * Nosotros dejamos que el cliente escriba y las renumeramos al vuelo, para que
 * nunca mande una plantilla con un hueco (rechazo seguro, y 24 horas perdidas).
 */
export const RE_VARIABLE = /\{\{\s*(\d+)\s*\}\}/g;

export function variablesDe(texto: string): number[] {
  const fuera: number[] = [];
  for (const m of (texto ?? "").matchAll(RE_VARIABLE)) fuera.push(Number(m[1]));
  return fuera;
}

/** Renumera {{n}} de izquierda a derecha: 1, 2, 3… sin huecos ni repetidos. */
export function renumerar(texto: string): string {
  let n = 0;
  return (texto ?? "").replace(RE_VARIABLE, () => `{{${++n}}}`);
}

/** Cuántas variables distintas hay, ya renumeradas. */
export function cuantasVariables(texto: string): number {
  return variablesDe(renumerar(texto)).length;
}

/**
 * El texto tal como lo verá el cliente final, con los ejemplos puestos.
 * Es lo que dibuja la vista previa del teléfono.
 */
export function conEjemplos(texto: string, ejemplos: string[]): string {
  let n = 0;
  return renumerar(texto).replace(RE_VARIABLE, () => {
    const v = ejemplos[n++];
    return v && v.trim() ? v : "…";
  });
}

/* ─── Validación ──────────────────────────────────────────────────────────── */

export type Aviso = { campo: string; texto: string; grave: boolean };

/** Convierte lo que el cliente escribe en un nombre que Meta acepta. */
export function aNombreValido(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, TOPE.nombre);
}

/**
 * Todo lo que Meta rechazaría, dicho antes de enviar.
 *
 * POR QUÉ ES TAN PESADO: un rechazo de Meta tarda hasta 24 horas y no siempre
 * explica el motivo. Cada regla que atrapamos aquí es un día que el cliente no
 * pierde. Las `grave: true` bloquean el envío; las demás solo advierten.
 */
export function revisar(b: Borrador): Aviso[] {
  const avisos: Aviso[] = [];
  const mal = (campo: string, texto: string) => avisos.push({ campo, texto, grave: true });
  const ojo = (campo: string, texto: string) => avisos.push({ campo, texto, grave: false });

  if (!b.nombre) mal("nombre", "Ponle un nombre a la plantilla.");
  else if (!/^[a-z0-9_]+$/.test(b.nombre)) {
    mal("nombre", "El nombre solo admite minúsculas, números y guiones bajos.");
  }

  if (b.categoria === "AUTHENTICATION") {
    if (b.autCaducidad !== null && (b.autCaducidad < TOPE.caducidadMin || b.autCaducidad > TOPE.caducidadMax)) {
      mal("caducidad", `La caducidad va de ${TOPE.caducidadMin} a ${TOPE.caducidadMax} minutos.`);
    }
    if (b.autTipoCodigo === "one_tap") {
      if (b.autApps.length === 0) {
        mal("apps", "El autocompletado necesita al menos una app de Android.");
      }
      for (const a of b.autApps) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(a.paquete)) {
          mal("apps", `«${a.paquete || "(vacío)"}» no parece un nombre de paquete de Android.`);
        }
        if (a.firma.length !== 11) {
          mal("apps", "La firma de la app tiene que ser de exactamente 11 caracteres.");
        }
      }
    }
    return avisos; // El resto no aplica: el texto lo pone Meta.
  }

  /* Encabezado */
  if (b.encabezado === "TEXT") {
    if (!b.encabezadoTexto.trim()) mal("encabezado", "Escribe el encabezado o quítalo.");
    if (b.encabezadoTexto.length > TOPE.encabezadoTexto) {
      mal("encabezado", `El encabezado no puede pasar de ${TOPE.encabezadoTexto} caracteres.`);
    }
    const vs = cuantasVariables(b.encabezadoTexto);
    if (vs > 1) mal("encabezado", "El encabezado admite una sola variable.");
    if (vs === 1 && !b.encabezadoEjemplo.trim()) {
      mal("encabezado", "Meta pide un ejemplo de lo que irá en esa variable.");
    }
    if (/[*_~]/.test(b.encabezadoTexto)) {
      ojo("encabezado", "El encabezado no admite negritas ni cursivas: se verán los asteriscos.");
    }
  }
  if ((b.encabezado === "IMAGE" || b.encabezado === "VIDEO" || b.encabezado === "DOCUMENT") && !b.encabezadoHandle) {
    mal("encabezado", "Sube el archivo de ejemplo: Meta lo necesita para revisar la plantilla.");
  }

  /* Cuerpo */
  const cuerpo = renumerar(b.cuerpo).trim();
  if (!cuerpo) mal("cuerpo", "El mensaje no puede ir vacío.");
  if (b.cuerpo.length > TOPE.cuerpo) mal("cuerpo", `El mensaje no puede pasar de ${TOPE.cuerpo} caracteres.`);

  const nVars = cuantasVariables(b.cuerpo);
  for (let i = 0; i < nVars; i++) {
    if (!(b.ejemplos[i] ?? "").trim()) {
      mal("ejemplos", `Falta el ejemplo de la variable ${i + 1}.`);
      break;
    }
  }
  // Meta rechaza los mensajes que empiezan o terminan en variable.
  if (/^\{\{\s*\d+\s*\}\}/.test(cuerpo)) {
    mal("cuerpo", "El mensaje no puede empezar con una variable. Ponle algo antes, por ejemplo «Hola, ».");
  }
  if (/\{\{\s*\d+\s*\}\}$/.test(cuerpo)) {
    mal("cuerpo", "El mensaje no puede terminar con una variable. Cierra con algo, por ejemplo un punto.");
  }
  // Y los que son casi todo variables.
  const palabras = cuerpo.replace(RE_VARIABLE, " ").split(/\s+/).filter(Boolean).length;
  if (nVars > 0 && palabras < nVars * 3) {
    ojo("cuerpo", "Hay muchas variables para tan poco texto. Meta suele rechazar esto: escribe algo más.");
  }

  /* Pie */
  if (b.pie.length > TOPE.pie) mal("pie", `El pie no puede pasar de ${TOPE.pie} caracteres.`);
  if (cuantasVariables(b.pie) > 0) mal("pie", "El pie no admite variables.");

  /* Botones */
  if (b.botones.length > TOPE.botones) mal("botones", `Como mucho ${TOPE.botones} botones.`);
  const cuenta = (t: TipoBoton) => b.botones.filter((x) => x.tipo === t).length;
  if (cuenta("URL") > TOPE.botonesUrl) mal("botones", `Como mucho ${TOPE.botonesUrl} botones de enlace.`);
  if (cuenta("PHONE_NUMBER") > TOPE.botonesTelefono) mal("botones", "Solo se admite un botón de llamada.");
  if (cuenta("COPY_CODE") > TOPE.botonesCodigo) mal("botones", "Solo se admite un botón de copiar código.");
  if (cuenta("QUICK_REPLY") > TOPE.respuestasRapidas) mal("botones", "Como mucho 10 respuestas rápidas.");

  b.botones.forEach((bt, i) => {
    const n = i + 1;
    if (bt.tipo !== "COPY_CODE") {
      if (!bt.texto.trim()) mal("botones", `El botón ${n} no tiene texto.`);
      if (bt.texto.length > TOPE.botonTexto) {
        mal("botones", `El texto del botón ${n} no puede pasar de ${TOPE.botonTexto} caracteres.`);
      }
    }
    if (bt.tipo === "URL") {
      const u = (bt.url ?? "").trim();
      if (!u) mal("botones", `El botón ${n} no tiene enlace.`);
      else if (!/^https:\/\//i.test(u)) mal("botones", `El enlace del botón ${n} tiene que empezar con https://`);
      if (u.length > TOPE.botonUrl) mal("botones", `El enlace del botón ${n} es demasiado largo.`);
      const vs = variablesDe(u);
      if (vs.length > 1) mal("botones", `El enlace del botón ${n} admite una sola variable.`);
      if (vs.length === 1) {
        if (!/\{\{\s*\d+\s*\}\}\s*$/.test(u)) {
          mal("botones", `En el botón ${n} la variable tiene que ir al final del enlace.`);
        }
        if (!(bt.ejemploUrl ?? "").trim()) mal("botones", `Falta el ejemplo del enlace del botón ${n}.`);
      }
    }
    if (bt.tipo === "PHONE_NUMBER") {
      const t = (bt.telefono ?? "").replace(/\D/g, "");
      if (!t) mal("botones", `El botón ${n} no tiene número.`);
      if (t.length > TOPE.botonTelefono) mal("botones", `El número del botón ${n} es demasiado largo.`);
    }
    if (bt.tipo === "COPY_CODE") {
      const c = (bt.codigo ?? "").trim();
      if (!c) mal("botones", "Escribe un código de ejemplo para el botón de copiar.");
      if (c.length > TOPE.codigoOferta) mal("botones", `El código no puede pasar de ${TOPE.codigoOferta} caracteres.`);
    }
  });

  // Meta exige que las respuestas rápidas vayan juntas, no intercaladas.
  const esRapida = b.botones.map((x) => x.tipo === "QUICK_REPLY");
  let cambios = 0;
  for (let i = 1; i < esRapida.length; i++) if (esRapida[i] !== esRapida[i - 1]) cambios++;
  if (cambios > 1) {
    mal("botones", "Las respuestas rápidas tienen que ir todas juntas, antes o después de los demás botones.");
  }

  if (b.categoria === "MARKETING" && b.botones.length === 0) {
    ojo("botones", "Las promociones se aprueban más fácil si incluyen un botón para darse de baja.");
  }

  return avisos;
}

export const hayGraves = (avisos: Aviso[]) => avisos.some((a) => a.grave);

/* ─── Traducción a lo que entiende Meta ───────────────────────────────────── */

/**
 * Arma el `components` que espera Graph API.
 *
 * DOS TRAMPAS QUE CUESTAN UN RECHAZO CADA UNA:
 *  · `example.body_text` es una lista DENTRO de otra lista. El del encabezado
 *    y el del botón de enlace son listas planas. No es un descuido de Meta:
 *    es así y hay que respetarlo.
 *  · Las variables tienen que ir numeradas 1,2,3… sin huecos. Por eso todo
 *    pasa por `renumerar` antes de salir.
 */
export function aComponentesDeMeta(b: Borrador): any[] {
  if (b.categoria === "AUTHENTICATION") {
    const comps: any[] = [{ type: "BODY", add_security_recommendation: b.autRecomendacion }];
    if (b.autCaducidad !== null) comps.push({ type: "FOOTER", code_expiration_minutes: b.autCaducidad });
    const boton: any = {
      type: "OTP",
      otp_type: b.autTipoCodigo,
      text: b.autTextoBoton.slice(0, TOPE.botonTexto) || undefined,
    };
    if (b.autTipoCodigo === "one_tap") {
      boton.autofill_text = "Autocompletar";
      boton.supported_apps = b.autApps.map((a) => ({ package_name: a.paquete, signature_hash: a.firma }));
    }
    comps.push({ type: "BUTTONS", buttons: [boton] });
    return comps;
  }

  const comps: any[] = [];

  if (b.encabezado === "TEXT") {
    const texto = renumerar(b.encabezadoTexto);
    const c: any = { type: "HEADER", format: "TEXT", text: texto };
    if (variablesDe(texto).length === 1) c.example = { header_text: [b.encabezadoEjemplo] };
    comps.push(c);
  } else if (b.encabezado === "IMAGE" || b.encabezado === "VIDEO" || b.encabezado === "DOCUMENT") {
    comps.push({ type: "HEADER", format: b.encabezado, example: { header_handle: [b.encabezadoHandle] } });
  } else if (b.encabezado === "LOCATION") {
    comps.push({ type: "HEADER", format: "LOCATION" });
  }

  const cuerpo = renumerar(b.cuerpo);
  const cuerpoComp: any = { type: "BODY", text: cuerpo };
  const nVars = variablesDe(cuerpo).length;
  if (nVars > 0) {
    // Sí: lista dentro de lista. Meta lo exige exactamente así.
    cuerpoComp.example = { body_text: [b.ejemplos.slice(0, nVars).map((e) => e ?? "")] };
  }
  comps.push(cuerpoComp);

  if (b.pie.trim()) comps.push({ type: "FOOTER", text: b.pie.trim() });

  if (b.botones.length) {
    comps.push({
      type: "BUTTONS",
      buttons: b.botones.map((bt) => {
        if (bt.tipo === "QUICK_REPLY") return { type: "QUICK_REPLY", text: bt.texto };
        if (bt.tipo === "PHONE_NUMBER") {
          return { type: "PHONE_NUMBER", text: bt.texto, phone_number: (bt.telefono ?? "").replace(/\D/g, "") };
        }
        if (bt.tipo === "COPY_CODE") return { type: "COPY_CODE", example: bt.codigo };
        const url = renumerar(bt.url ?? "");
        const c: any = { type: "URL", text: bt.texto, url };
        if (variablesDe(url).length === 1) c.example = [bt.ejemploUrl];
        return c;
      }),
    });
  }

  return comps;
}

/** El cuerpo completo del POST a Meta. */
export function aPlantillaDeMeta(b: Borrador) {
  return {
    name: b.nombre,
    language: b.idioma,
    category: b.categoria,
    // Que Meta la recoloque en vez de rechazarla si cree que es otra categoría.
    allow_category_change: true,
    components: aComponentesDeMeta(b),
  };
}

/* ─── Errores de Meta en cristiano ────────────────────────────────────────── */

/**
 * Meta contesta con códigos y con frases en inglés escritas para programadores.
 * El dueño de una tienda no tiene por qué entenderlas.
 */
export function motivoPlantilla(code: number | string, mensaje: string): string {
  switch (String(code)) {
    case "2388040":
      return "Algún campo se pasó del límite de caracteres.";
    case "2388047":
      return "El encabezado no tiene el formato que Meta espera.";
    case "2388072":
      return "El mensaje no tiene el formato que Meta espera.";
    case "2388073":
      return "El pie no tiene el formato que Meta espera.";
    case "2388293":
      return "Hay demasiadas variables para tan poco texto. Escribe un mensaje más largo.";
    case "2388299":
      return "El mensaje no puede empezar ni terminar con una variable.";
    case "2388019":
      return "Llegaste al máximo de plantillas de tu cuenta de WhatsApp. Borra alguna que ya no uses.";
    case "80008":
      return "Creaste muchas plantillas muy seguido. Espera un rato y vuelve a intentarlo.";
    case "190":
      return "La conexión con Meta caducó. Vuelve a conectar tu número de WhatsApp.";
    case "200":
      return "A tu conexión con Meta le faltan permisos para crear plantillas. Vuelve a conectar el número.";
    case "100":
      return "Meta no aceptó los datos de la plantilla. Revisa los ejemplos de las variables.";
    default:
      if (/already exists|duplicate/i.test(mensaje)) {
        return "Ya tienes una plantilla con ese nombre en ese idioma. Ponle otro nombre.";
      }
      return mensaje || "Meta no aceptó la plantilla.";
  }
}

/** Los motivos de rechazo de Meta, dichos de forma útil. */
export function motivoRechazo(razon?: string | null): string | null {
  if (!razon || razon === "NONE") return null;
  switch (razon) {
    case "INCORRECT_CATEGORY":
      return "Meta cree que el contenido no corresponde a la categoría que elegiste.";
    case "TAG_CONTENT_MISMATCH":
      return "El contenido no coincide con lo que declaraste que era la plantilla.";
    case "ABUSIVE_CONTENT":
      return "Meta consideró el contenido abusivo o engañoso.";
    case "INVALID_FORMAT":
      return "El formato de la plantilla no es válido (variables, límites o caracteres).";
    case "SCAM":
      return "Meta lo interpretó como un intento de fraude.";
    default:
      return razon;
  }
}

export const ESTADOS: Record<string, { texto: string; clase: string }> = {
  APPROVED: { texto: "Aprobada", clase: "bg-success/15 text-exito" },
  PENDING: { texto: "En revisión", clase: "bg-warning/20 text-aviso" },
  IN_APPEAL: { texto: "En apelación", clase: "bg-warning/20 text-aviso" },
  REJECTED: { texto: "Rechazada", clase: "bg-danger/15 text-danger" },
  PAUSED: { texto: "Pausada", clase: "bg-danger/15 text-danger" },
  DISABLED: { texto: "Desactivada", clase: "bg-suave text-ink-3" },
  PENDING_DELETION: { texto: "Borrándose", clase: "bg-suave text-ink-3" },
  DELETED: { texto: "Borrada", clase: "bg-suave text-ink-3" },
  LIMIT_EXCEEDED: { texto: "Límite alcanzado", clase: "bg-danger/15 text-danger" },
};
