import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  API_ASAP,
  esAmbienteEnvio,
  cuerpoDeOrden,
  loQueFaltaParaMandar,
  leerDeliveryId,
  loAcepto,
  leerEstado,
  motivoDelFallo,
  type ConfigEnvio,
  type PedidoParaEnviar,
  type EstadoEnvio,
} from "./asap";

/**
 * HABLAR CON ASAP. Solo eso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO ES UN CARTERO, igual que los motores de WhatsApp y de la web.
 * No decide nada: qué mandar lo arma `cuerpoDeOrden`, si se puede mandar lo
 * dice `loQueFaltaParaMandar`, y qué significa la respuesta lo traducen
 * `loAcepto` y `leerEstado`. Todo eso vive en `asap.ts`, que es puro y se puede
 * probar sin internet.
 *
 * La razón no es estética. Una decisión metida aquí dentro solo se puede
 * comprobar llamando a ASAP de verdad — y ya sabemos lo que cuesta: la noche
 * del 7 de septiembre un pedido salió a la calle porque el identificador venía
 * en `result.delivery_id` y no donde lo buscábamos.
 *
 * ── LO QUE SÍ DECIDE ESTE ARCHIVO: CUÁNDO NO LLAMAR ───────────────────────
 *
 * Un pedido que ya tiene `envio_id` NO se vuelve a mandar. Dos clics en
 * «Enviar al mensajero» serían dos motos, dos cobros y un repartidor de más en
 * la puerta de una panadería. Y no basta con esconder el botón: la comprobación
 * va contra la base, justo antes de llamar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuánto se espera. ASAP a veces tarda; colgarse para siempre no es una opción. */
const TOPE_MS = 25_000;

export type Envio =
  | { ok: true; envioId: string; crudo: unknown }
  | { ok: false; error: string; falta?: string[] };

function base(c: ConfigEnvio): string {
  return API_ASAP[esAmbienteEnvio(c?.ambiente)];
}

/**
 * Una llamada a ASAP, con su tope de tiempo y su llave.
 *
 * LA LLAVE VA EN EL ENCABEZADO `x-api-key`, comprobado el 7 sep 2026: contra
 * `Authorization: Bearer` la misma llave devuelve 401. Se probaron las seis
 * combinaciones y solo ésta pasa la puerta.
 */
async function llamar(
  c: ConfigEnvio,
  ruta: string,
  init?: { metodo?: "GET" | "POST"; cuerpo?: unknown },
): Promise<{ ok: boolean; estado: number; datos: any }> {
  const llave = String(c?.api_key ?? "").trim();
  const r = await fetch(`${base(c)}/${ruta}`, {
    method: init?.metodo ?? "GET",
    headers: {
      Accept: "application/json",
      "x-api-key": llave,
      ...(init?.cuerpo ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.cuerpo ? { body: JSON.stringify(init.cuerpo) } : {}),
    signal: AbortSignal.timeout(TOPE_MS),
    cache: "no-store",
  });

  // SU ERROR NO SIEMPRE ES JSON. Cuando la ruta no existe devuelven una página
  // HTML de Express; intentar leerla como JSON revienta y se pierde el código.
  const texto = await r.text().catch(() => "");
  let datos: any = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = { message: texto.slice(0, 200) };
  }
  return { ok: r.ok, estado: r.status, datos };
}

