import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { zonaDelNegocio } from "@/lib/agenda";
import { queMesaLeDoy, comoLoDigo, type Mesa } from "./asignar";
import { conUnibles, type MesaEnElMapa } from "./mapa";
import { turnosDelDia, nombreDelTurno, confirmaSola, type Turno } from "./turnos";

/**
 * RESERVAS: LO QUE HACE FALTA UNA BASE DE DATOS PARA SABER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE CEREBRO VIVE UNA SOLA VEZ. El motor de WhatsApp corre en Deno y no puede
 * importar de aquí, así que lo llama por HTTP (`/api/motor/reservas`) — igual
 * que ya hace con la agenda y con los pedidos.
 *
 * Es a propósito y es la decisión más importante del módulo: una copia del
 * cálculo de disponibilidad en el motor se separaría de esta, y entonces
 * WhatsApp diría que hay mesa y la plataforma que no. De las dos, ninguna sería
 * de fiar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type TurnoLibre = {
  id: string;
  nombre: string;
  hora: string;
  /** Cómo se le dice a la persona: «Primer turno · 7:00 p.m.» */
  comoSeDice: string;
  /** Si Lana puede cerrarla sin que la mire nadie. */
  confirmaSola: boolean;
};

export type Disponibilidad =
  | { ok: true; fecha: string; turnos: TurnoLibre[] }
  | { ok: false; motivo: string; queDecir: string };

/** Lo que el restaurante configuró. Los de fábrica si no hay nada guardado. */
async function ajustesDe(admin: any, orgId: string) {
  const { data, error } = await admin
    .from("reservas_ajustes")
    .select("grupo_grande, max_mesas_juntas, recordatorio_horas, recordatorio_activo")
    .eq("org_id", orgId)
    .maybeSingle();
  // «No hay fila» es normal en una cuenta nueva. «No se pudo leer» se apunta,
  // pero tampoco para el mundo: se sigue con los de fábrica.
  if (error) console.error("[reservas] no pude leer los ajustes:", error.message);
  return {
    grupoGrande: Number(data?.grupo_grande ?? 12),
    maxJuntas: Number(data?.max_mesas_juntas ?? 3),
    recordatorioHoras: Number(data?.recordatorio_horas ?? 24),
    recordatorioActivo: data?.recordatorio_activo !== false,
  };
}

/** El salón entero, con las uniones ya leídas en las dos direcciones. */
async function salonDe(admin: any, orgId: string): Promise<Mesa[] | null> {
  const [{ data: mesas, error: errMesas }, { data: pares, error: errPares }] = await Promise.all([
    admin.from("reservas_mesas").select("id, nombre, capacidad, activa, x, y, ancho, alto")
      .eq("org_id", orgId),
    admin.from("reservas_uniones").select("mesa_a, mesa_b").eq("org_id", orgId),
  ]);
  // SIN PODER LEER EL SALÓN NO SE DECIDE NADA. Tratar el fallo como «no hay
  // mesas» haría que Lana rechazara a todo el mundo un día que la base tosa.
  if (errMesas || errPares) {
    console.error("[reservas] no pude leer el salón:", errMesas?.message ?? errPares?.message);
    return null;
  }
  return conUnibles((mesas ?? []) as MesaEnElMapa[], (pares ?? []) as any) as unknown as Mesa[];
}

/** Las mesas ya tomadas en esa fecha y turno. */
async function ocupadasEn(
  admin: any, orgId: string, fecha: string, turnoId: string,
): Promise<Set<string> | null> {
  const { data, error } = await admin
    .from("reserva_mesas")
    .select("mesa_id")
    .eq("org_id", orgId)
    .eq("fecha", fecha)
    .eq("turno_id", turnoId);
  if (error) {
    console.error("[reservas] no pude leer lo ocupado:", error.message);
    return null;
  }
  return new Set((data ?? []).map((r: any) => String(r.mesa_id)));
}

/**
 * ¿QUÉ TURNOS TIENEN SITIO PARA ESTE GRUPO ESE DÍA?
 *
 * Devuelve solo los turnos donde el grupo CABE DE VERDAD — no los que existen.
 * Ofrecer un turno lleno y descubrirlo al confirmar es peor que no ofrecerlo:
 * la persona ya se hizo a la idea.
 */
