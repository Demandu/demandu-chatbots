/**
 * El tutorial de 30 segundos de cada bloque del constructor.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE. El panel del constructor ya tenía un botón «▶ Ver tutorial
 * (30 seg)» que NO HACÍA NADA — ni siquiera tenía un `onClick`. Y al lado, la
 * caja de «Lana explica» enseñaba la frase corta de una línea mientras el texto
 * bueno, escrito para los 28 componentes en `channels.ts`, era dato muerto que
 * nadie veía nunca.
 *
 * ── QUÉ ES UN TUTORIAL AQUÍ, Y QUÉ NO ─────────────────────────────────────
 *
 * NO ES UN VIDEO. Un video hay que grabarlo otra vez cada vez que cambia una
 * pantalla, y en una plataforma que se mueve todas las semanas eso significa
 * tener veintiocho videos desactualizados. Esto es texto, y se actualiza con el
 * mismo commit que cambia el bloque.
 *
 * SON TREINTA SEGUNDOS DE VERDAD: cuatro pasos como mucho y un ejemplo. Quien
 * abre esto está a mitad de armar un flujo y quiere volver a lo suyo. Un manual
 * de dos páginas no se lee, y no leerlo cuesta lo mismo que no tenerlo.
 *
 * ── LO QUE HACE QUE SIRVA: EL «OJO» ───────────────────────────────────────
 *
 * Cada tutorial termina con el fallo que de verdad comete la gente con ESE
 * bloque. No una advertencia genérica: la concreta, la que ya vimos pasar. Es
 * la parte que ahorra la llamada a soporte, y la que no está en ninguna
 * documentación de la competencia porque hay que haber visto romperse la cosa.
 *
 * ── LA REGLA DEL EJEMPLO ──────────────────────────────────────────────────
 *
 * El ejemplo es una CONVERSACIÓN, no una descripción. «Manda un texto» no
 * explica nada; ver el mensaje que le llega al cliente sí. Se escriben con
 * `bot:` y `cliente:` para poder pintarlos como un chat de verdad.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ComponentKey } from "@/lib/channels";

export type LineaDeEjemplo = { quien: "bot" | "cliente" | "nota"; texto: string };

export type Tutorial = {
  /** Para qué sirve, en una frase que empieza por un verbo. */
  para: string;
  /** Cómo se configura. Máximo cuatro: más no son treinta segundos. */
  pasos: string[];
  /** Cómo se ve en una conversación de verdad. */
  ejemplo: LineaDeEjemplo[];
  /** El fallo que de verdad comete la gente con este bloque. */
  ojo: string;
};

const bot = (texto: string): LineaDeEjemplo => ({ quien: "bot", texto });
const cliente = (texto: string): LineaDeEjemplo => ({ quien: "cliente", texto });
const nota = (texto: string): LineaDeEjemplo => ({ quien: "nota", texto });