/**
 * Mandar el pedido al mensajero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL IDENTIFICADOR SE APUNTA ANTES DE TOCAR EL PEDIDO, y ese orden es lo más
 * importante de esta función.
 *
 * ASAP da el `delivery_id` UNA VEZ. Si se guardara solo en `pedidos` y ese
 * `update` fallara —la base ocupada, una carrera, cualquier cosa—, la moto ya
 * estaría pedida y nosotros sin forma de seguirla ni cancelarla. Escribiendo
 * primero la respuesta CRUDA en la bitácora del pedido, que es una tabla de
 * solo añadir, el identificador queda recuperable pase lo que pase después.
 *
 * Es la misma lógica que el correo de bienvenida, al revés: allí se marca antes
 * de mandar para no mandar dos veces; aquí se apunta antes de actualizar para
 * no perder lo que ya salió. En los dos casos, primero lo irreversible.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function mandarAlMensajero(
  sb: SupabaseClient,
  v: { pedidoId: string; tiendaId: string; config: ConfigEnvio; pedido: PedidoParaEnviar },
): Promise<Envio> {
  const falta = loQueFaltaParaMandar(v.config, v.pedido);
  if (falta.length > 0) return { ok: false, error: "Falta " + falta.join(", ") + ".", falta };

  // ── QUE NO SALGAN DOS MOTOS ───────────────────────────────────────────────
  //
  // Se pregunta a la BASE, no al formulario ni a la pantalla. Dos clics
  // seguidos, dos pestañas abiertas o un botón pulsado dos veces por una
  // conexión lenta llegan aquí como dos peticiones idénticas, y la pantalla no
  // sabe nada de la otra.
  const { data: yaEsta, error: errLeer } = await sb
    .from("pedidos")
    .select("envio_id, estado")
    .eq("id", v.pedidoId)
    .eq("tienda_id", v.tiendaId)
    .maybeSingle();

  if (errLeer) return { ok: false, error: "No pude comprobar si el pedido ya se mandó." };
  if (!yaEsta) return { ok: false, error: "Ese pedido no es de esta tienda." };
  if (String(yaEsta.envio_id ?? "").trim()) {
    return { ok: false, error: "Este pedido ya está con el mensajero. No se manda dos veces." };
  }

  const cuerpo = cuerpoDeOrden(v.config, v.pedido);

  let respuesta: { ok: boolean; estado: number; datos: any };
  try {
    respuesta = await llamar(v.config, "order", { metodo: "POST", cuerpo });
  } catch (e) {
    // NO SE SABE SI SALIÓ O NO, Y ESO SE DICE. Un tope de tiempo agotado puede
    // significar que ASAP no recibió nada… o que lo recibió y tardó en
    // contestar. Decir «no se pudo» a secas invita a pulsar otra vez, y esa
    // vez sí saldrían dos motos.
    console.error("[asap] no se pudo hablar con ASAP:", e);
    await apuntar(sb, v.pedidoId, "envio_sin_respuesta", { error: String(e).slice(0, 300) });
    return {
      ok: false,
      error:
        "ASAP no contestó a tiempo. NO vuelvas a pulsar todavía: puede que el envío sí se creara. " +
        "Míralo en tu panel de ASAP antes de reintentar.",
    };
  }

  // LA RESPUESTA CRUDA A LA BITÁCORA, LO PRIMERO. Ver la cabecera.
  await apuntar(sb, v.pedidoId, "envio_respuesta", { http: respuesta.estado, cuerpo: respuesta.datos });

  if (!loAcepto(respuesta.datos)) {
    const error = motivoDelFallo(respuesta.datos);
    await sb
      .from("pedidos")
      .update({ envio_error: error.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", v.pedidoId)
      .eq("tienda_id", v.tiendaId);
    return { ok: false, error };
  }

  const envioId = leerDeliveryId(respuesta.datos);

  const { error: errGuardar } = await sb
    .from("pedidos")
    .update({
      envio_proveedor: "asap",
      envio_id: envioId,
      envio_estado: "pedido",
      envio_pedido_en: new Date().toISOString(),
      envio_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", v.pedidoId)
    .eq("tienda_id", v.tiendaId);

  if (errGuardar) {
    // EL ENVÍO EXISTE AUNQUE NO SE HAYA PODIDO GUARDAR, y hay que decirlo con
    // el número delante. Está también en la bitácora, así que no se ha perdido.
    console.error("[asap] envío creado pero no guardado:", errGuardar.message);
    return {
      ok: false,
      error: `El envío SÍ se creó (${envioId}) pero no se pudo guardar en el pedido. Apunta ese número.`,
    };
  }

  return { ok: true, envioId, crudo: respuesta.datos };
}

/**
 * Preguntar en qué punto va.
 *
 * NO SIRVE PARA AVISAR AL CLIENTE, y conviene decirlo aquí para que nadie lo
 * intente: el código 100 significa «el mensajero llegó» tanto al local como a
 * casa del cliente, y por aquí no se distinguen. Su propio registro de una
 * orden completada lo enseña saliendo dos veces. Para avisar hace falta el
 * webhook, que sí manda `pickupAgentArrived` y `deliveryAgentArrived` por
 * separado. Esto es para mirar, no para anunciar.
 */
