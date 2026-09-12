import "server-only";
import {
  horariosLibres, agendar, proximaCita, moverCita, cancelarCita,
  citasDePersona, zonaDelNegocio,
} from "@/lib/agenda";
import { accionesDelPrompt } from "@/lib/ai/acciones";
import { herramientasAutomaticas, herramientasQueManda } from "@/lib/ai/capacidades";
import {
  horarioQuePidio, comoRecordarLosHorarios, enLaZonaDelCliente, comoSeLoDigo,
  type HorarioOfrecido,
} from "@/lib/agendaHorarios";
import { zonaDelTelefono } from "@/lib/zonaHoraria";
import { emitir } from "@/lib/salidas";
import { prometioUnaPersona } from "@/lib/ai/promesas";
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
 * Datos que además tienen su CASILLA PROPIA en la ficha del lead.
 *
 * Sin esto, el correo que la IA captura se guarda como «un atributo más» y la
 * casilla «Correo» de la ficha se queda vacía. Pasó tal cual: el bot pidió el
 * correo, la persona lo dio, el bot dijo «ya quedó registrado» y en la ficha no
 * había nada donde el equipo lo busca. Para el agente que abre esa ficha, el
 * dato no existe.
 *
 * Se guarda en LOS DOS SITIOS: en la casilla, que es donde se mira, y en los
 * atributos, que es de donde tiran los flujos y las plantillas.
 */
const CASILLA_DE_LA_FICHA: Record<string, string> = {
  nombre: "name", name: "name", nombre_completo: "name",
  correo: "email", email: "email", mail: "email", correo_electronico: "email",
  telefono: "phone", phone: "phone", celular: "phone", movil: "phone",
  empresa: "company", company: "company", negocio: "company",
  pais: "country", country: "country",
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
  const suya = comoSeLoDigo(iso, await zonaDeQuienEscribe(ctx));
  if (suya) return `${suya.dia} a las ${suya.hora}`;
  const delNegocio = comoSeLoDigo(iso, await zonaDelNegocio(ctx.orgId));
  if (delNegocio) return `${delNegocio.dia} a las ${delNegocio.hora}`;
  return "(no puedo decirte la hora: a este negocio le falta configurar su zona horaria)";
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
          duracion: { type: "integer", description: "Duración de la cita en minutos. Por defecto 30." },
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
): Promise<void> {
  if (ctx.pasoAHumano) return;
  if (!tools.some((t) => t.name === "pasar_a_humano")) return;
  if (!prometioUnaPersona(texto)) return;

  console.log("[agente] prometió una persona sin llamar a la herramienta; se hace el pase");
  try {
    await ctx.admin.from("conversations").update({
      status: "assigned",
      handoff_requested_at: new Date().toISOString(),
      handoff_reason: "El asistente prometió que atendería una persona",
    }).eq("id", ctx.conversationId).eq("org_id", ctx.orgId);
    ctx.pasoAHumano = true;
    emitir(ctx.orgId, "pase.a.humano", {
      motivo: "el asistente lo prometió en su respuesta",
      conversacion_id: ctx.conversationId,
      por: "agente_ia",
    });
  } catch (e) {
    console.error("[agente] no pude cumplir la promesa de pase:", e);
  }
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
          durationMin: Number(args?.duracion) || 30,
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
        const slots = enLaZonaDelCliente(r.slots, await zonaDeQuienEscribe(ctx));

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

        const r = await agendar(ctx.orgId, {
          inicioISO: inicio,
          durationMin: 30,
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
        const suyo = comoSeLoDigo(r.inicioISO, await zonaDeQuienEscribe(ctx));
        const diaDicho = suyo?.dia ?? r.dia;
        const horaDicha = suyo?.hora ?? r.hora;

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

        const movida = comoSeLoDigo(r.inicioISO, await zonaDeQuienEscribe(ctx));
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
