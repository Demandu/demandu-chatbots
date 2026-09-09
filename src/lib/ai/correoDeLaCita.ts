/**
 * DE QUÉ CORREO SE MANDA LA INVITACIÓN DE UNA CITA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 9 SEP 2026. Henma agendó por chat. La cita apareció en el calendario y NADIE
 * recibió nada: sin correo no hay invitado, y sin invitado Google no manda la
 * invitación. Después pidió cancelar, y tampoco le llegó el aviso de
 * cancelación — por la misma razón, no por otra.
 *
 * Hubo que poner el correo a mano y reenviar la confirmación desde Google.
 *
 * ── NO ES UN FALLO DEL MODELO ─────────────────────────────────────────────
 *
 * `correo` era opcional en la herramienta y el código hacía
 * `correoInvitado: args?.correo || undefined`. O sea: si no venía, se agendaba
 * igual. El modelo hizo lo que se le permitía.
 *
 * Y estaba escrito: «sin `correo` la cita se crea sin invitación y nadie se
 * entera». Se documentó el riesgo y no se puso el candado. Esto es el candado.
 *
 * ── UNA CITA SIN CORREO NO SE AGENDA ──────────────────────────────────────
 *
 * Se falla ANTES de tocar el calendario. Agendar y no avisar es peor que no
 * agendar: el negocio cree que tiene una reunión, la persona no sabe que existe,
 * y nadie se entera hasta que uno de los dos no aparece.
 *
 * Pedir el correo cuesta un mensaje.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type DeDondeSalio = "lo dijo ahora" | "ya estaba en su ficha";

export type CorreoDeLaCita =
  | { ok: true; correo: string; de: DeDondeSalio }
  | { ok: false; motivo: string };

/**
 * ¿Vale como correo?
 *
 * A propósito NO es la expresión regular exhaustiva del RFC. Lo que se protege
 * aquí es otra cosa: que el modelo pase «no tiene», «el mismo de antes» o el
 * nombre de la persona, y que eso viaje a Google como si fuera una dirección.
 * Google acepta basura sin quejarse y la invitación se pierde en el vacío.
 */
export function pareceUnCorreo(v: string | null | undefined): boolean {
  const t = String(v ?? "").trim();
  if (!t || /\s/.test(t)) return false;
  // Una sola arroba, algo a cada lado, y un punto con al menos dos letras
  // después en el dominio.
  return /^[^@]+@[^@.]+(\.[^@.]+)*\.[a-z]{2,}$/i.test(t);
}

/**
 * El correo con el que se agenda, y de dónde salió.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ORDEN NO ES CAPRICHOSO.
 *
 * 1. Lo que la persona acaba de decir en el chat. Manda sobre lo guardado: si
 *    dice «mándalo mejor a mi correo del trabajo», es ahí.
 * 2. Lo que ya está en su ficha. Quien escribió su correo hace un mes no tiene
 *    por qué repetirlo.
 *
 * Y si no hay ninguno, NO se agenda. Se devuelve qué pedirle, en palabras que
 * el modelo pueda usar tal cual.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function correoParaLaCita(v: {
  loDijoAhora?: string | null;
  enSuFicha?: string | null;
}): CorreoDeLaCita {
  const ahora = String(v.loDijoAhora ?? "").trim();
  if (ahora) {
    if (pareceUnCorreo(ahora)) return { ok: true, correo: ahora.toLowerCase(), de: "lo dijo ahora" };
    // Dio algo que no es un correo. Se pide otra vez, diciendo qué pasó — no se
    // cae en silencio a la ficha, porque acaba de pedir que sea ese.
    return {
      ok: false,
      motivo:
        "Ese correo no parece válido. Pídeselo otra vez, escrito completo " +
        "(por ejemplo: nombre@dominio.com). NO agendes todavía.",
    };
  }

  const ficha = String(v.enSuFicha ?? "").trim();
  if (pareceUnCorreo(ficha)) return { ok: true, correo: ficha.toLowerCase(), de: "ya estaba en su ficha" };

  return {
    ok: false,
    motivo:
      "Falta su correo y sin él no le llega la invitación. Pídeselo antes de agendar, " +
      "explicándole que es para mandarle la invitación de la reunión. NO agendes todavía.",
  };
}
