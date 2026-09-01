import "server-only";
import { horariosLibres, agendar } from "@/lib/agenda";
import { accionesDelPrompt } from "@/lib/ai/acciones";
import { emitir } from "@/lib/salidas";
import { prometioUnaPersona } from "@/lib/ai/promesas";

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
};

/** Ajustes del agente que vienen de `bots.ai`. */
export type AjustesAgente = {
  herramientas?: string[];
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
    .select("id, tags, attributes, name, external_id")
    .eq("id", conv.contact_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  return c ?? null;
}

export async function armarHerramientas(
  ctx: ContextoAgente,
  ai: AjustesAgente,
): Promise<{ tools: any[]; contexto: string }> {
  // LO QUE PIDE EL PROMPT CUENTA IGUAL QUE LO MARCADO EN LA PANTALLA. Ver
  // `acciones.ts` para el porqué. Se unen: nadie pierde lo que ya tenía.
  const marcadas: string[] = Array.isArray(ai.herramientas) ? ai.herramientas : [];
  const escritas = accionesDelPrompt(ai.persona);
  const quiere: string[] = [...new Set([...marcadas, ...escritas])];
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
        "No la llames sin haber confirmado la hora con la persona.",
      input_schema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "La fecha y hora exacta que devolvió ver_horarios." },
          nombre: { type: "string", description: "Nombre de quien reserva, si lo sabes." },
          correo: { type: "string", description: "Su correo, si lo sabes. Le llega la invitación." },
        },
        required: ["inicio"],
      },
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
      case "ver_horarios": {
        const r = await horariosLibres(ctx.orgId, {
          durationMin: Number(args?.duracion) || 30,
          days: Number(args?.dias) || 14,
          maxSlots: 8,
        });
        if (!r.slots.length) {
          return "No hay horarios libres o la agenda no está conectada. Dile que le pasarás con una persona.";
        }
        return "Horarios libres (usa el valor de `inicio` tal cual al agendar):\n" +
          r.slots.map((s) => `- ${s.label} → inicio: ${s.startISO}`).join("\n");
      }

      case "agendar_cita": {
        const inicio = String(args?.inicio ?? "").trim();
        if (!inicio) return "Falta la hora. Llama primero a ver_horarios.";

        const r = await agendar(ctx.orgId, {
          inicioISO: inicio,
          durationMin: 30,
          titulo: `Cita con ${args?.nombre ?? ctx.vars?.nombre ?? "cliente"}`,
          descripcion: "Cita agendada por el agente de IA.",
          correoInvitado: args?.correo || undefined,
        });
        if (!r.ok) return `No se pudo agendar: ${r.error}. Ofrece otra hora.`;

        ctx.vars.cita_inicio = r.inicioISO;
        ctx.vars.cita_dia = r.dia;
        ctx.vars.cita_hora = r.hora;
        emitir(ctx.orgId, "cita.agendada", {
          nombre: args?.nombre ?? null,
          correo: args?.correo ?? null,
          inicio: r.inicioISO,
          dia: r.dia,
          hora: r.hora,
          enlace: r.enlace,
          conversacion_id: ctx.conversationId,
          por: "agente_ia",
        });
        return `Cita confirmada para el ${r.dia} a las ${r.hora}. Confírmaselo con esas palabras.`;
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
