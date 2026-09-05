/**
 * Las reglas del bloque «Agendar cita» que no tocan la red.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE ESTE ARCHIVO. De una conversación real de WhatsApp, el 5 de
 * septiembre, en la que un cliente intentó agendar una demo:
 *
 *   bot     → «Revisa los horarios disponibles» [09:00] [09:30] [10:00]
 *   cliente → «necesito que sea en la tarde»
 *   bot     → «Falta la fecha y hora de la cita.»
 *
 * Tres fallos en cuatro mensajes: solo se ofrecieron tres horas seguidas de la
 * misma mañana, no había ni una de tarde que ofrecer, y cuando la persona lo
 * dijo con sus palabras el motor le enseñó el mensaje de error de una función
 * interna. La cita acabó creándose sin invitado —nadie le había preguntado el
 * correo— así que tampoco llegó la invitación.
 *
 * Todo lo que se decide aquí es lo que evita cada uno de esos cuatro fallos, y
 * está aquí y no dentro del motor porque son reglas, no fontanería: se prueban
 * solas y las usan los dos motores (el de WhatsApp en Deno y el de web e
 * Instagram en Node) sin poder desviarse una del otro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo mínimo que necesita `repartirHorarios`. `computeSlots` devuelve más. */
export type HorarioRepartible = {
  /** Clave del día en la zona del negocio, p. ej. «2026-9-7». */
  dia: string;
  /** Minutos desde medianoche, en la zona del negocio. */
  minutos: number;
};

/** Antes de las 12:00 es mañana. */
export const CORTE_DE_TURNO = 12 * 60;

/**
 * Elige `cuantos` horarios REPARTIDOS, no los primeros que haya.
 *
 * ── POR QUÉ NO VALEN LOS PRIMEROS ─────────────────────────────────────────
 *
 * El cálculo de huecos recorre el horario laboral de arriba abajo, así que los
 * primeros libres son casi siempre 09:00, 09:30 y 10:00 del mismo día. A quien
 * no pueda por la mañana no le estás ofreciendo tres opciones: le estás
 * ofreciendo una, tres veces. Y como no ve ninguna tarde, ni se le ocurre que
 * la haya — se va, o escribe «¿no tienes por la tarde?» y ahí ya dependemos de
 * que el bot entienda texto libre.
 *
 * ── CÓMO SE REPARTE ───────────────────────────────────────────────────────
 *
 * Se agrupa por (día, turno) y se va cogiendo UNA de cada grupo por vuelta. En
 * la primera vuelta salen mañana y tarde del primer día, mañana y tarde del
 * segundo… y solo cuando ya hay una de cada se empieza a repetir grupo. Con
 * diez huecos eso son cinco días con las dos mitades del día cubiertas.
 *
 * El orden final es CRONOLÓGICO, no el del reparto: la lista se lee mucho
 * mejor de la hora más próxima a la más lejana, y quien tiene prisa encuentra
 * arriba lo de mañana.
 */
export function repartirHorarios<T extends HorarioRepartible>(libres: T[], cuantos: number): T[] {
  const total = Math.max(0, Math.floor(cuantos));
  if (total === 0) return [];
  const lista = libres ?? [];
  if (lista.length <= total) return [...lista];

  // El orden de los grupos es el de aparición, que ya viene cronológico del
  // cálculo de huecos. Un `Map` lo conserva; un objeto normal no lo garantiza
  // con claves que parecen números.
  const grupos = new Map<string, T[]>();
  for (const h of lista) {
    const turno = h.minutos < CORTE_DE_TURNO ? "m" : "t";
    const clave = `${h.dia}|${turno}`;
    const g = grupos.get(clave);
    if (g) g.push(h);
    else grupos.set(clave, [h]);
  }

  const cubos = [...grupos.values()];
  const elegidos: T[] = [];
  for (let vuelta = 0; elegidos.length < total; vuelta++) {
    let hubo = false;
    for (const cubo of cubos) {
      if (vuelta >= cubo.length) continue;
      elegidos.push(cubo[vuelta]);
      hubo = true;
      if (elegidos.length >= total) break;
    }
    // SIN ESTO EL BUCLE NO TERMINA cuando se piden más de los que hay. No pasa
    // hoy porque arriba se devuelve la lista entera en ese caso, pero esa
    // salida es una optimización y esto es la garantía.
    if (!hubo) break;
  }

  // El día se ordena por CUÁNDO APARECIÓ, no alfabéticamente: «2026-9-7» y
  // «2026-10-1» ordenados como texto pondrían octubre antes que septiembre.
  const ordenDelDia = new Map<string, number>();
  for (const h of lista) if (!ordenDelDia.has(h.dia)) ordenDelDia.set(h.dia, ordenDelDia.size);

  return elegidos.sort((a, b) => {
    const d = (ordenDelDia.get(a.dia) ?? 0) - (ordenDelDia.get(b.dia) ?? 0);
    return d !== 0 ? d : a.minutos - b.minutos;
  });
}

