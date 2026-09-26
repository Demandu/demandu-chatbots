/**
 * ¿El bot acaba de PROMETER que va a intervenir una persona?
 *
 * POR QUÉ EXISTE ESTO. Un modelo con herramientas a veces NARRA la acción en
 * vez de ejecutarla: escribe «un asesor se va a comunicar contigo» y no llama a
 * `pasar_a_humano`. La conversación se queda abierta, sin dueño, y nadie del
 * equipo se entera. El lead espera a alguien que no va a llegar nunca.
 *
 * Es el peor fallo posible de un chatbot de ventas: no es que no ayude, es que
 * promete en nombre del negocio y el negocio no cumple.
 *
 * Así que el motor lee lo que el bot acaba de decir y, si prometió una persona
 * sin haber llamado a la herramienta, hace el pase igualmente. La promesa la
 * hizo el bot en nombre del cliente: se cumple.
 *
 * ES DELIBERADAMENTE ESTRECHO. Pasar una conversación a un humano que no hacía
 * falta cuesta el tiempo de un agente; no cumplir una promesa cuesta el lead.
 * Aun así, se exige que aparezca una PERSONA y un COMPROMISO — no basta con
 * mencionar a un asesor de pasada («si quieres, un asesor puede ayudarte»).
 *
 * Dato puro, sin imports: lo usan el motor de WhatsApp (que tiene su gemelo en
 * Deno), el canal web y las pruebas.
 */

/** Quién va a atender: persona del equipo, no el bot. */
const PERSONA =
  "(?:asesor|asesora|agente|ejecutivo|ejecutiva|vendedor|vendedora|" +
  "una\\s+persona|alguien\\s+del\\s+equipo|del\\s+equipo|compa[nñ]er[oa])";

/** El compromiso: alguien VA a hacer algo, no «podría». */
const COMPROMISO =
  "(?:se\\s+(?:va|van)\\s+a\\s+comunicar|se\\s+comunicar[aá]n?|te\\s+contactar[aá]n?|" +
  "lo\\s+contactar[aá]n?|la\\s+contactar[aá]n?|te\\s+escribir[aá]n?|te\\s+atender[aá]n?|" +
  "lo\\s+atender[aá]n?|la\\s+atender[aá]n?|te\\s+llamar[aá]n?|" +
  "en\\s+un\\s+momento\\s+te\\s+atiende|enseguida\\s+te\\s+atiende)";

/** «Te paso con…», que es un compromiso en primera persona. */
const YO_TE_PASO =
  "(?:te|le|lo|la)\\s+(?:paso|comunico|conecto|transfiero|derivo|enlazo)\\s+(?:con|a)\\b";

/**
 * «Mejor te ENVÍO con uno de mis compañeros». No estaba, y es exactamente
 * como lo escribió una inmobiliaria en su mensaje de respaldo: el bot se lo
 * mandó dos veces a la misma persona el 25 de septiembre de 2026 y la
 * conversación se quedó abierta y sin dueño las dos veces.
 *
 * SE EXIGE UNA PERSONA DETRÁS, y por eso no va dentro de `YO_TE_PASO`: sin
 * ese requisito, «te lo mando a tu correo» contaría como promesa de un
 * asesor y cada envío de un PDF acabaría ocupando a alguien del equipo.
 */
const YO_TE_ENVIO_CON =
  `(?:te|le|lo|la)\\s+(?:env[íi]o|mando|remito)\\s+(?:con|a)\\b[^.!?\\n]{0,40}${PERSONA}`;

const PATRONES = [
  new RegExp(`${PERSONA}[^.!?\\n]{0,60}${COMPROMISO}`, "i"),
  new RegExp(`${COMPROMISO}[^.!?\\n]{0,60}${PERSONA}`, "i"),
  new RegExp(YO_TE_PASO, "i"),
  new RegExp(YO_TE_ENVIO_CON, "i"),
];

/**
 * Frases que MENCIONAN a una persona sin prometer nada. Se miran primero: si
 * la frase es una oferta («¿quieres que te comunique con alguien?»), no hay
 * promesa que cumplir — la persona todavía no ha dicho que sí.
 */
const SOLO_OFRECE =
  /(?:\?|¿)|(?:quieres|querés|desea|deseas|gustar[íi]a|prefieres|te sirve|puedo)\b/i;

