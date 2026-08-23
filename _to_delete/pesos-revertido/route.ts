import { refrescarTipoDeCambio } from "@/lib/billing/cambioRefrescar";

export const dynamic = "force-dynamic";

/**
 * Actualiza el tipo de cambio que se muestra junto a los precios.
 *
 * Lo dispara una tarea programada. Pide el mismo secreto compartido que el
 * resto de tareas: sin él, cualquiera podría hacernos pegarle al servicio de
 * tipos de cambio hasta que nos bloqueen.
 *
 * NO TOCA NINGÚN PRECIO. Solo escribe una tabla de referencia.
 */
export async function POST(req: Request) {
  const secreto = process.env.CRON_SECRET;
  const dado = req.headers.get("x-demandu-cron") ?? "";
  if (!secreto || dado !== secreto) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const r = await refrescarTipoDeCambio();

  // El detalle de cada intento se devuelve a propósito: a esta ruta solo llega
  // quien trae el secreto, así que no se le filtra nada a nadie, y sin ese
  // detalle un fallo de esto es imposible de diagnosticar.
  return Response.json(r, { status: r.ok ? 200 : 502 });
}
