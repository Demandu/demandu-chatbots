import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConfig } from "@/lib/tienda/config";
import { cobrarPedidoConYappy } from "@/lib/tienda/cobrar-pedido";

/**
 * Volver a intentar el cobro de un pedido que ya existe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA RUTA NACIÓ DE MIRAR LA BASE: dos pedidos idénticos, cuatro segundos de
 * diferencia. Fue alguien pulsando «pagar», viendo un error y pulsando otra
 * vez. Cada intento creaba un pedido nuevo, y el negocio se quedaba con
 * fantasmas que cancelar a mano — justo cuando ya estaba molesto porque el
 * cobro no le funcionaba.
 *
 * UN REINTENTO DE PAGO NO ES UN PEDIDO NUEVO.
 *
 * ES PÚBLICA, así que no se cree nada de lo que llega: el código identifica al
 * pedido, y el importe, el teléfono y la tienda salen de la base. Lo único que
 * se consigue con un código ajeno es crearle un cobro a un pedido que ya
 * existe, por su importe real y a nombre de su propia tienda — lo mismo que
 * puede hacer cualquiera que tenga el enlace de la tienda.
 *
 * UN PEDIDO YA PAGADO NO SE VUELVE A COBRAR. Es lo que impide que un reintento
 * tardío le pase la factura dos veces a alguien.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  let cuerpo: { slug?: string; codigo?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió la petición." }, { status: 400 });
  }

  const slug = String(cuerpo?.slug ?? "").trim().toLowerCase();
  const codigo = String(cuerpo?.codigo ?? "").trim().toUpperCase();
  if (!slug || !/^[A-Z0-9]{1,15}$/.test(codigo)) {
    return NextResponse.json({ error: "Faltan datos del pedido." }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,activa,config")
    .eq("slug", slug)
    .maybeSingle();

  if (!tienda || !tienda.activa) {
    return NextResponse.json({ error: "Esta tienda no está disponible." }, { status: 404 });
  }

  const { data: pedido } = await sb
    .from("pedidos")
    .select("id,tienda_id,total,pago,respuestas")
    .eq("codigo", codigo)
    .eq("tienda_id", tienda.id)
    .maybeSingle();

  if (!pedido) return NextResponse.json({ error: "Ese pedido no existe." }, { status: 404 });

  if (pedido.pago === "pagado") {
    return NextResponse.json({ error: "Este pedido ya está pagado." }, { status: 409 });
  }

  // El teléfono sale de lo que contestó en el formulario, no de la petición:
  // dejar cambiarlo al reintentar permitiría mandarle el cobro de un pedido
  // ajeno al teléfono de cualquiera.
  const config = leerConfig(tienda.config);
  const preguntaTel = config.preguntas.find((p) => p.tipo === "telefono");
  const guardadas = (pedido.respuestas ?? []) as { id: string; valor: string }[];
  const telefono = preguntaTel
    ? (guardadas.find((r) => r.id === preguntaTel.id)?.valor ?? "")
    : "";

  const r = await cobrarPedidoConYappy(sb, {
    id: pedido.id,
    tienda_id: pedido.tienda_id,
    total: pedido.total,
    telefono,
  });

  return NextResponse.json({ codigo, total: pedido.total, ...r });
}