/**
 * ¿Esto que contestó la persona es una de las horas que le ofrecimos?
 *
 * El identificador de cada opción ES la hora en ISO, así que no hay que
 * guardar la lista en ninguna parte. Pero eso significa que CUALQUIER texto
 * que escriba la persona llega por el mismo sitio: si no se comprueba, «en la
 * tarde» viaja hasta el calendario y vuelve como un error interno.
 */
export function esHorarioElegido(texto: string | null | undefined): string | null {
  const t = String(texto ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return null;
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? t : null;
}

/**
 * ¿Es un correo?
 *
 * A PROPÓSITO NO SE VALIDA A FONDO. Comprobar de verdad un correo es imposible
 * sin mandarle algo, y las expresiones que lo intentan rechazan direcciones
 * legítimas —las de dominios nuevos, las que llevan un `+`—. Aquí solo se
 * atrapa lo que evidentemente no es un correo, que es de lo que se trata: que
 * «no tengo», «ahorita no» o el nombre de la persona no acaben metidos en el
 * campo de invitado de una cita de Google.
 */
export function correoValido(texto: string | null | undefined): string | null {
  const t = String(texto ?? "").trim().toLowerCase();
  if (!t || t.length > 254 || /\s/.test(t)) return null;
  return /^[^@]+@[^@.]+\.[^@]+$/.test(t) ? t : null;
}

/**
 * La persona no quiere dar ese dato.
 *
 * SE RESPETA, y no es una concesión: insistir en el correo de alguien que ya
 * dijo que no es la forma más rápida de perder la cita entera. Sin correo hay
 * cita, solo que sin invitación — y una cita en la agenda vale infinitamente
 * más que un contacto perfecto que nunca se agendó.
 */
export function quiereOmitir(texto: string | null | undefined): boolean {
  const t = String(texto ?? "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t) return false;
  return [
    "no", "no.", "nel", "nop", "nope", "paso", "omitir", "saltar", "skip",
    "no tengo", "no gracias", "no quiero", "prefiero no", "sin correo",
    "no tengo correo", "no tengo email", "despues", "luego", "mejor no",
  ].includes(t);
}

/**
 * Qué se le puede enseñar a la persona cuando algo falla al agendar.
 *
 * ── LA REGLA: SI NO PUEDE HACER NADA CON EL MENSAJE, NO SE LO ENSEÑES ──────
 *
 * «Ese horario acaba de ocuparse, elige otro» es accionable: la persona elige
 * otro y sigue. «Falta la fecha y hora de la cita.» no lo es — es una frase
 * escrita para quien programa esto, describe un estado interno que la persona
 * no provocó ni puede arreglar, y encima le hace pensar que hizo algo mal.
 *
 * Ese mensaje exacto llegó a un cliente de verdad, el 5 de septiembre, por
 * escribir «necesito que sea en la tarde».
 *
 * ── POR QUÉ NO SE DECIDE POR EL MOTIVO ────────────────────────────────────
 *
 * Fue lo primero que intenté y estaba mal. Dos fallos comparten el motivo
 * `sin_datos`: «ese horario acaba de ocuparse» —que la persona resuelve en un
 * toque— y «falta la fecha y hora» —que no significa nada para ella—. Un
 * motivo agrupa por CAUSA TÉCNICA, y esto no va de la causa: va de si al otro
 * lado hay algo que hacer.
 *
 * Así que lo dice quien escribe el mensaje, en la misma línea en que lo
 * escribe, y por omisión NO SALE. Un fallo nuevo empieza siendo interno, que
 * es el lado seguro en el que equivocarse.
 */
export function mensajeParaElCliente(
  fallo: { error?: string | null; paraElCliente?: boolean | null } | null | undefined,
  porDefecto = "Esa hora ya no está disponible 😕 Elige otra, por favor.",
): string {
  const e = String(fallo?.error ?? "").trim();
  return fallo?.paraElCliente && e ? e : porDefecto;
}

/* ════════════════════════════════════════════════════════════════════════════
 * EL FORMULARIO NATIVO DE WHATSAPP, CON HORARIOS DE VERDAD
 *
 * ── QUÉ CAMBIA ────────────────────────────────────────────────────────────
 *
 * Hasta ahora el bloque «Flujo de WhatsApp» solo sabía ABRIR un formulario:
 * mandaba el nombre de la primera pantalla y nada más. Servía para pedir datos,
 * no para agendar — dentro no había forma de enseñar una sola hora libre.
 *
 * Meta sí deja mandar datos al abrirlo (`flow_action_payload.data`), y ahí cabe
 * la lista de huecos. Así el cliente ve UNA pantalla nativa: elige su hora,
 * escribe su nombre y su correo, y envía. Una sola vez.
 *
 * Los horarios son una FOTO DEL MOMENTO EN QUE SE MANDA. Si la persona tarda
 * una hora en abrirlo, el hueco puede haberse ocupado — y no pasa nada, porque
 * `agendar` vuelve a mirar el calendario antes de crear la cita y contesta «ese
 * horario acaba de ocuparse». Ese caso ya estaba resuelto y por eso esta
 * versión no necesita servidor de intercambio de datos ni cifrado.
 *
 * ── POR QUÉ SE BUSCA POR FORMA Y NO POR NOMBRE ────────────────────────────
 *
 * Los campos que devuelve un formulario se llaman como diga su Flow JSON. Quien
 * lo arma en el editor visual de Meta acaba con nombres como
 * `screen_0_Dropdown_0`, y NO lo sabe: el editor no se los enseña.
 *
 * Montar esto sobre «pon aquí el nombre exacto del campo» es garantizar una
 * llamada de soporte por cada cliente. Una hora tiene forma de hora y un correo
 * tiene forma de correo: se buscan por eso. El nombre del campo, si se
 * configura, solo sirve para mandar sobre la búsqueda.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Meta corta el título de una opción en 30 caracteres. */
export const TITULO_MAX = 30;

/**
 * Los huecos, como las opciones que espera Meta.
 *
 * Un `RadioButtonsGroup` o un `Dropdown` atados a `${data.horarios}` necesitan
 * exactamente `{ id, title }`. El `id` es la hora en ISO —lo mismo que en los
 * botones del bloque «Agendar cita»— para que la respuesta se pueda agendar sin
 * guardar la lista en ninguna parte.
 */
export function opcionesDeHorario(
  slots: { startISO?: string; label?: string }[] | null | undefined,
  cuantas = 10,
): { id: string; title: string }[] {
  return (slots ?? [])
    .map((s) => ({
      id: String(s?.startISO ?? ""),
      title: String(s?.label ?? "").slice(0, TITULO_MAX),
    }))
    // UNA OPCIÓN SIN ID NO SE PUEDE AGENDAR y una sin título sale en blanco en
    // el móvil. Meta acepta las dos cosas y el fallo se ve al final, cuando la
    // persona ya eligió: mejor no ofrecerla.
    .filter((o) => o.id && o.title)
    .slice(0, Math.max(0, cuantas));
}

/** Todos los valores de texto que trajo el formulario, en orden. */
function valoresDelFormulario(respuesta: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(respuesta ?? {})) {
    // `flow_token` es nuestro, no del cliente: lleva dentro la conversación y
    // el bloque. Buscar en él sería mirar nuestros propios datos.
    if (k === "flow_token") continue;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
  }
  return out;
}

/**
 * La hora que eligió, venga en el campo que venga.
 *
 * Primero el campo configurado, si lo hay; después, el primer valor con forma
 * de hora. Ninguna otra respuesta de un formulario tiene esa forma, así que no
 * hay con qué confundirla.
 */
export function horaDelFormulario(
  respuesta: Record<string, unknown> | null | undefined,
  campo?: string | null,
): string | null {
  const nombre = String(campo ?? "").trim();
  if (nombre && respuesta && nombre in respuesta) {
    const elegido = esHorarioElegido(String((respuesta as any)[nombre] ?? ""));
    if (elegido) return elegido;
  }
  for (const v of valoresDelFormulario(respuesta)) {
    const elegido = esHorarioElegido(v);
    if (elegido) return elegido;
  }
  return null;
}

/**
 * El correo, venga en el campo que venga.
 *
 * Mismo orden: el campo configurado manda, y si no cuadra se busca por forma.
 * Que el campo configurado exista pero traiga basura NO detiene la búsqueda —
 * un formulario con el nombre del campo mal escrito debe seguir agendando con
 * invitación, no quedarse sin ella en silencio.
 */
export function correoDelFormulario(
  respuesta: Record<string, unknown> | null | undefined,
  campo?: string | null,
): string | null {
  const nombre = String(campo ?? "").trim();
  if (nombre && respuesta && nombre in respuesta) {
    const c = correoValido(String((respuesta as any)[nombre] ?? ""));
    if (c) return c;
  }
  for (const v of valoresDelFormulario(respuesta)) {
    const c = correoValido(v);
    if (c) return c;
  }
  return null;
}

/**
 * El nombre de la persona.
 *
 * ESTE SÍ NECESITA QUE LE DIGAN CUÁL ES. Un nombre no tiene forma: «Alejandro»,
 * «Restaurante El Puerto» y «me urge para hoy» son todos texto suelto, y
 * adivinar aquí sería mandarle a Google una cita a nombre de un comentario.
 *
 * Sin campo configurado se devuelve vacío, y quien llama usa el nombre que ya
 * tenía de WhatsApp — que casi siempre es el bueno.
 */
export function nombreDelFormulario(
  respuesta: Record<string, unknown> | null | undefined,
  campo?: string | null,
): string {
  const nombre = String(campo ?? "").trim();
  if (!nombre || !respuesta || !(nombre in respuesta)) return "";
  const v = (respuesta as any)[nombre];
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).trim().slice(0, 80);
}
