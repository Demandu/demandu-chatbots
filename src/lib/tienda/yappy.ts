/**
 * Yappy: el botón de pago de Banco General.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CÓMO FUNCIONA, EN ORDEN, PARA QUE NO HAYA QUE ADIVINARLO:
 *
 *   1. El servidor se identifica con `merchantId` + `urlDomain` y recibe un
 *      token de sesión que dura poco.
 *   2. Con ese token crea la orden y recibe `transactionId`, `token` y
 *      `documentName`.
 *   3. El navegador se los pasa al componente <btn-yappy>, que abre la app de
 *      Yappy en el teléfono del cliente.
 *   4. Cuando el cliente paga (o no), Yappy llama a NUESTRO servidor —el IPN—
 *      con `orderId`, `status`, `domain` y un `hash`.
 *
 * EL PASO 4 ES EL ÚNICO QUE DICE SI HAY DINERO, y llega por una URL pública
 * que cualquiera puede llamar. Lo que separa un pago real de uno inventado es
 * comprobar la firma: si esa comprobación se hace mal, o se hace «suave»,
 * marcar un pedido como pagado sale gratis para cualquiera que sepa el número.
 *
 * POR ESO EL DINERO NO PASA POR NOSOTROS: cada negocio pone su propia cuenta de
 * comercio y el cobro va directo a su banco. Aquí solo se guarda la llave con
 * la que se firma, y nunca sale al navegador.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHmac, timingSafeEqual } from "crypto";

export type Ambiente = "prueba" | "produccion";

/** El de pruebas existe para equivocarse sin mover dinero de nadie. */
export const API_YAPPY: Record<Ambiente, string> = {
  prueba: "https://api-comecom-uat.yappycloud.com",
  produccion: "https://apipagosbg.bgeneral.cloud",
};

export const CDN_YAPPY: Record<Ambiente, string> = {
  prueba: "https://bt-cdn-uat.yappycloud.com/v1/cdn/web-component-btn-yappy.js",
  produccion: "https://bt-cdn.yappy.cloud/v1/cdn/web-component-btn-yappy.js",
};

/**
 * El dominio con el que se habla con Yappy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIENE RESPALDO PORQUE YA NOS MORDIÓ. Una tienda configurada antes de que
 * existiera esta columna la tenía vacía, y con el dominio vacío la firma del
 * aviso de pago NUNCA cuadra: el cobro se hace, el cliente paga, y el pedido se
 * queda sin marcar para siempre. Un fallo silencioso, del lado del dinero.
 *
 * Se decide en UN solo sitio para que las tres piezas —crear la orden,
 * comprobar el aviso y enseñarlo en pantalla— no puedan discrepar. Si
 * discreparan, el pago se crearía con un dominio y se validaría con otro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function dominioDeCobro(guardado: unknown, dominioPlataforma: string): string {
  const d = String(guardado ?? "").trim();
  return d || `https://${String(dominioPlataforma ?? "").trim()}`;
}

export function esAmbiente(v: unknown): Ambiente {
  return v === "produccion" ? "produccion" : "prueba";
}

/** Lo que Yappy contesta en el IPN, traducido a algo que se pueda guardar. */
export const PAGOS_YAPPY: Record<string, string> = {
  E: "pagado",
  R: "rechazado",
  C: "cancelado",
  X: "expirado",
};

/**
 * Centavos → "12.34".
 *
 * Yappy quiere el monto como texto con dos decimales. Se construye a mano
 * desde el entero, sin dividir entre cien: así el formato no depende de la
 * configuración regional del servidor —donde una coma en vez de un punto sería
 * un monto que el banco no entiende— ni de cómo redondee `toFixed`.
 */
export function comoMontoYappy(centavos: number): string {
  const n = Math.max(0, Math.round(Number(centavos) || 0));
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}

/** Yappy no cobra cero: por debajo de un centavo no hay orden que crear. */
export function montoCobrable(centavos: number): boolean {
  return Math.round(Number(centavos) || 0) >= 1;
}

/**
 * El teléfono, como lo quiere Yappy: ocho dígitos, sin el 507 delante.
 *
 * La gente lo escribe de siete maneras —+507 6123-4567, 507 61234567,
 * 6123 4567— y todas son la misma. Normalizar aquí evita rechazar un pago por
 * un guion.
 */
