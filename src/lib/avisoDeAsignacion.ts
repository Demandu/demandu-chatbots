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

/**
 * QUÉ DICE EL AVISO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Te asignaron un chat» no dice nada de lo que hace falta saber: ¿quién me lo
 * pasó, y de quién es? Con tres agentes da igual; con ocho se convierte en
 * «¿quién me quitó mi chat?» — y la base SÍ guarda quién fue desde la 0118, así
 * que callarlo era desperdiciar el dato.
 *
 * SE DISTINGUE A LA MÁQUINA DE LA PERSONA, y no es un adorno: «Ana te pasó»
 * pide una respuesta a Ana; «se te asignó automáticamente» no. Que las dos
 * sonaran igual hacía que la gente buscara a quién contestarle y no encontrara
 * a nadie.
 *
 * Cuando no se sabe el nombre —el compañero ya no está en el equipo, o la
 * consulta falló— se dice «alguien del equipo» en vez de inventarse uno o
 * dejar la frase coja. Ver la cabecera de este archivo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function comoSeAnuncia(
  quienMePasa: string | null | undefined,
  deQuienEsElChat: string | null | undefined,
): { titulo: string; cuerpo: string } {
  const cliente = String(deQuienEsElChat ?? "").trim() || "un cliente";
  const quien = String(quienMePasa ?? "").trim();

  // Nulo o vacío = lo repartió la plataforma, no una persona.
  if (!quien) {
    return {
      titulo: "📥 Te asignaron un chat",
      cuerpo: `Se te asignó la conversación de ${cliente}.`,
    };
  }

  return {
    titulo: `📥 ${quien} te pasó un chat`,
    cuerpo: `${quien} te pasó la conversación de ${cliente}.`,
  };
}

/**
 * QUÉ SE VE EN LA CABECERA DEL CHAT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El aviso de `comoSeAnuncia` pasa y se va. La cabecera es lo que queda: quien
 * abre la conversación tres días después ve un desplegable con un nombre y
 * nada más, y no puede distinguir «me la pasó Ana» de «me la puso la máquina»
 * de «me la quedé yo». Sin ese rastro, reasignar es borrar: el chat cambia de
 * manos y no queda señal de que cambió.
 *
 * SE CALLA CUANDO NO APORTA. Si me la asigné yo mismo no hace falta contármelo,
 * y sin responsable el propio desplegable ya dice «Sin asignar». Una etiqueta
 * que sale siempre deja de leerse.
 *
 * NO SE INVENTA NADIE: si el nombre no se pudo averiguar —el compañero salió
 * del equipo— dice «alguien del equipo», igual que el aviso.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function rastroDeLaAsignacion(args: {
  /** `conversations.assignee_member_id` */
  responsable?: string | null;
  /** `conversations.asignada_por`: el usuario que la puso. Nulo = la plataforma. */
  asignadaPor?: string | null;
  /** Mi id de usuario (auth), para saber si fui yo. */
  miUserId?: string | null;
  /** Mi id de miembro del equipo, para saber si el chat es mío. */
  miMemberId?: string | null;
  /** Nombre de quien la pasó, si se pudo averiguar. */
  nombreDeQuienPaso?: string | null;
}): string | null {
  const responsable = String(args.responsable ?? "").trim();
  if (!responsable) return null;

  const porQuien = String(args.asignadaPor ?? "").trim();
  if (!porQuien) return "asignada automáticamente";

  const esMia = !!args.miMemberId && responsable === args.miMemberId;

  if (args.miUserId && porQuien === args.miUserId) {
    // Me la quedé yo: decírmelo no añade nada. Se la pasé a otro: sí.
    return esMia ? null : "la asignaste tú";
  }

  const nombre = String(args.nombreDeQuienPaso ?? "").trim() || "alguien del equipo";
  return esMia ? `te la pasó ${nombre}` : `la asignó ${nombre}`;
}
