/**
 * LOS CORREOS QUE ESCRIBE LA PLATAFORMA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTOS NO SON LOS DE SUPABASE, Y LA DIFERENCIA IMPORTA.
 *
 * Supabase manda tres: confirmar cuenta, recuperar contraseña e invitación. Los
 * dispara la autenticación, sus plantillas se pegan en su panel, y por eso
 * viven en `correos/*.html` y no aquí.
 *
 * Estos otros los decide la plataforma: la bienvenida cuando un negocio nace, y
 * lo que el equipo le escriba a un cliente desde el superadmin. Supabase no
 * sabe que existen y nunca los va a mandar.
 *
 * ── POR QUÉ ES UN MÓDULO PURO ─────────────────────────────────────────────
 *
 * Porque un correo es lo único del producto que NO SE PUEDE CORREGIR. Una
 * pantalla mal escrita se arregla y nadie se entera; un correo con el nombre
 * mal, un enlace roto o un hueco sin rellenar («Hola, {nombre}») ya está en la
 * bandeja de entrada de un cliente para siempre. Aquí se puede comprobar cada
 * texto sin mandar nada a nadie.
 *
 * ── TABLA Y ESTILOS EN LÍNEA, COMO LOS OTROS DOS ──────────────────────────
 *
 * Gmail borra las hojas de estilo y Outlook no entiende flex ni grid. Esto no
 * es HTML moderno mal escrito: es la única forma de que se vea igual en los dos
 * sitios donde la gente lee su correo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Correo = { asunto: string; html: string; texto: string };

/**
 * EL LOGO, Y POR QUÉ ES UNA IMAGEN Y UN TEXTO A LA VEZ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OUTLOOK BLOQUEA LAS IMÁGENES POR DEFECTO, y Gmail lo hace en cuanto el
 * remitente no es conocido. Un correo cuya cabecera es solo una imagen le llega
 * a mucha gente con un recuadro roto donde debería estar la marca — y un correo
 * sin marca que habla de tu cuenta se lee como phishing.
 *
 * Por eso el `alt` dice «Demandu» Y lleva los estilos del texto encima: cuando
 * la imagen no carga, el cliente de correo pinta el `alt` con esa tipografía y
 * ese color, y se ve exactamente el logotipo escrito que había antes. Con
 * imágenes se ve el logo; sin ellas, la palabra. Nunca un hueco.
 *
 * LA DIRECCIÓN ES ABSOLUTA Y NO PUEDE NO SERLO: un correo no tiene página desde
 * la que colgar una ruta relativa. Sale del dominio de la plataforma, que es
 * público y no pide sesión.
 *
 * OJO AL CAMBIAR EL DOMINIO: los correos ya enviados apuntan a la dirección
 * vieja. Si se apaga, la marca desaparece de todo el histórico que alguien
 * vuelva a abrir. Es una razón más para no mudar el dominio a la ligera.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const LOGO = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.demandu.tech").replace(/\/+$/, "")}/demandu-logo-white.png`;

/** Los colores del correo, que son los de la marca y no los del panel. */
const FONDO = "#0b0d1a";
const TARJETA = "#12142a";
const BLANCO = "#ffffff";
const GRIS = "#a9adc9";
const GRIS_2 = "#7a7f9e";
const ROSA = "#e0397f";

/**
 * El primer nombre, y solo el primero.
 *
 * «Hola, María José Rodríguez de la Guardia» no lo escribe nadie que conozca a
 * María. Es la misma regla que ya usa el aviso de pedido, dicha aquí otra vez
 * porque este archivo no puede depender de la tienda.
 */
export function primerNombre(entero: string | null | undefined): string {
  const t = String(entero ?? "").trim();
  // Un «nombre» que es en realidad un número —así se guarda un contacto sin
  // nombre— no es un nombre: mejor sin saludo que «Hola, 50761234567».
  if (!t || /^[\d+\s()-]+$/.test(t)) return "";
  return t.split(/\s+/)[0].slice(0, 40);
}

