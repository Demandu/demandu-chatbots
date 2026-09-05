import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessTokenForOrg, freeBusy, createCalendarEvent } from "@/lib/integrations/google";
import { computeSlots, type Slot } from "@/lib/integrations/availability";
import * as calendly from "@/lib/integrations/calendly";
import {
  agendaDelBloque, leerPreferida, leerEleccionDelBloque, tipoDeEventoDeCalendly,
  type EleccionDelBloque,
} from "@/lib/agendaElegida";

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

export type Fallo = {
  ok: false;
  error: string;
  motivo: "sin_conexion" | "sin_datos" | "google" | "calendly" | "plan";
  /**
   * El enlace para agendar a mano, cuando lo hay.
   *
   * VIENE CON `motivo: "plan"`: la agenda del negocio está en el plan gratis de
   * Calendly, que no deja reservar por API. No es un error del cliente ni del
   * flujo — la cita se puede hacer igual, solo que abriendo el enlace. El
   * bloque lo manda en vez de decir «no se pudo».
   */
  enlace?: string;
};

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
 * ¿Con qué agenda trabaja este cliente?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE DECIDE EN DOS ALTURAS, y la de abajo manda:
 *
 *   1. EL BLOQUE «Agendar cita», si fijó una. Sirve para el negocio que usa
 *      Google para lo interno y Calendly para las demos, y quiere que ESTE
 *      bloque agende siempre en una en concreto.
 *   2. LA CUENTA (Ajustes → Integraciones), que es lo que sigue un bloque que
 *      nadie tocó — y lo único que hay para las herramientas de la IA, que no
 *      tienen bloque donde elegir.
 *
 * Sin nada elegido en ninguna de las dos, manda la que YA ESTABA FUNCIONANDO:
 * Google si está conectado. Conectar Calendly no puede mover la agenda de un
 * bot que ya agendaba — eso rompió una cuenta y está contado entero en
 * `agendaElegida.ts`.
 *
 * La regla vive ahí, pura y probada. Aquí queda solo lo que necesita la base:
 * quién está conectado DE VERDAD.
 * ─────────────────────────────────────────────────────────────────────────────
 */
type Conexion =
  | { cual: "calendly"; token: string; usuario: string; agendaUrl: string; planGratis: boolean }
  | { cual: "google" }
  | { cual: "ninguna" };

async function conexionDeAgenda(
  orgId: string,
  // LA ELECCIÓN DEL BLOQUE, si la hay. Llega desde el nodo «Agendar cita» y
  // manda sobre la de la cuenta, pero SOLO si esa agenda está conectada: un
  // bloque que apunta a una agenda desconectada no puede dejar al bot mudo.
  eleccionDelBloque?: EleccionDelBloque | null,
): Promise<Conexion> {
  const sb = createAdminClient();
  const [{ data: fila }, { data: org }] = await Promise.all([
    sb.from("integrations").select("data").eq("org_id", orgId).eq("provider", "calendly").maybeSingle(),
    sb.from("organizations").select("agenda_preferida").eq("id", orgId).maybeSingle(),
  ]);

  // ── «CONECTADO» ES QUE EL TOKEN SIRVA, NO QUE HAYA FILA ─────────────────
  // Una conexión con el token roto no puede ganar la elección: haría que el
  // bloque fallara siempre teniendo un Google sano al lado.
  let cal: { token: string; d: Record<string, unknown> } | null = null;
  if (fila) {
    const token = await calendly.tokenValido(orgId);
    if (token) cal = { token, d: (fila.data ?? {}) as Record<string, unknown> };
  }

  const manda = agendaDelBloque(eleccionDelBloque, leerPreferida(org?.agenda_preferida), {
    // Google no se comprueba aquí: `horariosLibres` y `agendarCita` ya saben
    // decir «no hay agenda conectada» cuando su token no sirve, y pedirlo
    // ahora costaría un viaje a Google en CADA mensaje que toque agenda.
    google: true,
    calendly: !!cal,
  });

  if (manda === "calendly" && cal) {
    return {
      cual: "calendly",
      token: cal.token,
      usuario: String(cal.d.usuario_uri ?? ""),
      agendaUrl: String(cal.d.agenda_url ?? ""),
      planGratis: cal.d.plan_gratis === true,
    };
  }

  // ── CALENDLY CONECTADO PERO CON EL TOKEN ROTO ────────────────────────────
  //
  // No se cae a Google en silencio: sería agendar en una agenda que este
  // negocio quizá lleva meses sin mirar, y sin que nadie se entere de que su
  // Calendly dejó de funcionar. Se dice que no hay agenda, que es la verdad.
  //
  // SALVO QUE ALGUIEN HAYA PEDIDO GOOGLE A PROPÓSITO —el bloque o la cuenta—.
  // Entonces Google no es un apaño silencioso: es exactamente lo que pidieron,
  // y el Calendly roto no tiene por qué estorbar.
  const pidieronGoogle =
    eleccionDelBloque === "google" || leerPreferida(org?.agenda_preferida) === "google";

  if (fila && !cal && !pidieronGoogle) return { cual: "ninguna" };

  return { cual: "google" };
}

