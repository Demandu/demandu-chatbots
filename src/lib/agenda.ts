import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessTokenForOrg, freeBusy, createCalendarEvent } from "@/lib/integrations/google";
import { computeSlots, type Slot } from "@/lib/integrations/availability";

/**
 * Agendar citas. UNA sola implementación, tres puertas de entrada.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO REPARTIDO. Hay tres formas legítimas de agendar en
 * Demandu, y las tres tienen que dar exactamente el mismo resultado:
 *
 *   1. El bloque «Calendario» del constructor — el camino corto, para quien
 *      quiere una lista de horarios en el chat y punto.
 *   2. Un Flujo de WhatsApp + el bloque de API — el camino que muchos
 *      prefieren, porque el formulario nativo de WhatsApp se ve mejor y lo
 *      controlan ellos. Detrás llaman a `/api/v1/agenda`, que es esto mismo.
 *   3. La pantalla del constructor, para probar sin salir del editor.
 *
 * Si cada puerta tuviera su copia, el día que cambie el horario laboral o la
 * forma de calcular huecos, dos de las tres se quedarían atrás y nadie se
 * enteraría hasta que un cliente reclamara una cita doble.
 *
 * NO ESTÁ ATADO A GOOGLE POR DISEÑO. Hoy Google Calendar es lo único
 * conectado, pero el bloque de API deja al cliente apuntar a SU sistema —
 * Calendly, un ERP, lo que sea. Esta función es la implementación *nuestra*,
 * no la única posible.
 */

export type Cita = {
  ok: true;
  eventoId: string;
  enlace: string;
  inicioISO: string;
  finISO: string;
  /**
   * La misma hora, ya escrita para una persona. NO ES UN ADORNO: quien arma un
   * flujo escribe «tu cita quedó el {{cita_dia}} a las {{cita_hora}}», y si lo
   * único que le damos es `2026-08-27T15:00:00.000Z` acaba pegando eso en el
   * mensaje —o peor, no pone nada y el cliente recibe una confirmación con los
   * huecos vacíos, que fue exactamente lo que pasó aquí—.
   *
   * Se formatea de este lado porque la zona horaria del negocio vive aquí. El
   * motor corre en Deno y no la conoce; pedirle que la adivine es pedirle que
   * un día se equivoque en cinco husos.
   */
  dia: string;      // «jueves, 27 de agosto»
  hora: string;     // «10:00»
  etiqueta: string; // «jue 27 ago, 10:00» — el mismo formato de los botones
};

export type Fallo = { ok: false; error: string; motivo: "sin_conexion" | "sin_datos" | "google" };

/** Horario laboral y zona horaria del cliente. */
async function ajustesDeOrg(orgId: string) {
  const { data } = await createAdminClient()
    .from("organizations")
    .select("business_hours, timezone")
    .eq("id", orgId)
    .maybeSingle();
  return {
    businessHours: (data?.business_hours as any) ?? {},
    timeZone: (data?.timezone as string) || "America/Mexico_City",
  };
}

/**
 * Los huecos libres de verdad: horario laboral del negocio MENOS lo que ya
 * tiene ocupado en su calendario.
 *
 * Devuelve lista vacía si no hay Google conectado. No lanza: quien llama suele
 * ser un chatbot hablando con una persona, y una excepción ahí se traduce en
 * silencio, que es la peor respuesta posible.
 */
export async function horariosLibres(
  orgId: string,
  opts: { calendarId?: string; durationMin?: number; days?: number; maxSlots?: number } = {},
): Promise<{ slots: Slot[]; calendarId: string; conectado: boolean }> {
  const durationMin = Number(opts.durationMin) || 30;
  const days = Number(opts.days) || 14;
  const maxSlots = Number(opts.maxSlots) || 6;
  const calendarId = String(opts.calendarId || "").trim() || "primary";

  const admin = createAdminClient();
  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) return { slots: [], calendarId, conectado: false };

  const { businessHours, timeZone } = await ajustesDeOrg(orgId);
  const ahora = new Date();

  let ocupado: any[] = [];
  try {
    ocupado = await freeBusy(token, calendarId, ahora.toISOString(), new Date(ahora.getTime() + days * 86400_000).toISOString());
  } catch {
    // Sin poder leer lo ocupado se ofrecerían horas ya tomadas. Mejor no
    // ofrecer nada que agendar encima de otra cita.
    return { slots: [], calendarId, conectado: true };
  }

  return {
    slots: computeSlots({ businessHours, timeZone, durationMin, busy: ocupado, now: ahora, days, maxSlots }),
    calendarId,
    conectado: true,
  };
}

/**
 * Crea la cita.
 *
 * SE VUELVE A COMPROBAR QUE EL HUECO SIGA LIBRE. Entre que el bot ofrece los
 * horarios y la persona contesta pueden pasar minutos —o una hora, si dejó el
 * chat a medias— y en ese rato alguien más pudo tomar esa hora. Sin esta
 * comprobación se agendan dos citas en el mismo hueco y el negocio se entera
 * cuando llegan los dos clientes.
 */
export async function agendar(
  orgId: string,
  d: {
    inicioISO: string;
    durationMin?: number;
    calendarId?: string;
    titulo?: string;
    descripcion?: string;
    correoInvitado?: string;
  },
): Promise<Cita | Fallo> {
  const inicio = String(d.inicioISO || "").trim();
  if (!inicio || Number.isNaN(Date.parse(inicio))) {
    return { ok: false, motivo: "sin_datos", error: "Falta la fecha y hora de la cita." };
  }

  const durationMin = Number(d.durationMin) || 30;
  const calendarId = String(d.calendarId || "").trim() || "primary";

  const admin = createAdminClient();
  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) {
    return {
      ok: false,
      motivo: "sin_conexion",
      error: "Este negocio no tiene Google Calendar conectado.",
    };
  }

  const { timeZone } = await ajustesDeOrg(orgId);
  const finISO = new Date(Date.parse(inicio) + durationMin * 60_000).toISOString();

  try {
    const ocupado = await freeBusy(token, calendarId, inicio, finISO);
    if (ocupado.length) {
      return {
        ok: false,
        motivo: "sin_datos",
        error: "Ese horario acaba de ocuparse. Elige otro, por favor.",
      };
    }
  } catch {
    // Si no se puede comprobar, se sigue: el riesgo de duplicar es menor que
    // el de no agendar a nadie porque Google tuvo un mal minuto.
  }

  try {
    const ev = await createCalendarEvent(token, calendarId, {
      summary: d.titulo || "Cita agendada · Demandu",
      description: d.descripcion || "Cita agendada desde el chatbot.",
      startISO: inicio,
      endISO: finISO,
      timeZone,
      attendeeEmail: d.correoInvitado || undefined,
    });
    const cuando = new Date(Date.parse(inicio));
    return {
      ok: true,
      eventoId: ev.id,
      enlace: ev.htmlLink,
      inicioISO: inicio,
      finISO,
      dia: new Intl.DateTimeFormat("es-MX", {
        timeZone, weekday: "long", day: "numeric", month: "long",
      }).format(cuando),
      hora: new Intl.DateTimeFormat("es-MX", {
        timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(cuando),
      etiqueta: new Intl.DateTimeFormat("es-MX", {
        timeZone, weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(cuando),
    };
  } catch (e: any) {
    return { ok: false, motivo: "google", error: e?.message ?? "Google no aceptó la cita." };
  }
}
