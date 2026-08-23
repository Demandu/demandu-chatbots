import { revisarServicios, guardarChequeos } from "@/lib/estado/servicios";
import { revisarMeta } from "@/lib/estado/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Revisa el estado de todo y lo guarda. La llama una tarea programada.
 *
 * Pide el mismo secreto compartido que el resto de tareas. Aquí importa más
 * que en las otras: sin él, cualquiera podría hacernos consultar la API de
 * Meta en bucle hasta que nos limite — y Meta nos limita a NOSOTROS, no a
 * quien llamó.
 *
 * `?solo=servicios` salta la parte de Meta. Sirve para mirar la infra cada
 * pocos minutos sin gastar llamadas a Meta, que basta con revisar cada hora.
 */
export async function POST(req: Request) {
  const secreto = process.env.CRON_SECRET;
  const dado = req.headers.get("x-demandu-cron") ?? "";
  if (!secreto || dado !== secreto) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const solo = new URL(req.url).searchParams.get("solo");
  const origen = new URL(req.url).origin;

  const chequeos = await revisarServicios(origen);
  await guardarChequeos(chequeos);

  const meta = solo === "servicios" ? null : await revisarMeta();

  return Response.json({
    ok: true,
    servicios: chequeos.map((c) => ({ servicio: c.servicio, ok: c.ok, ms: c.latencia_ms })),
    meta,
  });
}