export function prometioUnaPersona(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;

  // Se mira frase a frase: un mensaje puede ofrecer algo Y prometer otra cosa,
  // y quedarse con el mensaje entero haría que una sola pregunta anulara la
  // promesa que va dos líneas más abajo.
  for (const frase of t.split(/(?<=[.!?\n])/)) {
    const f = frase.trim();
    if (!f || SOLO_OFRECE.test(f)) continue;
    if (PATRONES.some((p) => p.test(f))) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ¿EL CLIENTE ACABA DE PEDIR UNA PERSONA?
 *
 * ── EL OTRO LADO DEL MISMO AGUJERO ─────────────────────────────────────────
 *
 * `prometioUnaPersona` mira lo que dijo EL BOT. Esta mira lo que dijo EL
 * CLIENTE, y hace falta porque en producción se vio lo siguiente: misma cuenta,
 * mismo bot, misma herramienta encendida, dos clientes pidiendo lo mismo con
 * otras palabras, y solo uno acabó con una persona. La diferencia no estuvo en
 * la configuración: estuvo en si al modelo le dio por llamar a la herramienta.
 *
 * Que un cliente PIDA hablar con alguien y el bot siga contestando solo es el
 * fallo más caro que tiene un chatbot de ventas: la persona ya dijo que el bot
 * no le sirve. Y no se arregla con el prompt, porque el prompt ya lo dice.
 *
 * ── AQUÍ LAS PREGUNTAS SÍ CUENTAN, AL REVÉS QUE ARRIBA ─────────────────────
 *
 * En `prometioUnaPersona` una pregunta anula la promesa: «¿quieres que te pase
 * con un asesor?» no promete nada. Aquí es justo al contrario — «¿me puedes
 * pasar con una persona?» es LA petición, y es como la escribe casi todo el
 * mundo. Filtrar preguntas dejaría fuera la mayoría de los casos reales.
 *
 * ── LO QUE SE DESCARTA A PROPÓSITO ─────────────────────────────────────────
 *
 * 1. El pasado: «ya hablé con un asesor», «me atendió una persona». Eso es
 *    contexto, no una petición.
 * 2. La negación: «no quiero hablar con un asesor todavía».
 *
 * Y una excepción que va antes que las dos: rechazar al bot —«no quiero hablar
 * con un robot»— SÍ es pedir una persona, aunque venga escrito como negación.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** A quién pide: una persona del equipo, no el bot. */
const PIDE_QUIEN =
  "(?:un[ao]?\\s+persona|un\\s+humano|humano|asesor[ao]?|agente|ejecutiv[ao]|" +
  "vendedor[ao]?|representante|operador[ao]?|alguien\\s+(?:del\\s+equipo|real|de\\s+verdad|m[aá]s)|" +
  "servicio\\s+al\\s+cliente|atenci[oó]n\\s+(?:al\\s+cliente|humana|personalizada))";

/** Que quiere hablar con esa persona, en infinitivo: es lo que aún no pasó. */
const PIDE_VERBO =
  "(?:hablar|platicar|charlar|conversar|comunicarme|contactar(?:me)?|" +
  "que\\s+me\\s+atienda|atenderme)";

/** «Pásame con…», «me comunicas con…»: la petición en primera persona. */
const PIDE_PASAME =
  "(?:p[aá]same|me\\s+pasas|me\\s+puedes?\\s+pasar|puedes?\\s+pasarme|" +
  "comun[ií]came|me\\s+comunicas|me\\s+puedes?\\s+comunicar|transfi[eé]re(?:me)?|" +
  "me\\s+transfieres|der[ií]vame|con[eé]ctame|me\\s+conectas)" +
  "\\s+(?:con|a)\\b";

/** «Quiero un asesor», sin verbo de hablar de por medio. */
const PIDE_QUIERO = "(?:quiero|necesito|deseo|busco|requiero|dame|me\\s+das|hay)";

/** Rechazar al bot es pedir una persona, y llega escrito como negación. */
const PIDE_AL_BOT =
  /\b(?:bot|robot|m[aá]quina|chatbot|inteligencia\s+artificial|contestador)\b/i;
const PIDE_HARTO =
  /\b(?:no\s+(?:quiero|me\s+sirve|me\s+funciona|entiendes|entiende|me\s+ayudas)|deja\s+de|basta)\b/i;

const PIDE_PATRONES = [
  new RegExp(`${PIDE_VERBO}\\s+(?:con\\s+)?(?:un[ao]?\\s+)?${PIDE_QUIEN}`, "i"),
  new RegExp(PIDE_PASAME, "i"),
  new RegExp(`${PIDE_QUIERO}\\s+(?:un[ao]?\\s+)?${PIDE_QUIEN}`, "i"),
];

/** Lo que ya ocurrió no se pide: es contexto. */
const PIDE_YA_PASO =
  /\b(?:ya\s+)?(?:habl[ée]|platiqu[ée]|me\s+atendi[óo]|me\s+contact[óo]|me\s+llam[óo]|me\s+escribi[óo]|me\s+pasaron|me\s+atendieron)\b/i;

/** Una negación de la petición, que NO es lo mismo que rechazar al bot. */
const PIDE_NEGADO = /\bno\s+(?:quiero|necesito|hace\s+falta|es\s+necesario)\b/i;

/**
 * @param texto Lo que el CLIENTE acaba de escribir.
 */
export function pidioUnaPersona(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;

  for (const frase of t.split(/(?<=[.!?\n])/)) {
    const f = frase.trim();
    if (!f) continue;

    // Primero la excepción: «no quiero hablar con un robot» es una petición,
    // no una negación, y si se mirara después la negación se la comería.
    if (PIDE_AL_BOT.test(f) && PIDE_HARTO.test(f)) return true;

    if (PIDE_YA_PASO.test(f) || PIDE_NEGADO.test(f)) continue;
    if (PIDE_PATRONES.some((p) => p.test(f))) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ¿EL BOT ACABA DE DECIR QUE AGENDÓ UNA CITA?
 *
 * 16 sep 2026, visto en producción en una clínica fetal. El modelo llamó a
 * `agendar_cita` con `2025-01-17T12:00:00` —enero de 2025, año y ocho meses en
 * el pasado— porque se inventó la fecha. La plataforma hizo lo correcto: no
 * reconoció esa hora entre las ofrecidas y se lo dijo. DOS VECES. Y el modelo,
 * en vez de corregirse, le escribió al paciente:
 *
 *     «Ahora sí, confirmando tu cita para el jueves 17 a las 12:00. ✅»
 *
 * Y cuando el paciente contestó que no le llegaba el correo, el bot le echó la
 * culpa al correo: «a veces tardan o caen en spam».
 *
 * ── POR QUÉ ESTO NO SE ARREGLA COMO EL PASE A HUMANO ───────────────────────
 *
 * Con `prometioUnaPersona` la salida es CUMPLIR: se hace el pase y ya. Aquí no
 * se puede. No sabemos qué hueco quería, y agendar el equivocado es peor que no
 * agendar: el paciente llega un jueves que no era y la agenda del negocio
 * queda con basura. Lo único honesto es DESMENTIRLO antes de que salga.
 *
 * ── ES DELIBERADAMENTE ESTRECHO ────────────────────────────────────────────
 *
 * Desmentir una cita que SÍ se agendó sería el fallo contrario y igual de caro:
 * el paciente cancelaría una cita buena. Por eso se exige una afirmación en
 * pasado o presente sobre una cita —«quedó agendada», «tu cita está
 * confirmada»— y se descarta todo lo que sea pregunta u ofrecimiento.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** La cosa: una cita, una reserva, un turno. */
const LA_CITA = "(?:cita|reserva|turno|consulta|espacio|lugar)";

/**
 * Que ya está hecha. «Voy a agendarte» NO entra: eso es intención, no hecho.
 *
 * EL GERUNDIO SÍ ENTRA, y es el que se escapó en la primera versión de esta
 * regla. La frase que de verdad salió en producción fue «Ahora sí, CONFIRMANDO
 * tu cita para el jueves 17 a las 12:00 ✅» — que en boca de un modelo no es
 * una acción en curso, es un hecho consumado. Sin el gerundio, esta regla no
 * habría atrapado el único caso que ya sabemos que ocurrió.
 */
const YA_ESTA =
  "(?:agendad[ao]|reservad[ao]|confirmad[ao]|registrad[ao]|apartad[ao]|" +
  "separad[ao]|programad[ao]|list[ao]|qued[óo]|anot[ée]|" +
  "agendando|reservando|confirmando|registrando|apartando|programando)";

/** «Te agendé», «la confirmé»: el hecho en primera persona. */
const YO_LA_HICE =
  "(?:te|le|lo|la)\\s+(?:agend|reserv|confirm|registr|apart|separ|program)[ée]";

const PATRONES_CITA = [
  new RegExp(`${LA_CITA}[^.!?\\n]{0,70}${YA_ESTA}`, "i"),
  new RegExp(`${YA_ESTA}[^.!?\\n]{0,70}${LA_CITA}`, "i"),
  new RegExp(YO_LA_HICE, "i"),
];

/**
 * Lo que dice la plataforma cuando el bot mintió.
 *
 * NO SE DISCULPA Y YA: vuelve a abrir la puerta. Un «no se pudo» a secas deja
 * al paciente sin cita y sin saber qué hacer, que es justo donde se pierde.
 */
export const LA_CITA_NO_QUEDO =
  "Perdón, me equivoqué: la cita **no** quedó registrada. 🙏\n\n" +
  "¿Me confirmas otra vez el día y la hora que quieres? Así la dejo agendada de verdad y te llega la confirmación.";

/**
 * @param texto Lo que el bot acaba de escribir.
 */
export function prometioUnaCita(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;

  for (const frase of t.split(/(?<=[.!?\n])/)) {
    const f = frase.trim();
    // Misma guarda que en el pase: una pregunta no afirma nada.
    if (!f || SOLO_OFRECE.test(f)) continue;
    if (PATRONES_CITA.some((p) => p.test(f))) return true;
  }
  return false;
}
