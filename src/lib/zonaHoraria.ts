/**
 * EN QUÉ HORA ESTÁ ESTE NEGOCIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL FALLO QUE ESTO ARREGLA, CON NOMBRE Y FECHA. La columna `timezone` era
 * `not null default 'America/Mexico_City'`. O sea que la base NO PODÍA
 * REPRESENTAR «no sé dónde está este negocio»: todos nacían en Ciudad de
 * México, y ese mismo valor estaba escrito a mano como respaldo en diez sitios
 * más.
 *
 * Resultado real, 5 de septiembre de 2026: un negocio de Panamá con la zona de
 * México ofreciendo TODAS sus citas una hora corridas. El bot decía «09:00» y
 * el evento caía a las 10:00. Nadie lo vio, porque el síntoma —una cita a una
 * hora rara— no se parece en nada a la causa, y porque la pantalla enseñaba una
 * zona perfectamente plausible.
 *
 * La lección no es «faltaba dónde configurarlo»: la pantalla existía desde
 * hacía meses. Es que UNA RESPUESTA POR DEFECTO QUE PARECE CORRECTA ES PEOR QUE
 * NO TENER RESPUESTA. Sin estado «sin configurar», no hay nada que avisar.
 *
 * ── POR QUÉ NO SE PREGUNTA EL PAÍS ────────────────────────────────────────
 *
 * Porque un país no es una zona horaria. México tiene cuatro, Brasil cuatro,
 * Estados Unidos seis. Preguntar el país y traducirlo metería exactamente el
 * mismo tipo de error, y encima en los países donde más clientes hay.
 *
 * Se lee del NAVEGADOR de quien está configurando —`Intl` da la zona IANA
 * exacta, gratis y sin preguntar nada— y el teléfono es el segundo intento.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** De dónde salió la zona que tiene puesta un negocio. */
export type DeDondeSaleLaZona = "confirmada" | "navegador" | "guardada" | "telefono" | "ninguna";

/**
 * Prefijo telefónico → zona horaria.
 *
 * ── LOS PAÍSES DE VARIAS ZONAS LLEVAN LA DE SU CAPITAL, A PROPÓSITO ───────
 *
 * México tiene cuatro husos y aquí solo aparece el de Ciudad de México. No es
 * un descuido: es una SUPOSICIÓN, y por eso lo que se deduce del teléfono nunca
 * se da por confirmado. El negocio de Tijuana ve el aviso, lo corrige en un
 * clic, y a partir de ahí manda lo suyo.
 *
 * Estados Unidos y Canadá NO ESTÁN. Con seis husos y sin ninguno claramente
 * mayoritario, adivinar sería tirar una moneda — y una moneda con cara de
 * certeza es lo que causó todo esto.
 */
export const ZONA_POR_PREFIJO: Record<string, string> = {
  "507": "America/Panama",
  "506": "America/Costa_Rica",
  "503": "America/El_Salvador",
  "502": "America/Guatemala",
  "504": "America/Tegucigalpa",
  "505": "America/Managua",
  "51":  "America/Lima",
  "56":  "America/Santiago",
  "57":  "America/Bogota",
  "58":  "America/Caracas",
  "591": "America/La_Paz",
  "593": "America/Guayaquil",
  "595": "America/Asuncion",
  "598": "America/Montevideo",
  "54":  "America/Argentina/Buenos_Aires",
  "53":  "America/Havana",
  "1809": "America/Santo_Domingo",
  "1829": "America/Santo_Domingo",
  "1849": "America/Santo_Domingo",
  // De varias zonas: va la de la capital y NUNCA se da por confirmada.
  "52":  "America/Mexico_City",
  "55":  "America/Sao_Paulo",
  "34":  "Europe/Madrid",
};

/**
 * La zona que sugiere un número de teléfono.
 *
 * GANA EL PREFIJO MÁS LARGO. Sin eso, «1809…» (República Dominicana) entraría
 * por cualquier regla de un solo dígito y acabaría en la zona equivocada.
 */
