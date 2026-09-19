import "server-only";
import {
  turnosConSitio, hacerReserva, misReservas, proximaReserva,
  moverReserva, cancelarReserva, fechaDelNegocio,
} from "@/lib/reservas/servidor";
import {
  horariosLibres, agendar, proximaCita, moverCita, cancelarCita,
  citasDePersona, zonaDelNegocio,
} from "@/lib/agenda";
import { accionesDelPrompt } from "@/lib/ai/acciones";
import { herramientasAutomaticas, herramientasQueManda } from "@/lib/ai/capacidades";
import {
  horarioQuePidio, comoRecordarLosHorarios, enLaZonaDelCliente, comoSeLoDigo,
  type HorarioOfrecido, deQueHoraHablamos,
} from "@/lib/agendaHorarios";
import { zonaDelTelefono } from "@/lib/zonaHoraria";
import { emitir } from "@/lib/salidas";
import {
  prometioUnaPersona, pidioUnaPersona, prometioUnaCita, LA_CITA_NO_QUEDO,
} from "@/lib/ai/promesas";
// La lista vive sola: la usan la IA, el canal web y el motor de WhatsApp.
// Ver la cabecera de `casillas.ts`.
import { CASILLA_DE_LA_FICHA } from "@/lib/leads/casillas";
import {
  cuantoDura, loQueSeCongela, servicioQuePidio, comoSeLosOfrezco, POR_DEFECTO_MIN,
  type Servicio,
} from "@/lib/duracionDeLaCita";
import { comoSeCuentaElHorario, abiertoAhora, SIN_HORARIO } from "@/lib/horarioDelNegocio";
import { correoParaLaCita } from "@/lib/ai/correoDeLaCita";
import {
  tiendaDelBot, enlaceDelBot, productosQueSePuedenOfrecer, precioDelBot,
  comoVaElPedido, pedidoDelQueHablar,
  type TiendaDelBot, type ProductoDelBot, type PedidoDelBot,
} from "@/lib/tienda/paraElBot";

/**
 * LAS HERRAMIENTAS DEL AGENTE — lado Next (canal web y prueba del panel).
 *
 * Gemelo de `armarHerramientas`/`ejecutarHerramienta` de la función de
 * WhatsApp (`supabase/functions/whatsapp/index.ts`). Son dos porque corren en
 * runtimes distintos —Deno allá, Node aquí— y no pueden compartir archivo.
 *
 * QUE SEAN DOS ES UN RIESGO CONOCIDO, no un descuido: en este proyecto ya se
 * han desincronizado los dos motores dos veces (el respaldo del RAG que
 * inventaba datos, y la regla de texto plano). Por eso:
 *
 *   - los NOMBRES de las herramientas y sus argumentos son idénticos, y hay
 *     una prueba estática que falla si una lista tiene algo que la otra no;
 *   - todo lo que es política —qué etiquetas, qué campos, qué criterios— sale
 *     de la BASE, que sí es una sola, y no de código duplicado.
 *
 * LA REGLA QUE SOSTIENE EL DISEÑO: la capacidad es código; la política es dato
 * del cliente. `etiquetar` es la misma para todos; las etiquetas que puede
 * poner salen del catálogo de ESE cliente y el criterio lo escribe él en
 * español. Una clínica dental y una inmobiliaria califican distinto y ninguna
 * necesita que le programemos su criterio.
 */

/** Lo que el agente necesita saber de la conversación, sea del canal que sea. */
export type ContextoAgente = {
  admin: any;
  orgId: string;
  botId: string;
  conversationId: string;
  /** Variables del flujo. El agente escribe aquí la cita que acaba de reservar. */
  vars: Record<string, string>;
  /**
   * Lo pone `pasar_a_humano`. Quien llama DEBE mirarlo y dejar de responder:
   * seguir conversando después de decir «te atiende una persona» es la peor
   * cara que puede poner un bot.
   */
  pasoAHumano: boolean;
  /** Se enciende SOLO cuando el calendario confirmó. Ver `desmentirLaCita`. */
  citaAgendada?: boolean;
  /**
   * Lo último que escribió la PERSONA en este turno.
   *
   * No es para el modelo —el modelo ya lo tiene en el historial— sino para
   * `cumplirLoPrometido`: si el cliente pidió hablar con alguien y el modelo no
   * llamó a la herramienta, el pase se hace igual. Ver `pidioUnaPersona`.
   */
  ultimoTexto?: string | null;
  /**
   * La tienda que eligió el agente, si eligió alguna.
   *
   * Nulo = como se decidía antes (la enlazada al bot, y con empate la primera
   * por nombre). Con varias tiendas en el mismo bot, el alfabeto servía
   * siempre el catálogo de la misma y el negocio no tenía forma de cambiarlo.
   */
  tiendaElegida?: string | null;
  /**
   * Por qué la IA acabó devolviendo su mensaje de respaldo, cuando no fue
   * porque no supiera.
   *
   * Lo escribe `aiAnswer` y lo guarda el motor con el mensaje. Sin esto, las
   * siete causas distintas del respaldo se ven todas igual —«esa no me la sé»—
   * y una agenda rota es indistinguible de una pregunta que el bot no domina.
   */
  motivoDelRespaldo?: string | null;
};

/** Ajustes del agente que vienen de `bots.ai`. */
export type AjustesAgente = {
  herramientas?: string[];
  /**
   * Las automáticas que este negocio apagó a propósito.
   *
   * Es una lista de APAGADAS y no de encendidas, a propósito: con una lista de
   * encendidas, cada herramienta nueva nace apagada para todo el mundo y hay
   * que ir cuenta por cuenta a activarla. Es exactamente cómo se llegó a tener
   * tres herramientas de la tienda construidas y desplegadas que no tenía
   * nadie. Ver `capacidades.ts`.
   */
  herramientas_apagadas?: string[];
  /** El prompt que se está usando de verdad. De aquí salen las acciones «/». */
  persona?: string;
  criterios?: string;
  sistemaUrl?: string;
  sistemaDescripcion?: string;
};


/**
 * La ficha de la persona con la que se está hablando.
 *
 * Se resuelve por la CONVERSACIÓN, no por el identificador del canal. El motor
 * de WhatsApp busca por teléfono porque ahí el teléfono es la identidad; aquí
 * el visitante de una web no tiene ninguna, y la conversación es lo único que
 * existe en los dos casos. De paso, esto hace imposible tocar la ficha de otra
 * organización aunque llegara un id equivocado: se filtra por `org_id`.
 */