export async function turnosConSitio(
  orgId: string,
  fecha: string,
  personas: number,
): Promise<Disponibilidad> {
  const admin = createAdminClient();
  const zona = (await zonaDelNegocio(orgId)) || "UTC";
  const ajustes = await ajustesDe(admin, orgId);

  const { data: turnosCrudos, error: errTurnos } = await admin
    .from("reservas_turnos")
    .select("id, nombre, hora, dias, duracion_min, confirma_sola, activo")
    .eq("org_id", orgId);

  if (errTurnos) {
    console.error("[reservas] no pude leer los turnos:", errTurnos.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "Ahora mismo no puedo consultar la disponibilidad. Dile que alguien del restaurante le escribe enseguida." };
  }

  const delDia = turnosDelDia((turnosCrudos ?? []) as Turno[], fecha, zona);
  if (!delDia.length) {
    return { ok: false, motivo: "sin_turnos", queDecir: "Ese día no hay turnos disponibles. Ofrécele otro día." };
  }

  const salon = await salonDe(admin, orgId);
  if (!salon) {
    return { ok: false, motivo: "no_se_pudo", queDecir: "Ahora mismo no puedo consultar la disponibilidad. Dile que alguien del restaurante le escribe enseguida." };
  }

  const libres: TurnoLibre[] = [];
  let ultimoMotivo = "";
  for (const t of delDia) {
    const ocupadas = await ocupadasEn(admin, orgId, fecha, t.id);
    if (!ocupadas) {
      return { ok: false, motivo: "no_se_pudo", queDecir: "Ahora mismo no puedo consultar la disponibilidad. Dile que alguien del restaurante le escribe enseguida." };
    }
    const r = queMesaLeDoy({
      mesas: salon, ocupadas, personas,
      maxJuntas: ajustes.maxJuntas, grupoGrande: ajustes.grupoGrande,
    });
    if (r.ok) {
      libres.push({
        id: t.id, nombre: t.nombre, hora: String(t.hora).slice(0, 5),
        comoSeDice: nombreDelTurno(t), confirmaSola: confirmaSola(t),
      });
    } else {
      ultimoMotivo = comoLoDigo(r.motivo, personas);
    }
  }

  if (!libres.length) {
    return { ok: false, motivo: "sin_sitio", queDecir: ultimoMotivo || "Ese día está completo. Ofrécele otro." };
  }
  return { ok: true, fecha, turnos: libres };
}

export type Reservada =
  | {
      ok: true; id: string; estado: "confirmada" | "pendiente";
      mesas: string[]; turno: string; fecha: string;
      queDecir: string;
    }
  | { ok: false; motivo: string; queDecir: string };

