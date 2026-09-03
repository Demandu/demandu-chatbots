import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConfig } from "@/lib/tienda/config";
import { sanearGrupos } from "@/lib/tienda/variedades";
import { recalcularPedido, type LineaPedida, type ProductoDelCatalogo } from "@/lib/tienda/recalcular";
import { textoDelPedido, type LineaCarrito } from "@/lib/tienda/pedido";
import { DOMINIO_TIENDAS } from "@/lib/tienda/direccion";
import {
  aliasValido,
  codigoDePedido,
  crearOrdenYappy,
  esAmbiente,
  montoCobrable,
  validarComercio,
  CDN_YAPPY,
} from "@/lib/tienda/yappy";

/**
 * Crear un pedido desde el escaparate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PEDIDO SE GUARDA ANTES DE ABRIR WHATSAPP, y esa es la razón de que esta
 * ruta exista. Hasta ahora, si el cliente pulsaba el botón y no llegaba a
 * enviar el mensaje —se arrepintió, se le fue el internet, cerró sin querer—
 * ese pedido se perdía entero y el negocio nunca supo que existió. Ahora queda
 * registrado y se puede ir a buscar.
 *
 * ES PÚBLICA A PROPÓSITO: la tienda no pide cuenta. Por eso NADA de lo que
 * llega se cree salvo qué productos y cuántos: los precios se vuelven a leer
 * del catálogo en `recalcularPedido`. Sin eso, cualquiera pediría un saco de
 * sesenta dólares por un centavo.
 *
 * Se usa el cliente con `service_role` porque no hay sesión, y por eso mismo
 * cada consulta lleva su `tienda_id` escrito a mano: aquí no hay RLS que
 * proteja de un descuido.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  let cuerpo: {
    slug?: string;
    lineas?: LineaPedida[];
    respuestas?: Record<string, string>;
    pago?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió el pedido." }, { status: 400 });
  }

  const slug = String(cuerpo?.slug ?? "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Falta la tienda." }, { status: 400 });

  const sb = createAdminClient();

  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,org_id,nombre,slug,activa,config")
    .eq("slug", slug)
    .maybeSingle();

  // Una tienda cerrada no recibe pedidos. Que el escaparate no se pinte no
  // basta: alguien puede tener la pestaña abierta desde antes de cerrarla.
  if (!tienda || !tienda.activa) {
    return NextResponse.json({ error: "Esta tienda no está disponible." }, { status: 404 });
  }

  const { data: prods } = await sb
    .from("tienda_productos")
    .select("id,nombre,precio,oculto,stock,variedades")
    .eq("tienda_id", tienda.id);

  const catalogo: ProductoDelCatalogo[] = ((prods ?? []) as ProductoDelCatalogo[]).map((p) => ({
    ...p,
    variedades: sanearGrupos(p.variedades),
  }));

  const { lineas, total, rechazos } = recalcularPedido(catalogo, cuerpo?.lineas ?? []);
  if (!lineas.length) {
    return NextResponse.json(
      { error: rechazos[0] ?? "El pedido quedó vacío.", rechazos },
      { status: 400 },
    );
  }

  const config = leerConfig(tienda.config);
  if (config.minimo_pedido > 0 && total < config.minimo_pedido) {
    return NextResponse.json({ error: "El pedido no llega al mínimo." }, { status: 400 });
  }

  // Las respuestas se guardan CON SU ETIQUETA, no solo con el id: si mañana el
  // negocio renombra una pregunta, el pedido viejo tiene que seguir
  // explicándose solo.
  const respuestas = config.preguntas
    .map((p) => ({
      id: p.id,
      etiqueta: p.etiqueta,
      valor: String(cuerpo?.respuestas?.[p.id] ?? "").trim().slice(0, 500),
    }))
    .filter((r) => r.valor);

  const faltan = config.preguntas
    .filter((p) => p.obligatoria && !respuestas.some((r) => r.id === p.id))
    .map((p) => p.etiqueta);
  if (faltan.length) {
    return NextResponse.json({ error: `Falta ${faltan.join(", ")}.` }, { status: 400 });
  }

  const { data: numero, error: errNumero } = await sb.rpc("siguiente_numero_pedido", {
    p_tienda: tienda.id,
  });
  if (errNumero || !numero) {
    return NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 });
  }

  // EL CÓDIGO CORTO SE PONE SIEMPRE, se vaya a cobrar en línea o no: es lo que
  // se dicta por teléfono y lo que usará cualquier pasarela que se enchufe
  // después. Ponerlo solo cuando hace falta obliga a inventarlo más tarde,
  // cuando el pedido ya está en manos de otro sistema.
  let pedido: { id: string; numero: number; codigo: string } | null = null;
  for (let intento = 0; intento < 3 && !pedido; intento++) {
    const codigo = codigoDePedido();
    const { data } = await sb
      .from("pedidos")
      .insert({
        org_id: tienda.org_id,
        tienda_id: tienda.id,
        numero,
        total,
        canal: "tienda",
        respuestas,
        codigo,
      })
      .select("id,numero,codigo")
      .single();
    if (data) pedido = data as { id: string; numero: number; codigo: string };
  }

  if (!pedido) {
    return NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 });
  }

  // Un alias constante: dentro de las funciones de abajo, TypeScript ya no
  // recuerda que `pedido` dejó de ser nulo tres líneas antes.
  const ped = pedido;

  await sb.from("pedido_lineas").insert(
    lineas.map((l, i) => ({
      pedido_id: ped.id,
      producto_id: l.producto_id,
      nombre: l.nombre,
      precio: l.precio,
      cantidad: l.cantidad,
      elegidas: l.elegidas,
      nota: l.nota || null,
      orden: i,
    })),
  );

  await sb.from("pedido_eventos").insert({
    pedido_id: ped.id,
    que: "recibido",
    quien: "tienda",
    detalle: { total, lineas: lineas.length, rechazos },
  });

  // EL TEXTO LO ARMA EL SERVIDOR, con los precios de verdad. Si lo armara el
  // navegador, el mensaje podría decir un total y el pedido guardado otro — y
  // entonces nadie sabría cuál de los dos se cobra.
  const paraTexto: LineaCarrito[] = lineas.map((l, i) => ({
    clave: String(i),
    producto_id: l.producto_id,
    nombre: l.nombre,
    // `textoDelPedido` suma los recargos al precio base; aquí el precio ya los
    // trae, así que las elegidas van sin recargo para no contarlos dos veces.
    precio: l.precio,
    cantidad: l.cantidad,
    elegidas: l.elegidas.map((e) => ({ ...e, recargo: 0 })),
    nota: l.nota,
  }));

  const texto = [
    `*Pedido #${ped.numero}*`,
    textoDelPedido({
      tienda: config.titulo || tienda.nombre,
      lineas: paraTexto,
      respuestas: Object.fromEntries(respuestas.map((r) => [r.id, r.valor])),
      preguntas: config.preguntas,
      moneda: config.moneda,
    }),
  ].join("\n");

  const yappy = cuerpo?.pago === "yappy" ? await cobrarConYappy() : null;

  return NextResponse.json({
    numero: ped.numero,
    codigo: ped.codigo,
    total,
    texto,
    rechazos,
    ...(yappy ?? {}),
  });

  /**
   * Preparar el cobro con Yappy.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * SI YAPPY FALLA, EL PEDIDO NO SE CAE. Ya está guardado y el cliente ya tiene
   * su mensaje de WhatsApp: quitárselo porque el banco no contestó sería
   * perder una venta por algo que no es culpa de nadie de los dos. Se devuelve
   * el motivo y la tienda ofrece pagar al recibir.
   * ───────────────────────────────────────────────────────────────────────────
   */
  async function cobrarConYappy() {

    const { data: cobro } = await sb
      .from("tienda_cobros")
      .select("comercio,secreto,dominio,ambiente,activo")
      .eq("tienda_id", tienda!.id)
      .eq("proveedor", "yappy")
      .maybeSingle();

    if (!cobro?.activo || !cobro.comercio || !cobro.secreto) {
      return { yappy_error: "Esta tienda no está cobrando con Yappy ahora mismo." };
    }
    if (!montoCobrable(total)) {
      return { yappy_error: "El monto es demasiado bajo para cobrarlo en línea." };
    }

    // EL TELÉFONO SALE DE LO QUE YA CONTESTÓ. Yappy necesita el número para
    // abrir la app en el teléfono correcto, y volver a pedirlo en la pantalla
    // de pago es una casilla más donde el pedido se abandona.
    const preguntaTel = config.preguntas.find((p) => p.tipo === "telefono");
    const telefono = preguntaTel
      ? (respuestas.find((r) => r.id === preguntaTel.id)?.valor ?? "")
      : "";

    if (!aliasValido(telefono)) {
      return {
        yappy_error: "Para pagar con Yappy hace falta un número de celular de Panamá (8 dígitos).",
      };
    }

    const comercio = {
      comercio: cobro.comercio,
      secreto: cobro.secreto,
      dominio: cobro.dominio || `https://${DOMINIO_TIENDAS}`,
      ambiente: esAmbiente(cobro.ambiente),
    };

    const sesion = await validarComercio(comercio);
    if (!sesion.ok) return { yappy_error: sesion.mensaje };

    const orden = await crearOrdenYappy(comercio, sesion.token, {
      codigo: ped.codigo,
      total,
      telefono,
      ipnUrl: `https://${DOMINIO_TIENDAS}/api/tienda/yappy/ipn`,
    });
    if (!orden.ok || !orden.datos) return { yappy_error: orden.mensaje };

    await sb.from("pedidos").update({ pago: "pendiente" }).eq("id", ped.id);
    await sb.from("pedido_eventos").insert({
      pedido_id: ped.id,
      que: "pago_pendiente",
      quien: "yappy",
      detalle: { ambiente: comercio.ambiente, transactionId: orden.datos.transactionId },
    });

    return { yappy: { ...orden.datos, cdn: CDN_YAPPY[comercio.ambiente] } };
  }
}
