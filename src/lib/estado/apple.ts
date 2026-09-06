/**
 * Cuánto le queda al secreto de «Entrar con Apple».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIVE APARTE DE `servicios.ts` PORQUE ES PURO y ese archivo es `server-only`:
 * así se puede probar sin base de datos ni red, que es justo lo que hace falta
 * con algo que solo se equivoca en las fechas.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 *
 * Apple no permite que su secreto dure más de seis meses, y cuando caduca NADA
 * avisa: el botón «Continuar con Apple» sigue apareciendo, la pantalla de Apple
 * sigue saliendo, y el acceso falla en el último paso. Desde fuera parece que
 * se rompió la plataforma. Es de los fallos más caros de diagnosticar porque no
 * cambió nada — solo pasó el tiempo.
 *
 * NO SE MIRA EL SECRETO, SE MIRA UNA FECHA. El secreto es una llave y vive en
 * Supabase, que es quien lo usa; aquí solo hace falta saber cuándo caduca, y eso
 * es un dato público que se apunta al generarlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Con cuánta antelación conviene avisar. Un mes da tiempo de sobra. */
export const AVISO_APPLE_DIAS = 30;

/**
 * Días que faltan, o `null` si no hay una fecha que valga.
 *
 * SE COMPARA POR DÍA Y EN UTC. Con horas de por medio, «caduca hoy» daría a
 * veces 0 y a veces −1 según la hora a la que se abriera la pantalla, y un
 * tablero que cambia de color según cuándo lo mires no se lo cree nadie.
 */
export function diasParaElSecretoDeApple(
  fecha: string | null | undefined,
  ahora: Date = new Date(),
): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? "").trim());
  if (!m) return null;

  const cuando = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(cuando)) return null;

  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  return Math.round((cuando - hoy) / 86_400_000);
}

export type EstadoDeApple = { ok: boolean | null; detalle: string };

/**
 * Qué decir sobre el secreto de Apple.
 *
 * SIN FECHA NO SE PINTA VERDE. Es la regla de todo el tablero de estado: «no
 * pude medirlo» va en gris. Decir que está bien porque nadie apuntó la fecha es
 * exactamente la tranquilidad falsa que hay que evitar.
 */
export function comoEstaApple(fecha: string | null | undefined, ahora?: Date): EstadoDeApple {
  const dias = diasParaElSecretoDeApple(fecha, ahora);

  if (dias === null) {
    return {
      ok: null,
      detalle: "No sé cuándo caduca: falta APPLE_SECRETO_EXPIRA (la imprime scripts/apple-secreto.mjs)",
    };
  }
  if (dias < 0) {
    return { ok: false, detalle: `El secreto caducó hace ${-dias} días: el botón de Apple no funciona` };
  }
  if (dias <= AVISO_APPLE_DIAS) {
    return { ok: false, detalle: `Caduca en ${dias} días. Genera uno nuevo antes, o el acceso se cae` };
  }
  return { ok: true, detalle: `Le quedan ${dias} días` };
}