/**
 * Se apunta que este cliente está en el plan gratis de Calendly.
 *
 * SE APRENDE DEL PRIMER INTENTO, no se pregunta. Calendly no dice en ningún
 * sitio legible en qué plan está una cuenta; lo dice al rechazar la reserva.
 * Guardarlo evita que la segunda persona pase por la misma conversación
 * incómoda —elegir hora y que al final no se pueda— porque a partir de ahí el
 * bloque manda el enlace directamente.
 */
async function apuntarPlanGratis(orgId: string): Promise<void> {
  try {
    const sb = createAdminClient();
    const { data } = await sb
      .from("integrations").select("data")
      .eq("org_id", orgId).eq("provider", "calendly").maybeSingle();
    await sb
      .from("integrations")
      .update({ data: { ...((data?.data as object) ?? {}), plan_gratis: true } })
      .eq("org_id", orgId)
      .eq("provider", "calendly");
  } catch {
    /* apuntarlo es una comodidad: que falle no puede tumbar la cita */
  }
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
  opts: {
    calendarId?: string;
    /** Tipo de cita de Calendly. CAMPO APARTE del de Google, a propósito. */
    calendlyTipo?: string;
    /** Qué agenda pidió el bloque. Ausente = la que use la cuenta. */
    agendaProveedor?: EleccionDelBloque | null;
    durationMin?: number;
    days?: number;
    maxSlots?: number;
  } = {},
): Promise<{ slots: Slot[]; calendarId: string; conectado: boolean; enlace?: string }> {
  const durationMin = Number(opts.durationMin) || 30;
  const days = Number(opts.days) || 14;
  const maxSlots = Number(opts.maxSlots) || 6;
  const calendarId = String(opts.calendarId || "").trim() || "primary";

  const conexion = await conexionDeAgenda(orgId, leerEleccionDelBloque(opts.agendaProveedor));

  // CALENDLY CONECTADO PERO CON EL TOKEN ROTO. No se cae a Google sin más:
  // sería agendar en una agenda que este negocio quizá lleva meses sin mirar.
  // Se dice que no hay agenda, que es la verdad, y el bloque ya sabe pedir
  // persona en vez de inventarse horarios.
  if (conexion.cual === "ninguna") return { slots: [], calendarId, conectado: false };

  // ── CALENDLY: LOS HUECOS LOS DA ÉL, NO LOS CALCULAMOS ────────────────────
  // Con Google hay que restar lo ocupado del horario laboral porque Google solo
  // sabe qué está tomado. Calendly ya aplica las reglas del negocio —antelación
  // mínima, tope de citas por día, horarios por tipo— así que calcular por
  // nuestra cuenta sería ofrecer horas que él va a rechazar.
  if (conexion.cual === "calendly") {
    // ── DEL CAMPO DE CALENDLY, NUNCA DEL DE GOOGLE ────────────────────
    // Los bloques viejos no tienen `calendlyTipo` —se guardaba todo en
    // `calendarId`— así que ahí no hay nada que mirar: se cae al primer tipo
    // activo. `tipoDeEventoDeCalendly` sigue comprobando la forma porque el
    // valor puede venir de una petición a la API pública, no solo del bloque.
    const tipo = tipoDeEventoDeCalendly(opts.calendlyTipo);
    const { timeZone: zona } = await ajustesDeOrg(orgId);

    try {
      const elTipo = tipo || (await primerTipoDeEvento(conexion));
      if (!elTipo) return { slots: [], calendarId, conectado: true, enlace: conexion.agendaUrl };

      const horas = await calendly.horariosDisponibles(conexion.token, elTipo, new Date(), days);
      const slots: Slot[] = horas.slice(0, maxSlots).map((iso) => ({
        startISO: iso,
        endISO: new Date(Date.parse(iso) + durationMin * 60_000).toISOString(),
        label: new Intl.DateTimeFormat("es-MX", {
          timeZone: zona, weekday: "short", day: "2-digit", month: "short",
          hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date(iso)),
      }));
      return { slots, calendarId: elTipo, conectado: true, enlace: conexion.agendaUrl };
    } catch (e) {
      // Sin poder leer los huecos NO se ofrece nada, pero sí el enlace: el
      // cliente puede agendar igual y el negocio no pierde la cita.
      console.error("[agenda] Calendly no dio horarios:", (e as Error)?.message);
      return { slots: [], calendarId, conectado: true, enlace: conexion.agendaUrl };
    }
  }

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
 * El primer tipo de cita activo, cuando el bloque no dice cuál.
 *
 * SE ELIGE UNO SOLO Y SIEMPRE EL MISMO. Un flujo que ofrezca una cita distinta
 * según el día es peor que uno que siempre ofrezca la misma: el negocio no
 * entiende por qué le entran citas de treinta minutos si él configuró una hora.
 */
async function primerTipoDeEvento(
  c: Extract<Conexion, { cual: "calendly" }>,
): Promise<string | null> {
  if (!c.usuario) return null;
  const tipos = await calendly.tiposDeEvento(c.token, c.usuario);
  const activos = tipos.filter((t) => t.activo);
  if (!activos.length) return null;
  return [...activos].sort((a, b) => a.nombre.localeCompare(b.nombre))[0].uri;
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
    calendlyTipo?: string;
    agendaProveedor?: EleccionDelBloque | null;
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

  const conexion = await conexionDeAgenda(orgId, leerEleccionDelBloque(d.agendaProveedor));

  // Mismo caso que arriba: Calendly conectado y con el token roto. Se dice con
  // esas palabras, para que el negocio sepa QUÉ arreglar — «no hay agenda
  // conectada» le mandaría a mirar Google, que no es donde está el problema.
  if (conexion.cual === "ninguna") {
    return {
      ok: false,
      motivo: "sin_conexion",
      error: "La conexión con Calendly dejó de funcionar. Vuelve a conectarla en Ajustes → Integraciones.",
    };
  }

  if (conexion.cual === "calendly") {
    const { timeZone: zona } = await ajustesDeOrg(orgId);
    const cuando = new Date(Date.parse(inicio));
    const finCal = new Date(Date.parse(inicio) + durationMin * 60_000).toISOString();

    const conElEnlace = (error: string): Fallo => ({
      ok: false,
      motivo: "plan",
      error,
      enlace: conexion.agendaUrl || undefined,
    });

    // YA SABEMOS QUE ESTÁ EN EL GRATIS: no se le hace elegir hora para nada.
    // Se sale por aquí con el enlace y el bloque lo manda.
    if (conexion.planGratis) {
      return conElEnlace("Esta agenda no permite reservar por API. Manda el enlace.");
    }

    // Del campo de Calendly, igual que en `horariosLibres`.
    const elTipo = tipoDeEventoDeCalendly(d.calendlyTipo) || (await primerTipoDeEvento(conexion));
    if (!elTipo) {
      return { ok: false, motivo: "sin_datos", error: "Este Calendly no tiene ningún tipo de cita activo." };
    }

    const r = await calendly.reservar(conexion.token, {
      eventTypeUri: elTipo,
      inicioISO: inicio,
      nombre: d.titulo || "Cliente",
      correo: d.correoInvitado || "",
      zona,
    });

    if (!r.ok) {
      if (r.planGratis) {
        // Se aprende para que la próxima persona no pase por lo mismo.
        await apuntarPlanGratis(orgId);
        return conElEnlace("Esta agenda no permite reservar por API. Manda el enlace.");
      }
      return { ok: false, motivo: "calendly", error: r.error };
    }

    return {
      ok: true,
      eventoId: r.uri,
      // El enlace útil para el cliente es el de cambiar o cancelar, no el del
      // evento: es lo que va a necesitar si le cambia el día.
      enlace: r.enlaceCambiar || r.enlaceCancelar || conexion.agendaUrl,
      inicioISO: inicio,
      finISO: finCal,
      dia: new Intl.DateTimeFormat("es-MX", {
        timeZone: zona, weekday: "long", day: "numeric", month: "long",
      }).format(cuando),
      hora: new Intl.DateTimeFormat("es-MX", {
        timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(cuando),
      etiqueta: new Intl.DateTimeFormat("es-MX", {
        timeZone: zona, weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(cuando),
    };
  }

  const admin = createAdminClient();
  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) {
    return {
      ok: false,
      motivo: "sin_conexion",
      error: "Este negocio no tiene ninguna agenda conectada.",
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
