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
