/**
 * QUÉ CORREO LE FALTA A CADA NEGOCIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Hasta hoy, para reenviar había que ACORDARSE de la dirección y escribirla.
 * Si fallaba una letra, la pantalla decía «no hay ninguna cuenta» — y para
 * saber a quién le faltaba algo había que ir uno por uno. El 3 oct eso costó
 * cinco correos de más: dos clientes recibieron la bienvenida dos y tres veces
 * en ocho segundos porque nada en la pantalla decía que ya había salido.
 *
 * Esto decide, para cada negocio, EN QUÉ ESTADO ESTÁ y SI SE PUEDE PULSAR.
 * Es puro a propósito: lo que decide gastar un correo de verdad se prueba sin
 * mandar ninguno.
 *
 * ── LAS DOS REGLAS QUE NO SON OBVIAS ─────────────────────────────────────
 *
 * 1. `bienvenida_enviada_at` CON FECHA NO ES «RECIBIDA». Dos negocios tienen
 *    esa fecha puesta el 7 sep a las 19:08 —los dos exactamente la misma hora,
 *    y ninguna fila en `correos_enviados`—. Eso no fue un envío: fue un relleno
 *    que escribió la fecha. Quien mire solo esa columna da por mandado algo que
 *    nadie recibió. Manda el registro de envíos, no la marca.
 *
 * 2. UNA PRUEBA NO ES UN ENVÍO. `bienvenida_prueba` es «Mandármelo a mí»: va a
 *    quien está sentado en la pantalla, no al cliente. Contarla haría creer que
 *    el cliente ya lo tiene.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Las etiquetas de `correos_enviados` que SÍ son la bienvenida del cliente. */
export const ETIQUETAS_DE_BIENVENIDA = ["bienvenida", "reenvio_bienvenida"] as const;

/**
 * Cuánto se espera antes de poder reenviar la misma bienvenida.
 *
 * NO ES UN LÍMITE DE GOOGLE: es el freno que faltaba. Google aceptó los tres
 * seguidos sin quejarse, y por eso llegaron tres. Cinco minutos es lo que tarda
 * alguien en mirar su bandeja y volver a pedirlo con motivo.
 */
export const ESPERA_DE_BIENVENIDA_S = 300;

export type EnvioApuntado = {
  para: string;
  etiqueta: string | null;
  enviado: boolean | null;
  error: string | null;
  created_at: string;
};

export type NegocioParaLaLista = {
  id: string;
  name: string;
  contacto_email: string | null;
  bienvenida_enviada_at: string | null;
};

export type EstadoDeBienvenida = "recibida" | "fallo" | "nunca" | "sin_correo";

export type EstadoDeCuenta =
  | "confirmada"
  | "sin_confirmar"
  | "invitada_sin_aceptar"
  | "sin_cuenta";

export type FilaDeNegocio = {
  id: string;
  nombre: string;
  correo: string;
  bienvenida: EstadoDeBienvenida;
  /** Cuándo se intentó por última vez de verdad (null si nunca). */
  intentada: string | null;
  /** Lo que dijo el proveedor cuando falló. */
  error: string | null;
  /** Cuántas veces ha salido bien. Más de una es que se pulsó de más. */
  veces: number;
  cuenta: EstadoDeCuenta;
  /** Si el botón de reenviar se puede pulsar ahora. */
  sePuede: boolean;
  /** Siempre dice algo: qué va a pasar, o por qué no. */
  nota: string;
};

const texto = (v: unknown) => String(v ?? "").trim();
const mismoCorreo = (a: unknown, b: unknown) =>
  texto(a).toLowerCase() === texto(b).toLowerCase() && texto(a) !== "";

