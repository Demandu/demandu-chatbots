import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidAccessTokenForOrg, freeBusy, createCalendarEvent,
  updateCalendarEvent, deleteCalendarEvent,
} from "@/lib/integrations/google";
import { computeSlots, type Slot } from "@/lib/integrations/availability";
import * as calendly from "@/lib/integrations/calendly";
import {
  agendaDelBloque, leerPreferida, leerEleccionDelBloque, tipoDeEventoDeCalendly,
  type EleccionDelBloque,
} from "@/lib/agendaElegida";
import { repartirHorarios } from "@/lib/agendaHorarios";

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
  /**
   * LA CITA EXISTE, PERO NADIE RECIBIÓ INVITACIÓN.
   *
   * Pasa cuando no había correo que invitar, o cuando Google rechazó al
   * invitado —una cuenta de servicio sin permiso de delegación no puede
   * invitar a nadie—. En los dos casos el evento SÍ está en la agenda, así
   * que se confirma la cita; lo que cambia es que no se le puede prometer a
   * la persona un correo que no va a llegar.
   *
   * Es exactamente lo que pasó el 5 de septiembre: cita creada, cero correos,
   * y una confirmación que no mencionaba ninguna de las dos cosas.
   */
  sinInvitacion?: boolean;
};

export type Fallo = {
  ok: false;
  error: string;
  motivo: "sin_conexion" | "sin_datos" | "google" | "calendly" | "plan";
  /**
   * ¿ESTE TEXTO SE LE PUEDE ENSEÑAR A LA PERSONA QUE ESTÁ AGENDANDO?
   *
   * Por omisión NO. `error` está escrito para quien monta la plataforma —«no
   * hay ningún tipo de cita activo», «vuelve a conectarla en Ajustes»— y a
   * quien está al otro lado del chat no le dice nada, no lo provocó y no lo
   * puede arreglar. Un cliente recibió literalmente «Falta la fecha y hora de
   * la cita.» por escribir «necesito que sea en la tarde».
   *
   * Se marca solo lo que la persona puede resolver ella misma en el siguiente
   * mensaje. El motivo no sirve para decidirlo: «acaba de ocuparse» y «falta
   * la fecha» comparten `sin_datos` y son casos opuestos.
   */
  paraElCliente?: boolean;
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
    /* ── SIN RESPALDO A CIUDAD DE MÉXICO ────────────────────────────────
     *
     * Aquí había `|| "America/Mexico_City"`, y era uno de los diez sitios que
     * convertían «no lo sabemos» en una respuesta que parecía correcta. Un
     * negocio de Panamá ofreció todas sus citas una hora corridas por esto.
     *
     * Ahora nulo viaja como nulo y quien lo use decide qué hacer — que en
     * todos los casos es negarse y decirlo, no inventar un huso. */
    timeZone: (data?.timezone as string) || null,
  };
}

