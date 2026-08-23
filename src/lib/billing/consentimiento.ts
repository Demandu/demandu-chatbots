/**
 * El consentimiento de borrado, en su propio archivo A PROPÓSITO.
 *
 * Lo lee una pantalla del navegador, y si viviera junto al código de borrado
 * arrastraría al navegador todo lo que no le importa. Además tenerlo suelto
 * deja claro lo que es: no un texto de pantalla, sino lo que el cliente firma.
 */

/**
 * El texto que el cliente acepta. Se guarda TAL CUAL en el registro de la baja.
 *
 * No es una formalidad: si algún día hay una discusión, lo que vale es lo que
 * él leyó ese día, no lo que hoy diga la pantalla. Por eso se copia el texto
 * completo a la fila y no una referencia a una versión.
 */
export const CONSENTIMIENTO = [
  "Confirmo que quiero borrar los datos de mi cuenta en Demandu.",
  "",
  "Entiendo que se eliminan de forma permanente mis contactos, conversaciones, " +
    "chatbots, flujos, información de entrenamiento y la conexión con WhatsApp. " +
    "Esto no se puede deshacer y Demandu no conserva una copia.",
  "",
  "Demandu conserva únicamente mis registros de facturación, porque la ley lo exige.",
  "",
  "Entiendo que mi cuenta de WhatsApp Business en Meta es mía y sigue existiendo: " +
    "Demandu solo suelta la conexión con ella. Si quiero eliminarla, debo hacerlo " +
    "yo desde mi Meta Business Manager.",
  "",
  "Entiendo que hacer esta eliminación es decisión y responsabilidad mía.",
].join("\n");