/** Los envíos de bienvenida de ese correo, del más nuevo al más viejo. */
export function enviosDeLaBienvenida(correo: string, todos: EnvioApuntado[]): EnvioApuntado[] {
  return todos
    .filter((e) => mismoCorreo(e.para, correo))
    .filter((e) => (ETIQUETAS_DE_BIENVENIDA as readonly string[]).includes(texto(e.etiqueta)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function segundosParaReenviar(ultimoBueno: string | null, ahora: Date): number {
  if (!ultimoBueno) return 0;
  const t = new Date(ultimoBueno).getTime();
  if (!Number.isFinite(t)) return 0;
  const pasados = Math.floor((ahora.getTime() - t) / 1000);
  return Math.max(0, ESPERA_DE_BIENVENIDA_S - pasados);
}

/** «hace 2 minutos», «hace 3 días». Para que la nota se lea sin pensar. */
export function hace(cuando: string | null, ahora: Date): string {
  if (!cuando) return "";
  const t = new Date(cuando).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((ahora.getTime() - t) / 1000));
  if (s < 60) return "hace unos segundos";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} minuto${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} hora${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

export function estadoDeLaCuenta(
  persona: { confirmadoEl: string | null; invitadoEl: string | null } | null | undefined,
): EstadoDeCuenta {
  if (!persona) return "sin_cuenta";
  if (persona.confirmadoEl) return "confirmada";
  if (persona.invitadoEl) return "invitada_sin_aceptar";
  return "sin_confirmar";
}

/**
 * La fila de un negocio, ya decidida.
 *
 * `persona` es la cuenta que tiene ESE correo de contacto, si existe. Puede no
 * existir: el correo de contacto del negocio y la cuenta con la que alguien
 * entra no tienen por qué ser el mismo.
 */
export function filaDelNegocio(
  negocio: NegocioParaLaLista,
  envios: EnvioApuntado[],
  persona: { confirmadoEl: string | null; invitadoEl: string | null } | null,
  ahora: Date = new Date(),
): FilaDeNegocio {
  const correo = texto(negocio.contacto_email);
  const cuenta = estadoDeLaCuenta(persona);
  const base = {
    id: negocio.id,
    nombre: texto(negocio.name) || "(sin nombre)",
    correo,
    cuenta,
  };

  if (!correo) {
    return {
      ...base,
      bienvenida: "sin_correo",
      intentada: null,
      error: null,
      veces: 0,
      sePuede: false,
      nota: "Este negocio no tiene correo de contacto: no hay a quién mandárselo.",
    };
  }

  const mios = enviosDeLaBienvenida(correo, envios);
  const buenos = mios.filter((e) => e.enviado === true);
  const ultimo = mios[0] ?? null;
  const ultimoBueno = buenos[0] ?? null;

  // ── Ya le llegó ────────────────────────────────────────────────────────
  if (ultimoBueno) {
    const espera = segundosParaReenviar(ultimoBueno.created_at, ahora);
    const cuantas =
      buenos.length > 1
        ? ` Se le ha mandado ${buenos.length} veces.`
        : "";
    return {
      ...base,
      bienvenida: "recibida",
      intentada: ultimoBueno.created_at,
      error: null,
      veces: buenos.length,
      sePuede: espera === 0,
      nota:
        espera > 0
          ? `Salió ${hace(ultimoBueno.created_at, ahora)}.${cuantas} Espera ${espera} s antes de volver a mandarlo.`
          : `Salió ${hace(ultimoBueno.created_at, ahora)}.${cuantas} Solo hace falta otro si te dice que no lo encuentra.`,
    };
  }

  // ── Se intentó y falló ─────────────────────────────────────────────────
  if (ultimo) {
    return {
      ...base,
      bienvenida: "fallo",
      intentada: ultimo.created_at,
      error: texto(ultimo.error) || null,
      veces: 0,
      sePuede: true,
      nota: `Falló ${hace(ultimo.created_at, ahora)} y no le llegó. Ahora sí hay por dónde mandarlo.`,
    };
  }

  // ── Nunca se intentó, diga lo que diga la marca de la fecha ────────────
  return {
    ...base,
    bienvenida: "nunca",
    intentada: null,
    error: null,
    veces: 0,
    sePuede: true,
    nota: negocio.bienvenida_enviada_at
      ? "Tiene fecha de bienvenida pero no hay ningún envío apuntado: esa fecha la puso un relleno, no un correo."
      : "Nunca se le ha mandado la bienvenida.",
  };
}

/** Primero lo que necesita algo. Lo resuelto, al final. */
const PESO: Record<EstadoDeBienvenida, number> = {
  fallo: 0,
  nunca: 1,
  sin_correo: 2,
  recibida: 3,
};

/**
 * La lista, en el orden en que hay que atenderla.
 *
 * ORDENAR POR URGENCIA Y NO POR NOMBRE es la mitad del valor de esta pantalla:
 * quien la abre no viene a buscar un negocio concreto, viene a ver a quién le
 * falta algo. Alfabético lo dejaría escondido entre los que ya están bien.
 */
export function listaDeNegocios(
  negocios: NegocioParaLaLista[],
  envios: EnvioApuntado[],
  personas: Map<string, { confirmadoEl: string | null; invitadoEl: string | null }>,
  ahora: Date = new Date(),
): FilaDeNegocio[] {
  return negocios
    .map((n) =>
      filaDelNegocio(n, envios, personas.get(texto(n.contacto_email).toLowerCase()) ?? null, ahora),
    )
    .sort((a, b) => PESO[a.bienvenida] - PESO[b.bienvenida] || a.nombre.localeCompare(b.nombre, "es"));
}

/** El resumen de arriba: cuántos están pendientes de algo. */
export function cuantosFaltan(filas: FilaDeNegocio[]): {
  pendientes: number;
  recibidas: number;
  sinConfirmar: number;
} {
  return {
    pendientes: filas.filter((f) => f.bienvenida === "fallo" || f.bienvenida === "nunca").length,
    recibidas: filas.filter((f) => f.bienvenida === "recibida").length,
    sinConfirmar: filas.filter(
      (f) => f.cuenta === "sin_confirmar" || f.cuenta === "invitada_sin_aceptar",
    ).length,
  };
}
