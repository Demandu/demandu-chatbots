import { turnosConSitio, hacerReserva } from "@/lib/reservas/servidor";
import { esDelMotor } from "@/lib/motor/autorizado";

export const dynamic = "force-dynamic";

/**
 * LAS RESERVAS, PARA EL MOTOR DE WhatsApp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El motor corre en Deno y no puede importar del proyecto. En vez de copiarle
 * el cálculo de disponibilidad —que se separaría de este y entonces WhatsApp
 * diría que hay mesa y la plataforma que no— lo llama por aquí.
 *
 * Es el mismo patrón que `/api/motor/agenda` y `/api/motor/pedido`, y se
 * autentica igual: con la llave de servicio que el motor y la web YA comparten.
 * No hay un secreto nuevo que configurar, y un secreto que hay que acordarse de
 * poner es un secreto que un día falta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  if (!(await esDelMotor(req))) return Response.json({ error: "no autorizado" }, { status: 401 });

  const b = await req.json().catch(() => ({} as any));
  const orgId = String(b.org_id ?? "");
  if (!orgId) return Response.json({ error: "falta org_id" }, { status: 400 });

  if (b.accion === "turnos") {
    const r = await turnosConSitio(orgId, String(b.fecha ?? ""), Number(b.personas));
    return Response.json(r);
  }

  if (b.accion === "reservar") {
    const r = await hacerReserva({
      orgId,
      fecha: String(b.fecha ?? ""),
      turnoId: String(b.turno_id ?? ""),
      personas: Number(b.personas),
      contactId: b.contacto_id ?? null,
      conversationId: b.conversacion_id ?? null,
      nombre: b.nombre ?? null,
      telefono: b.telefono ?? null,
      notas: b.notas ?? null,
      laHizo: "lana",
    });
    return Response.json(r);
  }

  // Una acción que no existe se dice, no se contesta con un éxito vacío: el
  // motor creería que funcionó y le confirmaría una reserva a alguien.
  return Response.json({ error: "acción desconocida" }, { status: 400 });
}
