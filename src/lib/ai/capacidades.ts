/**
 * QUÉ SABE HACER LA IA, SEGÚN LO QUE EL NEGOCIO YA TIENE CONECTADO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA. Hasta hoy las herramientas eran nueve casillas que había que
 * marcar a mano. Nada se encendía solo, y eso rompe a la persona para la que
 * está hecha esta plataforma: alguien que tiene una clínica, no una empresa de
 * software, y que no sabe —ni tiene por qué saber— qué es una integración.
 *
 * Ese usuario conecta su Google Calendar porque la pantalla se lo pide para el
 * bloque de citas. Y después su asistente sigue sin poder agendar, porque en
 * OTRA pantalla hay una casilla que nadie le dijo que existía. Desde su lado no
 * hay ningún fallo que reportar: simplemente «la IA no sirve para eso».
 *
 * Ya pasó, y no con una: TRES herramientas de la tienda —ver el catálogo, el
 * estado de un pedido, mandar el enlace— estuvieron construidas, probadas y
 * desplegadas sin casilla en ninguna pantalla. Solo las tenía quien adivinara
 * que había que escribir `/ver_catalogo` en el prompt.
 *
 * ── LA REGLA: CONECTAR ES ENCENDER ────────────────────────────────────────
 *
 * Si hay agenda conectada, la IA puede ver horarios, agendar, mover y cancelar.
 * Si hay tienda encendida, puede enseñar el catálogo, dar el enlace y consultar
 * un pedido. Sin marcar nada, sin escribir nada en el prompt, sin enterarse de
 * que existe este archivo.
 *
 * ── Y APAGARLAS SE GUARDA COMO «APAGADAS», NO COMO «ENCENDIDAS» ───────────
 *
 * Hay negocios que conectan su agenda solo para lo interno y no quieren que el
 * bot toque citas. Tienen que poder decir que no.
 *
 * Pero la lista que se guarda es la de las APAGADAS. Con una lista de
 * encendidas, cada herramienta nueva nace apagada para todo el mundo y hay que
 * ir cuenta por cuenta a activarla — que es exactamente cómo se llegó a tener
 * tres herramientas invisibles. Con una lista de apagadas, lo que se construya
 * mañana llega encendido a quien tenga con qué usarlo, y el que dijo que no
 * sigue diciendo que no.
 *
 * ── ARCHIVO PURO ──────────────────────────────────────────────────────────
 *
 * No importa nada. Lo usan la pantalla de configuración, el motor de Node y —en
 * copia deliberada, comparada por una prueba estática— el motor de WhatsApp en
 * Deno.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Qué tiene este negocio, de verdad, ahora mismo. */
export type LoQueTiene = {
  /** Google Calendar o Calendly conectado y con el token vivo. */
  agenda?: boolean;
  /** Al menos una tienda encendida y vinculada a este chatbot. */
  tienda?: boolean;
  /** El complemento de Reservas, con salón dibujado y turnos configurados. */
  reservas?: boolean;
};

/** Qué hace falta tener para que una herramienta sirva de algo. */
export type Requisito = "agenda" | "tienda" | "reservas" | null;

/**
 * Las que se encienden con la agenda.
 *
 * `ver_horarios` va primero y no es casualidad: sin ella el modelo se inventa
 * disponibilidad. Nunca se enciende `agendar_cita` sin ella.
 */
export const POR_LA_AGENDA = [
  "ver_horarios",
  // LEER LA AGENDA VA PRIMERO, y no es orden decorativo: es lo que hace falta
  // para contestar «¿quedó confirmada mi cita?». Sin ella, el modelo solo podía
  // llegar a esa respuesta llamando a `reagendar_cita` sin hora —usar una
  // herramienta de escritura para leer— y cuando no encontraba nada se
  // inventaba el motivo. Pasó el 6 de septiembre.
  "ver_mis_citas",
  "agendar_cita",
  "reagendar_cita",
  "cancelar_cita",
] as const;

/**
 * Las que se encienden con RESERVAS.
 *
 * ── VER ANTES DE RESERVAR ─────────────────────────────────────────────────
 *
 * `ver_mesas` va primero por lo mismo que `ver_horarios` en la agenda: sin
 * consultar, el modelo se inventa disponibilidad. Nunca se enciende
 * `reservar_mesa` sin ella.
 */
export const POR_LAS_RESERVAS = [
  "ver_mesas",
  "reservar_mesa",
  "ver_mis_reservas",
  "mover_reserva",
  "cancelar_reserva",
] as const;

/** Las que se encienden con la tienda. */
export const POR_LA_TIENDA = [
  "ver_catalogo",
  "enlace_de_tienda",
  "estado_de_pedido",
] as const;

/**
 * Qué necesita cada herramienta. Lo que no está aquí no necesita nada
 * conectado y sigue siendo una casilla que el negocio marca si quiere.
 */
export function requisitoDe(clave: string): Requisito {
  if ((POR_LA_AGENDA as readonly string[]).includes(clave)) return "agenda";
  if ((POR_LAS_RESERVAS as readonly string[]).includes(clave)) return "reservas";
  if ((POR_LA_TIENDA as readonly string[]).includes(clave)) return "tienda";
  return null;
}

