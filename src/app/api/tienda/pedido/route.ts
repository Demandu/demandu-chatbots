import { NextResponse } from "next/server";
import { crearPedido } from "@/lib/tienda/crearPedido";
import type { LineaPedida } from "@/lib/tienda/recalcular";

/**
 * Crear un pedido desde el escaparate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PEDIDO SE GUARDA ANTES DE ABRIR WHATSAPP, y esa es la razón de que esta
 * ruta exista. Hasta ahora, si el cliente pulsaba el botón y no llegaba a
 * enviar el mensaje —se arrepintió, se le fue el internet, cerró sin querer—
 * ese pedido se perdía entero y el negocio nunca supo que existió.
 *
 * ES PÚBLICA A PROPÓSITO: la tienda no pide cuenta. Por eso NADA de lo que
 * llega se cree salvo qué productos y cuántos: los precios se vuelven a leer
 * del catálogo. Sin eso, cualquiera pediría un saco de sesenta dólares por un
 * centavo.
 *
 * ── AQUÍ YA NO SE CREA EL PEDIDO, SE PIDE QUE SE CREE ─────────────────────
 *
 * Todo lo que era este archivo vive ahora en `crearPedido`, porque el chat
 * empezó a tomar pedidos y necesitaba exactamente lo mismo. Dos copias de la
 * creación de un pedido es garantizar que un día cobren distinto según por
 * dónde pidió el cliente — y eso solo lo descubre alguien comparando recibos.
 *
 * Esta ruta se quedó con lo único que es suyo: leer el JSON, decir de qué
 * canal viene y traducir el resultado a códigos HTTP.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  let cuerpo: {
    slug?: string;
    lineas?: LineaPedida[];
    respuestas?: Record<string, string>;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió el pedido." }, { status: 400 });
  }

  const slug = String(cuerpo?.slug ?? "").trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Falta la tienda." }, { status: 400 });

  const r = await crearPedido({
    slug,
    lineas: cuerpo?.lineas ?? [],
    respuestas: cuerpo?.respuestas ?? {},
    // EL CANAL LO PONE LA RUTA, NO EL NAVEGADOR. Es la única forma de que
    // «vino de la tienda» signifique algo: si viajara en el cuerpo, cualquiera
    // podría marcar sus pedidos como si vinieran del chat y las cuentas de qué
    // canal vende más dejarían de valer.
    canal: "tienda",
  });

  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, ...(r.rechazos ? { rechazos: r.rechazos } : {}) },
      { status: r.estado },
    );
  }

  return NextResponse.json({
    numero: r.numero,
    codigo: r.codigo,
    total: r.total,
    texto: r.texto,
    rechazos: r.rechazos,
  });
}