async function fichaDeLaConversacion(ctx: ContextoAgente) {
  const { data: conv } = await ctx.admin
    .from("conversations")
    .select("contact_id")
    .eq("id", ctx.conversationId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!conv?.contact_id) return null;

  const { data: c } = await ctx.admin
    .from("contacts")
    .select("id, tags, attributes, name, email, phone, external_id")
    .eq("id", conv.contact_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  return c ?? null;
}

/**
 * En qué reloj vive la persona con la que se está hablando.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CITA ES UN INSTANTE; LA HORA ES UNA FORMA DE CONTARLO. Un negocio con
 * número de Panamá y clientes en México le decía a cada mexicano una hora que
 * en su teléfono era otra, y el cliente apuntaba la que oyó.
 *
 * Se deduce del teléfono, que es lo único que se sabe con certeza de alguien
 * que escribe por WhatsApp. En Instagram y en el chat de la web no hay
 * teléfono: se devuelve `null` y todo sigue contándose en la hora del negocio,
 * que es lo correcto cuando no se sabe nada mejor.
 *
 * NO SE ADIVINA POR NADA MÁS. Ni por el idioma, ni por la hora a la que
 * escribe: la lección de la 0102 es que un respaldo plausible es peor que no
 * tener respaldo, porque nadie lo revisa.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function zonaDeQuienEscribe(ctx: ContextoAgente): Promise<string | null> {
  const quien = await fichaDeLaConversacion(ctx);
  return zonaDelTelefono((quien as any)?.phone ?? null);
}

/**
 * Una hora escrita para esta persona: en su reloj si se sabe cuál es, y si no
 * en el del negocio.
 *
 * Y si tampoco se sabe el del negocio, SE DICE — no se formatea en la zona del
 * servidor, que es lo que hacía `toLocaleString` y contaba una hora que no era
 * de nadie.
 */
async function comoLoDigo(ctx: ContextoAgente, iso: string): Promise<string> {
  const delNegocio0 = await zonaDelNegocio(ctx.orgId);
  const suya = comoSeLoDigo(iso, await zonaDeQuienEscribe(ctx), delNegocio0);
  // `suya.zona` es «(hora de Panamá)» o nada. Sin eso, el bot decía «11:00» y
  // el correo «10:00» siendo el mismo instante. Ver `hayQueDecirLaZona`.
  if (suya) return `${suya.dia} a las ${suya.hora}${suya.zona}`;
  const delNegocio = comoSeLoDigo(iso, await zonaDelNegocio(ctx.orgId));
  if (delNegocio) return `${delNegocio.dia} a las ${delNegocio.hora}`;
  return "(no puedo decirte la hora: a este negocio le falta configurar su zona horaria)";
}

/**
 * Los servicios de este negocio y cuánto dura cada uno.
 *
 * UNA SOLA CONSULTA POR RESPUESTA: en un mismo turno la piden `ver_horarios`,
 * `agendar_cita` y el contexto del modelo. Preguntar tres veces por lo mismo
 * era el coste que hacía tentador escribir la duración a fuego.
 */
async function serviciosDelNegocio(ctx: ContextoAgente): Promise<Servicio[]> {
  if ((ctx as any)._servicios) return (ctx as any)._servicios;
  const { data, error } = await ctx.admin
    .from("servicios")
    .select("id, nombre, duracion_min, buffer_antes_min, buffer_despues_min, precio_centavos, moneda, activo")
    .eq("org_id", ctx.orgId)
    .eq("activo", true)
    .order("orden");
  // Si esto falla, se agenda con la duración de fábrica en vez de dejar al
  // cliente sin cita. Pero se dice, que es la diferencia entre un fallo y un
  // misterio.
  if (error) console.error("[agenda] no pude leer los servicios:", error.message);
  (ctx as any)._servicios = (data as Servicio[]) ?? [];
  return (ctx as any)._servicios;
}

/** Lo que dura una cita en este negocio cuando no se eligió servicio. */
async function duracionPorDefecto(ctx: ContextoAgente): Promise<number> {
  if ((ctx as any)._duracionDefecto !== undefined) return (ctx as any)._duracionDefecto;
  const { data, error } = await ctx.admin
    .from("organizations").select("duracion_cita_min").eq("id", ctx.orgId).maybeSingle();
  // «No tiene duración puesta» y «no pude leerla» acaban los dos en 60, pero
  // se distinguen en los registros: si no, un fallo de la base se ve igual que
  // una cuenta recién creada y nadie lo investiga nunca.
  if (error) console.error("[agenda] no pude leer la duración por defecto:", error.message);
  (ctx as any)._duracionDefecto = Number((data as any)?.duracion_cita_min) || POR_DEFECTO_MIN;
  return (ctx as any)._duracionDefecto;
}

/**
 * ¿Qué tiene conectado este negocio, AHORA MISMO?
 *
 * ── SE PREGUNTA CADA VEZ, Y NO SE GUARDA EN NINGÚN SITIO ──────────────────
 *
 * Porque el día que alguien desconecte su Google, su asistente tiene que dejar
 * de prometer citas EN ESE MOMENTO, no cuando alguien se acuerde de ir a
 * desmarcar una casilla. Una IA que ofrece horarios de una agenda que ya no
 * existe es peor que una IA que no agenda.
 *
 * Son dos consultas por respuesta, las dos por índice. El coste es invisible al
 * lado de la llamada al modelo que viene después.
 *
 * ── «CONECTADO» ES QUE HAYA FILA, NO QUE EL TOKEN SIRVA ──────────────────
 *
 * Comprobar el token de verdad costaría un viaje a Google en CADA mensaje. Si
 * está roto, `horariosLibres` y `agendar` ya saben decir «no hay agenda
 * conectada» — y esa es la respuesta correcta para quien escribe, que es lo
 * único que importa aquí.
 */
async function loQueTieneEsteNegocio(
  ctx: ContextoAgente,
): Promise<{ agenda: boolean; tienda: boolean; reservas: boolean }> {
  try {
    const [agenda, tienda, mesas, turnos] = await Promise.all([
      ctx.admin.from("integrations").select("provider")
        .eq("org_id", ctx.orgId).in("provider", ["google_calendar", "calendly"]).limit(1),
      ctx.admin.from("tiendas").select("id")
        .eq("org_id", ctx.orgId).eq("activa", true).limit(1),
      /* HACEN FALTA LAS DOS COSAS: mesas Y turnos. Con salón y sin turnos no
       * hay a qué hora sentar a nadie; con turnos y sin salón no hay dónde. Un
       * restaurante a medio configurar con las herramientas encendidas es Lana
       * prometiendo mesas que no existen. */
      ctx.admin.from("reservas_mesas").select("id")
        .eq("org_id", ctx.orgId).eq("activa", true).limit(1),
      ctx.admin.from("reservas_turnos").select("id")
        .eq("org_id", ctx.orgId).eq("activo", true).limit(1),
    ]);
    return {
      agenda: !!(agenda.data ?? []).length,
      tienda: !!(tienda.data ?? []).length,
      reservas: !!(mesas.data ?? []).length && !!(turnos.data ?? []).length,
    };
  } catch (e) {
    // ANTE LA DUDA, NADA AUTOMÁTICO. Encender herramientas porque la base no
    // contestó sería que el bot prometa citas sin poder crearlas. Lo que el
    // negocio marcó a mano sigue funcionando igual.
    console.error("[ia] no pude ver qué tiene conectado este negocio:", (e as Error)?.message ?? e);
    return { agenda: false, tienda: false, reservas: false };
  }
}

/**
 * Los horarios que se ofrecieron, tal y como quedaron guardados.
 *
 * Viven en una variable de la conversación —texto— porque es lo que los dos
 * motores saben guardar y recuperar sin tabla nueva. Si viene roto, se trata
 * como «no hay ninguno», que hace que se le pida al modelo mirar primero.
 */
/* ════════════════════════════════════════════════════════════════════════════
 * RESERVAS: LA PLATAFORMA SE ACUERDA DE LOS TURNOS QUE OFRECIÓ.
 *
 * Es la misma medicina que `horarios_ofrecidos` en la agenda, y por el mismo
 * fallo real: el modelo reescribe la lista con sus palabras para enseñársela a
 * la persona y después ya no tiene el identificador a mano. Si `reservar_mesa`
 * dependiera de que lo recordara, un día mandaría un uuid inventado — y un
 * uuid de turno inventado que exista reserva en el turno equivocado.
 *
 * Guardando aquí lo que se ofreció, el modelo puede decir «el primer turno» o
 * «7:00 p.m.» y la plataforma lo traduce sola.
 * ══════════════════════════════════════════════════════════════════════════ */

type TurnoOfrecido = { id: string; fecha: string; label: string };

function leerTurnosOfrecidos(crudo: unknown): TurnoOfrecido[] {
  try {
    const x = JSON.parse(String(crudo ?? "[]"));
    return Array.isArray(x) ? (x as TurnoOfrecido[]) : [];
  } catch {
    return [];
  }
}

/**
 * Traduce lo que trae el modelo al turno exacto que se ofreció.
 *
 * Acepta el identificador tal cual, la etiqueta que se le enseñó a la persona,
 * o un trozo de ella. Si solo se ofreció uno, ese es — pedir precisión cuando
 * no hay ambigüedad es hacer fallar la conversación por gusto.
 */
function turnoQuePidio(pedido: string, ofrecidos: TurnoOfrecido[]): TurnoOfrecido | null {
  const q = String(pedido ?? "").trim().toLowerCase();
  if (!ofrecidos.length) return null;
  if (!q) return ofrecidos.length === 1 ? ofrecidos[0] : null;

  const exacto = ofrecidos.find((t) => t.id.toLowerCase() === q);
  if (exacto) return exacto;

  const porEtiqueta = ofrecidos.find((t) => t.label.toLowerCase() === q);
  if (porEtiqueta) return porEtiqueta;

  const parecido = ofrecidos.filter((t) => t.label.toLowerCase().includes(q) || q.includes(t.label.toLowerCase()));
  if (parecido.length === 1) return parecido[0];

  return ofrecidos.length === 1 ? ofrecidos[0] : null;
}

/** Qué decirle al modelo cuando no se pudo traducir. Nunca un error mudo. */
function comoRecordarLosTurnos(ofrecidos: TurnoOfrecido[]): string {
  if (!ofrecidos.length) {
    return "Todavía no has consultado la disponibilidad. Llama primero a ver_mesas con la fecha y cuántas personas son.";
  }
  return (
    "No supe a qué turno te refieres. Vuelve a llamar a reservar_mesa copiando uno de estos tal cual:\n" +
    ofrecidos.map((t) => `- ${t.label} → turno: ${t.id}`).join("\n")
  );
}

/** "AAAA-MM-DD" o nada. El modelo no inventa fechas: si no la sabe, pregunta. */
function fechaPedida(x: unknown): string {
  const s = String(x ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function leerHorariosOfrecidos(crudo: unknown): HorarioOfrecido[] {
  try {
    const v = JSON.parse(String(crudo ?? "[]"));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function armarHerramientas(
  ctx: ContextoAgente,
  ai: AjustesAgente,
): Promise<{ tools: any[]; contexto: string }> {
  /* ── CONECTAR ES ENCENDER ────────────────────────────────────────────────
   *
   * Tres fuentes, y la primera es nueva: lo que el negocio TIENE CONECTADO.
   *
   * Antes esto empezaba y acababa en las casillas. Y la persona para la que
   * está hecha esta plataforma tiene una clínica, no una empresa de software:
   * conecta su Google Calendar porque se lo pide la pantalla de citas, y su
   * asistente sigue sin poder agendar por una casilla en OTRA pantalla que
   * nadie le dijo que existía. Desde su lado eso no es un fallo que reportar,
   * es «la IA no sirve para eso».
   *
   * Las reglas están en `capacidades.ts`, puras y probadas. Aquí solo se mira
   * qué hay de verdad conectado.
   * ────────────────────────────────────────────────────────────────────── */
  const marcadas: string[] = Array.isArray(ai.herramientas) ? ai.herramientas : [];
  const escritas = accionesDelPrompt(ai.persona);
  const automaticas = herramientasAutomaticas(await loQueTieneEsteNegocio(ctx));
  const quiere = herramientasQueManda({
    automaticas,
    marcadas,
    escritas,
    apagadas: Array.isArray(ai.herramientas_apagadas) ? ai.herramientas_apagadas : [],
  });
  if (!quiere.length) return { tools: [], contexto: "" };



  const tools: any[] = [];
  const notas: string[] = [];

  if (quiere.includes("horario_del_negocio") || quiere.includes("ver_horarios")) {
    tools.push({
      name: "horario_del_negocio",
      description:
        "A qué hora abre y cierra el negocio cada día. ÚSALA SIEMPRE que pregunten por el horario, " +
        "si están abiertos o hasta qué hora atienden. NUNCA contestes eso de memoria ni con lo que " +
        "hayas leído en el entrenamiento: el negocio cambia su horario en la plataforma y solo esta " +
        "herramienta sabe el de hoy.",
      input_schema: { type: "object", properties: {}, required: [] },
    });
  }

  if (quiere.includes("ver_horarios")) {
    tools.push({
      name: "ver_horarios",
      description:
        "Consulta los horarios libres en la agenda del negocio. Úsala ANTES de proponer una hora: " +
        "nunca inventes disponibilidad.",
      input_schema: {
        type: "object",
        properties: {
          dias: { type: "integer", description: "Cuántos días hacia adelante mirar. Por defecto 14." },
          servicio: {
            type: "string",
            description:
              "El servicio que pidió, con el NOMBRE TAL CUAL de la lista. Decide cuánto duran " +
              "los huecos: sin él se ofrecen huecos de la duración de fábrica del negocio, y " +
              "una cita larga acabaría encima de la siguiente.",
          },
        },
      },
    });
  }

  if (quiere.includes("agendar_cita")) {
    tools.push({
      name: "agendar_cita",
      description:
        "Reserva una cita. El `inicio` DEBE ser uno de los que devolvió ver_horarios, copiado tal cual. " +
        "No la llames sin haber confirmado la hora con la persona. " +
        "HACE FALTA SU CORREO: sin él no le llega la invitación y la cita queda solo en el calendario " +
        "del negocio. Si no lo sabes, pregúntaselo antes de llamar a esta herramienta.",
      input_schema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "La fecha y hora exacta que devolvió ver_horarios." },
          servicio: {
            type: "string",
            description:
              "El servicio que pidió, con el NOMBRE TAL CUAL aparece en la lista de servicios. " +
              "Decide cuánto dura la cita. Si no estás seguro de cuál de dos es, pregúntale antes.",
          },
          nombre: { type: "string", description: "Nombre de quien reserva, si lo sabes." },
          correo: {
            type: "string",
            description:
              "Su correo, para mandarle la invitación. Si ya te lo dio antes en esta conversación, " +
              "repítelo aquí. Si no lo tienes, pídeselo primero: sin correo la cita no se crea.",
          },
        },
        required: ["inicio"],
      },
    });
  }

  if (quiere.includes("reagendar_cita")) {
    tools.push({
      name: "reagendar_cita",
      description:
        "Mueve la cita que esta persona ya tiene a otra hora. Llámala sin `inicio` para saber cuándo " +
        "la tiene; después usa ver_horarios y vuelve a llamarla con la hora nueva. " +
        "NO necesitas identificar la cita: la plataforma sabe cuál es la suya.",
      input_schema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "La hora nueva, tal cual la devolvió ver_horarios." },
        },
      },
    });
  }

  if (quiere.includes("ver_mis_citas")) {
    tools.push({
      name: "ver_mis_citas",
      description:
        "Consulta las citas que ESTA persona tiene por delante, en todos los canales por los que " +
        "te haya escrito. Úsala SIEMPRE que pregunte por su cita —si la tiene, si quedó confirmada, " +
        "cuándo es—. NO adivines ni digas que no puedes verlas: llámala. " +
        "Si devuelve que no hay ninguna, díselo tal cual y ofrécele agendar.",
      input_schema: { type: "object", properties: {} },
    });
  }

  if (quiere.includes("cancelar_cita")) {
    tools.push({
      name: "cancelar_cita",
      description:
        "Cancela la cita que esta persona tiene. CONFÍRMALE ANTES que de verdad la quiere cancelar: " +
        "se borra del calendario del negocio y no se deshace. Si lo que quiere es cambiarla de hora, " +
        "usa reagendar_cita en vez de esta.",
      input_schema: { type: "object", properties: {} },
    });
  }

  /* ── LAS CINCO DE RESERVAS ────────────────────────────────────────────────
   *
   * `ver_mesas` va primero por lo mismo que `ver_horarios`: sin consultar, el
   * modelo se inventa disponibilidad. Y ninguna de las tres últimas recibe el
   * id de una reserva — la plataforma sabe cuál es la suya. */

  if (quiere.includes("ver_mesas")) {
    tools.push({
      name: "ver_mesas",
      description:
        "Consulta si el restaurante tiene sitio un día concreto para un número de personas. " +
        "Úsala SIEMPRE antes de prometer una mesa: nunca inventes disponibilidad ni digas que hay sitio sin llamarla. " +
        "Devuelve los turnos donde el grupo cabe de verdad.",
      input_schema: {
        type: "object",
        properties: {
          fecha: { type: "string", description: "El día exacto, como AAAA-MM-DD, si lo sabes con certeza." },
          dias: {
            type: "integer",
            description:
              "O la distancia desde hoy: 0 = hoy, 1 = mañana, 2 = pasado mañana. " +
              "ÚSALA cuando la persona hable en relativo. NO calcules tú la fecha: no sabes en qué día vives.",
          },
          personas: { type: "integer", description: "Cuántas personas son. Si no lo sabes, pregúntaselo antes." },
        },
        required: ["personas"],
      },
    });
  }

  if (quiere.includes("reservar_mesa")) {
    tools.push({
      name: "reservar_mesa",
      description:
        "Hace la reserva. El `turno` DEBE ser uno de los que devolvió ver_mesas, copiado tal cual. " +
        "No la llames sin haber confirmado con la persona el día, la hora y cuántos son. " +
        "Si la respuesta dice APARTADA, NO le digas que está confirmada.",
      input_schema: {
        type: "object",
        properties: {
          turno: { type: "string", description: "El turno que devolvió ver_mesas, tal cual." },
          personas: { type: "integer", description: "Cuántas personas son." },
          nombre: { type: "string", description: "A nombre de quién, si lo sabes." },
          notas: { type: "string", description: "Lo que haya pedido: cumpleaños, terraza, silla de bebé." },
        },
        required: ["turno"],
      },
    });
  }

  if (quiere.includes("ver_mis_reservas")) {
    tools.push({
      name: "ver_mis_reservas",
      description:
        "Consulta las reservas que ESTA persona tiene por delante, en todos los canales por los que te " +
        "haya escrito. Úsala SIEMPRE que pregunte por su reserva —si la tiene, si quedó confirmada, " +
        "cuándo es, para cuántos—. NO adivines ni digas que no puedes verlas: llámala.",
      input_schema: { type: "object", properties: {} },
    });
  }

  if (quiere.includes("mover_reserva")) {
    tools.push({
      name: "mover_reserva",
      description:
        "Mueve la reserva que esta persona ya tiene a otro día o turno. Llámala sin `turno` para saber " +
        "cuándo la tiene; después usa ver_mesas y vuelve a llamarla con el turno nuevo. " +
        "NO necesitas identificar la reserva: la plataforma sabe cuál es la suya. " +
        "Mover puede dejarla pendiente de confirmar otra vez: di lo que responda, no lo que había antes.",
      input_schema: {
        type: "object",
        properties: {
          turno: { type: "string", description: "El turno nuevo, tal cual lo devolvió ver_mesas." },
          personas: { type: "integer", description: "Si además cambia cuántos son." },
        },
      },
    });
  }

  if (quiere.includes("cancelar_reserva")) {
    tools.push({
      name: "cancelar_reserva",
      description:
        "Cancela la reserva que esta persona tiene. CONFÍRMALE ANTES que de verdad la quiere cancelar: " +
        "la mesa se libera y no se deshace. Si lo que quiere es cambiar el día o la hora, usa " +
        "mover_reserva en vez de esta.",
      input_schema: { type: "object", properties: {} },
    });
  }

  if (quiere.includes("etiquetar")) {
    // El catálogo REAL de este cliente. Sin esto el modelo se inventa etiquetas
    // y el embudo del negocio deja de significar nada.
    const { data: tags } = await ctx.admin.from("tags").select("name").eq("org_id", ctx.orgId);
    const nombres = ((tags ?? []) as any[]).map((t) => t.name);
    if (nombres.length) {
      notas.push(`Etiquetas disponibles: ${nombres.join(", ")}.`);
      tools.push({
        name: "etiquetar",
        description:
          "Marca a esta persona con una etiqueta del negocio para clasificarla. " +
          "Solo puedes usar las etiquetas que existen; cualquier otra será rechazada.\n\n" +
          "CUÁNDO: solo cuando YA SEPAS lo que el criterio del negocio pide para decidir. " +
          "Si el criterio habla de ingresos, presupuesto o plazo y todavía no te lo han dicho, " +
          "NO llames a esta herramienta: pregúntalo primero y etiqueta después. " +
          "Etiquetar al principio 'por si acaso' llena el embudo del negocio de calificaciones " +
          "inventadas, y alguien toma decisiones de dinero con ellas.\n" +
          "Si te enteras de algo que cambia la calificación, vuelve a llamarla: la nueva " +
          "sustituye a la anterior.",
        input_schema: {
          type: "object",
          properties: {
            etiqueta: { type: "string", enum: nombres, description: "Una de las etiquetas existentes." },
            por_que: { type: "string", description: "En una frase, por qué le pones esta etiqueta." },
            // OBLIGATORIO Y A PROPÓSITO: obliga al modelo a nombrar lo que la
            // persona DIJO. Cuando no hay nada que citar, se nota —para él al
            // escribirlo y para quien lo lea después en el evento—, y eso
            // frena la calificación prematura mucho mejor que pedírselo en
            // prosa dentro del prompt.
            en_que_me_baso: {
              type: "array",
              items: { type: "string" },
              description:
                "Lo que la persona DIJO y te lleva a esta etiqueta, con sus palabras. " +
                "Si no puedes citar nada concreto, es que todavía no sabes lo suficiente: no etiquetes.",
            },
          },
          required: ["etiqueta", "por_que", "en_que_me_baso"],
        },
      });
    }
  }

  if (quiere.includes("guardar_dato")) {
    const { data: campos } = await ctx.admin
      .from("custom_attributes").select("key, name, type").eq("org_id", ctx.orgId);
    const lista = (campos ?? []) as any[];
    if (lista.length) {
      notas.push(
        "Datos que puedes guardar de la persona: " +
          lista.map((c) => `${c.key} (${c.name})`).join(", ") + ".",
      );
      tools.push({
        name: "guardar_dato",
        description:
          "Guarda un dato de esta persona en su ficha, para que el equipo lo vea después. " +
          "Solo campos que existan.",
        input_schema: {
          type: "object",
          properties: {
            campo: { type: "string", enum: lista.map((c) => c.key), description: "La clave del campo." },
            valor: { type: "string", description: "Lo que la persona dijo, tal cual." },
          },
          required: ["campo", "valor"],
        },
      });
    }
  }

  if (quiere.includes("pasar_a_humano")) {
    tools.push({
      name: "pasar_a_humano",
      description:
        "Pasa la conversación a una persona del equipo. Úsala cuando te lo pidan, cuando no puedas " +
        "resolver algo importante, o cuando la persona esté molesta.",
      input_schema: {
        type: "object",
        properties: { motivo: { type: "string", description: "Por qué la pasas." } },
        required: ["motivo"],
      },
    });
  }

  /* ── LAS TRES DE LA TIENDA ──────────────────────────────────────────────
   *
   * SON LA RESPUESTA A LA PREGUNTA QUE MÁS LLEGA: «¿tienen X?» y «¿cuánto
   * cuesta?». Sin esto, la IA contesta con lo que haya en el conocimiento
   * cargado —que casi nunca tiene precios al día— o se lo inventa, que es
   * peor: un precio inventado por WhatsApp es una discusión con un cliente.
   *
   * NO HACE FALTA CONFIGURAR NADA. Los productos salen de la tienda vinculada
   * a este chatbot. Es el mismo diseño de `etiquetar`: la capacidad es código,
   * la política —qué productos, a qué precio— es dato del cliente. */
  if (quiere.includes("ver_catalogo")) {
    tools.push({
      name: "ver_catalogo",
      description:
        "Consulta los productos y precios REALES de la tienda del negocio. Úsala SIEMPRE antes de " +
        "decir un precio o de afirmar que algo está disponible: nunca inventes ni supongas precios.",
      input_schema: {
        type: "object",
        properties: {
          busca: { type: "string", description: "Palabra que describe lo que busca la persona. Vacío = todo el catálogo." },
        },
      },
    });
  }

  if (quiere.includes("estado_de_pedido")) {
    tools.push({
      name: "estado_de_pedido",
      description:
        "Consulta cómo va el pedido de la persona con la que estás hablando. Se identifica sola por " +
        "su número: no le pidas datos para esto.",
      input_schema: { type: "object", properties: {} },
    });
  }

  if (quiere.includes("enlace_de_tienda")) {
    tools.push({
      name: "enlace_de_tienda",
      description:
        "Da el enlace de la tienda para que la persona haga su pedido. Úsala cuando ya resolviste su " +
        "duda y toca cerrar.",
      input_schema: { type: "object", properties: {} },
    });
  }

  if (quiere.includes("consultar_sistema") && ai.sistemaUrl) {
    tools.push({
      name: "consultar_sistema",
      description:
        String(ai.sistemaDescripcion ?? "") ||
        "Consulta el sistema del negocio para obtener información que no está en el conocimiento cargado.",
      input_schema: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Qué quieres consultar, en pocas palabras." },
        },
        required: ["consulta"],
      },
    });
  }

  // Los criterios del cliente, en su idioma. Esto es LA pieza que hace que el
  // mismo código sirva para una clínica y para una inmobiliaria.
  /* SIN LA LISTA, EL PARÁMETRO `servicio` NO SIRVE DE NADA: el modelo no puede
   * elegir de un catálogo que no ha visto, y acabaría inventándose nombres que
   * `servicioQuePidio` descarta — que es el fallo silencioso de siempre, pero
   * con otra cara. */
  if (quiere.includes("agendar_cita") || quiere.includes("ver_horarios")) {
    const catalogo = comoSeLosOfrezco(await serviciosDelNegocio(ctx));
    if (catalogo) notas.push(catalogo);
  }

  if (ai.criterios) notas.push(`Criterios del negocio:\n${ai.criterios}`);

  // ── LA LISTA DE VERDAD, Y VA LA ÚLTIMA ──────────────────────────────────
  //
  // Un prompt escrito por el cliente puede nombrar acciones que NO EXISTEN.
  // Pasó: terminaba con «Acciones disponibles: crear_lead_hubspot», una
  // herramienta que nunca construimos. El modelo se creyó esa lista, no llamó
  // a las que sí tenía, y se limitó a NARRAR lo que iba a hacer.
  //
  // Va al FINAL a propósito, después del prompt del cliente: lo último que se
  // lee es lo que manda.
  if (tools.length) {
    notas.push(
      `ACCIONES QUE PUEDES EJECUTAR DE VERDAD: ${tools.map((t) => t.name).join(", ")}.\n` +
        "Esta es la lista completa. Si más arriba se menciona cualquier otra acción o " +
        "herramienta, NO existe: ignórala.\n" +
        "NO ANUNCIES LO QUE NO EJECUTAS. Si escribes que vas a pasar con una persona, " +
        "que registraste un dato o que guardaste algo, tienes que llamar a la herramienta " +
        "correspondiente EN ESE MISMO TURNO. Decirlo sin hacerlo deja al cliente esperando " +
        "algo que nunca pasa.",
    );
  }

  return { tools, contexto: notas.join("\n") };
}