/**
 * HACER LA RESERVA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ORDEN IMPORTA Y NO ES NEGOCIABLE:
 *
 *   1. Se elige mesa con lo que hay libre AHORA.
 *   2. Se escribe la reserva.
 *   3. Se toman las mesas — y AHÍ puede fallar, porque el índice único de la
 *      base no deja entregar una mesa dos veces en el mismo turno.
 *   4. Si falla, LA RESERVA SE BORRA. Dejarla sin mesas sería una reserva
 *      fantasma: cuenta en la lista del restaurante y no ocupa nada.
 *
 * Dos personas escribiendo a la vez pasan las dos el paso 1 y llegan las dos al
 * 3. Solo una entra. La otra recibe «se acaba de ocupar» — que es la verdad, y
 * es infinitamente mejor que dos grupos con la misma mesa confirmada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function hacerReserva(opts: {
  orgId: string;
  fecha: string;
  turnoId: string;
  personas: number;
  contactId?: string | null;
  conversationId?: string | null;
  nombre?: string | null;
  telefono?: string | null;
  notas?: string | null;
  laHizo?: "lana" | "el negocio";
}): Promise<Reservada> {
  const admin = createAdminClient();
  const { orgId, fecha, turnoId } = opts;
  const personas = Math.round(Number(opts.personas));

  if (!orgId || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || !turnoId) {
    return { ok: false, motivo: "faltan_datos", queDecir: "Pregúntale la fecha, la hora y para cuántas personas." };
  }
  if (!Number.isFinite(personas) || personas < 1) {
    return { ok: false, motivo: "faltan_datos", queDecir: "Pregúntale para cuántas personas es la reserva." };
  }

  const ajustes = await ajustesDe(admin, orgId);
  const zona = (await zonaDelNegocio(orgId)) || "UTC";

  const { data: turnosCrudos, error: errTurnos } = await admin
    .from("reservas_turnos")
    .select("id, nombre, hora, dias, duracion_min, confirma_sola, activo")
    .eq("org_id", orgId);
  if (errTurnos) {
    console.error("[reservas] no pude leer los turnos al reservar:", errTurnos.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude completar la reserva. Dile que alguien le escribe enseguida." };
  }

  /* EL TURNO TIENE QUE SEGUIR SIENDO VÁLIDO PARA ESA FECHA. El modelo puede
   * mandar el id de un turno que no existe ese día de la semana, o uno que ya
   * empezó mientras se escribían los mensajes. */
  const valido = turnosDelDia((turnosCrudos ?? []) as Turno[], fecha, zona)
    .find((t) => t.id === turnoId);
  if (!valido) {
    return { ok: false, motivo: "turno_no_valido", queDecir: "Ese turno ya no está disponible. Vuelve a consultar los horarios y ofrécele los que queden." };
  }

  const salon = await salonDe(admin, orgId);
  const ocupadas = salon ? await ocupadasEn(admin, orgId, fecha, turnoId) : null;
  if (!salon || !ocupadas) {
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude completar la reserva. Dile que alguien le escribe enseguida." };
  }

  const eleccion = queMesaLeDoy({
    mesas: salon, ocupadas, personas,
    maxJuntas: ajustes.maxJuntas, grupoGrande: ajustes.grupoGrande,
  });
  if (!eleccion.ok) {
    return { ok: false, motivo: eleccion.motivo, queDecir: comoLoDigo(eleccion.motivo, personas) };
  }

  const estado = confirmaSola(valido) ? "confirmada" : "pendiente";

  const { data: reserva, error: errReserva } = await admin
    .from("reservas")
    .insert({
      org_id: orgId, turno_id: turnoId, fecha, personas, estado,
      contact_id: opts.contactId ?? null,
      conversation_id: opts.conversationId ?? null,
      nombre: opts.nombre ?? null,
      telefono: opts.telefono ?? null,
      notas: opts.notas ?? null,
      la_hizo: opts.laHizo ?? "lana",
    })
    .select("id")
    .single();

  if (errReserva || !reserva) {
    console.error("[reservas] no se pudo crear la reserva:", errReserva?.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude completar la reserva. Dile que alguien le escribe enseguida." };
  }

  const { error: errMesas } = await admin.from("reserva_mesas").insert(
    eleccion.mesas.map((m) => ({
      reserva_id: (reserva as any).id, mesa_id: m.id, org_id: orgId, fecha, turno_id: turnoId,
    })),
  );

  if (errMesas) {
    /* AQUÍ ES DONDE EL CANDADO DE LA BASE HACE SU TRABAJO. 23505 = alguien se
     * llevó esa mesa entre el paso 1 y el 3. Se deshace la reserva: una fila
     * sin mesas contaría en la lista del restaurante sin ocupar nada, y esa
     * mesa fantasma es peor que el rechazo. */
    await admin.from("reservas").delete().eq("id", (reserva as any).id).eq("org_id", orgId);
    const choque = String((errMesas as any).code ?? "") === "23505";
    console.error("[reservas] no se pudieron tomar las mesas:", errMesas.message);
    return {
      ok: false,
      motivo: choque ? "se_ocupo" : "no_se_pudo",
      queDecir: choque
        ? "Esa mesa se acaba de ocupar. Vuelve a consultar los horarios y ofrécele lo que quede."
        : "No pude completar la reserva. Dile que alguien le escribe enseguida.",
    };
  }

  const nombres = eleccion.mesas.map((m) => m.nombre);
  return {
    ok: true,
    id: (reserva as any).id,
    estado,
    mesas: nombres,
    turno: nombreDelTurno(valido),
    fecha,
    queDecir:
      estado === "confirmada"
        ? `Reserva CONFIRMADA para ${personas} el ${fecha}, ${nombreDelTurno(valido)}. Díselo con esas palabras.`
        : `Reserva APARTADA para ${personas} el ${fecha}, ${nombreDelTurno(valido)}. Dile que el restaurante se la confirma en un momento — NO le digas que está confirmada.`,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 * LA RESERVA QUE YA TIENE: VERLA, MOVERLA Y CANCELARLA.
 *
 * ── EL MODELO NUNCA DICE QUÉ RESERVA, SOLO QUÉ HACER ───────────────────────
 *
 * Ninguna de estas tres recibe el id de una reserva, y es la misma regla que ya
 * gobierna las citas (`conectar-es-encender.md`): el modelo no puede saber un
 * uuid, así que se lo inventaría, y un uuid inventado que por casualidad exista
 * cancela la mesa de otra persona un sábado.
 *
 * La plataforma busca la reserva POR CONTACTO, no por conversación: quien
 * reservó por Instagram y escribe por WhatsApp es la misma persona con la misma
 * mesa.
 * ══════════════════════════════════════════════════════════════════════════ */

export type ReservaSuya = {
  id: string;
  fecha: string;
  turnoId: string;
  personas: number;
  estado: string;
  /** «Primer turno · 7:00 p.m.», ya en palabras. */
  comoSeDice: string;
  mesas: string[];
};

/**
 * QUÉ DÍA ES HOY PARA ESTE NEGOCIO, Y QUÉ DÍA SERÁ DENTRO DE N.
 *
 * ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────
 *
 * Al modelo NUNCA se le dice en qué fecha vive. Con las citas no importaba,
 * porque `ver_horarios` se pide en días («mira los próximos 14») y devuelve
 * instantes que el modelo copia tal cual. Una reserva es distinta: la persona
 * dice «el sábado» y hay que convertirlo a un día del calendario.
 *
 * Si esa cuenta la hiciera el modelo, la haría desde una fecha inventada — y
 * una reserva con la fecha equivocada es un grupo que llega el día que no es.
 * La hace la plataforma, en la zona del restaurante, que es la única que vale:
 * a las 11 de la noche en Panamá el servidor en UTC ya está en mañana.
 */
export async function fechaDelNegocio(orgId: string, dias = 0): Promise<string> {
  const zona = (await zonaDelNegocio(orgId)) || "UTC";
  const base = hoyAlla(zona);
  if (!dias) return base;
  const d = new Date(`${base}T12:00:00Z`);        // mediodía: inmune al horario de verano
  d.setUTCDate(d.getUTCDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
}

/** Hoy en la zona del negocio, como "AAAA-MM-DD". Nunca la del servidor. */
function hoyAlla(zona: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * LAS RESERVAS QUE ESTA PERSONA TIENE POR DELANTE.
 *
 * Solo de hoy en adelante, y nunca las canceladas ni las rechazadas: una
 * reserva cancelada que aparece en la lista hace que el bot le confirme a
 * alguien una mesa que ya no tiene.
 *
 * `no_llego` y `llego` son del pasado por definición y se caen con la fecha.
 */
export async function misReservas(
  orgId: string,
  contactId: string | null | undefined,
  cuantas = 5,
): Promise<ReservaSuya[] | null> {
  if (!orgId || !contactId) return [];
  const admin = createAdminClient();
  const zona = (await zonaDelNegocio(orgId)) || "UTC";

  const { data, error } = await admin
    .from("reservas")
    .select("id, fecha, turno_id, personas, estado")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .gte("fecha", hoyAlla(zona))
    .in("estado", ["pendiente", "confirmada"])
    .order("fecha", { ascending: true })
    .limit(cuantas);

  /* UN FALLO DE LECTURA NO ES «NO TIENE RESERVA». Devolver [] aquí haría que
   * el bot le dijera «no tienes ninguna reserva» a alguien que sí la tiene, y
   * esa frase es la que hace que la persona vuelva a reservar y acabe con dos.
   * `null` significa «no pude mirar», y quien llama lo dice con esas palabras. */
  if (error) {
    console.error("[reservas] no pude leer sus reservas:", error.message);
    return null;
  }

  const filas = data ?? [];
  if (!filas.length) return [];

  const [{ data: turnosCrudos }, { data: tomadas }] = await Promise.all([
    admin.from("reservas_turnos")
      .select("id, nombre, hora, dias, duracion_min, confirma_sola, activo")
      .eq("org_id", orgId),
    admin.from("reserva_mesas")
      .select("reserva_id, mesa_id")
      .eq("org_id", orgId)
      .in("reserva_id", filas.map((r: any) => r.id)),
  ]);

  const porId = new Map<string, Turno>(
    ((turnosCrudos ?? []) as Turno[]).map((t) => [t.id, t]),
  );

  // Los nombres de las mesas, para poder decirle «mesa 4» y no un uuid.
  const idsMesa = Array.from(new Set((tomadas ?? []).map((t: any) => String(t.mesa_id))));
  const nombreMesa = new Map<string, string>();
  if (idsMesa.length) {
    const { data: mesas, error: errMesas } = await admin
      .from("reservas_mesas").select("id, nombre").eq("org_id", orgId).in("id", idsMesa);
    // Si esto falla, la reserva SIGUE valiendo: solo se queda sin el nombre
    // bonito de la mesa. Lo que no puede pasar es que el fallo no se vea en
    // ninguna parte y alguien crea que las mesas se llaman como un uuid.
    if (errMesas) console.error("[reservas] no se pudieron leer los nombres de las mesas:", errMesas.message);
    for (const m of mesas ?? []) nombreMesa.set(String((m as any).id), String((m as any).nombre));
  }

  return filas.map((r: any) => {
    const t = porId.get(String(r.turno_id));
    return {
      id: String(r.id),
      fecha: String(r.fecha),
      turnoId: String(r.turno_id),
      personas: Number(r.personas),
      estado: String(r.estado),
      comoSeDice: t ? nombreDelTurno(t) : "",
      mesas: (tomadas ?? [])
        .filter((x: any) => String(x.reserva_id) === String(r.id))
        .map((x: any) => nombreMesa.get(String(x.mesa_id)) ?? "")
        .filter(Boolean),
    };
  });
}

/** La primera que tiene por delante. `null` si no tiene; `undefined` si no se pudo mirar. */
export async function proximaReserva(
  orgId: string,
  contactId: string | null | undefined,
): Promise<ReservaSuya | null | undefined> {
  const todas = await misReservas(orgId, contactId, 1);
  if (todas === null) return undefined;
  return todas[0] ?? null;
}

export type Cancelada =
  | { ok: true; queDecir: string }
  | { ok: false; motivo: string; queDecir: string };

/**
 * CANCELAR.
 *
 * ── SE MARCA LA RESERVA Y SE BORRAN LAS MESAS ──────────────────────────────
 *
 * Son dos cosas distintas y las dos hacen falta:
 *
 *   - `reservas.estado = 'cancelada'` deja el rastro. El restaurante necesita
 *     saber que hubo una reserva y que se cayó; borrar la fila entera haría
 *     que «esta persona canceló» y «nunca reservó» se leyeran igual, que es
 *     justo la distinción que ya se cuidó en las citas.
 *   - `reserva_mesas` se BORRA, porque en este módulo la fila existiendo ES la
 *     mesa ocupada (ver la cabecera de la 0119). Si no se borra, la mesa queda
 *     bloqueada para siempre por una reserva que ya no existe.
 *
 * Y el orden es ese: primero se libera la mesa, después se marca. Al revés, si
 * el proceso se cae en medio, queda una reserva cancelada reteniendo su mesa —
 * un hueco que el restaurante ve vacío y la plataforma da por lleno.
 */
export async function cancelarReserva(orgId: string, reservaId: string): Promise<Cancelada> {
  if (!orgId || !reservaId) {
    return { ok: false, motivo: "faltan_datos", queDecir: "No pude identificar la reserva. Dile que le pasarás con una persona." };
  }
  const admin = createAdminClient();

  const { error: errMesas } = await admin
    .from("reserva_mesas").delete().eq("reserva_id", reservaId).eq("org_id", orgId);
  if (errMesas) {
    console.error("[reservas] no pude liberar las mesas al cancelar:", errMesas.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude cancelar la reserva. Dile que alguien del restaurante le escribe enseguida." };
  }

  const { error: errEstado } = await admin
    .from("reservas")
    .update({ estado: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", reservaId).eq("org_id", orgId);
  if (errEstado) {
    /* La mesa YA está libre, así que nadie se queda sin sitio. Lo que queda es
     * una reserva que el restaurante ve viva y no ocupa nada: molesta, pero no
     * deja a un grupo de pie. Se apunta fuerte y se dice la verdad. */
    console.error("[reservas] mesas liberadas pero no pude marcar la reserva:", errEstado.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude cancelar la reserva del todo. Dile que alguien del restaurante lo confirma." };
  }

  return { ok: true, queDecir: "Reserva cancelada. Díselo, y ofrécele reservar otro día cuando quiera." };
}

/**
 * MOVER.
 *
 * ── SE HACE COMO UNA RESERVA NUEVA, Y ES A PROPÓSITO ───────────────────────
 *
 * Mover no es editar una fila: es volver a preguntar «¿hay sitio para este
 * grupo ese otro día?», porque la respuesta puede ser que no. Editar la fecha
 * a pelo dejaría la reserva apuntando a un turno lleno, y el candado de la base
 * no lo vería: el candado vive en `reserva_mesas`, no en `reservas`.
 *
 * ── POR QUÉ SE SUELTAN LAS MESAS ANTES DE PEDIR LAS NUEVAS ─────────────────
 *
 * Preferiría lo contrario —tomar primero y soltar después, para no quedarse sin
 * nada—, pero no se puede: la clave primaria de `reserva_mesas` es
 * (reserva_id, mesa_id), así que esta misma reserva no puede tener dos veces la
 * misma mesa aunque sea en fechas distintas. Un grupo que mueve del viernes al
 * sábado y al que le tocaría la misma mesa chocaría consigo mismo.
 *
 * Así que se sueltan, se piden las nuevas, y SI FALLA SE DEVUELVEN LAS VIEJAS.
 * La ventana es de milisegundos y el peor caso queda cubierto: la reserva sigue
 * donde estaba y la persona oye «no pude moverla».
 */
export async function moverReserva(opts: {
  orgId: string;
  reserva: ReservaSuya;
  fecha: string;
  turnoId: string;
  personas?: number | null;
}): Promise<Reservada> {
  const admin = createAdminClient();
  const { orgId, reserva } = opts;
  const fecha = String(opts.fecha ?? "");
  const turnoId = String(opts.turnoId ?? "");
  const personas = Math.round(Number(opts.personas ?? reserva.personas));

  if (!orgId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !turnoId) {
    return { ok: false, motivo: "faltan_datos", queDecir: "Pregúntale para qué día y qué turno la quiere mover." };
  }

  const ajustes = await ajustesDe(admin, orgId);
  const zona = (await zonaDelNegocio(orgId)) || "UTC";

  const { data: turnosCrudos, error: errTurnos } = await admin
    .from("reservas_turnos")
    .select("id, nombre, hora, dias, duracion_min, confirma_sola, activo")
    .eq("org_id", orgId);
  if (errTurnos) {
    console.error("[reservas] no pude leer los turnos al mover:", errTurnos.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude mover la reserva. Dile que alguien le escribe enseguida." };
  }

  const valido = turnosDelDia((turnosCrudos ?? []) as Turno[], fecha, zona)
    .find((t) => t.id === turnoId);
  if (!valido) {
    return { ok: false, motivo: "turno_no_valido", queDecir: "Ese turno no está disponible ese día. Vuelve a consultar y ofrécele los que queden." };
  }

  // Lo que tenía, por si hay que devolverlo.
  const { data: viejas, error: errViejas } = await admin
    .from("reserva_mesas").select("mesa_id, fecha, turno_id")
    .eq("reserva_id", reserva.id).eq("org_id", orgId);
  if (errViejas) {
    console.error("[reservas] no pude leer sus mesas al mover:", errViejas.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude mover la reserva. Dile que alguien le escribe enseguida." };
  }

  const { error: errSoltar } = await admin
    .from("reserva_mesas").delete().eq("reserva_id", reserva.id).eq("org_id", orgId);
  if (errSoltar) {
    console.error("[reservas] no pude soltar las mesas al mover:", errSoltar.message);
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude mover la reserva. Dile que alguien le escribe enseguida." };
  }

  /** Vuelve a dejarlo como estaba. Se usa en todos los caminos que fallan. */
  const devolverLasViejas = async () => {
    if (!(viejas ?? []).length) return;
    const { error } = await admin.from("reserva_mesas").insert(
      (viejas ?? []).map((v: any) => ({
        reserva_id: reserva.id, mesa_id: v.mesa_id, org_id: orgId,
        fecha: v.fecha, turno_id: v.turno_id,
      })),
    );
    if (error) console.error("[reservas] NO PUDE DEVOLVER LAS MESAS VIEJAS:", error.message);
  };

  const salon = await salonDe(admin, orgId);
  const ocupadas = salon ? await ocupadasEn(admin, orgId, fecha, turnoId) : null;
  if (!salon || !ocupadas) {
    await devolverLasViejas();
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude mover la reserva. Dile que alguien le escribe enseguida." };
  }

  const eleccion = queMesaLeDoy({
    mesas: salon, ocupadas, personas,
    maxJuntas: ajustes.maxJuntas, grupoGrande: ajustes.grupoGrande,
  });
  if (!eleccion.ok) {
    await devolverLasViejas();
    return { ok: false, motivo: eleccion.motivo, queDecir: comoLoDigo(eleccion.motivo, personas) };
  }

  const { error: errNuevas } = await admin.from("reserva_mesas").insert(
    eleccion.mesas.map((m) => ({
      reserva_id: reserva.id, mesa_id: m.id, org_id: orgId, fecha, turno_id: turnoId,
    })),
  );
  if (errNuevas) {
    await devolverLasViejas();
    const choque = String((errNuevas as any).code ?? "") === "23505";
    console.error("[reservas] no pude tomar las mesas nuevas al mover:", errNuevas.message);
    return {
      ok: false,
      motivo: choque ? "se_ocupo" : "no_se_pudo",
      queDecir: choque
        ? "Ese turno se acaba de ocupar. Su reserva sigue como estaba. Vuelve a consultar y ofrécele lo que quede."
        : "No pude mover la reserva. Sigue como estaba. Dile que alguien le escribe enseguida.",
    };
  }

  /* MOVER VUELVE A PASAR POR LA REGLA DEL TURNO. Una reserva confirmada que se
   * mueve al sábado a las 9 —el turno que el restaurante mira a mano— vuelve a
   * quedar pendiente. Arrastrar el «confirmada» sería colar una reserva de hora
   * pico sin que nadie la viera. */
  const estado = confirmaSola(valido) ? "confirmada" : "pendiente";

  const { error: errFila } = await admin
    .from("reservas")
    .update({ fecha, turno_id: turnoId, personas, estado, updated_at: new Date().toISOString() })
    .eq("id", reserva.id).eq("org_id", orgId);
  if (errFila) {
    /* Las mesas nuevas ya están tomadas y la fila sigue con la fecha vieja: la
     * reserva estaría en dos sitios a la vez. Se deshace lo nuevo y se
     * devuelven las viejas. */
    console.error("[reservas] no pude actualizar la reserva al mover:", errFila.message);
    await admin.from("reserva_mesas").delete().eq("reserva_id", reserva.id).eq("org_id", orgId);
    await devolverLasViejas();
    return { ok: false, motivo: "no_se_pudo", queDecir: "No pude mover la reserva. Sigue como estaba. Dile que alguien le escribe enseguida." };
  }

  return {
    ok: true,
    id: reserva.id,
    estado,
    mesas: eleccion.mesas.map((m) => m.nombre),
    turno: nombreDelTurno(valido),
    fecha,
    queDecir:
      estado === "confirmada"
        ? `Reserva MOVIDA y CONFIRMADA para ${personas} el ${fecha}, ${nombreDelTurno(valido)}. Díselo con esas palabras.`
        : `Reserva MOVIDA al ${fecha}, ${nombreDelTurno(valido)}, para ${personas}. Dile que el restaurante se la confirma en un momento — NO le digas que está confirmada.`,
  };
}
