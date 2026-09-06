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

/**
 * Minúsculas, sin tildes y sin espacios de más.
 *
 * VIVE AQUÍ Y NO SE IMPORTA porque este archivo se copia entero al motor de
 * WhatsApp, que corre en Deno y no puede importar de `src/`. Una copia con un
 * import es una copia que no compila.
 *
 * Y ES UNO SOLO PARA TODO EL ARCHIVO: dos formas de quitar tildes en el mismo
 * sitio es garantizar que un día «PROMOCIÓN» coincida en una función y no en
 * la de al lado.
 */
function sinTildes(texto: string | null | undefined): string {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

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
  const t = sinTildes(texto);
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

/* ════════════════════════════════════════════════════════════════════════════
 * «LUNES A LAS 9 AM» TIENE QUE PODER AGENDARSE
 *
 * ── EL FALLO, CON FECHA ───────────────────────────────────────────────────
 *
 * 6 de septiembre de 2026. Lana ofreció horarios de verdad y el cliente
 * contestó «lunes a las 9 am». La cita nunca se creó y acabó pasando con una
 * persona, con este motivo escrito por ella misma:
 *
 *   «Error técnico al agendar cita para Alex, restaurante.
 *    Quería lunes 7 de sep 9:00 am»
 *
 * ── LA CAUSA ES UN FALLO DE DISEÑO, NO DEL MODELO ─────────────────────────
 *
 * `ver_horarios` le devolvía al modelo `lun 07 de sep, 09:00 → inicio:
 * 2026-09-07T15:00:00.000Z` y le pedía «usa ese valor tal cual». Pero el modelo
 * REESCRIBE la lista con sus palabras para enseñársela a la persona —«Lunes 7
 * de sep: 09:00 o 12:00»— y un turno después ya no tiene el ISO a mano.
 *
 * Es pedirle que cargue un dato exacto entre turnos. Eso no es fiable y no
 * tiene por qué serlo: LA PLATAFORMA SABE QUÉ HORARIOS OFRECIÓ, así que la
 * traducción de «lo que dijo la persona» a «uno de los huecos ofrecidos» es
 * trabajo suyo, no del modelo.
 *
 * ── ANTE LA DUDA, NO SE ADIVINA ───────────────────────────────────────────
 *
 * Si lo que dijo encaja con DOS huecos —«a las 9» cuando hay lunes y martes a
 * las 9— no se elige uno: se devuelve nada, y quien llama le enseña al modelo
 * las opciones para que pregunte. Agendar la cita del día equivocado es peor
 * que un mensaje más.
 * ══════════════════════════════════════════════════════════════════════════ */

export type HorarioOfrecido = { iso: string; label: string };

const DIAS_DE_LA_SEMANA: Record<string, string> = {
  lunes: "lun", lun: "lun",
  martes: "mar", mar: "mar",
  miercoles: "mie", mie: "mie",
  jueves: "jue", jue: "jue",
  viernes: "vie", vie: "vie",
  sabado: "sab", sab: "sab",
  domingo: "dom", dom: "dom",
};

/** El día de la semana que nombró, en el formato corto de las etiquetas. */
export function diaQueDijo(texto: string): string | null {
  const t = sinTildes(texto);
  for (const [palabra, corto] of Object.entries(DIAS_DE_LA_SEMANA)) {
    if (new RegExp(`\\b${palabra}\\b`).test(t)) return corto;
  }
  return null;
}

/**
 * Todas las horas del día que se pueden leer en un texto, en minutos.
 *
 * SE DEVUELVEN TODAS Y NO LA PRIMERA. «el 7 a las 9» tiene dos números y solo
 * uno es una hora; quedarse con el primero acertaría la mitad de las veces.
 * Devolviéndolas todas, el que cuadre con un hueco ofrecido gana, y si cuadran
 * dos se considera ambiguo — que es la respuesta correcta.
 */
export function horasQueDijo(texto: string): number[] {
  const t = sinTildes(texto);
  const out: number[] = [];
  for (const m of t.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    const sufijo = m[3];
    if (!Number.isFinite(h) || h > 24 || min > 59) continue;
    // «9 pm» son las 21; «12 am» es medianoche y «12 pm» mediodía.
    if (sufijo === "pm" && h < 12) h += 12;
    if (sufijo === "am" && h === 12) h = 0;
    out.push(h * 60 + min);
    // SIN SUFIJO, UNA HORA DE UNA CIFRA ES AMBIGUA: «a las 3» puede ser las 15
    // en una agenda de tarde. Se apuntan las dos y que decida cuál cuadra con
    // lo que de verdad se ofreció.
    if (!sufijo && h < 12) out.push((h + 12) * 60 + min);
  }
  return [...new Set(out)];
}

/** La hora de una etiqueta como «lun 07 de sep, 09:00». */
export function horaDeLaEtiqueta(label: string): number | null {
  // DESPUÉS DE LA ÚLTIMA COMA, y no el primer número que aparezca: en «lun 07
  // de sep, 09:00» el primero es el día del mes.
  const t = String(label ?? "");
  const trozo = t.includes(",") ? t.slice(t.lastIndexOf(",") + 1) : t;
  const m = /(\d{1,2}):(\d{2})/.exec(trozo);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Cuál de los horarios ofrecidos pidió.
 *
 * Tres intentos, de más seguro a menos: el identificador exacto · la etiqueta
 * tal cual · el día y la hora. Y nunca se adivina entre dos.
 */
export function horarioQuePidio(
  dicho: string | null | undefined,
  ofrecidos: HorarioOfrecido[] | null | undefined,
): string | null {
  const lista = (ofrecidos ?? []).filter((o) => o?.iso && o?.label);
  if (!lista.length) return null;

  // 1. El identificador exacto, que es lo que se le pidió al modelo.
  const crudo = String(dicho ?? "").trim();
  if (lista.some((o) => o.iso === crudo)) return crudo;

  const t = sinTildes(crudo);
  if (!t) return null;

  // 2. La etiqueta tal cual, por si copió lo que le enseñó a la persona.
  const porEtiqueta = lista.filter((o) => sinTildes(o.label) === t);
  if (porEtiqueta.length === 1) return porEtiqueta[0].iso;

  // 3. El día y la hora, que es como habla la gente.
  const horas = horasQueDijo(t);
  const dia = diaQueDijo(t);

  /* ── SOLO EL DÍA, CUANDO ESE DÍA NO TIENE MÁS QUE UN HUECO ──────────────
   *
   * «el jueves» no lleva hora, y antes se devolvía null: se le volvía a
   * enseñar la lista entera a alguien que ya había elegido. Si ese día tiene
   * UN solo hueco ofrecido no hay nada que preguntar — la respuesta es esa.
   *
   * Con dos o más sigue siendo ambiguo y se le pregunta, que es lo correcto:
   * reservar «el jueves» a las 9 cuando también había a las 14 es exactamente
   * la clase de suposición que acaba en una cita a la que nadie va. */
  if (!horas.length) {
    if (!dia) return null;
    const delDia = lista.filter((o) => sinTildes(o.label).includes(dia));
    return delDia.length === 1 ? delDia[0].iso : null;
  }

  const cuadran = lista.filter((o) => {
    const etiqueta = sinTildes(o.label);
    if (dia && !etiqueta.includes(dia)) return false;
    const h = horaDeLaEtiqueta(o.label);
    return h !== null && horas.includes(h);
  });

  // NI UNO NI DOS: exactamente uno. Con dos, quien llama enseña las opciones.
  return cuadran.length === 1 ? cuadran[0].iso : null;
}

/**
 * Lo que se le contesta al modelo cuando no se reconoce la hora.
 *
 * NO «falta la fecha y hora»: eso fue lo que le devolvimos y por eso se rindió
 * y pasó la conversación con una persona. Un error que no dice qué hacer deja
 * al modelo sin salida — se le enseñan las horas que SÍ existen.
 */
export function comoRecordarLosHorarios(ofrecidos: HorarioOfrecido[] | null | undefined): string {
  const lista = (ofrecidos ?? []).filter((o) => o?.iso && o?.label);
  if (!lista.length) {
    return "No tengo horarios ofrecidos todavía. Llama primero a ver_horarios.";
  }
  return (
    "No reconozco esa hora. Estas son las que ofreciste; llama otra vez con el valor de `inicio` " +
    "EXACTO de la que elija:\n" +
    lista.map((o) => `- ${o.label} → inicio: ${o.iso}`).join("\n") +
    "\nSi lo que dijo encaja con dos, pregúntale cuál de las dos antes de agendar."
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LA HORA SE DICE EN EL RELOJ DE QUIEN LA ESCUCHA
 *
 * La cita es un instante y no se mueve. Lo que cambia es cómo se cuenta: el
 * mismo momento son las 9:00 para un cliente de México y las 10:00 para uno de
 * Panamá, y los dos tienen razón.
 *
 * Hasta hoy el bot hablaba SIEMPRE en la zona del negocio. Un negocio con
 * número de Panamá y clientes en México le decía a cada mexicano una hora que
 * en su teléfono era otra — y el cliente apuntaba la que oyó.
 *
 * ── LO QUE NO CAMBIA, Y ES IMPORTANTE ─────────────────────────────────────
 *
 * · Los huecos se CALCULAN en la zona del negocio. El horario laboral es del
 *   negocio: «abrimos de 9 a 6» son las suyas, no las de quien pregunta.
 * · La cita se GUARDA en la zona del negocio, y así la lee su equipo y su
 *   Google Calendar.
 *
 * Solo se traduce lo que se DICE. Por eso esto vive aquí, en el archivo puro,
 * y se aplica al borde —al ofrecer y al confirmar—, no dentro del cálculo.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** ¿Se puede formatear en esta zona? Una zona inventada no falla al guardarse: falla aquí. */
function zonaUsable(zona: string | null | undefined): boolean {
  const z = String(zona ?? "").trim();
  if (!z) return false;
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: z }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * La etiqueta de un instante, con el MISMO formato que usa el resto de la
 * plataforma: «mié 09 de sep, 09:00».
 *
 * Tiene que ser idéntico al de `computeSlots` o `horarioQuePidio` dejaría de
 * reconocer lo que la persona repite — la etiqueta es lo que se compara.
 */
export function etiquetaEnZona(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zona,
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

/**
 * Cómo se le cuenta una cita a esta persona.
 *
 * Devuelve `null` si la zona no sirve, y quien llama se queda con lo que ya
 * tenía. NUNCA se inventa una zona: es la lección de la 0102, y aquí el daño
 * sería el mismo con otra cara — decirle a alguien una hora que no es la suya.
 */
export function comoSeLoDigo(
  iso: string | null | undefined,
  zona: string | null | undefined,
): { dia: string; hora: string; etiqueta: string } | null {
  const t = String(iso ?? "").trim();
  if (!t || !zonaUsable(zona)) return null;
  const cuando = new Date(t);
  if (!Number.isFinite(cuando.getTime())) return null;
  const z = String(zona);
  return {
    dia: new Intl.DateTimeFormat("es-MX", {
      timeZone: z, weekday: "long", day: "numeric", month: "long",
    }).format(cuando),
    hora: new Intl.DateTimeFormat("es-MX", {
      timeZone: z, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(cuando),
    etiqueta: etiquetaEnZona(t, z),
  };
}

/**
 * Reescribe las etiquetas de los huecos para quien está escribiendo.
 *
 * Se cambia SOLO `label`. El `dia` y los `minutos` siguen siendo los del
 * negocio porque son lo que usa `repartirHorarios` para agrupar por día y
 * turno: repartir por el turno del cliente pondría «mañana y tarde» de un huso
 * ajeno y el negocio vería su agenda ofrecida de una forma que no reconoce.
 *
 * Sin zona utilizable devuelve la lista TAL CUAL. Es lo que pasa en Instagram
 * y en el chat de la web, donde no hay teléfono del que deducir nada.
 */
export function enLaZonaDelCliente<T extends { startISO: string; label: string }>(
  slots: T[] | null | undefined,
  zona: string | null | undefined,
): T[] {
  const lista = slots ?? [];
  if (!zonaUsable(zona)) return [...lista];
  const z = String(zona);
  return lista.map((s) => (s?.startISO ? { ...s, label: etiquetaEnZona(s.startISO, z) } : s));
}