/**
 * Ejecuta una herramienta que pidió el modelo.
 *
 * TODO SE VALIDA AQUÍ, no en el prompt. Lo que el modelo pide es una propuesta;
 * lo que se puede hacer lo decide la base. Cuando algo no cuadra se devuelve un
 * error EXPLICATIVO en vez de fallar en silencio: con eso el modelo corrige y
 * lo vuelve a intentar bien, que es justo lo que se quiere.
 */
/**
 * SI EL BOT PROMETIÓ UNA PERSONA, QUE VENGA UNA PERSONA.
 *
 * Gemelo del de la función de WhatsApp. El porqué, en `promesas.ts`: el modelo
 * a veces narra el pase en vez de ejecutarlo, y el lead se queda esperando a
 * alguien que no va a llegar. La promesa la hizo el bot en nombre del negocio.
 */
export async function cumplirLoPrometido(
  ctx: ContextoAgente,
  texto: string,
  tools: any[],
): Promise<string> {
  const corregido = await desmentirLaCita(ctx, texto, tools);
  if (ctx.pasoAHumano) return corregido;
  if (!tools.some((t) => t.name === "pasar_a_humano")) return corregido;

  /* DOS DISPARADORES, NO UNO.
   *
   * El de abajo mira lo que prometió el BOT. Este mira lo que pidió el
   * CLIENTE, y es el que faltaba: en producción se vieron dos personas
   * pidiendo lo mismo con otras palabras, misma cuenta y misma herramienta
   * encendida, y solo una acabó con un agente. La diferencia estuvo en si al
   * modelo le dio por llamar a la herramienta.
   *
   * SE HACE EL PASE Y SE DEJA HABLAR AL BOT. No se sustituye el texto: el
   * modelo suele contestar algo razonable («claro, te comunico») y taparlo con
   * una frase nuestra sería peor. Lo que no puede pasar es que la conversación
   * siga sin dueño. */
  if (pidioUnaPersona(ctx.ultimoTexto)) {
    console.log("[agente] el cliente pidió una persona; se hace el pase");
    await hacerElPase(
      ctx,
      "El cliente pidió hablar con una persona",
      "lo pidió el cliente",
    );
    return corregido;
  }

  if (!prometioUnaPersona(corregido)) return corregido;

  console.log("[agente] prometió una persona sin llamar a la herramienta; se hace el pase");
  await hacerElPase(
    ctx,
    "El asistente prometió que atendería una persona",
    "el asistente lo prometió en su respuesta",
  );
  return corregido;
}

