import { BORRADOR_VACIO, type Borrador } from "./plantillas";

/**
 * LAS PLANTILLAS QUE LA PLATAFORMA NECESITA PARA FUNCIONAR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SON PLANTILLAS DEL CLIENTE: son piezas de la plataforma. El recordatorio de
 * una cita no lo escribe el negocio, lo manda Demandu en su nombre — así que
 * tiene que existir aprobada en SU cuenta de Meta antes de que la función sirva
 * para nada.
 *
 * Y aquí está lo que las hace distintas: **se envían solas**. Cuando un cliente
 * conecta su agenda, la plataforma manda esta plantilla a revisión de Meta sin
 * que él sepa que existe algo llamado «plantilla». Pedirle a un dentista que
 * entre al Administrador de WhatsApp, elija categoría «Utilidad» y escriba dos
 * botones con el texto exacto es pedirle que no use la función.
 *
 * ── SE DEFINE COMO UN `Borrador`, EL MISMO QUE USA LA PANTALLA ────────────
 *
 * No como un JSON de Meta a mano. Así pasa por el MISMO validador
 * (`revisar`) y el MISMO traductor (`aPlantillaDeMeta`) que las plantillas que
 * escribe un cliente. Dos caminos hacia Meta se separan; uno solo no puede.
 *
 * Hay una prueba que corre `revisar()` sobre esto: si alguien edita el texto y
 * lo deja como Meta lo rechazaría, se ve en la suite y no 24 horas después en
 * un correo de rechazo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Los botones, letra por letra. Los compara `recordatorio.ts` al recibirlos. */
export const BOTON_CONFIRMA = "Confirmo";
export const BOTON_CAMBIA = "Necesito cambiarla";

/**
 * El recordatorio de una cita.
 *
 * ── POR QUÉ «UTILITY» Y POR QUÉ IMPORTA ──────────────────────────────────
 *
 * Utilidad cuesta unos $0.004 por mensaje; promoción, unas seis veces más, y se
 * le puede desactivar al negocio si la gente la marca como no deseada. Un
 * recordatorio de una cita que la propia persona agendó ES utilidad — pero si el
 * texto vendiera algo, Meta lo recoloca a promoción por su cuenta y no avisa
 * hasta la factura. Por eso el cuerpo no ofrece nada: recuerda y pregunta.
 *
 * ── SIN ENCABEZADO NI PIE ─────────────────────────────────────────────────
 *
 * Un recordatorio se lee en dos segundos. Cada línea de más le resta, y el pie
 * empuja los botones fuera de la primera pantalla del teléfono.
 */
export const RECORDATORIO_CITA: Borrador = {
  ...BORRADOR_VACIO,
  nombre: "recordatorio_cita",
  idioma: "es_MX",
  categoria: "UTILITY",
  cuerpo:
    "Hola {{1}} 👋\n\n" +
    "Te recordamos tu cita con {{2}} {{3}}.\n\n" +
    "¿Nos confirmas que puedes asistir?",
  // Uno por variable y EN ORDEN. Es lo que lee el revisor de Meta, y un ejemplo
  // que no se parezca a lo real es motivo de rechazo.
  ejemplos: ["Henmary", "Paws at Home", "el jueves 11 de septiembre a las 3:00 p.m."],
  botones: [
    { tipo: "QUICK_REPLY", texto: BOTON_CONFIRMA },
    { tipo: "QUICK_REPLY", texto: BOTON_CAMBIA },
  ],
};

/** Todas las de la casa, por su clave interna. */
export const DE_LA_CASA: Record<string, Borrador> = {
  recordatorio_cita: RECORDATORIO_CITA,
};

/**
 * Qué plantillas hacen falta para una función.
 *
 * Se declara aquí y no en quien conecta la agenda: el día que el recordatorio
 * necesite una segunda plantilla —una para cancelaciones, por ejemplo— se añade
 * en esta línea y todos los caminos que activan agenda la mandan solos.
 */
export const PARA_LA_AGENDA: Borrador[] = [RECORDATORIO_CITA];