export function aliasYappy(tel: string): string {
  let d = String(tel ?? "").replace(/\D+/g, "");
  if (d.length === 11 && d.startsWith("507")) d = d.slice(3);
  return d;
}

/** Panamá: ocho dígitos y el móvil empieza en 6. */
export function aliasValido(tel: string): boolean {
  const d = aliasYappy(tel);
  return d.length === 8 && d.startsWith("6");
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * El código con el que Yappy nos devuelve el pedido.
 *
 * Yappy admite quince caracteres alfanuméricos como mucho, así que NO puede
 * ser el uuid. Y no puede ser el número del pedido: ese va por tienda, se
 * repite entre tiendas, y el IPN no dice de qué tienda viene.
 *
 * Sin letras que se confunden al dictarlas por teléfono (O/0, I/1).
 */
export function codigoDePedido(azar: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALFABETO[Math.floor(azar() * ALFABETO.length)];
  return s;
}

export function codigoValido(v: string): boolean {
  return /^[A-Z0-9]{1,15}$/.test(String(v ?? ""));
}

/**
 * La llave con la que se firma, sacada del secreto del panel.
 *
 * El secreto que da Yappy viene en base64 y dentro trae varias partes
 * separadas por puntos; la primera es la que firma. Si lo que hay dentro no
 * tiene esa forma, se usa el secreto tal cual: equivocarse aquí no abre
 * ninguna puerta —una llave que no es la buena solo produce firmas que no
 * cuadran, y esas se rechazan igual.
 */
export function claveDeFirma(secreto: string): string {
  const bruto = String(secreto ?? "");
  try {
    const abierto = Buffer.from(bruto, "base64").toString("utf-8");
    // Texto imprimible y con punto: es el formato que documenta Yappy. Si lo
    // que se decodifica no era base64, salen bytes de control — y eso no es
    // una llave, es basura.
    const hayBasura = abierto.split("").some((c) => c.charCodeAt(0) < 32);
    if (abierto.includes(".") && !hayBasura) return abierto.split(".")[0];
  } catch {
    /* cae al secreto crudo */
  }
  return bruto;
}

/** HMAC-SHA256 de orderId + status + domain, en hexadecimal. */
export function firmaIpn(
  secreto: string,
  orderId: string,
  status: string,
  domain: string,
): string {
  return createHmac("sha256", claveDeFirma(secreto))
    .update(`${orderId}${status}${domain}`)
    .digest("hex");
}

/**
 * ¿Este aviso viene de Yappy de verdad?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE COMPARA EN TIEMPO CONSTANTE. Comparar dos textos con `===` tarda más
 * cuanto más coinciden, y esa diferencia de microsegundos, medida muchas
 * veces, deja adivinar la firma carácter a carácter. Es el mismo cuidado que
 * ya tiene el webhook de WhatsApp.
 *
 * Y SE EXIGE QUE EL DOMINIO SEA EL NUESTRO: el dominio entra en la firma, así
 * que un aviso firmado para otra tienda no puede reciclarse contra la nuestra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ipnValido(v: {
  secreto: string;
  orderId: string;
  status: string;
  domain: string;
  hash: string;
  dominioEsperado: string;
}): { ok: boolean; motivo: string } {
  if (!v.secreto) return { ok: false, motivo: "La tienda no tiene secreto de cobro guardado." };
  if (!v.orderId || !v.status || !v.hash) return { ok: false, motivo: "Faltan datos en el aviso." };

  const norm = (u: string) => String(u ?? "").trim().toLowerCase().replace(/\/+$/, "");
  if (norm(v.domain) !== norm(v.dominioEsperado)) {
    return { ok: false, motivo: "El aviso viene con otro dominio." };
  }

  const esperada = Buffer.from(firmaIpn(v.secreto, v.orderId, v.status, v.domain), "utf-8");
  const llegada = Buffer.from(String(v.hash).trim().toLowerCase(), "utf-8");
  if (esperada.length !== llegada.length) return { ok: false, motivo: "La firma no cuadra." };
  if (!timingSafeEqual(esperada, llegada)) return { ok: false, motivo: "La firma no cuadra." };

  return { ok: true, motivo: "" };
}

/* ── Las dos llamadas a Yappy ──────────────────────────────────────────────── */

export type Comercio = {
  comercio: string;
  secreto: string;
  dominio: string;
  ambiente: Ambiente;
};

type Respuesta = { status?: { code?: string; description?: string }; body?: Record<string, unknown> };

async function llamar(url: string, opciones: RequestInit): Promise<Respuesta> {
  // CON TOPE DE TIEMPO: sin esto, un Yappy lento deja al cliente mirando un
  // botón que gira hasta que el navegador se cansa, y el pedido ya está hecho.
  const corte = AbortSignal.timeout(12_000);
  const r = await fetch(url, { ...opciones, signal: corte, cache: "no-store" });
  const texto = await r.text();
  try {
    return JSON.parse(texto) as Respuesta;
  } catch {
    return { status: { code: String(r.status), description: texto.slice(0, 200) } };
  }
}

/**
 * Lo que se le enseña al negocio cuando Yappy rechaza el comercio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL BANCO CONTESTA «Algo salió mal» Y SE QUEDA TAN ANCHO. Ese mensaje no le
 * sirve a nadie: no dice si el número está mal, si el dominio no coincide o si
 * las llaves son de otro entorno.
 *
 * La causa de lejos más común es esta última —llaves normales contra el entorno
 * de pruebas— y el sistema SÍ sabe en cuál está. Callárselo y repetir el
 * mensaje del banco es dejar que el negocio pruebe a ciegas lo que nosotros ya
 * podemos deducir.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function falloDeComercio(mensajeDelBanco: string, ambiente: Ambiente): string {
  const base = String(mensajeDelBanco ?? "").trim() || "Yappy no aceptó los datos del comercio.";
  if (ambiente !== "prueba") return base;
  return `${base} · Estás en el entorno de PRUEBAS: las llaves que da el panel de Yappy son de producción y aquí no valen. Cambia el entorno a Producción.`;
}

/**
 * Paso 1: identificarse. Es también LA PRUEBA DE QUE LA CONFIGURACIÓN SIRVE
 * —número de comercio, secreto y dominio— sin mover un centavo de nadie.
 */
export async function validarComercio(
  c: Comercio,
): Promise<{ ok: boolean; token: string; mensaje: string }> {
  try {
    const r = await llamar(`${API_YAPPY[c.ambiente]}/payments/validate/merchant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: c.comercio, urlDomain: c.dominio }),
    });
    const token = String(r?.body?.token ?? "");
    if (!token) {
      return {
        ok: false,
        token: "",
        mensaje: falloDeComercio(r?.status?.description ?? "", c.ambiente),
      };
    }
    return { ok: true, token, mensaje: "" };
  } catch {
    return { ok: false, token: "", mensaje: "No se pudo hablar con Yappy. Inténtalo otra vez." };
  }
}

/** Paso 2: crear la orden. Devuelve lo que necesita el botón del navegador. */
export async function crearOrdenYappy(
  c: Comercio,
  token: string,
  o: { codigo: string; total: number; telefono: string; ipnUrl: string },
): Promise<{
  ok: boolean;
  mensaje: string;
  datos?: { transactionId: string; token: string; documentName: string };
}> {
  try {
    const r = await llamar(`${API_YAPPY[c.ambiente]}/payments/payment-wc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({
        merchantId: c.comercio,
        orderId: o.codigo,
        domain: c.dominio,
        paymentDate: Math.floor(Date.now() / 1000),
        aliasYappy: aliasYappy(o.telefono),
        ipnUrl: o.ipnUrl,
        discount: "0.00",
        taxes: "0.00",
        // EL SUBTOTAL ES EL TOTAL a propósito: los impuestos de cada negocio ya
        // van dentro del precio del producto en toda LATAM. Repartirlos aquí
        // sin saber su régimen sería inventarle la contabilidad.
        subtotal: comoMontoYappy(o.total),
        total: comoMontoYappy(o.total),
      }),
    });

    const b = r?.body ?? {};
    const datos = {
      transactionId: String(b.transactionId ?? ""),
      token: String(b.token ?? ""),
      documentName: String(b.documentName ?? ""),
    };
    if (!datos.transactionId || !datos.token) {
      return { ok: false, mensaje: r?.status?.description || "Yappy no pudo crear el cobro." };
    }
    return { ok: true, mensaje: "", datos };
  } catch {
    return { ok: false, mensaje: "No se pudo hablar con Yappy. Inténtalo otra vez." };
  }
}