/**
 * El saludo, con o sin nombre.
 *
 * NO HAY HUECO VACÍO POSIBLE. «Hola, ,» es el error clásico de las plantillas
 * con variables, y se ve en la bandeja de entrada del cliente antes que en
 * ninguna otra parte.
 */
export function saludo(nombre: string | null | undefined): string {
  const n = primerNombre(nombre);
  return n ? `Hola, ${n}` : "Hola";
}

/** Escapa lo que viene de fuera. Un nombre con `<` no puede romper el correo. */
export function escapar(t: string | null | undefined): string {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── El armazón, una sola vez ──────────────────────────────────────────────── */

/**
 * La caja donde va cualquier correo nuestro.
 *
 * SE ESCRIBE UNA VEZ para que el de bienvenida y el que manda el equipo se vean
 * como el mismo remitente. Dos armazones parecidos acaban siendo dos marcas.
 */
export function armazon(v: { titulo: string; cuerpo: string; boton?: { texto: string; url: string } }): string {
  const boton = v.boton
    ? `<tr><td style="padding-bottom:24px;">
         <a href="${escapar(v.boton.url)}" style="display:inline-block;background:${ROSA};color:${BLANCO};font-size:15px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:12px;">${escapar(v.boton.texto)}</a>
       </td></tr>`
    : "";

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${FONDO};margin:0;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${TARJETA};border-radius:16px;padding:32px;">
      <tr><td style="padding-bottom:24px;">
        <img src="${LOGO}" width="140" alt="Demandu"
             style="display:block;border:0;outline:none;text-decoration:none;height:auto;font-size:22px;font-weight:800;color:${BLANCO};letter-spacing:-0.5px;" />
      </td></tr>
      <tr><td style="font-size:22px;font-weight:800;color:${BLANCO};padding-bottom:12px;line-height:1.3;">${escapar(v.titulo)}</td></tr>
      <tr><td style="font-size:15px;color:${GRIS};line-height:1.6;padding-bottom:24px;">${v.cuerpo}</td></tr>
      ${boton}
      <tr><td style="font-size:13px;color:${GRIS_2};line-height:1.6;border-top:1px solid #22254a;padding-top:18px;">
        Demandu · <a href="https://www.demandu.tech" style="color:${GRIS_2};">demandu.tech</a>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

/* ── Bienvenida ────────────────────────────────────────────────────────────── */

/**
 * EL TEXTO DE LA BIENVENIDA ES DATO, NO CÓDIGO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Estaba escrito aquí dentro. Cambiar una coma exigía tocar el repositorio,
 * pasar las pruebas y publicar — para un texto que se corrige leyéndolo. Ahora
 * vive en la base y se edita desde el superadmin.
 *
 * ESTO DE AQUÍ SIGUE SIENDO LA VERDAD DE RESPALDO. Si la fila no está, si
 * alguien vació un campo, o si la base no contesta, se manda ESTE texto. Un
 * correo de bienvenida en blanco es peor que uno viejo: el cliente abre y no
 * hay nada, y ya no se puede recoger.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type PlantillaBienvenida = {
  asunto: string;
  titulo: string;
  /** Texto llano. Una línea en blanco separa párrafos y `*así*` pone negrita. */
  cuerpo: string;
  boton: string;
};

export const BIENVENIDA_POR_DEFECTO: PlantillaBienvenida = {
  asunto: "{negocio} ya está en Demandu",
  titulo: "{negocio} ya está lista",
  cuerpo: [
    "{saludo}. Tu cuenta ya está creada para *{negocio}*.",
    "",
    "Falta una cosa para que empiece a contestar: *conectar tu WhatsApp*. Se hace desde el panel en un par de minutos y no hace falta instalar nada.",
    "",
    "Tienes *14 días de prueba*, sin tarjeta.",
  ].join("\n"),
  boton: "Conectar mi WhatsApp",
};

/** Los huecos que se pueden usar, con lo que significan. Para enseñarlos en la pantalla. */
export const HUECOS: { clave: string; explica: string }[] = [
  { clave: "{saludo}", explica: "«Hola, Darwin» — o solo «Hola» si no sabemos su nombre" },
  { clave: "{nombre}", explica: "El primer nombre a secas. Vacío si no lo tenemos" },
  { clave: "{negocio}", explica: "El nombre del negocio" },
];

/**
 * Rellenar los huecos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NINGÚN HUECO PUEDE QUEDARSE ABIERTO NI DEJAR UN AGUJERO. Los dos errores
 * clásicos de las plantillas son «Hola, {nombre}» —el hueco sin rellenar— y
 * «Hola, .» —el hueco relleno con nada—, y los dos se ven en la bandeja del
 * cliente antes que en ninguna prueba.
 *
 * Por eso: `{negocio}` sin valor NO se queda vacío, dice «tu negocio»; y
 * después de sustituir se barren las comas y los espacios que quedaron
 * colgando de un `{nombre}` vacío.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function rellenarHuecos(
  texto: string | null | undefined,
  v: { nombre?: string | null; negocio?: string | null },
): string {
  const negocio = String(v?.negocio ?? "").trim() || "tu negocio";
  const nombre = primerNombre(v?.nombre);

  const salida = String(texto ?? "")
    .replace(/\{saludo\}/g, saludo(v?.nombre))
    .replace(/\{negocio\}/g, negocio)
    .replace(/\{nombre\}/g, nombre)
    // Lo que dejó un `{nombre}` vacío: «Hola, .» → «Hola.», «para  y» → «para y».
    .replace(/,\s*([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();

  // Si el hueco iba al principio de la frase, «tu negocio ya está…» empieza en
  // minúscula. Se arregla aquí y no pidiéndole al que escribe que lo piense.
  return salida.charAt(0).toUpperCase() + salida.slice(1);
}

/**
 * El cuerpo escrito a mano, convertido en HTML.
 *
 * SE ESCAPA PRIMERO Y SE DA FORMATO DESPUÉS, y ese orden es toda la seguridad
 * de esta función: quien escribe el correo no puede meter HTML —ni queriendo ni
 * sin querer— en un mensaje que sale con nuestro nombre. Lo único que se
 * interpreta son dos cosas suyas: la línea en blanco separa párrafos y `*así*`
 * pone negrita.
 */
export function cuerpoEnHtml(texto: string | null | undefined): string {
  return escapar(String(texto ?? "").trim())
    .replace(/\*([^*\n]+)\*/g, `<b style="color:${BLANCO};">$1</b>`)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, "<br />"))
    .join("<br /><br />");
}

