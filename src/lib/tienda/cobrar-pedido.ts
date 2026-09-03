import type { SupabaseClient } from "@supabase/supabase-js";
import { DOMINIO_TIENDAS } from "./direccion";
import {
  aliasValido,
  crearOrdenYappy,
  dominioDeCobro,
  esAmbiente,
  montoCobrable,
  validarComercio,
  CDN_YAPPY,
} from "./yappy";

/**
 * Preparar el cobro de un pedido que YA existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIVE APARTE DE «CREAR EL PEDIDO» POR UNA RAZÓN QUE SE VIO EN LA BASE: dos
 * pedidos idénticos, con cuatro segundos de diferencia. Fue alguien pulsando
 * «pagar», viendo un error, y pulsando otra vez. Cada intento creaba un pedido
 * nuevo, y el negocio se queda con fantasmas que tiene que cancelar a mano.
 *
 * Un reintento de pago NO es un pedido nuevo. Separarlo permite volver a
 * intentar el cobro sobre el mismo pedido tantas veces como haga falta.
 *
 * Y CADA FALLO SE APUNTA. Hasta ahora el motivo solo se veía en la pantalla del
 * cliente y se perdía: cuando el negocio preguntaba «¿por qué no me cobró?», no
 * había nada que mirar. Ahora queda en la bitácora del pedido.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ResultadoCobro = {
  yappy?: { transactionId: string; token: string; documentName: string; cdn: string };
  yappy_error?: string;
};

export async function cobrarPedidoConYappy(
  sb: SupabaseClient,
  pedido: { id: string; tienda_id: string; total: number; telefono: string },
): Promise<ResultadoCobro> {
  const fallo = async (motivo: string, detalle: Record<string, unknown> = {}) => {
    await sb.from("pedido_eventos").insert({
      pedido_id: pedido.id,
      que: "pago_no_iniciado",
      quien: "yappy",
      detalle: { motivo, ...detalle },
    });
    return { yappy_error: motivo };
  };

  const { data: cobro } = await sb
    .from("tienda_cobros")
    .select("comercio,secreto,dominio,ambiente,activo")
    .eq("tienda_id", pedido.tienda_id)
    .eq("proveedor", "yappy")
    .maybeSingle();

  if (!cobro?.activo || !cobro.comercio || !cobro.secreto) {
    return fallo("Esta tienda no está cobrando con Yappy ahora mismo.");
  }
  if (!montoCobrable(pedido.total)) {
    return fallo("El monto es demasiado bajo para cobrarlo en línea.");
  }
  if (!aliasValido(pedido.telefono)) {
    return fallo("Para pagar con Yappy hace falta un número de celular de Panamá (8 dígitos).");
  }

  const comercio = {
    comercio: cobro.comercio,
    secreto: cobro.secreto,
    dominio: dominioDeCobro(cobro.dominio, DOMINIO_TIENDAS),
    ambiente: esAmbiente(cobro.ambiente),
  };

  const sesion = await validarComercio(comercio);
  if (!sesion.ok) {
    // EL AMBIENTE SE APUNTA CON EL FALLO a propósito: el error más común es
    // llaves de producción contra el entorno de pruebas, y sin este dato el
    // mensaje del banco no basta para verlo.
    return fallo(sesion.mensaje, { paso: "validar_comercio", ambiente: comercio.ambiente });
  }

  const { data: pedidoFresco } = await sb
    .from("pedidos")
    .select("codigo")
    .eq("id", pedido.id)
    .maybeSingle();

  const codigo = String(pedidoFresco?.codigo ?? "");
  if (!codigo) return fallo("Este pedido no tiene código de cobro.");

  const orden = await crearOrdenYappy(comercio, sesion.token, {
    codigo,
    total: pedido.total,
    telefono: pedido.telefono,
    ipnUrl: `https://${DOMINIO_TIENDAS}/api/tienda/yappy/ipn`,
  });
  if (!orden.ok || !orden.datos) {
    return fallo(orden.mensaje, { paso: "crear_orden", ambiente: comercio.ambiente });
  }

  // LA HORA SE GUARDA AQUÍ, no cuando llegue el aviso: es justo el aviso lo que
  // puede no llegar nunca. Y el id de transacción se guarda porque Yappy solo
  // lo da una vez.
  await sb
    .from("pedidos")
    .update({
      pago: "pendiente",
      pago_iniciado_en: new Date().toISOString(),
      pago_transaccion: orden.datos.transactionId,
    })
    .eq("id", pedido.id);

  await sb.from("pedido_eventos").insert({
    pedido_id: pedido.id,
    que: "pago_pendiente",
    quien: "yappy",
    detalle: { ambiente: comercio.ambiente, transactionId: orden.datos.transactionId },
  });

  return { yappy: { ...orden.datos, cdn: CDN_YAPPY[comercio.ambiente] } };
}
