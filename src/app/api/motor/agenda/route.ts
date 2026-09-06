import { horariosLibres, agendar, proximaCita, moverCita, cancelarCita } from "@/lib/agenda";
import { createAdminClient } from "@/lib/supabase/admin";
import { esDelMotor } from "@/lib/motor/autorizado";

export const dynamic = "force-dynamic";

/**
 * La misma agenda, pero para el MOTOR de WhatsApp.
 *
 * POR QUÉ NO REUSA `/api/v1/agenda`: aquella pide la llave de API del cliente,
 * y el motor no la tiene ni debe tenerla — atiende a todos los clientes y
 * guardar la llave de cada uno sería crear un llavero que no hace falta.
 *
 * POR QUÉ NO LLAMA A LA BASE DIRECTAMENTE: porque el cálculo de horarios vive
 * en la web (`computeSlots`, con el horario laboral y las zonas horarias) y
 * copiarlo al motor en Deno sería tener dos versiones que se separan.
 *
 * Se autentica con la llave de servicio de Supabase, que el motor y la web YA
 * comparten. No hay un secreto nuevo que configurar — y un secreto que hay que
 * acordarse de poner es un secreto que un día falta.
 */

export async function POST(req: Request) {
  if (!(await esDelMotor(req))) return Response.json({ error: "no autorizado" }, { status: 401 });

  const b = await req.json().catch(() => ({} as any));
  const orgId = String(b.org_id ?? "");
  if (!orgId) return Response.json({ error: "falta org_id" }, { status: 400 });

  if (b.accion === "horarios") {
    const r = await horariosLibres(orgId, {
      calendarId: b.calendario,
      // DOS CAMPOS, UNO POR AGENDA. Compartir uno solo es lo que rompió una
      // cuenta: el id de Google acabó viajando a Calendly como tipo de cita.
      calendlyTipo: b.calendly_tipo,
      agendaProveedor: b.agenda,
      durationMin: b.duracion,
      days: b.dias,
      maxSlots: b.cuantos,
    });
    return Response.json(r);
  }

  if (b.accion === "agendar") {
    const r = await agendar(orgId, {
      inicioISO: String(b.inicio ?? ""),
      durationMin: b.duracion,
      calendarId: b.calendario,
      calendlyTipo: b.calendly_tipo,
      agendaProveedor: b.agenda,
      titulo: b.titulo,
      descripcion: b.descripcion,
      correoInvitado: b.correo,
      // DE QUIÉN ES. El motor de WhatsApp no puede apuntar la cita —la tabla
      // vive de este lado— así que manda a quién pertenece y `agendar` la
      // apunta. Sin esto sus citas serían las únicas que no se pueden mover.
      contactoId: b.contacto_id ?? null,
      conversacionId: b.conversacion_id ?? null,
      nombreInvitado: b.nombre_invitado ?? null,
    });
    return Response.json(r);
  }

  /* ── MOVER Y CANCELAR ──────────────────────────────────────────────────
   *
   * El motor manda A QUIÉN, no QUÉ CITA. Es deliberado: la cita la elige esta
   * capa, con la misma consulta para los dos motores. Si el identificador
   * viajara por aquí, cualquiera que llegara a esta ruta con la llave de
   * servicio podría mover la cita de otra persona pasando otro id.
   *
   * `sin_cita` no es un error: es la respuesta correcta a «muévela» cuando no
   * hay ninguna, y el motor la convierte en algo que decirle a la persona. */
  if (b.accion === "mover" || b.accion === "cancelar") {
    const cita = await proximaCita(orgId, String(b.contacto_id ?? "") || null);
    if (!cita) return Response.json({ ok: false, sin_cita: true });

    if (b.accion === "cancelar") {
      return Response.json(await cancelarCita(orgId, cita));
    }

    // Sin hora nueva, la pregunta es «¿cuándo la tiene?». Se contesta ya
    // escrito para una persona: el motor corre en Deno y no conoce la zona
    // horaria del negocio, así que formatear allí sería equivocarse de huso.
    const inicio = String(b.inicio ?? "").trim();
    if (!inicio) {
      return Response.json({ ok: false, cuando: await comoSeLee(orgId, cita.inicio) });
    }

    return Response.json(await moverCita(orgId, cita, inicio));
  }

  return Response.json({ error: "acción desconocida" }, { status: 400 });
}

/**
 * Una fecha, escrita como la lee una persona, en la zona del negocio.
 *
 * SIN ZONA SE DEVUELVE VACÍO, no una fecha en el huso de otro país. Aquí había
 * `|| "America/Mexico_City"` y era uno de los diez respaldos que convirtieron
 * «no lo sabemos» en una respuesta plausible: decirle a alguien «tu cita es el
 * lunes a las 10» con una hora que no es la suya es peor que no decirle nada.
 */
async function comoSeLee(orgId: string, iso: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  const zona = (data?.timezone as string) || "";
  if (!zona) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}
