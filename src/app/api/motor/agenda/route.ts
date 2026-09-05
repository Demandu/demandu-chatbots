import { horariosLibres, agendar } from "@/lib/agenda";
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
    });
    return Response.json(r, { status: r.ok ? 200 : 200 });
  }

  return Response.json({ error: "acción desconocida" }, { status: 400 });
}
