/**
 * ¿HAY QUE AVISAR DE QUE ME ASIGNARON ESTE CHAT?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Aquí solo vive la DECISIÓN, sin React ni base de datos, para poder probarla.
 * Quien pregunta es `NotificationsWatcher`.
 *
 * 9 SEP 2026. La plataforma avisaba de mensajes nuevos y de solicitudes de
 * persona, y de nada más. Que a alguien le pusieran una conversación encima no
 * avisaba a nadie — ni con la pestaña abierta. Ver la migración 0118.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Asignacion = {
  /** Cuándo se puso al responsable actual. Lo escribe el trigger de la 0118. */
  assigned_at?: string | null;
  /** Quién lo puso. Nulo = la plataforma (reparto automático o cola). */
  asignada_por?: string | null;
};

export type QueHacer = {
  /** Sacar el aviso: tono, tarjeta y, si no está mirando, aviso de escritorio. */
  avisar: boolean;
  /** La marca que hay que recordar para la siguiente vuelta. */
  marca: number | null;
};

/**
 * @param ultima  La última conversación asignada a esta persona, o nada.
 * @param miUserId  Quién soy. `null` si no se pudo averiguar.
 * @param visto  La marca de la vuelta anterior. `null` = primera vuelta.
 */
export function queHacerConLaAsignacion(
  ultima: Asignacion | null | undefined,
  miUserId: string | null,
  visto: number | null,
): QueHacer {
  const t = Date.parse(String(ultima?.assigned_at ?? ""));
  const marca = Number.isFinite(t) ? t : null;

  // Sin nada asignado no hay nada que recordar ni que decir.
  if (marca === null) return { avisar: false, marca: visto };

  /* LA PRIMERA VUELTA SOLO TOMA LA FOTO. Sin esto, abrir la plataforma sacaría
   * un aviso por una conversación que uno tiene desde el martes — y el primer
   * aviso que sobra es el que hace que se apaguen todos. */
  if (visto === null) return { avisar: false, marca };

  if (marca <= visto) return { avisar: false, marca: visto };

  /* SE APUNTA LA MARCA AUNQUE NO SE AVISE. Si me la asigné yo mismo no quiero
   * el aviso, pero sí quiero que la siguiente vuelta sepa que esto ya pasó:
   * dejándola atrás, el aviso saltaría en cuanto cambiara cualquier otra cosa. */
  const meLaPuseYo = !!miUserId && ultima?.asignada_por === miUserId;
  return { avisar: !meLaPuseYo, marca };
}