/**
 * El pase en sí, en UN solo sitio.
 *
 * Había dos copias de estas siete líneas y ahora harían falta tres. Una copia
 * que se arregla y otra que no es exactamente cómo vuelve un fallo: el día que
 * el pase necesite tocar una columna más, la que se olvide dejará
 * conversaciones a medio pasar sin que nadie lo note.
 *
 * Que falle no puede dejar al cliente sin respuesta: se registra y se sigue.
 */
async function hacerElPase(
  ctx: ContextoAgente,
  razon: string,
  motivo: string,
): Promise<void> {
  try {
    await ctx.admin.from("conversations").update({
      status: "assigned",
      handoff_requested_at: new Date().toISOString(),
      handoff_reason: razon,
    }).eq("id", ctx.conversationId).eq("org_id", ctx.orgId);
    ctx.pasoAHumano = true;
    emitir(ctx.orgId, "pase.a.humano", {
      motivo,
      conversacion_id: ctx.conversationId,
      por: "agente_ia",
    });
  } catch (e) {
    console.error("[agente] no pude hacer el pase a una persona:", e);
  }
}

/**
 * SI DIJO QUE AGENDÓ Y NO AGENDÓ, SE DESMIENTE ANTES DE QUE SALGA.
 *
 * A diferencia del pase a humano, esto NO se puede cumplir: no sabemos qué
 * hueco quería, y agendar el equivocado es peor que no agendar — el paciente
 * llega un jueves que no era. Ver la cabecera de `prometioUnaCita`.
 *
 * Se devuelve un texto DISTINTO, no un añadido: un mensaje que dice
 * «confirmada ✅» y tres líneas más abajo «perdón, no quedó» deja a la persona
 * sin saber si tiene cita o no. Se sustituye entero.
 *
 * Y se pasa a una persona, porque a alguien ya le dijimos que tenía una cita.
 */