export const TUTORIALES: Record<ComponentKey, Tutorial> = {
  message: {
    para: "Decirle algo a tu cliente.",
    pasos: [
      "Escribe el mensaje en «Mensaje».",
      "Usa {{nombre}} donde quieras que aparezca su nombre.",
      "Conéctalo al siguiente bloque arrastrando desde el punto de la derecha.",
    ],
    ejemplo: [
      bot("¡Hola Ana! Gracias por escribirnos 🐾"),
      nota("{{nombre}} se cambió por «Ana» solo."),
    ],
    ojo:
      "Si {{nombre}} viene vacío no queda «¡Hola !»: la plataforma limpia el hueco. Pero un " +
      "mensaje de cinco párrafos sí llega de cinco párrafos, y en WhatsApp eso no lo lee nadie.",
  },

  media: {
    para: "Mandar una foto, un video o un PDF.",
    pasos: [
      "Elige si es imagen, video o archivo.",
      "Pega la dirección del archivo, o súbelo.",
      "El «pie de foto» va debajo: ahí explica qué está viendo.",
    ],
    ejemplo: [
      bot("[imagen] menu-septiembre.jpg"),
      bot("Este es el menú de esta semana 👆"),
    ],
    ojo:
      "La dirección tiene que ser pública. Un enlace de Google Drive «solo para quien tenga el " +
      "enlace» le falla a WhatsApp y el cliente no recibe nada — y en la pantalla todo se ve bien.",
  },

  question: {
    para: "Preguntar un dato y guardarlo en la ficha del cliente.",
    pasos: [
      "Escribe la pregunta.",
      "En «Variable» pon dónde se guarda (por ejemplo: correo).",
      "Después puedes usarlo en cualquier mensaje como {{correo}}.",
    ],
    ejemplo: [
      bot("¿Cuál es tu correo? Te mando la cotización ahí."),
      cliente("ana@correo.com"),
      nota("Guardado en {{correo}} y visible en la ficha del contacto."),
    ],
    ojo:
      "El bloque acepta LO QUE SEA que escriban, incluido «no quiero dártelo». Si el dato tiene " +
      "que ser válido de verdad, pon una Condición después que lo revise.",
  },

  buttons: {
    para: "Dar opciones para tocar en vez de escribir.",
    pasos: [
      "Escribe el mensaje de arriba.",
      "Agrega una opción por cada camino.",
      "Conecta cada opción a su bloque: son salidas distintas.",
    ],
    ejemplo: [
      bot("¿Qué necesitas?"),
      bot("[ Ver productos ] [ Hablar con alguien ] [ Mi pedido ]"),
      cliente("Ver productos"),
    ],
    ojo:
      "WhatsApp solo deja TRES botones. Si pones más, Meta rechaza el mensaje entero y el cliente " +
      "no recibe nada. Para más opciones usa el bloque de tu catálogo, que sí admite una lista.",
  },

  condition: {
    para: "Que la conversación tome caminos distintos según lo que sabes del cliente.",
    pasos: [
      "Agrega una condición y elige qué dato se mira.",
      "Elige el operador (es igual a, contiene, es mayor que…).",
      "Conecta cada rama, y también «En caso contrario».",
    ],
    ejemplo: [
      nota("Si {{ciudad}} contiene «Panamá» → envío gratis"),
      nota("En caso contrario → cotizar envío"),
    ],
    ojo:
      "CONECTA SIEMPRE «En caso contrario». Es la salida que se usa cuando el dato viene vacío, y " +
      "viene vacío más veces de las que crees. Sin ella el bot se queda mudo.",
  },

  ai: {
    para: "Dejar que Lana conteste con la información de tu negocio.",
    pasos: [
      "Escribe en el prompt cómo tiene que hablar y qué puede decir.",
      "Escribe /etiquetar, /ver_catalogo, etc. para darle esas capacidades.",
      "Carga la información de tu negocio en Entrenamiento.",
    ],
    ejemplo: [
      cliente("tienen comida para cachorro?"),
      bot("Sí, tenemos tres opciones para cachorro: NutriSource Puppy a $15.34…"),
      nota("Consultó tu catálogo real antes de contestar."),
    ],
    ojo:
      "Sin /acciones en el prompt, Lana SOLO PUEDE HABLAR. Pedirle por escrito que etiquete o que " +
      "consulte precios no basta: si no está la barra, no tiene la herramienta y se lo inventa.",
  },

  delay: {
    para: "Hacer una pausa para que la conversación no se sienta de robot.",
    pasos: [
      "Pon cuánto y en qué unidad (segundos, minutos, horas).",
      "Hasta 5 segundos se siente como que está escribiendo.",
      "Más de eso, la conversación se duerme y sigue sola después.",
    ],
    ejemplo: [
      bot("Déjame revisar eso…"),
      nota("⏱ 3 segundos"),
      bot("Listo, sí lo tenemos disponible."),
    ],
    ojo:
      "Una espera larga NO es una alarma. Si pones 24 horas, el bot sigue 24 horas después aunque " +
      "el cliente ya haya escrito diez veces. Para retomar a alguien que se enfrió, usa una difusión.",
  },

  action: {
    para: "Avisarle a otro sistema tuyo que algo pasó.",
    pasos: [
      "Pega la dirección a la que hay que avisar.",
      "Elige qué datos se mandan.",
      "Conéctalo y sigue: no espera respuesta.",
    ],
    ejemplo: [
      nota("El cliente terminó el formulario"),
      nota("→ se avisa a tu CRM con su nombre y teléfono"),
      bot("¡Listo! Te contactamos hoy mismo."),
    ],
    ojo:
      "ESTE BLOQUE NO ESCUCHA LA RESPUESTA. Manda el aviso y sigue, pase lo que pase del otro " +
      "lado. Si necesitas usar lo que conteste el otro sistema, el bloque es «Acción API».",
  },

  api: {
    para: "Preguntarle algo a otro sistema y seguir por un camino u otro según conteste.",
    pasos: [
      "Pon la dirección y el método (GET o POST).",
      "Guarda lo que devuelva en variables para usarlo después.",
      "Conecta las tres salidas: éxito, error y otros.",
    ],
    ejemplo: [
      cliente("mi número de guía es 4471"),
      nota("→ se consulta tu sistema de envíos"),
      bot("Tu paquete salió ayer y llega mañana."),
    ],
    ojo:
      "CONECTA LA SALIDA DE ERROR. El día que tu sistema se caiga —y se va a caer— esa salida es " +
      "lo único que separa «te paso con una persona» de dejar al cliente hablando solo.",
  },

  calendar: {
    para: "Que el cliente agende una cita sin llamar a nadie.",
    pasos: [
      "Conecta Google Calendar en Configuración → Conexiones.",
      "Pon cuánto dura la cita.",
      "Elige de qué campos salen su nombre y su correo.",
    ],
    ejemplo: [
      bot("Tengo estos horarios:"),
      bot("[ Mar 10:00 ] [ Mar 15:30 ] [ Mié 09:00 ]"),
      cliente("Mar 15:30"),
      bot("Listo, te agendé el martes a las 3:30 pm. Te llegó la invitación."),
    ],
    ojo:
      "Revisa la ZONA HORARIA de tu negocio en Configuración. Con la zona mal, el bot ofrece horas " +
      "corridas y la gente llega a deshora — y el error no se ve en ninguna pantalla.",
  },

  tags: {
    para: "Marcar al contacto para poder buscarlo o mandarle cosas después.",
    pasos: [
      "Crea antes la etiqueta en Contactos → Etiquetas.",
      "Elige cuáles poner y cuáles quitar.",
      "Después puedes filtrar por ella y mandarle una difusión.",
    ],
    ejemplo: [
      cliente("¿Hacen envíos a Colón?"),
      nota("🏷 se etiqueta como «interesado-interior»"),
      nota("Después: difusión solo a ese grupo."),
    ],
    ojo:
      "Etiquetar es lo que hace que una difusión valga la pena. Un contacto sin etiquetas solo " +
      "sirve para mandarle a todos lo mismo, que es la forma más rápida de que te bloqueen.",
  },

  human: {
    para: "Pasarle la conversación a una persona de tu equipo.",
    pasos: [
      "Elige el equipo que atiende.",
      "Escribe qué decir si es fuera de horario.",
      "Conéctalo donde el bot ya no puede ayudar.",
    ],
    ejemplo: [
      cliente("quiero hablar con alguien"),
      bot("Claro, ya le avisé a nuestro equipo. Te responden en un momento 👋"),
      nota("La conversación aparece asignada en la Bandeja."),
    ],
    ojo:
      "PON EL MENSAJE DE FUERA DE HORARIO. Sin él, quien escribe un domingo a las 11 pm recibe " +
      "«te responden en un momento» y espera despierto. Eso enoja más que no contestar.",
  },

  assign: {
    para: "Repartir la conversación entre tu equipo según tus reglas.",
    pasos: [
      "Configura el reparto en Configuración → Reparto.",
      "Elige equipo o persona.",
      "El bloque respeta quién está disponible.",
    ],
    ejemplo: [
      nota("Etiqueta «ventas» → va al equipo de Ventas"),
      nota("Se le asigna a quien tenga menos chats abiertos."),
    ],
    ojo:
      "Si nadie está marcado como disponible, la conversación queda sin dueño y nadie recibe aviso. " +
      "Revisa que tu equipo se marque disponible al empezar el día.",
  },

  redirect: {
    para: "Saltar a otra de tus conversaciones automáticas.",
    pasos: [
      "Elige el chatbot destino.",
      "Ese flujo tiene que estar publicado y encendido.",
      "El cliente no nota nada: sigue la conversación.",
    ],
    ejemplo: [
      cliente("tengo un problema con mi pedido"),
      nota("→ salta al chatbot de Postventa"),
      bot("Cuéntame qué pasó con tu pedido."),
    ],
    ojo:
      "Si el flujo destino está en borrador, el salto no ocurre y el cliente se queda en silencio. " +
      "Publica el destino ANTES de conectar el salto.",
  },

  catalog: {
    para: "Enseñar productos del catálogo que subiste a Facebook.",
    pasos: [
      "Sube tu catálogo en Facebook Commerce Manager.",
      "Pega el ID del catálogo.",
      "Pon los códigos (SKU) de los productos a enseñar.",
    ],
    ejemplo: [
      bot("Estos son nuestros productos:"),
      bot("[ catálogo de Facebook con 3 productos ]"),
    ],
    ojo:
      "ESTE NO ES EL DE TU TIENDA DE DEMANDU. Son dos catálogos distintos: este vive en Facebook y " +
      "hay que mantenerlo aparte. Para tus productos de Demandu usa el bloque «Mis productos».",
  },

  payment: {
    para: "Mandarle un enlace de cobro que tú ya tienes.",
    pasos: [
      "Pega tu enlace de cobro (Stripe, Mercado Pago…).",
      "Pon el monto y la moneda.",
      "Conecta el siguiente paso.",
    ],
    ejemplo: [
      bot("Para confirmar tu reserva son $50."),
      bot("Paga aquí: pago.tuempresa.com/reserva"),
    ],
    ojo:
      "ESTE BLOQUE NO COBRA NI SE ENTERA SI PAGARON: solo manda el enlace. Si vendes productos, " +
      "usa tu tienda de Demandu, que sí registra el pago y te avisa.",
  },

  whatsapp_flow: {
    para: "Pedir varios datos en una sola pantalla de WhatsApp.",
    pasos: [
      "Crea el formulario en Chatbot → Formularios.",
      "Elige cuál usar y con qué pantalla empieza.",
      "Los datos llegan a la ficha del contacto.",
    ],
    ejemplo: [
      bot("[ Llenar mis datos ]"),
      nota("Se abre una pantalla dentro de WhatsApp con 4 campos."),
      cliente("(envía el formulario)"),
    ],
    ojo:
      "El formulario tiene que estar PUBLICADO en Meta, no en borrador. En borrador solo lo ves tú " +
      "desde tu propio número, y en las pruebas todo parece funcionar.",
  },

  call_permission: {
    para: "Pedir autorización para llamar al cliente por WhatsApp.",
    pasos: [
      "Escribe por qué quieres llamarlo.",
      "Conecta las dos salidas: aceptó y no aceptó.",
      "Si acepta, tu equipo puede llamarlo desde WhatsApp.",
    ],
    ejemplo: [
      bot("¿Nos autorizas a llamarte para explicarte las opciones?"),
      cliente("Sí"),
      nota("Tu equipo ya puede llamarlo desde WhatsApp."),
    ],
    ojo:
      "Meta solo deja pedirlo UNA VEZ AL DÍA y dos por semana por persona. Ponerlo al principio de " +
      "todos los flujos quema el permiso con gente que ni sabe todavía qué vendes.",
  },

  template: {
    para: "Escribirle primero a alguien fuera de las 24 horas.",
    pasos: [
      "Crea la plantilla en Chatbot → Plantillas y espera a que Meta la apruebe.",
      "Elige la plantilla y el idioma.",
      "Llena las variables en el orden en que salen.",
    ],
    ejemplo: [
      nota("Han pasado 3 días desde su última respuesta"),
      bot("Hola Ana, tu cotización sigue disponible hasta el viernes."),
    ],
    ojo:
      "Fuera de las 24 horas ESTA ES LA ÚNICA FORMA de escribir primero. Un bloque de Mensaje ahí " +
      "simplemente no llega, y ni el cliente ni tú se enteran de que no llegó.",
  },

  tienda: {
    para: "Mandar el enlace de tu tienda para que pidan.",
    pasos: [
      "No hace falta escribir la dirección: sale de tu tienda sola.",
      "Cambia el texto y la etiqueta del botón si quieres.",
      "Conecta las dos salidas: mandó, y no hay tienda.",
    ],
    ejemplo: [
      cliente("cómo hago un pedido?"),
      bot("Mira nuestro catálogo completo y haz tu pedido aquí 👇"),
      bot("[ Ver la tienda ]"),
    ],
    ojo:
      "Si tienes la tienda APAGADA, el bloque no manda nada y toma la otra salida. Conéctala a un " +
      "mensaje o a una persona: es lo que pasa en vacaciones y es cuando más importa contestar.",
  },

  tienda_pedir: {
    para: "Tomar el pedido completo hablando, y cobrarlo.",
    pasos: [
      "Escribe el saludo. Todo lo demás sale de tu tienda.",
      "Los productos, sus opciones y sus precios ya están ahí.",
      "El formulario de entrega es el mismo de tu tienda.",
      "Conecta las dos salidas: hizo el pedido, y no se pudo.",
    ],
    ejemplo: [
      bot("¿Qué te gustaría pedir?"),
      cliente("(toca Pizza mediana)"),
      bot("Pizza mediana — elige Masa"),
      cliente("(toca Delgada)"),
      bot("¿Cuántos te pongo?"),
      cliente("2"),
      bot("Llevas 2 cosas — $17.00\n¿Quieres agregar algo más?"),
      cliente("(toca Terminar pedido)"),
      bot("Dirección de entrega"),
      cliente("Calle 50, PH Mar del Sur, apto 12B"),
      bot("*Este es tu pedido:*\n• 2 × Pizza mediana (Delgada) — $17.00\n\n*Total: $17.00*\n\n¿Lo confirmo?"),
      cliente("(toca Sí, confirmar)"),
      bot("*Pedido #34*\n…\nDale clic para pagar con Yappy:\n(su enlace de pago)"),
      nota("El pedido te entra igual que uno de la tienda, con su número y su cobro."),
    ],
    ojo:
      "No te pregunta el teléfono: ya lo sabe, porque te está escribiendo desde él. Y los productos " +
      "con demasiadas opciones para el chat —«elige 3 rellenos de 18»— no se arman aquí: el bot manda " +
      "su página de la tienda ya abierta en ese producto. Es a propósito; preguntar eso por chat son " +
      "seis mensajes y ahí se cae el pedido.",
  },

  tienda_catalogo: {
    para: "Enseñar tus productos dentro de la conversación.",
    pasos: [
      "Salen de tu tienda: no hay que escribir nada.",
      "Cambia el texto del menú si quieres.",
      "Conecta las dos salidas: eligió, y no eligió.",
    ],
    ejemplo: [
      bot("Estos son nuestros productos:"),
      bot("[ lista: NutriSource $7.50 · Royal Canin $15.34 · … ]"),
      cliente("(toca NutriSource)"),
    ],
    ojo:
      "WhatsApp solo enseña 10 a la vez, así que con más productos aparece «Ver más». Lo que " +
      "tengas OCULTO o AGOTADO no se enseña: así nadie pide algo que no le puedes vender.",
  },

  tienda_pedido: {
    para: "Contestar «¿dónde va mi pedido?» sin molestar a nadie.",
    pasos: [
      "Lo busca por su teléfono: no hay que pedirle nada.",
      "Escribe qué decir si no tiene ningún pedido.",
      "Conecta las dos salidas: tiene, y no tiene.",
    ],
    ejemplo: [
      cliente("dónde va mi pedido?"),
      bot("Tu pedido #7 de $19.50 va en camino 🚚"),
    ],
    ojo:
      "Si le falta pagar, el bot se lo dice en vez de decir «lo estamos preparando». Es a propósito: " +
      "aquí se cobra antes de preparar, y esa es la información que de verdad necesita.",
  },

  ig_story: {
    para: "Contestar a quien responde o menciona tu historia de Instagram.",
    pasos: [
      "Elige si responde a menciones, a respuestas, o a las dos.",
      "Escribe el mensaje de bienvenida.",
      "Solo funciona en chatbots de Instagram.",
    ],
    ejemplo: [
      nota("Alguien responde tu historia con 🔥"),
      bot("¡Gracias por ver la historia! ¿Te cuento de la promo?"),
    ],
    ojo:
      "Tu cuenta tiene que ser de empresa o creador y estar conectada. Con una cuenta personal " +
      "Instagram no manda nada y el flujo nunca se dispara.",
  },

  ig_comment: {
    para: "Contestar comentarios de Instagram y seguir por privado.",
    pasos: [
      "Elige la publicación (o todas).",
      "Escribe la respuesta pública y la del privado.",
      "Marca si solo contesta una vez por persona.",
    ],
    ejemplo: [
      cliente("(comenta) precio?"),
      bot("(en el comentario) ¡Te escribí por privado! 💬"),
      bot("(en el DM) Hola, cuesta $35.49 con envío incluido."),
    ],
    ojo:
      "El privado solo llega si esa persona TE PUEDE RECIBIR mensajes. A quien nunca te ha escrito " +
      "y tiene los mensajes cerrados no le llega nada, aunque el comentario sí se conteste.",
  },

  ig_dm: {
    para: "Mandar un mensaje directo de Instagram.",
    pasos: [
      "Escribe el mensaje.",
      "Conéctalo dentro de un flujo de Instagram.",
    ],
    ejemplo: [bot("¡Hola! Vi que te interesó la promo, te cuento 👇")],
    ojo:
      "Instagram también tiene ventana de 24 horas. Pasado ese rato desde su último mensaje, lo que " +
      "mandes no llega.",
  },

  fb_comment: {
    para: "Contestar comentarios de Facebook y seguir por privado.",
    pasos: [
      "Elige la publicación.",
      "Escribe la respuesta pública y la del privado.",
      "Solo funciona en chatbots de Messenger.",
    ],
    ejemplo: [
      cliente("(comenta) info?"),
      bot("(en el comentario) ¡Te mandamos la info por mensaje!"),
    ],
    ojo:
      "La página tiene que estar conectada con los permisos de comentarios. Si se conectó solo para " +
      "mensajes, el bloque no ve los comentarios y no pasa nada.",
  },

  web_form: {
    para: "Capturar datos en el chat de tu sitio web.",
    pasos: [
      "Elige qué campos pedir.",
      "Solo funciona en el chat de tu sitio.",
      "Los datos llegan a la ficha del contacto.",
    ],
    ejemplo: [
      bot("Déjanos tus datos y te contactamos:"),
      nota("[ Nombre ] [ Correo ] [ Teléfono ]"),
    ],
    ojo:
      "En WhatsApp este bloque no hace nada. Si tu chatbot es de WhatsApp, usa «Pregunta» o el " +
      "formulario de WhatsApp.",
  },

  end: {
    para: "Cerrar la conversación.",
    pasos: [
      "Elige en qué estado queda la conversación.",
      "Marca si se reabre cuando el cliente vuelva a escribir.",
      "Conéctalo al final de cada camino.",
    ],
    ejemplo: [
      bot("¡Gracias por escribirnos! Aquí estamos para lo que necesites 👋"),
      nota("La conversación queda cerrada en la Bandeja."),
    ],
    ojo:
      "DEJA MARCADO «se reabre al escribir». Sin eso, quien vuelva mañana con una duda escribe a un " +
      "chat cerrado y nadie ve su mensaje.",
  },
};

/** El tutorial de un bloque, o `null` si ese bloque no tiene (no debería pasar). */
export function tutorialDe(clave: string): Tutorial | null {
  return (TUTORIALES as Record<string, Tutorial>)[clave] ?? null;
}
