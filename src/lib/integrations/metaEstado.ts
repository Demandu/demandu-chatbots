/**
 * "¿Por qué no salen mis mensajes?" — el diagnóstico que hoy obliga a irse a
 * Meta Business Manager a adivinar.
 *
 * Le pregunta a Meta el estado real del número y lo traduce a español de
 * persona. Lo importante no son los datos crudos: es que la pantalla diga
 * QUÉ HACER, y sobre todo que detecte el caso que hace perder días —
 * el número de pruebas.
 *
 * CASO REAL (19 ago 2026): un número llevaba días con el nombre "en revisión"
 * y todo lo demás aprobado. Era el +1 555 que Meta regala: en ese número NO se
 * puede aprobar el nombre para mostrar, así que la revisión no termina nunca.
 * La plataforma decía la verdad ("Meta no ha aprobado el nombre") y aun así
 * mandaba al cliente a esperar algo que no iba a pasar.
 */

const GRAPH = "https://graph.facebook.com/v20.0";

export interface DatosMeta {
  verified_name?: string;
  display_phone_number?: string;
  name_status?: string;
  new_name_status?: string;
  code_verification_status?: string;
  quality_rating?: string;
  status?: string;
  messaging_limit_tier?: string;
  platform_type?: string;
  /** De la cuenta (WABA) */
  waba_name?: string;
  account_review_status?: string;
  business_verification_status?: string;
}

export type Nivel = "ok" | "aviso" | "problema";

export interface Punto {
  titulo: string;
  valor: string;
  nivel: Nivel;
  /** Qué significa y, si algo está mal, qué hacer. */
  detalle?: string;
}

export interface Diagnostico {
  /** Lo primero que tiene que leer el cliente. */
  titular: string;
  nivel: Nivel;
  quePuedoHacer?: string[];
  puntos: Punto[];
  puedeEnviar: boolean;
}

/**
 * El número de pruebas que Meta regala a cada cuenta. Es un +1 con el
 * prefijo 555, que en Estados Unidos está reservado para ficción justamente
 * para que nadie lo confunda con un número real.
 *
 * En ese número no se puede configurar el nombre para mostrar: se queda
 * "en revisión" para siempre. Detectarlo es la mitad del valor de esta pantalla.
 */
export function esNumeroDePrueba(numero?: string | null): boolean {
  const n = String(numero ?? "").replace(/\D/g, "");
  // +1 555 XXX XXXX → 1 555 …
  return /^1555\d{7}$/.test(n);
}

const NOMBRE_ESTADO: Record<string, string> = {
  APPROVED: "Aprobado",
  AVAILABLE_WITHOUT_REVIEW: "Aprobado (sin revisión)",
  PENDING_REVIEW: "En revisión",
  DECLINED: "Rechazado",
  EXPIRED: "Caducado",
  NONE: "Sin nombre",
};

const CALIDAD: Record<string, { texto: string; nivel: Nivel }> = {
  GREEN:  { texto: "Alta",  nivel: "ok" },
  YELLOW: { texto: "Media", nivel: "aviso" },
  RED:    { texto: "Baja",  nivel: "problema" },
  UNKNOWN:{ texto: "Sin datos todavía", nivel: "ok" },
};

const LIMITE: Record<string, string> = {
  TIER_50: "50 clientes nuevos al día",
  TIER_250: "250 clientes nuevos al día",
  TIER_1K: "1 000 clientes nuevos al día",
  TIER_10K: "10 000 clientes nuevos al día",
  TIER_100K: "100 000 clientes nuevos al día",
  TIER_UNLIMITED: "Sin límite",
};

/**
 * Traduce los datos crudos de Meta a algo accionable.
 * Función pura: se prueba sin red y sin base de datos.
 */
