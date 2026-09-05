/**
 * El catálogo de acciones que un agente puede ejecutar, y cómo se escriben
 * dentro del prompt con «/».
 *
 * POR QUÉ EXISTE EL «/». Antes, para que la IA pudiera etiquetar había que
 * hacer DOS cosas en DOS sitios: escribir el criterio en el prompt y además
 * acordarse de encender la herramienta en otra pantalla. Nadie se acuerda. El
 * resultado real fue un prompt de dos páginas pidiéndole a la IA que
 * etiquetara y transfiriera, con CERO herramientas activadas: la IA solo podía
 * hablar, y no tenía forma de avisar de que no podía hacer nada de eso.
 *
 * Ahora el prompt es la única fuente: si escribes `/etiquetar`, la acción
 * queda activada. Lo que se lee es lo que hay.
 *
 * ESTE ARCHIVO ES DATO PURO — sin `server-only`, sin imports de servidor —
 * porque lo necesitan los dos lados: el editor, que corre en el navegador, y
 * el motor. Ya nos costó un despliegue entero aprender que la barrera de
 * `server-only` se hereda por la cadena de importaciones y tumba el build.
 */

export type Accion = {
  /** El nombre que se escribe tras la barra y el que conoce el motor. */
  clave: string;
  /** Cómo se llama para una persona. */
  nombre: string;
  /** Qué hace, en una línea. Sale en el desplegable del «/». */
  desc: string;
  /** Cuándo conviene usarla. Ayuda a escribir el prompt. */
  pista: string;
};

export const ACCIONES: Accion[] = [
  {
    clave: "etiquetar",
    nombre: "Etiquetar",
    desc: "Clasifica a la persona con una de tus etiquetas",
    pista: "Escribe justo después el criterio: «/etiquetar como lead-alto si su ingreso es 900 o más».",
  },
  {
    clave: "pasar_a_humano",
    nombre: "Pasar con una persona",
    desc: "Manda la conversación a tu equipo",
    pista: "Se reparte según tus reglas de Configuración → Reparto.",
  },
  {
    clave: "guardar_dato",
    nombre: "Guardar un dato",
    desc: "Anota algo en la ficha del lead",
    pista: "Solo puede guardar campos que existan en Configuración → Datos del lead.",
  },
  {
    clave: "ver_horarios",
    nombre: "Ver horarios",
    desc: "Consulta los huecos libres de tu agenda",
    pista: "Necesita Google Calendar conectado. Úsala siempre antes de agendar.",
  },
  {
    clave: "agendar_cita",
    nombre: "Agendar una cita",
    desc: "Reserva en tu calendario",
    pista: "Pídele que confirme la hora con la persona antes de reservar.",
  },
  {
    clave: "reagendar_cita",
    nombre: "Mover una cita",
    desc: "Cambia de hora la cita que ya tiene esa persona",
    pista:
      "Se enciende sola con tu agenda. No hace falta que la persona diga cuál cita: la plataforma " +
      "busca la suya.",
  },
  {
    clave: "cancelar_cita",
    nombre: "Cancelar una cita",
    desc: "Borra de tu calendario la cita de esa persona",
    pista:
      "Se enciende sola con tu agenda. El asistente pregunta antes de cancelar, y si lo que quiere " +
      "es cambiarla de hora usa «Mover una cita».",
  },
  {
    clave: "ver_catalogo",
    nombre: "Ver mi catálogo",
    desc: "Consulta los productos y precios de tu tienda",
    pista:
      "Sale de tu tienda de Demandu, no hay que escribir nada: lo oculto y lo agotado no lo enseña. " +
      "Úsala para que conteste «¿tienen X?» y «¿cuánto cuesta?» sin inventar.",
  },
  {
    clave: "estado_de_pedido",
    nombre: "Estado de un pedido",
    desc: "Le dice a la persona cómo va su pedido",
    pista: "Lo busca por su teléfono. Si le falta pagar, se lo dice — que es lo que necesita saber.",
  },
  {
    clave: "enlace_de_tienda",
    nombre: "Mandar mi tienda",
    desc: "Da el enlace de tu tienda para que pida",
    pista: "Úsala al final: primero que resuelva la duda, y luego el enlace para cerrar.",
  },
  {
    clave: "consultar_sistema",
    nombre: "Consultar tu sistema",
    desc: "Pregunta a una dirección tuya (inventario, precios…)",
    pista: "La dirección la pones tú en la configuración; el modelo nunca la elige.",
  },
];