/**
 * Las que se encienden solas con lo que este negocio tiene hoy.
 *
 * ── CITAS Y RESERVAS NO CONVIVEN ──────────────────────────────────────────
 *
 * Son dos negocios distintos: un médico o un consultor AGENDA CITAS; un
 * restaurante RESERVA MESAS. Nadie hace las dos cosas.
 *
 * Y si las dos cajas estuvieran encendidas, el modelo elegiría mal tarde o
 * temprano: llamaría a `agendar_cita` para una cena, crearía un evento en un
 * calendario que el restaurante no mira, y la mesa quedaría sin ocupar. El
 * grupo llega con su confirmación y no hay nada reservado.
 *
 * Con Reservas encendido, las de agenda no se ofrecen. Lo que el negocio marcó
 * a mano sigue valiendo: esto solo decide lo AUTOMÁTICO.
 */
export function herramientasAutomaticas(tiene: LoQueTiene | null | undefined): string[] {
  const out: string[] = [];
  if (tiene?.reservas) out.push(...POR_LAS_RESERVAS);
  else if (tiene?.agenda) out.push(...POR_LA_AGENDA);
  if (tiene?.tienda) out.push(...POR_LA_TIENDA);
  return out;
}

export type DeDondeSale = "automatica" | "marcada" | "del_prompt" | "apagada" | "no";

export type Fuentes = {
  /** Lo que sale solo de lo conectado. */
  automaticas?: string[] | null;
  /** Las casillas que marcó el negocio. */
  marcadas?: string[] | null;
  /** Las que pidió escribiéndolas en el prompt (`/agendar_cita`). */
  escritas?: string[] | null;
  /** Las automáticas que apagó a propósito. */
  apagadas?: string[] | null;
};

// El nombre es largo a propósito: el motor de WhatsApp lleva una copia de
// estas funciones y ahí `lista` ya existe dentro de otra función. Dos nombres
// distintos harían que la prueba que compara las copias acusara en falso — o,
// peor, que alguien la relajara para callarla.
const listaDeHerramientas = (x: string[] | null | undefined) => (Array.isArray(x) ? x.filter(Boolean) : []);

/**
 * Qué herramientas lleva de verdad el agente.
 *
 * ── APAGAR SOLO APAGA LO AUTOMÁTICO ───────────────────────────────────────
 *
 * Marcar la casilla o escribir `/agendar_cita` en el prompt son actos
 * deliberados: alguien fue y lo pidió. Si eso se pudiera anular con la lista de
 * apagadas, el negocio marcaría la casilla, la vería marcada, y la herramienta
 * no estaría — sin nada en pantalla que explique por qué.
 *
 * Así que las apagadas solo quitan de las automáticas. Un «sí» explícito
 * siempre gana a un «no» que se puso solo.
 */
export function herramientasQueManda(f: Fuentes | null | undefined): string[] {
  const apagadas = new Set(listaDeHerramientas(f?.apagadas));
  const automaticas = listaDeHerramientas(f?.automaticas).filter((h) => !apagadas.has(h));
  return [...new Set([...automaticas, ...listaDeHerramientas(f?.marcadas), ...listaDeHerramientas(f?.escritas)])];
}

/**
 * De dónde sale una herramienta. Es lo que la pantalla enseña debajo de cada
 * casilla —«encendida porque conectaste tu Google Calendar»— y sin eso el
 * usuario ve casillas marcadas que él no marcó y no entiende nada.
 */
export function deDondeSale(clave: string, f: Fuentes | null | undefined): DeDondeSale {
  if (listaDeHerramientas(f?.marcadas).includes(clave)) return "marcada";
  if (listaDeHerramientas(f?.escritas).includes(clave)) return "del_prompt";
  if (listaDeHerramientas(f?.automaticas).includes(clave)) {
    return listaDeHerramientas(f?.apagadas).includes(clave) ? "apagada" : "automatica";
  }
  return "no";
}

/**
 * Cómo queda la lista de apagadas cuando alguien toca una casilla.
 *
 * ── POR QUÉ ESTO ES UNA FUNCIÓN Y NO CUATRO LÍNEAS EN EL FORMULARIO ───────
 *
 * Porque el caso que importa es el de volver a encender: si al marcar una
 * casilla no se QUITA de las apagadas, el negocio la marca, la guarda, y sigue
 * apagada. Lo vería como «esta pantalla no guarda» y no como «hay dos listas».
 */
export function apagadasDespuesDeGuardar(
  antes: string[] | null | undefined,
  automaticas: string[] | null | undefined,
  marcadasAhora: string[] | null | undefined,
): string[] {
  const auto = new Set(listaDeHerramientas(automaticas));
  const marcadas = new Set(listaDeHerramientas(marcadasAhora));

  // Lo que ya estaba apagado y NO se acaba de marcar sigue apagado, aunque hoy
  // no sea automática: un negocio que apagó la tienda y la vuelve a encender
  // dentro de un mes debe encontrarse su decisión intacta, no reactivada.
  const out = listaDeHerramientas(antes).filter((h) => !marcadas.has(h));

  // Y lo automático que NO viene marcado es que lo acaban de apagar.
  for (const h of auto) if (!marcadas.has(h) && !out.includes(h)) out.push(h);

  return out;
}
