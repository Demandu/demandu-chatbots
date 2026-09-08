/**
 * EL BOT NO OPINA SOBRE UN PEDIDO QUE ESCRIBIMOS NOSOTROS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE PASÓ, EL 8 DE SEPTIEMBRE DE 2026, EN UN PEDIDO DE VERDAD.
 *
 *   02:15:20  entrante · del contacto  «*Pedido #17* *Pedido — Paws at Home* …»
 *   02:15:24  saliente · del bot       «Veo que el pedido #17 aparece duplicado
 *                                       con los mismos datos para Victoria
 *                                       Molina. ¿Es un error o necesitas dos
 *                                       pedidos iguales?»
 *
 * No había ningún duplicado. Solo existía un pedido #17. El modelo leyó dos
 * líneas seguidas que empiezan por «Pedido» —`*Pedido #17*` y `*Pedido — Paws
 * at Home*`— y dedujo que eran dos.
 *
 * ── PERO EL FALLO NO ES QUE SE EQUIVOCARA ─────────────────────────────────
 *
 * Es que llegó a opinar. Ese texto no es una pregunta del cliente: lo redacta
 * la plataforma, el cliente solo lo reenvía por WhatsApp. Pedirle a un modelo
 * que conteste al recibo que nosotros mismos escribimos es garantizar que
 * algún día diga algo raro sobre él — y lo dirá con seguridad y por delante de
 * un cliente que acaba de pagar.
 *
 * Mejorar el formato para que no se confunda sería tratar el síntoma. Un
 * formato que no confunda a este modelo confundirá al siguiente.
 *
 * ── EL CÓDIGO YA VIAJABA PARA ESTO, Y NADIE LO MIRABA ─────────────────────
 *
 * `crearPedido.ts` dice, desde el primer día: «EL CÓDIGO VIAJA SIEMPRE… es lo
 * que reconoce el mensaje al llegar». Era una intención que nunca se
 * construyó: en el motor no había nada que lo reconociera.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ¿Es este mensaje el recibo de un pedido nuestro?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE EXIGEN DOS MARCAS, Y LA RAZÓN ES LA ASIMETRÍA DE LOS DOS ERRORES.
 *
 * Equivocarse hacia el «sí» CALLA A UN CLIENTE DE VERDAD: alguien que escribe
 * «mi código es 12345» se queda sin respuesta y sin saber por qué. Eso es una
 * venta perdida en silencio, que es la peor clase.
 *
 * Equivocarse hacia el «no» deja las cosas COMO ESTÁN HOY: el bot contesta al
 * pedido, como acaba de pasar. Malo, pero conocido y visible.
 *
 * Por eso hacen falta las dos marcas de nuestro formato a la vez —la cabecera
 * `*Pedido #N*` y la línea `Código:`—, y no basta con encontrar algo que
 * parezca un código por ahí suelto. Si el cliente edita el mensaje antes de
 * mandarlo —WhatsApp lo permite— y rompe una de las dos, volvemos al
 * comportamiento de hoy. Nunca al silencio.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function esElReciboDeUnPedido(texto: string | null | undefined): boolean {
  return codigoDelRecibo(texto) !== "";
}

/**
 * El código del pedido que trae el recibo, si lo trae.
 *
 * SE DEVUELVE EL CÓDIGO Y NO UN SÍ/NO porque con él se puede atar la
 * conversación al pedido: es exactamente para lo que viaja.
 */
export function codigoDelRecibo(texto: string | null | undefined): string {
  const t = String(texto ?? "");
  if (!t) return "";

  // MARCA 1: la cabecera que pone `crearPedido`. Con asteriscos, que es como
  // WhatsApp escribe la negrita, y con el número del pedido.
  if (!/(^|\n)\s*\*Pedido #\d+\*/.test(t)) return "";

  // MARCA 2: la línea del código, al final y sola en su renglón. No vale un
  // código suelto en medio de una frase: eso lo escribe una persona.
  const m = t.match(/(^|\n)\s*C[oó]digo:\s*([A-Z0-9]{6,20})\s*$/im);
  if (!m) return "";

  return m[2].trim().toUpperCase();
}

/**
 * ¿Qué se le contesta entonces?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NADA, Y ES DELIBERADO.
 *
 * La tienda ya tiene sus avisos: cuando el pedido pasa a «recibido», a
 * «preparando» y a «en camino», el negocio le escribe con SU texto, el que
 * configuró en Avisos. Que el bot además dijera «¡recibido!» sería un segundo
 * mensaje diciendo lo mismo, cuatro segundos antes y con otra voz.
 *
 * Y si el cliente escribe algo DESPUÉS —«oye, cámbiame el sabor»— eso ya es
 * una pregunta suya, no el recibo, y el bot contesta con normalidad. Lo único
 * que se calla es el recibo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function loQueSeContestaAlRecibo(): null {
  return null;
}