/**
 * Junta lo guardado con lo de por defecto, campo a campo.
 *
 * UN CAMPO VACÍO NO ES UNA ELECCIÓN, ES UN DESCUIDO. Si alguien borró el asunto
 * y guardó, mandar un correo sin asunto —llega como «(sin asunto)» y se lee
 * como spam— no es respetar su decisión: es obedecer un error. Se usa el de por
 * defecto y el correo sale entero.
 */
export function laPlantilla(guardada?: Partial<PlantillaBienvenida> | null): PlantillaBienvenida {
  const uno = (v: unknown, porDefecto: string) => {
    const t = String(v ?? "").trim();
    return t || porDefecto;
  };
  return {
    asunto: uno(guardada?.asunto, BIENVENIDA_POR_DEFECTO.asunto),
    titulo: uno(guardada?.titulo, BIENVENIDA_POR_DEFECTO.titulo),
    cuerpo: uno(guardada?.cuerpo, BIENVENIDA_POR_DEFECTO.cuerpo),
    boton: uno(guardada?.boton, BIENVENIDA_POR_DEFECTO.boton),
  };
}

/**
 * El correo que recibe un negocio recién creado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DICE QUÉ HACER, NO «GRACIAS POR REGISTRARTE».
 *
 * Un correo de bienvenida que solo saluda es un correo que nadie abre dos
 * veces. El momento en que alguien acaba de crear su cuenta es el único en que
 * va a hacer lo que le digas, y lo que hace falta que haga es UNA cosa:
 * conectar su WhatsApp. Sin eso la plataforma no le sirve de nada y no vuelve.
 *
 * NO SE PROMETE LO QUE NO HAY. Nada de «tu asistente ya está aprendiendo» ni
 * «configuramos todo por ti»: lo que hay al entrar es un panel donde conectar
 * un número, y eso es lo que se dice.
 *
 * ── ESTA FUNCIÓN SIGUE SIENDO PURA AUNQUE EL TEXTO VENGA DE LA BASE ───────
 *
 * La plantilla ENTRA por parámetro; aquí no se lee nada. Es lo que permite
 * comprobar cada texto —el de por defecto y el que alguien escriba mañana— sin
 * mandarle un correo a nadie. Un correo es lo único del producto que no se
 * puede corregir después.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function correoDeBienvenida(v: {
  nombre?: string | null;
  negocio?: string | null;
  /** A dónde lleva el botón. Se pasa para no fijar el dominio aquí dentro. */
  panel: string;
  /** Lo guardado en la base. Sin esto, el texto de por defecto. */
  plantilla?: Partial<PlantillaBienvenida> | null;
}): Correo {
  const p = laPlantilla(v.plantilla);
  const con = { nombre: v.nombre, negocio: v.negocio };

  const asunto = rellenarHuecos(p.asunto, con);
  const titulo = rellenarHuecos(p.titulo, con);
  const cuerpo = rellenarHuecos(p.cuerpo, con);
  const boton = rellenarHuecos(p.boton, con);

  // EL TEXTO PLANO SALE DEL MISMO SITIO QUE EL HTML. Si se escribiera aparte,
  // el día que alguien cambie el correo desde la pantalla cambiaría uno y no el
  // otro — y quien lea la versión de texto recibiría el mensaje de antes.
  const texto = [
    cuerpo.replace(/\*([^*\n]+)\*/g, "$1"),
    "",
    `Entrar: ${v.panel}`,
    "",
    "Demandu · demandu.tech",
  ].join("\n");

  return {
    asunto,
    html: armazon({
      titulo,
      cuerpo: cuerpoEnHtml(cuerpo),
      boton: { texto: boton, url: v.panel },
    }),
    texto,
  };
}

