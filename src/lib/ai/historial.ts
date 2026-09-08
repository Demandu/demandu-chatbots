/**
 * QUÉ DE LA CONVERSACIÓN VE LA IA, Y COMO QUÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE PASÓ EL 8 DE SEPTIEMBRE DE 2026, A LAS 02:46.
 *
 * Entró el pedido #18 de Morelva Bracho y la IA contestó, cuatro segundos
 * después:
 *
 *     «¡Pago recibido! ✅ Tu pedido #18 en Paws at Home quedó confirmado por
 *      $1.00. Te vamos avisando por aquí.
 *      Tu pedido #18 ya se está preparando.
 *      Nota: Veo que el pedido #18 aparece duplicado…»
 *
 * NO SE HABÍA PAGADO NADA. `pago_iniciado_en` estaba vacío y el pedido se marcó
 * a mano un minuto DESPUÉS. Una clienta leyó que su pago estaba confirmado
 * porque lo dijo un modelo de lenguaje.
 *
 * ── Y NO SE LO INVENTÓ: SE COPIÓ A SÍ MISMA ──────────────────────────────
 *
 * Estos eran los seis mensajes que tenía delante:
 *
 *     inbound  · contacto  «*Pedido #18* … Morelva …»
 *     outbound · system    «Tu pedido #17 ya se está preparando.»
 *     outbound · system    «¡Pago recibido! ✅ Tu pedido #17 … $1.00 …»
 *     outbound · bot       «Veo que el pedido #17 aparece duplicado…»
 *     inbound  · contacto  «*Pedido #17* …»
 *     outbound · system    «Tu pedido #16 ya se está preparando.»
 *
 * El motor los pasaba TODOS como `assistant`, mirando solo `direction`. Así que
 * desde el punto de vista del modelo, la conversación decía: «llega un pedido,
 * yo digo pago recibido, yo digo ya se está preparando, yo digo que está
 * duplicado». Llegó el #18 y continuó el patrón. Cambió el 17 por el 18.
 *
 * No es un fallo del modelo. Es el comportamiento correcto dado lo que le
 * dimos: le enseñamos a suplantar a la plataforma.
 *
 * ── LOS AVISOS SON LA VOZ DEL SISTEMA, NO LA DEL CHAT ─────────────────────
 *
 * «¡Pago recibido!» lo manda el sistema DESPUÉS DE MIRAR LA FILA DEL PEDIDO. La
 * IA no sabe nada de pagos y no puede saberlo. Que las dos voces compartan el
 * papel de `assistant` es lo que permitió que una se hiciera pasar por la otra.
 *
 * Y lo mismo con las personas del equipo: si Darwin contesta por la Bandeja, el
 * modelo lee sus palabras como propias y las imita — incluidos los compromisos
 * que Darwin haya hecho y el modelo no pueda cumplir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MensajeGuardado = {
  direction?: string | null;
  sender?: string | null;
  body?: string | null;
};

export type Turno = { role: "user" | "assistant"; content: string };

/** Cómo se marca lo que escribió una persona del equipo. */
export const MARCA_AGENTE = "[un compañero del equipo escribió]";

/**
 * De los mensajes guardados a lo que se le manda al modelo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA, REMITENTE POR REMITENTE:
 *
 *   contact → `user`.      Es el cliente. Sin discusión.
 *
 *   bot     → `assistant`. Son SUS palabras de antes. Es lo único que de
 *                          verdad dijo el modelo, y lo único que puede imitar
 *                          sin suplantar a nadie.
 *
 *   system  → SE TIRA.     Son los avisos automáticos de la tienda. El modelo
 *                          no los necesita para conversar, y tenerlos delante
 *                          como propios es exactamente lo que le hizo escribir
 *                          «¡Pago recibido!». Si el cliente pregunta por el
 *                          estado de su pedido, esa respuesta no la puede dar
 *                          la IA: la da el sistema, que mira la base.
 *
 *   agent   → `user` CON MARCA. No se tira, porque el hilo se rompería: si un
 *                          compañero ya preguntó algo, el modelo volvería a
 *                          preguntarlo. Pero no entra como `assistant`, porque
 *                          un modelo continúa SU voz — y esa voz no es suya.
 *
 *   otro    → SE TIRA.     Un remitente que no conocemos no puede convertirse
 *                          en palabras del modelo por descarte. Se falla hacia
 *                          el silencio, que aquí es el lado barato.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function historialParaLaIA(mensajes: MensajeGuardado[] | null | undefined): Turno[] {
  const turnos: Turno[] = [];

  for (const m of mensajes ?? []) {
    const texto = String(m?.body ?? "").trim();
    if (!texto) continue;

    const quien = String(m?.sender ?? "").trim().toLowerCase();
    const entra = String(m?.direction ?? "").trim().toLowerCase() === "inbound";

    if (entra) {
      // Lo que entra es del cliente. `sender` puede faltar en mensajes viejos;
      // la dirección basta y no hay riesgo: un `user` de más no suplanta nada.
      turnos.push({ role: "user", content: texto });
      continue;
    }

    if (quien === "bot") {
      turnos.push({ role: "assistant", content: texto });
      continue;
    }

    if (quien === "agent") {
      turnos.push({ role: "user", content: `${MARCA_AGENTE}: ${texto}` });
      continue;
    }

    // `system` y cualquier otro: fuera. Ver la cabecera.
  }

  return ordenarParaElModelo(turnos);
}

/**
 * Dejar el historial en la forma que la API acepta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS COSAS QUE ANTES NO PODÍAN PASAR Y AHORA SÍ.
 *
 * Al tirar los avisos del sistema, un historial puede quedar EMPEZANDO POR EL
 * MODELO —«…yo dije algo», sin que nadie hubiera hablado antes— y puede quedar
 * con dos turnos seguidos del mismo lado. La API de Anthropic pide que empiece
 * el usuario, y dos turnos iguales seguidos son una forma rara de hablar que
 * empeora las respuestas.
 *
 * Si esto no estuviera, el arreglo de arriba haría fallar la llamada al modelo
 * en las conversaciones que MÁS avisos tienen — es decir, justo en las de los
 * clientes que más compran. Un arreglo que rompe donde más duele no es un
 * arreglo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function ordenarParaElModelo(turnos: Turno[]): Turno[] {
  // Fuera lo que diga el modelo antes de que nadie le hable.
  let i = 0;
  while (i < turnos.length && turnos[i].role === "assistant") i++;
  const desdeElCliente = turnos.slice(i);

  // Dos seguidos del mismo lado se juntan en uno.
  const juntos: Turno[] = [];
  for (const t of desdeElCliente) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && ultimo.role === t.role) ultimo.content = `${ultimo.content}\n${t.content}`;
    else juntos.push({ ...t });
  }
  return juntos;
}