export function interpretarEstado(d: DatosMeta | null): Diagnostico {
  if (!d) {
    return {
      titular: "No pudimos consultar el estado con Meta",
      nivel: "aviso",
      puedeEnviar: false,
      puntos: [],
      quePuedoHacer: ["Vuelve a intentarlo en un momento. Si sigue igual, escríbenos."],
    };
  }

  const prueba = esNumeroDePrueba(d.display_phone_number);
  const nombreOk = d.name_status === "APPROVED" || d.name_status === "AVAILABLE_WITHOUT_REVIEW";
  const conectado = d.status === "CONNECTED";
  const calidad = CALIDAD[d.quality_rating ?? "UNKNOWN"] ?? CALIDAD.UNKNOWN;

  const puntos: Punto[] = [
    {
      titulo: "Número",
      valor: d.display_phone_number ?? "—",
      nivel: prueba ? "problema" : "ok",
      detalle: prueba
        ? "Es el número de pruebas que Meta regala a cada cuenta. Solo sirve para probar con hasta 5 contactos que registres a mano, y no se le puede aprobar un nombre."
        : undefined,
    },
    {
      titulo: "Nombre para mostrar",
      valor: `${d.verified_name ?? "—"} · ${NOMBRE_ESTADO[d.name_status ?? "NONE"] ?? d.name_status}`,
      nivel: nombreOk ? "ok" : prueba ? "problema" : "aviso",
      detalle: prueba
        ? "En el número de pruebas esta revisión no termina nunca. No es culpa de tu nombre."
        : d.name_status === "DECLINED"
          ? "Meta lo rechazó. Tiene que parecerse al nombre de tu negocio, sin mayúsculas completas, emojis, direcciones web ni frases publicitarias."
          : d.name_status === "PENDING_REVIEW"
            ? "Suele tardar de minutos a 48 horas. Mientras tanto no salen mensajes."
            : undefined,
    },
    {
      titulo: "Negocio verificado",
      valor: d.business_verification_status === "verified" ? "Sí" : (d.business_verification_status ?? "—"),
      nivel: d.business_verification_status === "verified" ? "ok" : "aviso",
      detalle:
        d.business_verification_status === "verified"
          ? "Con el negocio verificado, el nombre de un número real se aprueba mucho más rápido."
          : "Verifica tu negocio en Meta Business Manager: sin eso, los nombres tardan más y los límites de envío son menores.",
    },
    {
      titulo: "Cuenta de WhatsApp",
      valor: d.account_review_status === "APPROVED" ? "Aprobada" : (d.account_review_status ?? "—"),
      nivel: d.account_review_status === "APPROVED" ? "ok" : "aviso",
    },
    {
      titulo: "Conexión",
      valor: conectado ? "Conectado" : (d.status ?? "—"),
      nivel: conectado ? "ok" : "problema",
    },
    {
      titulo: "Calidad del número",
      valor: calidad.texto,
      nivel: calidad.nivel,
      detalle:
        calidad.nivel === "problema"
          ? "Demasiada gente bloqueó o reportó tus mensajes. Baja el ritmo de los envíos y revisa qué estás mandando."
          : undefined,
    },
  ];

  if (d.messaging_limit_tier) {
    puntos.push({
      titulo: "Puedes escribirle a",
      valor: LIMITE[d.messaging_limit_tier] ?? d.messaging_limit_tier,
      nivel: "ok",
      detalle: "Es el máximo de clientes NUEVOS al día. Responder a quien te escribe no cuenta.",
    });
  }

  // ── El titular: lo primero (y a veces lo único) que va a leer el cliente ──
  if (prueba) {
    return {
      titular: "Estás usando el número de pruebas de Meta, no uno tuyo",
      nivel: "problema",
      puedeEnviar: false,
      puntos,
      quePuedoHacer: [
        "Entra a Meta Business → WhatsApp Manager → Números de teléfono → Agregar número.",
        "Usa un número que NO esté dado de alta en la app de WhatsApp ni en WhatsApp Business (o bórralo de ahí primero) y que pueda recibir SMS o llamada.",
        "Al darlo de alta te pide el nombre para mostrar: pon el nombre de tu negocio tal como aparece en tu sitio web.",
        "Verifica el número con el código que te llegue.",
        "Vuelve aquí y conéctalo. El número de pruebas puedes dejarlo o quitarlo, da igual.",
      ],
    };
  }

  if (!nombreOk && d.name_status === "DECLINED") {
    return {
      titular: "Meta rechazó el nombre para mostrar",
      nivel: "problema",
      puedeEnviar: false,
      puntos,
      quePuedoHacer: [
        "Cámbialo en Meta Business → WhatsApp Manager → tu número → Nombre para mostrar.",
        "Que se parezca al nombre de tu negocio y que aparezca así en tu sitio web.",
        "Sin MAYÚSCULAS completas, emojis, direcciones web, teléfonos ni frases de promoción.",
      ],
    };
  }

  if (!nombreOk) {
    return {
      titular: "Meta todavía está revisando tu nombre",
      nivel: "aviso",
      puedeEnviar: false,
      puntos,
      quePuedoHacer: [
        "No hay que hacer nada: suele tardar de unos minutos a 48 horas.",
        "Mientras tanto tu chatbot recibe los mensajes, pero no puede contestar.",
      ],
    };
  }

  if (!conectado) {
    return {
      titular: "Tu número no está conectado",
      nivel: "problema",
      puedeEnviar: false,
      puntos,
      quePuedoHacer: ["Vuelve a conectar el número desde esta misma pantalla."],
    };
  }

  return {
    titular: "Todo en orden: tu chatbot puede enviar y recibir",
    nivel: "ok",
    puedeEnviar: true,
    puntos,
  };
}

/**
 * Le pregunta a Meta. Devuelve null si algo falla — esta pantalla es
 * informativa y nunca debe tumbar la carga de la página.
 */
export async function consultarMeta(phoneNumberId: string, wabaId: string, token: string): Promise<DatosMeta | null> {
  try {
    const campos =
      "verified_name,display_phone_number,name_status,new_name_status,code_verification_status," +
      "quality_rating,status,messaging_limit_tier,platform_type";
    const cab = { Authorization: `Bearer ${token}` };

    const [rNum, rWaba] = await Promise.all([
      fetch(`${GRAPH}/${phoneNumberId}?fields=${campos}`, { headers: cab, cache: "no-store" }),
      fetch(`${GRAPH}/${wabaId}?fields=name,account_review_status,business_verification_status`, {
        headers: cab, cache: "no-store",
      }),
    ]);

    if (!rNum.ok) {
      console.error("[meta] estado del número:", rNum.status, (await rNum.text()).slice(0, 200));
      return null;
    }
    const num = await rNum.json();
    const waba = rWaba.ok ? await rWaba.json() : {};

    return {
      ...num,
      waba_name: waba?.name,
      account_review_status: waba?.account_review_status,
      business_verification_status: waba?.business_verification_status,
    } as DatosMeta;
  } catch (e: any) {
    console.error("[meta] no se pudo consultar el estado:", e?.message ?? e);
    return null;
  }
}
