import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipnValido, PAGOS_YAPPY, dominioDeCobro } from "@/lib/tienda/yappy";
import { DOMINIO_TIENDAS } from "@/lib/tienda/direccion";

/**
 * El aviso de pago de Yappy (IPN).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA ES LA ÚNICA VOZ QUE PUEDE DECIR «ESTE PEDIDO ESTÁ PAGADO», y llega por
 * una dirección pública que cualquiera puede llamar desde el navegador. Lo
 * único que separa un pago de verdad de uno inventado es la firma.
 *
 * POR ESO AQUÍ NO SE ES AMABLE: sin firma válida no se toca nada. Ni se avisa
 * de más: contestar «ese pedido no existe» a uno y «firma incorrecta» a otro
 * convierte esta ruta en una máquina de adivinar códigos de pedido.
 *
 * NO SE MIRA NADA DE LO QUE VIENE EN LA URL PARA DECIDIR CUÁNTO SE COBRÓ. El
 * aviso solo dice qué pasó con el cobro que NOSOTROS creamos; el importe es el
 * que el servidor calculó al hacer el pedido y no se vuelve a tocar.
 *
 * SE PUEDE REPETIR SIN HACER DAÑO. Yappy reintenta si no contestamos rápido, y
 * dos avisos iguales tienen que dejar el pedido igual — no dos pagos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const orderId = String(q.get("orderId") ?? "").trim();
  const status = String(q.get("status") ?? "").trim().toUpperCase();
  const hash = String(q.get("hash") ?? "").trim();
  const domain = String(q.get("domain") ?? "").trim();

  // EL NÚMERO DE CONFIRMACIÓN NO ENTRA EN LA FIRMA —Yappy firma orderId, status
  // y dominio— así que se trata como lo que es: un dato que se guarda para que
  // el negocio pueda cotejarlo con lo que el cliente ve en su app, nunca como
  // algo en lo que apoyarse para decidir si hubo pago.
  const referencia = String(q.get("confirmationNumber") ?? "").trim().slice(0, 64);

  // Una respuesta sola para todo lo que no cuadra: qué falló es asunto del
  // registro, no de quien llama.
  const no = () => NextResponse.json({ ok: false }, { status: 400 });

  if (!orderId || !status || !hash) return no();

  const sb = createAdminClient();

  const { data: pedido } = await sb
    .from("pedidos")
    .select("id,tienda_id,estado,pago,total,pago_referencia")
    .eq("codigo", orderId)
    .maybeSingle();

  if (!pedido) return no();

  const { data: cobro } = await sb
    .from("tienda_cobros")
    .select("secreto,dominio")
    .eq("tienda_id", pedido.tienda_id)
    .eq("proveedor", "yappy")
    .maybeSingle();

  const firma = ipnValido({
    secreto: cobro?.secreto ?? "",
    orderId,
    status,
    domain,
    hash,
    dominioEsperado: dominioDeCobro(cobro?.dominio, DOMINIO_TIENDAS),
  });

  if (!firma.ok) {
    // SE DEJA CONSTANCIA AUNQUE SE RECHACE: un aviso mal firmado contra un
    // pedido que existe es, o un error de configuración, o alguien probando.
    // Las dos cosas hay que poder verlas después.
    await sb.from("pedido_eventos").insert({
      pedido_id: pedido.id,
      que: "pago_rechazado_firma",
      quien: "yappy",
      detalle: { motivo: firma.motivo, status },
    });
    return no();
  }

  const pago = PAGOS_YAPPY[status] ?? "rechazado";

  // Ya estaba en ese estado: se contesta bien y no se escribe nada. Un reintento
  // no puede volver a mover el pedido ni duplicar el evento.
  if (pedido.pago === pago && (!referencia || pedido.pago_referencia === referencia)) {
    return NextResponse.json({ ok: true });
  }

  const cambios: Record<string, unknown> = { pago, updated_at: new Date().toISOString() };
  if (referencia) cambios.pago_referencia = referencia;
  if (pago === "pagado") {
    cambios.pagado_en = new Date().toISOString();
    // Pagar confirma el pedido: nadie tiene que entrar a pulsar «Confirmado»
    // para algo que ya está cobrado. Si el negocio ya lo movió más allá, se
    // respeta lo que hizo.
    if (pedido.estado === "recibido") cambios.estado = "confirmado";
  }

  await sb.from("pedidos").update(cambios).eq("id", pedido.id);
  await sb.from("pedido_eventos").insert({
    pedido_id: pedido.id,
    que: `pago_${pago}`,
    quien: "yappy",
    detalle: { status, total: pedido.total, referencia: referencia || null },
  });

  return NextResponse.json({ ok: true });
}