export function zonaDelTelefono(
  telefono: string | null | undefined,
  // EL MAPA ENTRA POR PARÁMETRO PARA PODER PROBARLO. Hoy no hay dos prefijos
  // donde uno sea principio del otro, así que la regla del más largo no se
  // puede demostrar con los datos reales — y una regla que no se puede probar
  // es una regla que se rompe el día que alguien añada el «1» de Estados
  // Unidos junto al «1809» de República Dominicana.
  mapa: Record<string, string> = ZONA_POR_PREFIJO,
): string | null {
  const n = String(telefono ?? "").replace(/\D/g, "");
  if (!n) return null;

  let mejor: string | null = null;
  let largo = 0;
  for (const [prefijo, zona] of Object.entries(mapa)) {
    if (n.startsWith(prefijo) && prefijo.length > largo) {
      mejor = zona;
      largo = prefijo.length;
    }
  }
  return mejor;
}

/**
 * ¿Es una zona horaria que existe de verdad?
 *
 * Se le pregunta al propio motor de fechas en vez de llevar una lista: la lista
 * se quedaría vieja, y una zona inventada no falla al guardarse — falla al
 * formatear una hora, meses después, en el mensaje de un cliente.
 */
export function zonaValida(zona: string | null | undefined): boolean {
  const z = String(zona ?? "").trim();
  if (!z) return false;
  try {
    new Intl.DateTimeFormat("es-MX", { timeZone: z }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Cómo se lee una zona para una persona: «Panamá (GMT-5)».
 *
 * NADIE SABE QUÉ ES `America/Panama`. Poner eso en un aviso que pide confirmar
 * es pedirle a alguien que confirme una cadena de texto; poner «Panamá, ahora
 * son las 15:40» es enseñarle algo que puede mirar en su reloj y contestar en
 * un segundo.
 */
export function comoSeLee(zona: string | null | undefined, ahora = new Date()): string {
  const z = String(zona ?? "").trim();
  if (!zonaValida(z)) return "";

  const ciudad = (z.split("/").pop() ?? z).replace(/_/g, " ");
  const hora = new Intl.DateTimeFormat("es-MX", {
    timeZone: z, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(ahora);

  const partes = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "shortOffset" })
    .formatToParts(ahora);
  const desfase = partes.find((p) => p.type === "timeZoneName")?.value ?? "";

  return desfase ? `${ciudad} (${desfase}) — ahí son las ${hora}` : `${ciudad} — ahí son las ${hora}`;
}

/**
 * ¿Hay que pedirle al negocio que confirme su zona?
 *
 * ── SE PREGUNTA UNA VEZ Y NO SE VUELVE A MOLESTAR ─────────────────────────
 *
 * En cuanto dice «sí, es correcta», el aviso desaparece para siempre. Un aviso
 * que sigue apareciendo después de atenderlo se convierte en parte del decorado
 * y deja de leerse — y entonces tampoco sirve para el siguiente problema.
 *
 * Pero mientras NO la haya confirmado, se enseña aunque la zona parezca bien:
 * la de México parecía bien y estaba mal.
 */
export function hayQueConfirmar(confirmada: boolean | null | undefined): boolean {
  return confirmada !== true;
}

/**
 * Qué zona usar, y de dónde salió.
 *
 * El orden es: lo que el negocio confirmó · lo que dice su navegador · lo que
 * sugiere su teléfono · nada. Lo confirmado manda siempre — si no, el negocio
 * de Panamá que configura desde un viaje a Madrid se encontraría sus citas
 * mudadas a Europa.
 */
export function zonaQueManda(v: {
  guardada?: string | null;
  confirmada?: boolean | null;
  navegador?: string | null;
  telefono?: string | null;
}): { zona: string | null; de: DeDondeSaleLaZona } {
  const guardada = String(v.guardada ?? "").trim();
  if (v.confirmada === true && zonaValida(guardada)) return { zona: guardada, de: "confirmada" };

  const nav = String(v.navegador ?? "").trim();
  if (zonaValida(nav)) return { zona: nav, de: "navegador" };

  // La guardada sin confirmar vale más que el teléfono: alguien pudo ponerla a
  // mano y no haber vuelto a pasar por el aviso. Pero se dice que viene de ahí,
  // no del navegador — un aviso que miente sobre de dónde sacó el dato es peor
  // que uno que no lo dice.
  if (zonaValida(guardada)) return { zona: guardada, de: "guardada" };

  const delTel = zonaDelTelefono(v.telefono);
  if (delTel) return { zona: delTel, de: "telefono" };

  return { zona: null, de: "ninguna" };
}
