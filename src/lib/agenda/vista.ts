/**
 * LA AGENDA DEL NEGOCIO, CON QUIÉN AGENDÓ CADA CITA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS FUENTES QUE NO SE PUEDEN SUSTITUIR LA UNA A LA OTRA:
 *
 *   · GOOGLE tiene TODO lo que hay en la agenda — incluido lo que el dueño puso
 *     a mano. Es la verdad de qué hay mañana a las diez.
 *   · `citas` solo tiene lo que agendó la plataforma. Es la única que sabe DE
 *     QUIÉN es la cita —qué contacto, qué conversación— y quién la creó.
 *
 * Ninguna de las dos sirve sola: con Google no se sabe a quién escribirle, y con
 * `citas` la pantalla enseñaría media agenda y el negocio dejaría de fiarse.
 *
 * ── LO QUE HACE VALER ESTA PANTALLA ───────────────────────────────────────
 *
 * Distinguir las que agendó la IA. Un negocio que entra el lunes y ve «4 de tus
 * 7 citas las agendó tu bot» entiende lo que paga sin que nadie se lo explique.
 * Y sale gratis: si el evento está en `citas`, lo agendó la plataforma; si solo
 * está en Google, lo puso él.
 *
 * ── SE CRUZAN POR `evento_id`, QUE ES LA ÚNICA LLAVE FIABLE ───────────────
 *
 * No por la hora ni por el título. Dos citas pueden coincidir en las dos cosas,
 * y una cita movida cambia de hora pero no de identificador. Cruzar por hora
 * haría que mover una cita la convirtiera en dos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type QuienAgendo = "lana" | "el negocio";

export type EventoCrudo = {
  id: string;
  titulo: string;
  inicio: string | null;
  fin: string | null;
  todoElDia: boolean;
  enlace: string;
  cancelado: boolean;
};

export type CitaCruda = {
  id?: string | null;
  evento_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  nombre: string | null;
  correo: string | null;
  estado: string | null;
  recordatorio_enviado_at?: string | null;
  respuesta?: string | null;
};

export type CitaEnLaVista = {
  id: string;
  titulo: string;
  inicio: string;
  fin: string | null;
  todoElDia: boolean;
  enlace: string;
  quien: QuienAgendo;
  /** Solo cuando la agendó la plataforma: con quién quedó y por dónde llegó. */
  contactoId: string | null;
  conversacionId: string | null;
  nombre: string | null;
  correo: string | null;
  /** Se agendó por chat pero se quedó sin correo: no le llegó invitación. */
  sinInvitacion: boolean;
  /** El id de la fila en `citas`. Solo lo tienen las que agendó la plataforma:
   *  es lo único con lo que se puede pedir «recuérdasela a esta persona». */
  citaId: string | null;
  /** Ya se le mandó el recordatorio. Evita mandar dos. */
  recordada: boolean;
  /** Qué contestó: «confirma», «cambia», o nada todavía. */
  respuesta: string | null;
};

/**
 * Mezcla lo que hay en el calendario con lo que la plataforma sabe de cada cita.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE PARTE DE GOOGLE, NO DE `citas`, Y ESO NO ES UN DETALLE.
 *
 * La verdad de la agenda vive en el calendario del negocio. Si una cita se
 * canceló desde Google —lo más normal del mundo— la fila de `citas` se queda
 * como estaba, porque esa tabla no se sincroniza. Partiendo de `citas` la
 * pantalla enseñaría reuniones que ya no existen, y el equipo se presentaría a
 * ellas.
 *
 * Lo que se pierde partiendo de Google es una cita que la plataforma apuntó y
 * que Google ya no tiene. Eso es correcto: si no está en el calendario, no hay
 * reunión.
 *
 * Los cancelados se tiran aquí y no en la pantalla: un evento cancelado no es
 * una cita, y dejar que llegue a la vista obliga a cada sitio que la use a
 * acordarse de filtrarlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function agendaDelNegocio(
  eventos: EventoCrudo[] | null | undefined,
  citas: CitaCruda[] | null | undefined,
): CitaEnLaVista[] {
  const porEvento = new Map<string, CitaCruda>();
  for (const c of citas ?? []) {
    const id = String(c?.evento_id ?? "").trim();
    // Una cita cancelada por chat sigue siendo una fila, pero ya no dice quién
    // viene: si Google todavía la tiene, es del negocio hasta que la borre.
    if (id && c?.estado !== "cancelada") porEvento.set(id, c);
  }

  const salida: CitaEnLaVista[] = [];
  for (const e of eventos ?? []) {
    if (!e || e.cancelado) continue;
    const inicio = String(e.inicio ?? "").trim();
    if (!inicio) continue; // sin hora no se puede pintar ni ordenar

    const suya = porEvento.get(String(e.id ?? ""));
    salida.push({
      id: String(e.id ?? ""),
      titulo: String(e.titulo ?? "").trim() || "(sin título)",
      inicio,
      fin: e.fin ?? null,
      todoElDia: !!e.todoElDia,
      enlace: String(e.enlace ?? ""),
      quien: suya ? "lana" : "el negocio",
      contactoId: suya?.contact_id ?? null,
      conversacionId: suya?.conversation_id ?? null,
      nombre: suya?.nombre ?? null,
      correo: suya?.correo ?? null,
      // Solo tiene sentido decirlo de las que agendó la plataforma: de las que
      // puso el dueño a mano, él ya sabe a quién invitó.
      sinInvitacion: !!suya && !String(suya.correo ?? "").trim(),
      citaId: suya?.id ?? null,
      recordada: !!suya?.recordatorio_enviado_at,
      respuesta: suya?.respuesta ?? null,
    });
  }

  return salida.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Cuántas agendó la IA, para poder decirlo en una frase. */
export function cuantasAgendoLana(vista: CitaEnLaVista[]): number {
  return vista.filter((c) => c.quien === "lana").length;
}