export const CLAVES_DE_ACCION = ACCIONES.map((a) => a.clave);

/**
 * Las acciones que menciona un prompt.
 *
 * LA EXPRESIÓN ES DELIBERADAMENTE ESTRICTA. Un prompt de verdad lleva fechas
 * («12/09»), rutas y direcciones («https://…/algo»), y fracciones. Si
 * cualquier barra encendiera acciones, un cliente acabaría con herramientas
 * activadas que nunca pidió — y eso no es un detalle: son herramientas que
 * ESCRIBEN en la ficha de sus leads y transfieren conversaciones.
 *
 * Por eso se exige que la barra vaya al principio del texto o después de un
 * espacio o salto de línea, y que el nombre esté en el catálogo. `12/09` no
 * cuela porque va pegado a un número; `https://x/etiquetar` tampoco, porque la
 * barra va pegada a una letra.
 */
export function accionesDelPrompt(prompt: string | null | undefined): string[] {
  const texto = String(prompt ?? "");
  if (!texto) return [];

  const encontradas = new Set<string>();
  for (const m of texto.matchAll(/(^|[\s(])\/([a-z_]+)/gm)) {
    const clave = m[2];
    if (CLAVES_DE_ACCION.includes(clave)) encontradas.add(clave);
  }
  return [...encontradas];
}

/**
 * Quita de una respuesta los marcadores de acción que el modelo haya escrito.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PASÓ EN PRODUCCIÓN Y LE LLEGÓ A UN CLIENTE. Un prospecto pidió una demo por
 * Instagram y recibió esto tal cual:
 *
 *     «/guardar_dato nombre: Alex Molina
 *      /guardar_dato correo: the_alexmolina@icloud.com»
 *     «Perfecto, Alex. Voy a reservarte mañana a las 9 am.
 *      /agendar_cita hora: 9:00 AM fecha: mañana correo: …»
 *
 * La causa de fondo era que a esa ruta no se le armaban las herramientas, y ya
 * está arreglada. Pero la causa de fondo puede volver de otra forma —una
 * herramienta desactivada, un tope de IA alcanzado, un modelo que se despista—
 * y el resultado siempre es el mismo: el cliente ve las tripas del sistema.
 *
 * Así que esto es la segunda barrera, no la única. Se limpia SIEMPRE, incluso
 * cuando las herramientas funcionan: un marcador en el texto nunca es algo que
 * el cliente deba leer.
 *
 * NO SE TOCA NADA MÁS. Solo las líneas cuyo marcador está en el catálogo, y
 * solo desde la barra hasta el final de esa línea. Una fecha como `12/09` o un
 * enlace como `https://x/etiquetar` no llevan la barra al principio ni después
 * de un espacio, así que no se rozan — la misma regla estricta que
 * `accionesDelPrompt`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function sinMarcadores(texto: string | null | undefined): string {
  const t = String(texto ?? "");
  if (!t) return "";

  const limpio = t.replace(/(^|[\s(])\/([a-z_]+)([^\n]*)/gm, (todo, antes, clave) =>
    CLAVES_DE_ACCION.includes(clave) ? String(antes).replace(/[^\n]/g, "") : todo,
  );

  // Puede quedar una línea vacía donde estaba el marcador, o tres saltos
  // seguidos. Un mensaje que empieza con dos líneas en blanco se ve roto.
  return limpio.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
