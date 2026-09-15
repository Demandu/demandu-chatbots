import {
  turnosConSitio, hacerReserva, misReservas, proximaReserva,
  moverReserva, cancelarReserva, fechaDelNegocio,
} from "@/lib/reservas/servidor";
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

  /* LA FECHA LA RESUELVE LA PLATAFORMA, NO EL MODELO.
   *
   * Acepta un día exacto (`fecha`) o una distancia (`dias`: 0 hoy, 1 mañana),
   * y la cuenta se hace en la zona del restaurante. Y se devuelve SIEMPRE
   * `hoy`, para que el motor pueda decirle al modelo desde qué día contar en
   * vez de dejarlo adivinando. */
  const resolverFecha = async () => {
    const exacta = String(b.fecha ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(exacta)) return exacta;
    const dias = Number(b.dias);
    if (Number.isFinite(dias) && dias >= 0 && dias <= 365) return await fechaDelNegocio(orgId, dias);
    return "";
  };

  if (b.accion === "turnos") {
    const hoy = await fechaDelNegocio(orgId);
    const fecha = await resolverFecha();
    if (!fecha) {
      return Response.json({
        ok: false, motivo: "sin_fecha", hoy,
        queDecir: `Hoy es ${hoy}. Pregúntale para qué día quiere la mesa y vuelve a llamarme con esa fecha en AAAA-MM-DD.`,
      });
    }
    const r = await turnosConSitio(orgId, fecha, Number(b.personas));
    return Response.json({ ...r, hoy });
  }

  if (b.accion === "reservar") {
    const r = await hacerReserva({
      orgId,
      fecha: await resolverFecha(),
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

  /* ── LAS TRES QUE MIRAN LA RESERVA QUE YA TIENE ───────────────────────────
   *
   * Las tres reciben `contacto_id` y NUNCA un id de reserva. El motor tampoco
   * lo tiene: lo saca el modelo, y el modelo no puede saber un uuid — se lo
   * inventaría, y un uuid inventado que exista es la mesa de otra persona.
   * Aquí se busca por contacto, igual que en las citas. */

  if (b.accion === "mis_reservas") {
    const r = await misReservas(orgId, b.contacto_id ?? null);
    // `null` es «no pude mirar», que NO es lo mismo que «no tiene ninguna».
    if (r === null) return Response.json({ ok: false, motivo: "no_se_pudo" });
    return Response.json({ ok: true, reservas: r });
  }

  if (b.accion === "mover") {
    const suya = await proximaReserva(orgId, b.contacto_id ?? null);
    if (suya === undefined) {
      return Response.json({ ok: false, motivo: "no_se_pudo", queDecir: "No pude consultar su reserva. Dile que alguien del restaurante le escribe enseguida." });
    }
    if (!suya) {
      return Response.json({ ok: false, motivo: "sin_reserva", queDecir: "Esta persona no tiene ninguna reserva por delante. Ofrécele hacer una." });
    }
    const r = await moverReserva({
      orgId, reserva: suya,
      fecha: await resolverFecha(),
      turnoId: String(b.turno_id ?? ""),
      personas: b.personas ?? null,
    });
    return Response.json(r);
  }

  if (b.accion === "cancelar") {
    const suya = await proximaReserva(orgId, b.contacto_id ?? null);
    if (suya === undefined) {
      return Response.json({ ok: false, motivo: "no_se_pudo", queDecir: "No pude consultar su reserva. Dile que alguien del restaurante le escribe enseguida." });
    }
    if (!suya) {
      return Response.json({ ok: false, motivo: "sin_reserva", queDecir: "Esta persona no tiene ninguna reserva por delante. No hay nada que cancelar." });
    }
    const r = await cancelarReserva(orgId, suya.id);
    return Response.json(r);
  }

  // Una acción que no existe se dice, no se contesta con un éxito vacío: el
  // motor creería que funcionó y le confirmaría una reserva a alguien.
  return Response.json({ error: "acción desconocida" }, { status: 400 });
}
