import { orgDeLaLlave } from "@/lib/llavesApi";
import { horariosLibres, agendar } from "@/lib/agenda";

export const dynamic = "force-dynamic";

/**
 * AGENDA PÚBLICA. La puerta para el camino «Flujo de WhatsApp + bloque de API».
 *
 * PARA QUÉ EXISTE. Hay dos formas de agendar en Demandu y ninguna es la buena
 * para todo el mundo:
 *
 *   · El bloque «Calendario» — se configura en un minuto y listo.
 *   · Un Flujo de WhatsApp con el formulario nativo de Meta + este endpoint —
 *     se ve mucho mejor, el cliente controla cada campo, y por detrás puede
 *     ir Google Calendar (esto) o su propio sistema.
 *
 * Quien quiera lo segundo pega esta dirección en su bloque de API con su llave
 * de Demandu, y agenda contra el mismo motor que usa el bloque de Calendario.
 * Mismo cálculo de horarios, mismo horario laboral, mismos huecos ocupados.
 *
 * Se autentica con la llave de API de la organización — la misma de Zapier y
 * Make. Nadie tiene que darnos credenciales de Google: eso ya está conectado
 * del lado del cliente.
 *
 *   GET  ?duracion=30&calendario=primary   → horarios libres
 *   POST { inicio, duracion, correo, ... } → crea la cita
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-demandu-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(req: Request) {
  const orgId = await orgDeLaLlave(req);
  if (!orgId) return Response.json({ error: "Llave de API inválida o revocada." }, { status: 401, headers: cors });

  const u = new URL(req.url);
  const r = await horariosLibres(orgId, {
    calendarId: u.searchParams.get("calendario") ?? undefined,
    durationMin: Number(u.searchParams.get("duracion")) || undefined,
    days: Number(u.searchParams.get("dias")) || undefined,
    maxSlots: Number(u.searchParams.get("cuantos")) || undefined,
  });

  if (!r.conectado) {
    return Response.json(
      { error: "Este negocio no tiene Google Calendar conectado.", horarios: [] },
      { status: 409, headers: cors },
    );
  }

  // Se devuelve `label` ya formateado en español además del ISO: quien arma un
  // Flujo de WhatsApp necesita texto para los botones, y obligarle a formatear
  // fechas dentro del flujo es pedirle que reimplemente lo que ya hicimos.
  return Response.json({ horarios: r.slots, calendario: r.calendarId }, { headers: cors });
}

export async function POST(req: Request) {
  const orgId = await orgDeLaLlave(req);
  if (!orgId) return Response.json({ error: "Llave de API inválida o revocada." }, { status: 401, headers: cors });

  const b = await req.json().catch(() => ({} as any));

  const r = await agendar(orgId, {
    // Se aceptan los dos nombres. Quien arma esto está pegando campos de un
    // formulario de WhatsApp a mano; discutirle si es `inicio` o `inicioISO`
    // es regalarle una tarde de depuración por nada.
    inicioISO: String(b.inicio ?? b.inicioISO ?? b.startISO ?? ""),
    durationMin: Number(b.duracion ?? b.durationMin) || undefined,
    calendarId: b.calendario ?? b.calendarId,
    titulo: b.titulo ?? b.summary,
    descripcion: b.descripcion ?? b.description,
    correoInvitado: b.correo ?? b.email ?? b.attendeeEmail,
  });

  if (!r.ok) {
    // 409 cuando el hueco se ocupó (se puede reintentar con otra hora), 400
    // cuando faltan datos, 502 cuando el problema es de Google. Un chatbot
    // decide qué decirle a la persona a partir de esto.
    const status = r.motivo === "sin_conexion" ? 409 : r.motivo === "google" ? 502 : 400;
    return Response.json({ error: r.error }, { status, headers: cors });
  }

  return Response.json(
    {
      ok: true,
      evento: r.eventoId,
      enlace: r.enlace,
      inicio: r.inicioISO,
      fin: r.finISO,
      // Ya escrito para una persona. Quien usa esto desde un bloque de API lo
      // recibe como {{api_dia}} y {{api_hora}} y lo pega en su mensaje tal cual.
      dia: r.dia,
      hora: r.hora,
      etiqueta: r.etiqueta,
    },
    { headers: cors },
  );
}
