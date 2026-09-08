/**
 * LA IA NO AFIRMA HECHOS SOBRE EL DINERO NI SOBRE EL PEDIDO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA ÚLTIMA PUERTA, Y EXISTE PORQUE LAS OTRAS DOS PUEDEN FALLAR.
 *
 * Ya hay dos defensas antes de ésta: la IA no contesta al recibo de un pedido
 * (`pedidoQueLlega.ts`), y los avisos del sistema ya no entran en su historial
 * como palabras suyas (`historial.ts`). Las dos son buenas y las dos son
 * evitables — basta con que mañana alguien añada una tercera forma de llamar al
 * modelo, o con que un mensaje llegue por un camino que no previmos.
 *
 * Esto es lo que queda si las dos fallan: **una frase que afirma que hay dinero
 * no sale de la IA.** Da igual por qué la escribió.
 *
 * ── POR QUÉ ESTA ES LA REGLA Y NO «QUE NO SE EQUIVOQUE» ───────────────────
 *
 * El 8 sep 2026 una clienta leyó «¡Pago recibido! ✅ Tu pedido #18 quedó
 * confirmado por $1.00» de un pedido que nadie había pagado. Lo escribió un
 * modelo de lenguaje imitando un patrón.
 *
 * No se puede garantizar que un modelo no se equivoque: escribe texto libre y
 * siempre podrá decir algo falso. Lo que SÍ se puede garantizar es de qué NO
 * habla. Un pago es un hecho que vive en una fila de la base de datos; el
 * sistema de avisos la mira antes de hablar. La IA no la mira y no puede
 * mirarla, así que no le corresponde afirmarlo.
 *
 * Es la misma regla que ya gobierna el resto de la plataforma —los motores son
 * carteros, las decisiones viven en la plataforma— aplicada al dinero.
 *
 * ── SE CORTA LA FRASE, NO EL MENSAJE ──────────────────────────────────────
 *
 * Tirar la respuesta entera dejaría mudo al bot ante «gracias, ya pagué», que
 * es una conversación legítima. Se quita la frase que afirma y se deja el
 * resto. Si no queda nada, entonces sí se calla — y callarse es correcto: lo
 * único que iba a decir era algo que no le consta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Las frases que solo puede decir el sistema.
 *
 * SE MIRA LO QUE AFIRMA, NO LAS PALABRAS SUELTAS. «pago» a secas no vale: el
 * cliente pregunta «¿cómo pago?» y el bot tiene que poder contestar «con Yappy,
 * en el enlace de arriba». Lo que no puede es decir que el pago YA ocurrió.
 *
 * Por eso cada patrón exige la afirmación completa: un verbo en pasado o un
 * estado, no un sustantivo.
 */
const NO_PUEDE_AFIRMAR: RegExp[] = [
  // «pago recibido», «pago confirmado», «pago acreditado», «recibimos tu pago»
  /pago\s+(recibid|confirmad|acreditad|registrad|aprobad|procesad)\w*/i,
  /(recibimos|confirmamos|acreditamos|registramos)\s+(tu|su|el)\s+pago/i,
  // «tu pago fue confirmado», «el pago ya está acreditado» — con verbo en medio.
  // La prueba lo cazó: el patrón de arriba exige que el participio vaya PEGADO
  // a «pago», y media Latinoamérica lo dice con «fue» o «está» entremedias.
  /pago\s+(ya\s+)?(fue|est[aá]|qued[oó]|ha\s+sido)\s+(recibid|confirmad|acreditad|registrad|aprobad|procesad)\w*/i,
  // «ya pagaste», «ya está pagado», «quedó pagado», «tu pedido está pagado»
  /\b(ya|qued[oó]|est[aá]|fue)\s+(est[aá]\s+)?pagad[oa]\b/i,
  /\bya\s+(pagaste|pag[oó]|pagaron)\b/i,
  // «pedido confirmado por $X» — la de la plantilla, con el importe
  /qued[oó]\s+confirmad[oa]\s+por\s*\$?\s*\d/i,
  // Estados del pedido: solo los sabe la base.
  /tu\s+pedido\s+#?\d*\s*(ya\s+)?(se\s+est[aá]\s+preparando|est[aá]\s+en\s+camino|fue\s+entregado|qued[oó]\s+cancelad)/i,
  /\b(tu|su)\s+pedido\s+(ya\s+)?(sali[oó]|va\s+en\s+camino|lleg[oó])\b/i,
  // El mensajero: tampoco lo sabe.
  /(el\s+)?mensajero\s+(ya\s+)?(va|sali[oó]|est[aá]\s+en\s+camino|lleg[oó])/i,
];

/**
 * ¿Esta frase suelta la puede decir la IA?
 *
 * Se exporta para poder probarla frase a frase, que es como se ve si un patrón
 * se pasa de ancho.
 */
export function afirmaAlgoQueNoSabe(frase: string | null | undefined): boolean {
  const t = String(frase ?? "");
  if (!t.trim()) return false;
  return NO_PUEDE_AFIRMAR.some((r) => r.test(t));
}

/**
 * Quitar de una respuesta lo que la IA no puede afirmar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE PARTE POR FRASES Y NO POR LÍNEAS. El mensaje que salió mal tenía las tres
 * afirmaciones en párrafos distintos, pero también podrían venir seguidas en un
 * mismo renglón: «Ya pagaste, así que tu pedido ya se está preparando». Cortar
 * por líneas dejaría pasar la mitad.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function sinLoQueNoPuedeDecir(texto: string | null | undefined): string {
  const t = String(texto ?? "");
  if (!t.trim()) return "";

  const limpio = t
    .split(/\n/)
    .map((linea) => {
      // Se parte en frases conservando el signo final, para no juntar dos al
      // volver a unirlas.
      const frases = linea.match(/[^.!?]+[.!?]*/g) ?? [linea];
      return frases.filter((f) => !afirmaAlgoQueNoSabe(f)).join("").trim();
    })
    .filter((linea, i, todas) => linea !== "" || (i > 0 && todas[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return limpio;
}

/**
 * ¿Se le mandó algo al cliente?
 *
 * Quien llama lo usa para no mandar un mensaje vacío. Si de la respuesta solo
 * quedaba una afirmación sobre el dinero, lo correcto es no decir nada: el
 * sistema de avisos ya le contará lo que de verdad pase con su pedido.
 */
export function quedaAlgoQueDecir(texto: string | null | undefined): boolean {
  return sinLoQueNoPuedeDecir(texto).trim().length > 0;
}
