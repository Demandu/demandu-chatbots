/**
 * ¿El bot acaba de PROMETER que va a intervenir una persona?
 *
 * POR QUÉ EXISTE ESTO. Un modelo con herramientas a veces NARRA la acción en
 * vez de ejecutarla: escribe «un asesor se va a comunicar contigo» y no llama a
 * `pasar_a_humano`. La conversación se queda abierta, sin dueño, y nadie del
 * equipo se entera. El lead espera a alguien que no va a llegar nunca.
 *
 * Es el peor fallo posible de un chatbot de ventas: no es que no ayude, es que
 * promete en nombre del negocio y el negocio no cumple.
 *
 * Así que el motor lee lo que el bot acaba de decir y, si prometió una persona
 * sin haber llamado a la herramienta, hace el pase igualmente. La promesa la
 * hizo el bot en nombre del cliente: se cumple.
 *
 * ES DELIBERADAMENTE ESTRECHO. Pasar una conversación a un humano que no hacía
 * falta cuesta el tiempo de un agente; no cumplir una promesa cuesta el lead.
 * Aun así, se exige que aparezca una PERSONA y un COMPROMISO — no basta con
 * mencionar a un asesor de pasada («si quieres, un asesor puede ayudarte»).
 *
 * Dato puro, sin imports: lo usan el motor de WhatsApp (que tiene su gemelo en
 * Deno), el canal web y las pruebas.
 */

/** Quién va a atender: persona del equipo, no el bot. */
const PERSONA =
  "(?:asesor|asesora|agente|ejecutivo|ejecutiva|vendedor|vendedora|" +
  "una\\s+persona|alguien\\s+del\\s+equipo|del\\s+equipo|compa[nñ]er[oa])";

/** El compromiso: alguien VA a hacer algo, no «podría». */
const COMPROMISO =
  "(?:se\\s+(?:va|van)\\s+a\\s+comunicar|se\\s+comunicar[aá]n?|te\\s+contactar[aá]n?|" +
  "lo\\s+contactar[aá]n?|la\\s+contactar[aá]n?|te\\s+escribir[aá]n?|te\\s+atender[aá]n?|" +
  "lo\\s+atender[aá]n?|la\\s+atender[aá]n?|te\\s+llamar[aá]n?|" +
  "en\\s+un\\s+momento\\s+te\\s+atiende|enseguida\\s+te\\s+atiende)";

/** «Te paso con…», que es un compromiso en primera persona. */
const YO_TE_PASO =
  "(?:te|le|lo|la)\\s+(?:paso|comunico|conecto|transfiero|derivo|enlazo)\\s+(?:con|a)\\b";

const PATRONES = [
  new RegExp(`${PERSONA}[^.!?\\n]{0,60}${COMPROMISO}`, "i"),
  new RegExp(`${COMPROMISO}[^.!?\\n]{0,60}${PERSONA}`, "i"),
  new RegExp(YO_TE_PASO, "i"),
];

/**
 * Frases que MENCIONAN a una persona sin prometer nada. Se miran primero: si
 * la frase es una oferta («¿quieres que te comunique con alguien?»), no hay
 * promesa que cumplir — la persona todavía no ha dicho que sí.
 */
const SOLO_OFRECE =
  /(?:\?|¿)|(?:quieres|querés|desea|deseas|gustar[íi]a|prefieres|te sirve|puedo)\b/i;

export function prometioUnaPersona(texto: string | null | undefined): boolean {
  const t = String(texto ?? "").trim();
  if (!t) return false;

  // Se mira frase a frase: un mensaje puede ofrecer algo Y prometer otra cosa,
  // y quedarse con el mensaje entero haría que una sola pregunta anulara la
  // promesa que va dos líneas más abajo.
  for (const frase of t.split(/(?<=[.!?\n])/)) {
    const f = frase.trim();
    if (!f || SOLO_OFRECE.test(f)) continue;
    if (PATRONES.some((p) => p.test(f))) return true;
  }
  return false;
}