/* ── El correo que escribe una persona del equipo ──────────────────────────── */

/**
 * Lo que el superadmin le manda a un cliente.
 *
 * VA CON EL MISMO ARMAZÓN, y eso no es pereza: el cliente tiene que reconocer
 * de quién es antes de leerlo. Un correo suelto en texto plano desde una
 * dirección `no-reply` parece phishing — sobre todo si habla de su cuenta.
 *
 * EL TEXTO ES DE QUIEN LO ESCRIBE, no una plantilla con huecos. Aquí solo se
 * respeta lo que escribió: los saltos de línea se convierten en saltos de línea
 * y se escapa todo lo demás, para que nadie pueda meter HTML sin querer —ni
 * queriendo— en un correo que sale con nuestro nombre.
 */
export function correoDelEquipo(v: { asunto: string; mensaje: string }): Correo {
  const asunto = String(v.asunto ?? "").trim().slice(0, 200);
  const mensaje = String(v.mensaje ?? "").trim();

  return {
    asunto,
    html: armazon({
      titulo: asunto,
      cuerpo: escapar(mensaje).replace(/\n/g, "<br />"),
    }),
    texto: `${mensaje}\n\nDemandu · demandu.tech`,
  };
}

/**
 * ¿Se puede mandar esto?
 *
 * SE PREGUNTA ANTES DE ABRIR EL FORMULARIO DE ENVÍO, no después de pulsar.
 * Un correo sin asunto llega como «(sin asunto)» y se lee como spam; uno sin
 * cuerpo es peor: el cliente lo abre, no hay nada, y escribe preguntando qué
 * era. Los dos son irreversibles.
 */
export function loQueFaltaParaEscribir(v: { para?: string | null; asunto?: string | null; mensaje?: string | null }): string[] {
  const falta: string[] = [];
  const para = String(v?.para ?? "").trim();
  if (!para) falta.push("el correo de quien lo recibe");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) falta.push("un correo válido de destino");
  if (!String(v?.asunto ?? "").trim()) falta.push("el asunto");
  if (!String(v?.mensaje ?? "").trim()) falta.push("el mensaje");
  return falta;
}