/** Lo que se contesta cuando no se sabe en qué hora vive este negocio. */
const SIN_ZONA: Fallo = {
  ok: false,
  motivo: "sin_datos",
  // NO es `paraElCliente`: a quien escribe no le dice nada y no lo puede
  // arreglar. El aviso que sí se ve está en la pantalla del negocio.
  error: "Falta la zona horaria de este negocio: las horas saldrían corridas.",
};

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
): Promise<{
  slots: Slot[]; calendarId: string; conectado: boolean; enlace?: string;
  /** No se sabe en qué hora vive este negocio. Distinto de «no hay huecos». */
  sinZona?: boolean;
}> {
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

    // SIN ZONA NO SE OFRECE NADA. Etiquetar los huecos con un huso inventado
    // es ofrecer horas que no son las del negocio, que es peor que no ofrecer.
    if (!zona) {
      console.error(`[agenda] sin zona horaria, no se ofrecen horarios (org ${orgId})`);
      return { slots: [], calendarId, conectado: true, sinZona: true };
    }

    try {
      const elTipo = tipo || (await primerTipoDeEvento(conexion));
      if (!elTipo) return { slots: [], calendarId, conectado: true, enlace: conexion.agendaUrl };

      const horas = await calendly.horariosDisponibles(conexion.token, elTipo, new Date(), days);
      const etiqueta = new Intl.DateTimeFormat("es-MX", {
        timeZone: zona, weekday: "short", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      // SE CONVIERTEN TODOS Y DESPUÉS SE RECORTA, no al revés. Cortar primero
      // dejaba las seis horas más próximas, que en una agenda vacía son seis
      // huecos seguidos de la misma mañana.
      const todos: Slot[] = horas.map((iso) => ({
        startISO: iso,
        endISO: new Date(Date.parse(iso) + durationMin * 60_000).toISOString(),
        label: etiqueta.format(new Date(iso)),
        ...partesEnZona(iso, zona),
      }));
      return { slots: repartirHorarios(todos, maxSlots), calendarId: elTipo, conectado: true, enlace: conexion.agendaUrl };
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
  if (!timeZone) {
    console.error(`[agenda] sin zona horaria, no se ofrecen horarios (org ${orgId})`);
    return { slots: [], calendarId, conectado: true, sinZona: true };
  }
  const ahora = new Date();

  let ocupado: any[] = [];
  try {
    ocupado = await freeBusy(token, calendarId, ahora.toISOString(), new Date(ahora.getTime() + days * 86400_000).toISOString());
  } catch {
    // Sin poder leer lo ocupado se ofrecerían horas ya tomadas. Mejor no
    // ofrecer nada que agendar encima de otra cita.
    return { slots: [], calendarId, conectado: true };
  }

  // ── SE CALCULAN TODOS LOS HUECOS Y LUEGO SE REPARTEN ────────────────────
  //
  // `computeSlots` recorre el horario laboral de arriba abajo y para en cuanto
  // junta `maxSlots`. Pedirle seis daba exactamente esto: 09:00, 09:30 y 10:00
  // del primer día laborable. Ni una tarde, ni un segundo día.
  //
  // Ahora se le pide una bolsa grande y el reparto elige diez cubriendo días y
  // turnos. El coste es aritmética en memoria sobre un par de cientos de
  // huecos —ninguna llamada de red extra—, y la diferencia para quien está al
  // otro lado es entre poder elegir y no poder.
  const bolsa = computeSlots({
    businessHours, timeZone, durationMin, busy: ocupado, now: ahora, days,
    maxSlots: Math.max(maxSlots, TOPE_DE_LA_BOLSA),
  });

  return { slots: repartirHorarios(bolsa, maxSlots), calendarId, conectado: true };
}

/**
 * Cuántos huecos se calculan antes de repartir.
 *
 * Suficientes para cubrir dos semanas de agenda vacía a media hora el hueco, y
 * con tope para que una configuración rara —citas de cinco minutos, horario de
 * 24 h— no acabe generando miles de objetos para enseñar diez.
 */
const TOPE_DE_LA_BOLSA = 300;

/** El día y la hora de un instante, en la zona del negocio. */
function partesEnZona(iso: string, zona: string): { dia: string; minutos: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zona, hour12: false,
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(iso));
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  // `hour12: false` puede devolver «24» a medianoche en algunos entornos; el
  // resto por 24 lo deja en 0, que es lo que significa.
  return { dia: `${+m.year}-${+m.month}-${+m.day}`, minutos: (+m.hour % 24) * 60 + +m.minute };
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
    /* ── DE QUIÉN ES LA CITA ───────────────────────────────────────────
     *
     * Van aquí y no en quien llama porque APUNTARLA TIENE QUE SER
     * IMPOSIBLE DE OLVIDAR. Hay cuatro caminos que agendan —el bloque, el
     * formulario nativo, la IA y la pantalla de pruebas— y si cada uno
     * tuviera que acordarse de guardar la cita, el que se añada mañana no
     * se acordaría, y sus citas serían las únicas que no se pueden mover.
     *
     * Nulos cuando se agenda desde la API pública, que no tiene
     * conversación. La cita se apunta igual: sirve para que el negocio la
     * vea, aunque el bot no pueda atarla a nadie. */
    contactoId?: string | null;
    conversacionId?: string | null;
    nombreInvitado?: string | null;
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
    if (!zona) return SIN_ZONA;
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

    await apuntarCita(orgId, {
      proveedor: "calendly",
      eventoId: r.uri,
      calendario: elTipo,
      enlace: r.enlaceCambiar || conexion.agendaUrl,
      enlaceCancelar: r.enlaceCancelar || null,
      inicioISO: inicio,
      finISO: finCal,
      titulo: d.titulo ?? null,
      nombre: d.nombreInvitado ?? null,
      correo: d.correoInvitado ?? null,
      contactoId: d.contactoId ?? null,
      conversacionId: d.conversacionId ?? null,
    });

    return {
      ok: true,
      eventoId: r.uri,
      // Calendly manda SIEMPRE su propio correo de confirmación al invitado;
      // por eso aquí no se marca nunca. Si un día deja de hacerlo, este es el
      // sitio donde se nota.
      sinInvitacion: false,
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
  if (!timeZone) return SIN_ZONA;
  const finISO = new Date(Date.parse(inicio) + durationMin * 60_000).toISOString();

  try {
    const ocupado = await freeBusy(token, calendarId, inicio, finISO);
    if (ocupado.length) {
      return {
        ok: false,
        motivo: "sin_datos",
        // El único que sí sale tal cual: la persona elige otra hora y sigue.
        paraElCliente: true,
        error: "Ese horario acaba de ocuparse. Elige otro, por favor.",
      };
    }
  } catch {
    // Si no se puede comprobar, se sigue: el riesgo de duplicar es menor que
    // el de no agendar a nadie porque Google tuvo un mal minuto.
  }

  try {
    const correoInvitado = String(d.correoInvitado || "").trim();
    const ev = await createCalendarEvent(token, calendarId, {
      summary: d.titulo || "Cita agendada · Demandu",
      description: d.descripcion || "Cita agendada desde el chatbot.",
      startISO: inicio,
      endISO: finISO,
      timeZone,
      attendeeEmail: correoInvitado || undefined,
    });

    await apuntarCita(orgId, {
      proveedor: "google",
      eventoId: ev.id,
      calendario: calendarId,
      enlace: ev.htmlLink,
      inicioISO: inicio,
      finISO,
      titulo: d.titulo ?? null,
      nombre: d.nombreInvitado ?? null,
      correo: correoInvitado || null,
      contactoId: d.contactoId ?? null,
      conversacionId: d.conversacionId ?? null,
    });
    const cuando = new Date(Date.parse(inicio));
    return {
      ok: true,
      eventoId: ev.id,
      enlace: ev.htmlLink,
      // SIN CORREO TAMPOCO HAY INVITACIÓN, y esa es la causa habitual — no que
      // Google la rechace. `createCalendarEvent` solo puede contar lo suyo.
      sinInvitacion: !correoInvitado || ev.sinInvitacion === true,
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

/* ════════════════════════════════════════════════════════════════════════════
 * MOVER Y CANCELAR
 *
 * ── POR QUÉ NO EXISTÍAN ───────────────────────────────────────────────────
 *
 * Porque al agendar se guardaba el enlace del evento y la hora, y NO el
 * identificador. Con eso se puede escribir «tu cita quedó el jueves a las 10»
 * y nada más: la plataforma no sabía CUÁL cita tocar.
 *
 *   cliente → «oye, ¿podemos mover la del jueves?»
 *   bot     → (ni idea de qué cita le hablan)
 *
 * Ahora cada cita queda apuntada en `citas`. Ver la 0100 para el porqué de la
 * tabla y de que no sea una copia del calendario.
 * ══════════════════════════════════════════════════════════════════════════ */

export type CitaGuardada = {
  id: string;
  proveedor: "google" | "calendly";
  evento_id: string;
  calendario: string | null;
  enlace: string | null;
  enlace_cancelar: string | null;
  inicio: string;
  fin: string | null;
  titulo: string | null;
  nombre: string | null;
  correo: string | null;
  estado: string;
};

const CAMPOS_DE_CITA =
  "id, proveedor, evento_id, calendario, enlace, enlace_cancelar, inicio, fin, titulo, nombre, correo, estado";

/**
 * Deja apuntada una cita recién creada.
 *
 * ── NUNCA TUMBA LA CITA ───────────────────────────────────────────────────
 *
 * La cita YA EXISTE en el calendario del negocio cuando esto corre. Si apuntarla
 * fallara y se dejara reventar, el cliente vería «no pude agendar» con la cita
 * hecha, y llamaría a un negocio que sí la tiene. Se apunta el fallo y se sigue:
 * lo peor que pasa es que esa cita concreta no se pueda mover por chat.
 */
export async function apuntarCita(
  orgId: string,
  d: {
    proveedor: "google" | "calendly";
    eventoId: string;
    calendario?: string | null;
    enlace?: string | null;
    enlaceCancelar?: string | null;
    inicioISO: string;
    finISO?: string | null;
    titulo?: string | null;
    nombre?: string | null;
    correo?: string | null;
    contactoId?: string | null;
    conversacionId?: string | null;
  },
): Promise<void> {
  try {
    // `upsert` por (org, proveedor, evento): un reintento del motor o un aviso
    // repetido de Calendly no puede dejar la misma cita apuntada dos veces —
    // «tu próxima cita» sería ambigua y mover una dejaría la otra viva.
    await createAdminClient()
      .from("citas")
      .upsert(
        {
          org_id: orgId,
          proveedor: d.proveedor,
          evento_id: d.eventoId,
          calendario: d.calendario ?? null,
          enlace: d.enlace ?? null,
          enlace_cancelar: d.enlaceCancelar ?? null,
          inicio: d.inicioISO,
          fin: d.finISO ?? null,
          titulo: d.titulo ?? null,
          nombre: d.nombre ?? null,
          correo: d.correo ?? null,
          contact_id: d.contactoId ?? null,
          conversation_id: d.conversacionId ?? null,
          estado: "agendada",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,proveedor,evento_id" },
      );
  } catch (e) {
    console.error("[agenda] no pude apuntar la cita:", (e as Error)?.message ?? e);
  }
}

/**
 * La próxima cita de esta persona.
 *
 * ── POR CONTACTO, NO POR CONVERSACIÓN ─────────────────────────────────────
 *
 * Quien agendó por Instagram y escribe por WhatsApp es otra conversación, y
 * sigue siendo la misma persona con la misma cita. Buscar por conversación
 * haría que el bot le dijera «no veo ninguna cita a tu nombre» a alguien que
 * la tiene el jueves.
 *
 * Y solo las que están POR VENIR: mover una cita de la semana pasada no
 * significa nada, y ofrecerlo confunde.
 */
export async function proximaCita(
  orgId: string,
  contactoId: string | null | undefined,
): Promise<CitaGuardada | null> {
  if (!contactoId) return null;
  try {
    const { data } = await createAdminClient()
      .from("citas")
      .select(CAMPOS_DE_CITA)
      .eq("org_id", orgId)
      .eq("contact_id", contactoId)
      .neq("estado", "cancelada")
      .gte("inicio", new Date().toISOString())
      .order("inicio", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as CitaGuardada) ?? null;
  } catch (e) {
    console.error("[agenda] no pude leer la próxima cita:", (e as Error)?.message ?? e);
    return null;
  }
}

/**
 * Mueve una cita a otra hora.
 *
 * ── SE COMPRUEBA QUE LA HORA NUEVA ESTÉ LIBRE ─────────────────────────────
 *
 * Igual que al agendar. Mover una cita encima de otra es peor que crear una
 * doble desde cero: la que estaba antes ya se la habías confirmado a alguien.
 *
 * ── CALENDLY NO SE MUEVE POR API ──────────────────────────────────────────
 *
 * No hay endpoint para reagendar: Calendly lo hace con SU enlace, que es el que
 * se guardó al reservar. Devolverlo no es rendirse — es lo que hace el propio
 * Calendly, y la persona cambia su cita en diez segundos.
 */
export async function moverCita(
  orgId: string,
  cita: CitaGuardada,
  nuevoInicioISO: string,
  durationMin?: number,
): Promise<Cita | Fallo> {
  const inicio = String(nuevoInicioISO || "").trim();
  if (!inicio || Number.isNaN(Date.parse(inicio))) {
    return { ok: false, motivo: "sin_datos", error: "Falta la nueva fecha y hora." };
  }

  if (cita.proveedor === "calendly") {
    return {
      ok: false,
      motivo: "plan",
      error: "Esta agenda se cambia desde su propio enlace.",
      enlace: cita.enlace || undefined,
    };
  }

  const admin = createAdminClient();
  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) {
    return { ok: false, motivo: "sin_conexion", error: "Este negocio no tiene ninguna agenda conectada." };
  }

  const { timeZone } = await ajustesDeOrg(orgId);
  if (!timeZone) return SIN_ZONA;
  const calendarId = cita.calendario || "primary";
  // La duración de la cita que ya existe, si se sabe. Mover una cita de una
  // hora y dejarla en media es cambiarle al cliente algo que no pidió.
  const dur = Number(durationMin)
    || (cita.fin ? Math.round((Date.parse(cita.fin) - Date.parse(cita.inicio)) / 60000) : 0)
    || 30;
  const finISO = new Date(Date.parse(inicio) + dur * 60_000).toISOString();

  try {
    const ocupado = await freeBusy(token, calendarId, inicio, finISO);

    // ── LA PROPIA CITA NO CUENTA COMO OCUPADO ──────────────────────────
    //
    // Sin esto, mover una cita media hora hacia adelante chocaría CONSIGO
    // MISMA —su hueco viejo sigue reservado— y se rechazaría siempre. El
    // único bloque que se ignora es el que ocupa exactamente su ventana; si
    // se mueve lejos, no coincide ninguno y no se ignora nada.
    const propioInicio = Date.parse(cita.inicio);
    const propioFin = Date.parse(cita.fin || cita.inicio);
    const ajenos = ocupado.filter(
      (b) => !(Date.parse(b.start) === propioInicio && Date.parse(b.end) === propioFin),
    );

    if (ajenos.length) {
      return {
        ok: false, motivo: "sin_datos", paraElCliente: true,
        error: "Ese horario ya está ocupado. Elige otro, por favor.",
      };
    }
  } catch {
    // Igual que al agendar: el riesgo de solapar es menor que el de no poder
    // mover nada porque Google tuvo un mal minuto.
  }

  try {
    const ev = await updateCalendarEvent(token, calendarId, cita.evento_id, {
      startISO: inicio, endISO: finISO, timeZone,
    });

    await admin.from("citas").update({
      inicio, fin: finISO, enlace: ev.htmlLink, updated_at: new Date().toISOString(),
    }).eq("id", cita.id).eq("org_id", orgId);

    const cuando = new Date(Date.parse(inicio));
    return {
      ok: true,
      eventoId: ev.id,
      enlace: ev.htmlLink,
      inicioISO: inicio,
      finISO,
      // Al mover SÍ se avisa al invitado (`sendUpdates=all` en la llamada), así
      // que no se marca como sin invitación.
      sinInvitacion: false,
      dia: new Intl.DateTimeFormat("es-MX", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(cuando),
      hora: new Intl.DateTimeFormat("es-MX", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(cuando),
      etiqueta: new Intl.DateTimeFormat("es-MX", {
        timeZone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(cuando),
    };
  } catch (e: any) {
    return { ok: false, motivo: "google", error: e?.message ?? "Google no aceptó el cambio." };
  }
}

/**
 * Cancela una cita.
 *
 * En Google se borra el evento y se avisa al invitado. En la tabla la fila se
 * queda con `estado = 'cancelada'`: es lo que permite que después el bot sepa
 * «esta persona canceló» y no «esta persona nunca agendó».
 */
export async function cancelarCita(
  orgId: string,
  cita: CitaGuardada,
): Promise<{ ok: true } | Fallo> {
  if (cita.proveedor === "calendly") {
    return {
      ok: false,
      motivo: "plan",
      error: "Esta agenda se cancela desde su propio enlace.",
      enlace: cita.enlace_cancelar || cita.enlace || undefined,
    };
  }

  const admin = createAdminClient();
  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) {
    return { ok: false, motivo: "sin_conexion", error: "Este negocio no tiene ninguna agenda conectada." };
  }

  try {
    await deleteCalendarEvent(token, cita.calendario || "primary", cita.evento_id);
  } catch (e: any) {
    return { ok: false, motivo: "google", error: e?.message ?? "Google no aceptó la cancelación." };
  }

  // SOLO DESPUÉS DE QUE GOOGLE LO CONFIRME. Marcarla cancelada antes dejaría al
  // negocio con el hueco bloqueado en su calendario y con la plataforma
  // diciéndole que está libre.
  await admin.from("citas")
    .update({ estado: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", cita.id).eq("org_id", orgId);

  return { ok: true };
}