async function desmentirLaCita(
  ctx: ContextoAgente,
  texto: string,
  tools: any[],
): Promise<string> {
  if (ctx.citaAgendada) return texto;
  if (!tools.some((t) => t.name === "agendar_cita" || t.name === "reagendar_cita")) return texto;
  if (!prometioUnaCita(texto)) return texto;

  console.log("[agente] dijo que agendó una cita SIN haberla agendado; se desmiente");
  try {
    await ctx.admin.from("conversations").update({
      status: "assigned",
      handoff_requested_at: new Date().toISOString(),
      handoff_reason: "El asistente dijo que agendó una cita y no se agendó",
    }).eq("id", ctx.conversationId).eq("org_id", ctx.orgId);
    ctx.pasoAHumano = true;
  } catch (e) {
    // Que falle el pase no puede impedir el desmentido: lo que no se negocia
    // es que la mentira no salga.
    console.error("[agente] no pude pasar la cita fallida a una persona:", e);
  }
  return LA_CITA_NO_QUEDO;
}

export async function ejecutarHerramienta(
  ctx: ContextoAgente,
  ai: AjustesAgente,
  nombre: string,
  args: any,
): Promise<string> {
  try {
    switch (nombre) {
      /* ── LAS TRES DE LA TIENDA ────────────────────────────────────────
       * SIEMPRE DEVUELVEN UNA FRASE QUE EL MODELO PUEDE USAR, nunca vacío ni
       * un error crudo. Una herramienta que contesta con silencio hace que el
       * modelo se invente la respuesta, que es exactamente de lo que veníamos
       * huyendo. */
      case "ver_catalogo": {
        const t = await laTiendaDelBot(ctx);
        if (!t) return "Este negocio no tiene tienda en línea activa. No inventes productos ni precios.";

        const { data: crudos } = await ctx.admin
          .from("tienda_productos")
          .select("id, nombre, precio, categoria, oculto, stock, orden, descripcion")
          .eq("tienda_id", t.id).order("orden").order("nombre");

        let productos = productosQueSePuedenOfrecer((crudos ?? []) as ProductoDelBot[]);
        const busca = String(args?.busca ?? "").trim().toLowerCase();
        if (busca) {
          const coincide = productos.filter((p: any) =>
            [p.nombre, p.categoria, p.descripcion].some((c) => String(c ?? "").toLowerCase().includes(busca)),
          );
          // SI NO COINCIDE NADA SE DEVUELVE TODO, no una lista vacía: casi
          // siempre es que la persona lo llamó de otra forma, y con el catálogo
          // delante el modelo sí sabe si lo tienen o no.
          if (coincide.length) productos = coincide;
        }

        if (!productos.length) return "La tienda no tiene productos disponibles ahora mismo.";

        const moneda = String((t as any)?.config?.moneda ?? "$");
        // TREINTA COMO MUCHO: el catálogo entero de una tienda grande se come
        // el contexto del modelo y encarece cada respuesta.
        const lineas = productos.slice(0, 30).map((p: any) =>
          `- ${p.nombre}${p.categoria ? ` (${p.categoria})` : ""}: ${precioDelBot(p.precio, moneda)}`,
        );
        const mas = productos.length > 30 ? `\n(y ${productos.length - 30} más — mándale el enlace de la tienda)` : "";
        return `Productos disponibles de ${t.nombre}:\n${lineas.join("\n")}${mas}\n\n` +
          `Enlace para pedir: ${enlaceDelBot(t)}`;
      }

      case "estado_de_pedido": {
        const t = await laTiendaDelBot(ctx);
        if (!t) return "Este negocio no tiene tienda en línea. No puedes consultar pedidos.";

        const { data: conv } = await ctx.admin
          .from("conversations").select("contact_id").eq("id", ctx.conversationId).maybeSingle();
        if (!conv?.contact_id) {
          return "No pude identificar a esta persona. Pídele el número de su pedido y pásalo a una persona del equipo.";
        }

        const { data: pedidos } = await ctx.admin
          .from("pedidos").select("numero, estado, pago, total, created_at")
          .eq("tienda_id", t.id).eq("contacto_id", conv.contact_id)
          .order("created_at", { ascending: false }).limit(10);

        const p = pedidoDelQueHablar((pedidos ?? []) as PedidoDelBot[]);
        if (!p) return "Esta persona no tiene ningún pedido a su nombre. No inventes uno.";
        return comoVaElPedido(p, String((t as any)?.config?.moneda ?? "$"));
      }

      case "enlace_de_tienda": {
        const t = await laTiendaDelBot(ctx);
        if (!t) return "Este negocio no tiene tienda en línea activa. No des ningún enlace.";
        return `Enlace de la tienda (dáselo tal cual): ${enlaceDelBot(t)}`;
      }

      case "ver_horarios": {
        const r = await horariosLibres(ctx.orgId, {
          /* LA REJILLA TIENE QUE DURAR LO QUE LA CITA. Con 30 a fuego, el bot
           * ofrecía las 12:00 Y las 12:30 de una cita de dos horas: el segundo
           * hueco no existía y alguien lo iba a reservar. */
          durationMin: cuantoDura(
            servicioQuePidio(args?.servicio, await serviciosDelNegocio(ctx)),
            await duracionPorDefecto(ctx),
          ).minutos,
          days: Number(args?.dias) || 14,
          maxSlots: 8,
        });
        if (!r.slots.length) {
          return "No hay horarios libres o la agenda no está conectada. Dile que le pasarás con una persona.";
        }

        /* ── SE LE DICEN EN SU RELOJ, NO EN EL DEL NEGOCIO ────────────────
         *
         * Los huecos se CALCULARON con el horario del negocio y en su zona —eso
         * no cambia, «abrimos de 9 a 6» son las suyas—. Aquí solo se reescribe
         * la etiqueta. El instante es el mismo.
         *
         * Y se guardan YA TRADUCIDOS: `horarioQuePidio` compara contra estas
         * etiquetas, así que si se guardaran las del negocio, alguien que
         * repitiera la hora que acaba de leer no sería reconocido. */
        const slots = enLaZonaDelCliente(
          r.slots,
          await zonaDeQuienEscribe(ctx),
          await zonaDelNegocio(ctx.orgId),
        );

        /* ── LA PLATAFORMA SE ACUERDA DE LO QUE OFRECIÓ ───────────────────
         *
         * Antes esto solo se lo decía al modelo y confiaba en que cargara el
         * identificador exacto hasta el turno siguiente. No lo hace: reescribe
         * la lista con sus palabras para enseñársela a la persona, y después ya
         * no tiene el ISO a mano. El 6 de septiembre eso hizo que una cita no
         * se creara y la conversación acabara con una persona.
         *
         * Guardándolos aquí, `agendar_cita` puede traducir «lunes a las 9 am» a
         * la hora exacta sin depender de la memoria del modelo. */
        ctx.vars.horarios_ofrecidos = JSON.stringify(
          slots.map((s) => ({ iso: s.startISO, label: s.label })),
        );

        return "Horarios libres (usa el valor de `inicio` tal cual al agendar):\n" +
          slots.map((s) => `- ${s.label} → inicio: ${s.startISO}`).join("\n");
      }

      case "horario_del_negocio": {
        const { data: org, error } = await ctx.admin
          .from("organizations").select("business_hours, timezone").eq("id", ctx.orgId).maybeSingle();
        if (error) console.error("[agenda] no pude leer el horario del negocio:", error.message);

        const zonaNeg = (org as any)?.timezone ?? null;
        const texto = comoSeCuentaElHorario(
          (org as any)?.business_hours,
          deQueHoraHablamos(zonaNeg, await zonaDeQuienEscribe(ctx)),
        );
        // Vacío NO es «cerrado toda la semana»: es que nadie lo configuró.
        if (!texto) return SIN_HORARIO;

        const ahora = abiertoAhora((org as any)?.business_hours, zonaNeg);
        const estado =
          ahora === true ? "\nAhora mismo ESTÁ ABIERTO."
          : ahora === false ? "\nAhora mismo está CERRADO."
          : "\nNo puedes saber si ahora mismo está abierto: no lo afirmes.";
        return `Horario del negocio:\n${texto}${estado}`;
      }

      case "agendar_cita": {
        const pedido = String(args?.inicio ?? "").trim();
        if (!pedido) return "Falta la hora. Llama primero a ver_horarios.";

        /* ── SE TRADUCE CONTRA LO QUE DE VERDAD SE OFRECIÓ ────────────────
         *
         * El modelo puede traer el identificador exacto, la etiqueta que le
         * enseñó a la persona, o «lunes a las 9 am». Los tres valen. Lo que NO
         * puede pasar es lo de antes: mandar el texto al calendario, que
         * `Date.parse` lo rechace, y devolverle «Falta la fecha y hora de la
         * cita» — un error que no dice qué hacer y con el que se rindió. */
        const ofrecidos = leerHorariosOfrecidos(ctx.vars?.horarios_ofrecidos);
        const inicio = horarioQuePidio(pedido, ofrecidos);
        if (!inicio) return comoRecordarLosHorarios(ofrecidos);

        const quien = await fichaDeLaConversacion(ctx);
        const nombreDeLaCita = String(args?.nombre ?? ctx.vars?.nombre ?? "cliente");

        /* ── SIN CORREO NO SE AGENDA ──────────────────────────────────────
         *
         * El 9 sep 2026 se agendó una cita sin invitado: apareció en el
         * calendario y no le llegó nada a nadie, ni la invitación ni —al
         * cancelarla— el aviso de cancelación. Hubo que ponerlo a mano.
         *
         * Antes esto era `args?.correo || undefined`: si el modelo no lo
         * traía, se agendaba igual. Agendar y no avisar es peor que no
         * agendar. Ver `correoDeLaCita.ts`. */
        const elCorreo = correoParaLaCita({
          loDijoAhora: args?.correo,
          enSuFicha: quien?.email ?? ctx.vars?.correo,
        });
        if (!elCorreo.ok) return elCorreo.motivo;

        const elServicio = servicioQuePidio(args?.servicio, await serviciosDelNegocio(ctx));
        const congelado = loQueSeCongela(elServicio, await duracionPorDefecto(ctx));

        const r = await agendar(ctx.orgId, {
          inicioISO: inicio,
          durationMin: congelado.duracion_min,
          // Lo que pasó, copiado: el servicio se puede renombrar, encarecer o
          // borrar y esta cita tiene que seguir contando lo de hoy.
          congelado,
          titulo: `Cita con ${nombreDeLaCita}`,
          descripcion: "Cita agendada por el agente de IA.",
          correoInvitado: elCorreo.correo,
          // DE QUIÉN ES. Sin esto la cita se crea pero queda huérfana, y
          // después no se puede mover ni cancelar por chat: es exactamente el
          // agujero que dejaba a la IA sin saber «cuál cita».
          contactoId: quien?.id ?? null,
          conversacionId: ctx.conversationId,
          nombreInvitado: nombreDeLaCita,
        });
        if (!r.ok) return `No se pudo agendar: ${r.error}. Ofrece otra hora.`;

        /* SE GUARDA EN SU FICHA SI NO ESTABA. Así no se lo volvemos a pedir la
         * próxima vez, y —más importante— si mueve o cancela la cita más
         * adelante, Google tiene a quién avisar. Best-effort: la cita ya está
         * hecha y un fallo aquí no puede deshacerla. */
        if (elCorreo.de === "lo dijo ahora" && quien?.id && !quien?.email) {
          try {
            await ctx.admin
              .from("contacts")
              .update({ email: elCorreo.correo })
              .eq("id", quien.id)
              .eq("org_id", ctx.orgId);
          } catch { /* la cita ya está creada; esto no la deshace */ }
        }

        /* ── SE CONFIRMA EN EL MISMO RELOJ EN QUE SE OFRECIÓ ──────────────
         *
         * `agendar` devuelve el día y la hora en la zona del NEGOCIO, que es lo
         * que su equipo y su Google Calendar necesitan. Pero a quien escribe se
         * le acaba de ofrecer la lista en SU reloj: confirmarle una hora
         * distinta de la que eligió es la peor forma posible de terminar. */
        const suyo = comoSeLoDigo(
          r.inicioISO,
          await zonaDeQuienEscribe(ctx),
          await zonaDelNegocio(ctx.orgId),
        );
        const diaDicho = suyo?.dia ?? r.dia;
        const horaDicha = suyo?.hora ?? r.hora;

        ctx.citaAgendada = true;
        ctx.vars.cita_inicio = r.inicioISO;
        ctx.vars.cita_dia = diaDicho;
        ctx.vars.cita_hora = horaDicha;

        // EL AVISO YA NO SE MANDA DESDE AQUÍ. Lo emite el disparador de la base
        // al apuntar la cita (ver la 0100), igual que los de la tienda: hay
        // cuatro caminos que agendan y emitir desde cada uno es garantizar que
        // el quinto se olvide — y que este mande el aviso DOS veces.
        return r.sinInvitacion
          ? `Cita confirmada para el ${diaDicho} a las ${horaDicha}. NO le prometas un correo: no se pudo mandar la invitación.`
          : `Cita confirmada para el ${diaDicho} a las ${horaDicha}. Confírmaselo con esas palabras.`;
      }

      /* ── MOVER Y CANCELAR ────────────────────────────────────────────────
       *
       * NO LLEVAN NINGÚN IDENTIFICADOR EN SUS ARGUMENTOS, y es a propósito. El
       * modelo no tiene forma de saber el id de un evento de Google, así que
       * si se lo pidiéramos se lo inventaría — y un identificador inventado
       * que casualmente exista borra la cita de otra persona.
       *
       * La cita la busca la plataforma por el contacto que está escribiendo.
       * El modelo solo dice QUÉ hacer, nunca SOBRE QUÉ. */
      /* ── LEER LA AGENDA ES UNA HERRAMIENTA, NO UN EFECTO SECUNDARIO ────
       *
       * Antes la única forma de saber si alguien tenía cita era llamar a
       * `reagendar_cita` SIN hora y leerse la respuesta. Eso es pedirle al
       * modelo que use una herramienta de escritura para leer, y el 6 de
       * septiembre acabó como tenía que acabar: preguntaron «¿quedó confirmada
       * mi cita?», el modelo no encontró la de Instagram, y se INVENTÓ una
       * explicación entera —«no puedo ver las citas hechas por Instagram desde
       * mi sistema»—. Nadie le enseñó eso; lo dedujo de no tener con qué mirar.
       */
      case "ver_mis_citas": {
        const quien = await fichaDeLaConversacion(ctx);
        const citas = await citasDePersona(ctx.orgId, quien?.id, 5);
        if (!citas.length) {
          return "Esta persona NO tiene ninguna cita por delante. Díselo con esas palabras y ofrécele agendar una.";
        }
        const lineas: string[] = [];
        for (const c of citas) lineas.push(`- ${await comoLoDigo(ctx, c.inicio)} (${c.titulo ?? "cita"})`);
        return (
          `Sus citas por delante (${citas.length}). Están CONFIRMADAS: si pregunta, la respuesta es sí.\n` +
          lineas.join("\n") +
          "\nDíselas con la fecha y la hora tal cual aparecen aquí."
        );
      }

      case "reagendar_cita": {
        const quien = await fichaDeLaConversacion(ctx);
        const cita = await proximaCita(ctx.orgId, quien?.id);
        if (!cita) return "Esta persona no tiene ninguna cita por delante. Ofrécele agendar una.";

        const pedido = String(args?.inicio ?? "").trim();
        if (!pedido) {
          /* AQUÍ HABÍA `toLocaleString("es-MX")` A SECAS, que formatea en la
           * zona DEL SERVIDOR — o sea en UTC. Le decía a la persona una hora
           * que no era la suya ni la del negocio, sino la de una máquina. */
          return `Su cita es el ${await comoLoDigo(ctx, cita.inicio)}. ` +
            "Llama a ver_horarios y pregúntale a qué hora la quiere mover.";
        }

        // Mismo traductor que al agendar: mover tiene el mismo problema y no
        // puede resolverse de otra forma, o una de las dos se quedaría atrás.
        const ofrecidos = leerHorariosOfrecidos(ctx.vars?.horarios_ofrecidos);
        const inicio = horarioQuePidio(pedido, ofrecidos);
        if (!inicio) return comoRecordarLosHorarios(ofrecidos);

        const r = await moverCita(ctx.orgId, cita, inicio);
        if (!r.ok) {
          // El plan gratis de Calendly no deja mover por API: se manda SU
          // enlace, que es exactamente lo que hace el propio Calendly.
          if (r.enlace) return `No se puede mover desde aquí. Dale este enlace tal cual: ${r.enlace}`;
          return `No se pudo mover: ${r.error}. Ofrécele otra hora.`;
        }

        const movida = comoSeLoDigo(
          r.inicioISO,
          await zonaDeQuienEscribe(ctx),
          await zonaDelNegocio(ctx.orgId),
        );
        ctx.citaAgendada = true;
        ctx.vars.cita_inicio = r.inicioISO;
        ctx.vars.cita_dia = movida?.dia ?? r.dia;
        ctx.vars.cita_hora = movida?.hora ?? r.hora;
        return `Cita movida al ${ctx.vars.cita_dia} a las ${ctx.vars.cita_hora}. Confírmaselo con esas palabras.`;
      }

      case "cancelar_cita": {
        const quien = await fichaDeLaConversacion(ctx);
        const cita = await proximaCita(ctx.orgId, quien?.id);
        if (!cita) return "Esta persona no tiene ninguna cita por delante. No hay nada que cancelar.";

        const r = await cancelarCita(ctx.orgId, cita);
        if (!r.ok) {
          if (r.enlace) return `No se puede cancelar desde aquí. Dale este enlace tal cual: ${r.enlace}`;
          return `No se pudo cancelar: ${r.error}. Dile que le pasarás con una persona.`;
        }

        ctx.vars.cita_ok = "false";
        return "Cita cancelada. Díselo, y ofrécele agendar otra cuando le venga bien.";
      }

      case "ver_mesas": {
        const personas = Math.round(Number(args?.personas));
        if (!Number.isFinite(personas) || personas < 1) {
          return "Falta cuántas personas son. Pregúntaselo y vuelve a llamarme.";
        }

        /* LA FECHA LA RESUELVE LA PLATAFORMA. El modelo no sabe en qué día
         * vive, así que «el sábado» lo tiene que traducir alguien que sí — y en
         * la zona del restaurante, no en la del servidor. */
        const dias = Number(args?.dias);
        const fecha = fechaPedida(args?.fecha)
          || (Number.isFinite(dias) && dias >= 0 && dias <= 365 ? await fechaDelNegocio(ctx.orgId, dias) : "");
        if (!fecha) {
          const hoy = await fechaDelNegocio(ctx.orgId);
          return `Hoy es ${hoy}. Pregúntale para qué día quiere la mesa y vuelve a llamarme con \`dias\` (0 hoy, 1 mañana) o con la fecha exacta.`;
        }

        const r = await turnosConSitio(ctx.orgId, fecha, personas);
        if (!r.ok) return r.queDecir;

        /* SE GUARDA LO QUE SE OFRECIÓ. Sin esto, `reservar_mesa` dependería de
         * que el modelo cargue el uuid del turno hasta el turno siguiente, y no
         * lo hace: reescribe la lista con sus palabras y lo pierde. */
        ctx.vars.turnos_ofrecidos = JSON.stringify(
          r.turnos.map((t) => ({ id: t.id, fecha: r.fecha, label: t.comoSeDice })),
        );

        return (
          `Hay sitio el ${r.fecha} para ${personas}. Turnos (usa el valor de \`turno\` tal cual al reservar):\n` +
          r.turnos.map((t) => `- ${t.comoSeDice} → turno: ${t.id}`).join("\n") +
          "\nOfrécele estos y NINGÚN otro."
        );
      }

      case "reservar_mesa": {
        const ofrecidos = leerTurnosOfrecidos(ctx.vars?.turnos_ofrecidos);
        const elegido = turnoQuePidio(String(args?.turno ?? ""), ofrecidos);
        if (!elegido) return comoRecordarLosTurnos(ofrecidos);

        const quien = await fichaDeLaConversacion(ctx);
        const personas = Math.round(Number(args?.personas));

        const r = await hacerReserva({
          orgId: ctx.orgId,
          fecha: elegido.fecha,
          turnoId: elegido.id,
          personas: Number.isFinite(personas) && personas > 0 ? personas : 0,
          contactId: quien?.id ?? null,
          conversationId: ctx.conversationId ?? null,
          nombre: String(args?.nombre ?? quien?.name ?? "") || null,
          telefono: (quien as any)?.phone ?? null,
          notas: String(args?.notas ?? "") || null,
          laHizo: "lana",
        });

        if (!r.ok) return r.queDecir;
        ctx.vars.reserva_fecha = r.fecha;
        ctx.vars.reserva_turno = r.turno;
        ctx.vars.reserva_estado = r.estado;
        return r.queDecir;
      }

      /* ── POR QUÉ ESTA NO PUEDE CONTESTAR «NO TIENES NINGUNA» A LA LIGERA ───
       *
       * Es el mismo cuidado que en `ver_mis_citas`. Si un fallo de lectura se
       * leyera como «no tiene reserva», el bot se lo diría a alguien que SÍ la
       * tiene; esa persona reserva otra vez y el sábado hay dos mesas a su
       * nombre y una se queda vacía. */
      case "ver_mis_reservas": {
        const quien = await fichaDeLaConversacion(ctx);
        const suyas = await misReservas(ctx.orgId, quien?.id);
        if (suyas === null) {
          return "No pude consultar sus reservas ahora mismo. NO le digas que no tiene ninguna: dile que alguien del restaurante se lo confirma.";
        }
        if (!suyas.length) {
          return "Esta persona NO tiene ninguna reserva por delante. Díselo con esas palabras y ofrécele hacer una.";
        }
        return (
          `Sus reservas por delante (${suyas.length}):\n` +
          suyas
            .map((s) => {
              const como = s.estado === "confirmada" ? "CONFIRMADA" : "APARTADA, pendiente de que el restaurante la confirme";
              const mesas = s.mesas.length ? ` · ${s.mesas.join(" + ")}` : "";
              return `- ${s.fecha}, ${s.comoSeDice}, ${s.personas} personas — ${como}${mesas}`;
            })
            .join("\n") +
          "\nDíselas tal cual aparecen aquí, y NO llames confirmada a una que está apartada."
        );
      }

      case "mover_reserva": {
        const quien = await fichaDeLaConversacion(ctx);
        const suya = await proximaReserva(ctx.orgId, quien?.id);
        if (suya === undefined) {
          return "No pude consultar su reserva ahora mismo. Dile que alguien del restaurante le escribe enseguida.";
        }
        if (!suya) return "Esta persona no tiene ninguna reserva por delante. Ofrécele hacer una.";

        const pedido = String(args?.turno ?? "").trim();
        if (!pedido) {
          return `Su reserva es el ${suya.fecha}, ${suya.comoSeDice}, para ${suya.personas}. ` +
            "Pregúntale para qué día la quiere mover, llama a ver_mesas con esa fecha, y vuelve a llamarme con el turno nuevo.";
        }

        const ofrecidos = leerTurnosOfrecidos(ctx.vars?.turnos_ofrecidos);
        const elegido = turnoQuePidio(pedido, ofrecidos);
        if (!elegido) return comoRecordarLosTurnos(ofrecidos);

        const personas = Math.round(Number(args?.personas));
        const r = await moverReserva({
          orgId: ctx.orgId,
          reserva: suya,
          fecha: elegido.fecha,
          turnoId: elegido.id,
          personas: Number.isFinite(personas) && personas > 0 ? personas : null,
        });
        if (!r.ok) return r.queDecir;
        ctx.vars.reserva_fecha = r.fecha;
        ctx.vars.reserva_turno = r.turno;
        ctx.vars.reserva_estado = r.estado;
        return r.queDecir;
      }

      case "cancelar_reserva": {
        const quien = await fichaDeLaConversacion(ctx);
        const suya = await proximaReserva(ctx.orgId, quien?.id);
        if (suya === undefined) {
          return "No pude consultar su reserva ahora mismo. Dile que alguien del restaurante le escribe enseguida.";
        }
        if (!suya) return "Esta persona no tiene ninguna reserva por delante. No hay nada que cancelar.";

        const r = await cancelarReserva(ctx.orgId, suya.id);
        if (!r.ok) return r.queDecir;
        ctx.vars.reserva_estado = "cancelada";
        return r.queDecir;
      }

      case "etiquetar": {
        const etiqueta = String(args?.etiqueta ?? "").trim();
        const c = await fichaDeLaConversacion(ctx);
        if (!c) return "No encuentro la ficha de esta persona.";

        // PONER LA ETIQUETA LO HACE LA BASE, no este archivo.
        //
        // Antes se hacía aquí con un conjunto: se añadía la nueva y se dejaban
        // todas las anteriores. Resultado real, visto el 31 ago: un lead quedó
        // como «lead-alto» Y «lead-medio» a la vez, porque la IA lo calificó dos
        // veces según iba sabiendo más. Un embudo donde alguien está en dos
        // niveles a la vez no significa nada.
        //
        // `poner_etiqueta` conoce los GRUPOS: si la etiqueta pertenece a uno
        // —«Calificación»—, quita a sus hermanas y deja solo esta. Las etiquetas
        // sueltas («vip», «habla inglés») se siguen acumulando, que es lo suyo.
        //
        // Vive en la base porque hay DOS motores y esta regla no puede
        // divergir: la base es una sola.
        const { data: quedaron, error } = await ctx.admin.rpc("poner_etiqueta", {
          p_org_id: ctx.orgId,
          p_contact_id: c.id,
          p_etiqueta: etiqueta,
        });

        if (error) {
          // El modelo se inventó una etiqueta. Se le devuelven las que sí
          // existen para que corrija: la IA propone, la base decide.
          const { data: tags } = await ctx.admin.from("tags").select("name").eq("org_id", ctx.orgId);
          return `La etiqueta "${etiqueta}" no existe. Las que hay son: ` +
            ((tags ?? []) as any[]).map((t) => t.name).join(", ") + ".";
        }

        emitir(ctx.orgId, "lead.datos", {
          etiquetas: quedaron ?? [etiqueta],
          contacto_id: c.id,
          etiqueta,
          por_que: args?.por_que ?? null,
          // Queda por escrito en qué se basó. Es lo que permite auditar una
          // calificación después, en vez de discutir de memoria.
          en_que_me_baso: Array.isArray(args?.en_que_me_baso) ? args.en_que_me_baso : [],
          conversacion_id: ctx.conversationId,
          por: "agente_ia",
        });
        return `Listo, quedó etiquetado como "${etiqueta}". No se lo menciones a la persona.`;
      }

      case "guardar_dato": {
        const campo = String(args?.campo ?? "").trim();
        const valor = String(args?.valor ?? "").trim();
        const { data: attr } = await ctx.admin
          .from("custom_attributes").select("key").eq("org_id", ctx.orgId).eq("key", campo).maybeSingle();
        if (!attr) {
          const { data: todos } = await ctx.admin
            .from("custom_attributes").select("key").eq("org_id", ctx.orgId);
          return `El campo "${campo}" no existe. Los que hay son: ` +
            ((todos ?? []) as any[]).map((a) => a.key).join(", ") + ".";
        }

        const c = await fichaDeLaConversacion(ctx);
        if (!c) return "No encuentro la ficha de esta persona.";

        const cambios: any = { attributes: { ...(c.attributes ?? {}), [campo]: valor } };
        // Y si ese dato tiene casilla propia en la ficha, también ahí.
        const casilla = CASILLA_DE_LA_FICHA[campo.toLowerCase()];
        if (casilla) cambios[casilla] = valor;
        await ctx.admin.from("contacts").update(cambios).eq("id", c.id);

        emitir(ctx.orgId, "lead.datos", {
          contacto_id: c.id,
          campo,
          valor,
          conversacion_id: ctx.conversationId,
          por: "agente_ia",
        });
        return `Guardado: ${campo} = ${valor}. No se lo menciones a la persona.`;
      }

      case "pasar_a_humano": {
        await ctx.admin.from("conversations").update({
          status: "assigned",
          handoff_requested_at: new Date().toISOString(),
          handoff_reason: String(args?.motivo ?? "Lo pidió el agente de IA").slice(0, 200),
        }).eq("id", ctx.conversationId).eq("org_id", ctx.orgId);

        // EL REPARTO NO SE LLAMA DESDE AQUÍ: lo hace un disparador de la base
        // en cuanto la conversación queda «assigned». Así reparte igual venga
        // del flujo, del atajo «1», de esta herramienta o de la Bandeja — un
        // solo sitio, sin cuatro copias que se desincronizan.
        ctx.pasoAHumano = true;
        emitir(ctx.orgId, "pase.a.humano", {
          motivo: args?.motivo ?? null,
          conversacion_id: ctx.conversationId,
          por: "agente_ia",
        });
        return "Hecho. Despídete diciendo que en un momento le atiende una persona del equipo.";
      }

      case "consultar_sistema": {
        // LA URL LA PONE EL CLIENTE, NUNCA EL MODELO. Si el modelo pudiera
        // elegir a dónde se llama, bastaría con convencerlo para hacernos
        // pedir cualquier dirección de internet desde nuestros servidores.
        const url = String(ai.sistemaUrl ?? "").trim();
        if (!url) return "No hay ningún sistema configurado.";

        const ctl = new AbortController();
        const reloj = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ consulta: args?.consulta ?? "", conversacion_id: ctx.conversationId }),
            signal: ctl.signal,
          });
          const texto = (await r.text().catch(() => "")).slice(0, 1500);
          if (!r.ok) return `El sistema respondió ${r.status}. Dile que ahora no puedes consultarlo.`;
          return texto || "El sistema no devolvió nada.";
        } catch (e: any) {
          return e?.name === "AbortError"
            ? "El sistema tardó demasiado. Dile que ahora no puedes consultarlo."
            : "No se pudo conectar con el sistema.";
        } finally {
          clearTimeout(reloj);
        }
      }

      default:
        return `No conozco la herramienta "${nombre}".`;
    }
  } catch (e: any) {
    console.error(`[herramienta ${nombre}]`, e);
    return "Hubo un error al ejecutarla. Sigue la conversación sin ella.";
  }
}

/**
 * La tienda de este chatbot, para las herramientas.
 *
 * SALE DE `tiendas.bot_id`, que ya vincula cada tienda con su bot. Y solo si
 * está ACTIVA: el negocio la apaga en vacaciones o mientras la monta, y darle a
 * la IA un catálogo de una tienda apagada es hacerle prometer productos que
 * nadie va a poder comprar.
 */
async function laTiendaDelBot(ctx: ContextoAgente): Promise<TiendaDelBot | null> {
  if (!ctx.botId) return null;
  try {
    const { data } = await ctx.admin
      .from("tiendas")
      .select("id, slug, nombre, activa, config")
      .eq("org_id", ctx.orgId)
      .eq("bot_id", ctx.botId)
      .eq("activa", true)
      .order("nombre");
    return tiendaDelBot((data ?? []) as TiendaDelBot[], true, ctx.tiendaElegida);
  } catch {
    return null;
  }
}