export async function preguntarEstado(
  c: ConfigEnvio,
  envioId: string,
): Promise<{ ok: true; clave: EstadoEnvio; label: string; crudo: unknown } | { ok: false; error: string }> {
  const id = String(envioId ?? "").trim();
  if (!id) return { ok: false, error: "No hay envío que consultar." };

  try {
    // OJO AL NOMBRE DEL PARÁMETRO. Aquí es `token`; en `order/tracking` el MISMO
    // valor se llama `user_token`. No es una errata suya: es así. Copiar una
    // línea para hacer la otra da un 401 que parece un problema de credenciales
    // y manda a revisar las llaves durante una hora.
    const q = new URLSearchParams({
      token: String(c?.user_token ?? "").trim(),
      shared_secret: String(c?.shared_secret ?? "").trim(),
      delivery_id: id,
    });
    const r = await llamar(c, `order/status?${q}`);
    const leido = leerEstado(r.datos);
    if (!leido) return { ok: false, error: motivoDelFallo(r.datos) };
    return { ok: true, clave: leido.clave, label: leido.label, crudo: r.datos };
  } catch (e) {
    console.error("[asap] no se pudo consultar el estado:", e);
    return { ok: false, error: "No se pudo hablar con ASAP." };
  }
}

/**
 * El enlace que se le puede pasar al cliente para que vea la moto.
 *
 * AQUÍ EL PARÁMETRO SE LLAMA `user_token`. Ver la advertencia de arriba.
 */
export async function enlaceDeRastreo(
  c: ConfigEnvio,
  envioId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const id = String(envioId ?? "").trim();
  if (!id) return { ok: false, error: "No hay envío que rastrear." };

  try {
    const q = new URLSearchParams({
      user_token: String(c?.user_token ?? "").trim(),
      shared_secret: String(c?.shared_secret ?? "").trim(),
      delivery_id: id,
    });
    const r = await llamar(c, `order/tracking?${q}`);
    const d = r.datos ?? {};
    const url = String(d.tracking_link ?? d.tracking_url ?? d.url ?? d.result?.tracking_link ?? "").trim();
    if (!url) return { ok: false, error: motivoDelFallo(d) };
    return { ok: true, url };
  } catch (e) {
    console.error("[asap] no se pudo pedir el enlace de rastreo:", e);
    return { ok: false, error: "No se pudo hablar con ASAP." };
  }
}

/**
 * Cancelar el envío.
 *
 * CANCELAR EL ENVÍO NO CANCELA EL PEDIDO. El negocio puede volver a mandarlo o
 * llevarlo él; mezclarlos daría un embudo donde los pedidos se cancelan solos
 * porque una moto se averió.
 *
 * SE LIMPIA `envio_id` AL CANCELAR, y es deliberado: es lo que permite volver a
 * mandarlo. El número no se pierde — queda en la bitácora del pedido, que es de
 * solo añadir.
 */
export async function cancelarEnvio(
  sb: SupabaseClient,
  v: { pedidoId: string; tiendaId: string; config: ConfigEnvio; envioId: string; motivo?: string },
): Promise<{ ok: boolean; error?: string }> {
  const id = String(v.envioId ?? "").trim();
  if (!id) return { ok: false, error: "No hay envío que cancelar." };

  let r: { ok: boolean; estado: number; datos: any };
  try {
    r = await llamar(v.config, "cancel", {
      metodo: "POST",
      cuerpo: {
        user_token: String(v.config?.user_token ?? "").trim(),
        shared_secret: String(v.config?.shared_secret ?? "").trim(),
        delivery_id: Number(id) || id,
        addn_reason: String(v.motivo ?? "").trim() || "user order cancelled",
      },
    });
  } catch (e) {
    console.error("[asap] no se pudo cancelar:", e);
    return { ok: false, error: "No se pudo hablar con ASAP." };
  }

  await apuntar(sb, v.pedidoId, "envio_cancelado", { http: r.estado, cuerpo: r.datos, envio_id: id });

  if (r.datos?.status === false || !r.ok) {
    return { ok: false, error: motivoDelFallo(r.datos) };
  }

  await sb
    .from("pedidos")
    .update({
      envio_id: null,
      envio_estado: "cancelado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", v.pedidoId)
    .eq("tienda_id", v.tiendaId);

  return { ok: true };
}

/**
 * Dejarlo apuntado en la bitácora del pedido.
 *
 * NUNCA LANZA. Es la red de seguridad del identificador: si fallar al apuntar
 * pudiera tumbar la llamada que acaba de crear un envío, la red de seguridad
 * sería la causa del accidente.
 */
async function apuntar(sb: SupabaseClient, pedidoId: string, que: string, detalle: unknown): Promise<void> {
  try {
    await sb.from("pedido_eventos").insert({ pedido_id: pedidoId, que, quien: "asap", detalle });
  } catch (e) {
    console.error("[asap] no pude apuntar en la bitácora:", e);
  }
}
