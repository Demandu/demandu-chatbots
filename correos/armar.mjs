/**
 * Genera las plantillas de correo de Supabase Auth con la marca de Demandu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ARMAZON SE ESCRIBE UNA VEZ, AQUI.
 *
 * Son seis correos que tienen que parecer el mismo producto. Escribirlos a mano
 * uno por uno es garantizar que el dia que cambie el logo, el color o el pie,
 * cambien cinco y se quede uno atras — y nadie echa de menos un correo que no
 * sabe que existe. Este archivo arma los seis del mismo molde: el molde esta
 * una sola vez y lo que cambia por correo es SOLO el texto.
 *
 * Es el mismo principio que ya sigue src/lib/correo/plantillas.ts con la
 * bienvenida: «el armazon NO se edita».
 *
 * ── POR QUE TABLAS Y ESTILOS EN LINEA, EN 2026 ────────────────────────────
 *
 * Porque Gmail borra las hojas de estilo cuando recorta un correo largo o
 * cuando se reenvia, y Outlook de escritorio pinta con el motor de Word: no
 * entiende flex, ni grid, ni esquinas redondeadas en una tabla, ni los
 * degradados. Un correo maquetado como una pagina web se ve roto justo en los
 * dos clientes donde esta la gente que paga.
 *
 * ── LOS COLORES SALEN DEL TEMA OSCURO DE LA PLATAFORMA ────────────────────
 *
 * No son colores nuevos inventados para el correo: son los mismos tokens que
 * tema-claro-oscuro.md fija para el modo oscuro, mas el rosa y el violeta de
 * identidad. Asi el correo y la pantalla a la que lleva son el mismo sitio.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── La marca ────────────────────────────────────────────────────────────────
const C = {
  /* EL AZUL SALE DEL LOGO, NO DEL TEMA DE LA PANTALLA.
     Se midio pixel a pixel sobre el lockup oficial sobre fondo azul: #00043C.
     El tema oscuro del panel usa #0a0a28, que es PARECIDO pero no el mismo — y
     en un correo eso se nota, porque el logo va encima: medio tono de
     diferencia dibuja un rectangulo alrededor del logotipo. Aqui manda la
     marca. */
  fondo: "#00043C", // el azul del logo
  tarjeta: "#0A0E4F", // la tarjeta, un escalon por encima
  suave: "#141A66", // la caja del aviso
  linea: "#2A3185", // bordes
  ink: "#FFFFFF", // titulos
  ink2: "#B9BDEA", // cuerpo      — 9.7:1 sobre la tarjeta
  ink3: "#8086C4", // apoyo       — 5.2:1 sobre la tarjeta
  pie: "#6B71B0",
  rosa: "#F64A97",
  violeta: "#6E42FF",
  /* EL COLOR MACIZO DEL BOTON NO ES UN ADORNO: Outlook ignora el degradado y
     pinta el color de fondo macizo. Sin este valor el boton saldria
     transparente con texto blanco encima — invisible. Es el punto medio exacto
     entre el rosa y el violeta, asi que en Outlook el boton se ve de la marca,
     no de otro color. */
  macizo: "#A93F8E",
};

const SITIO = "https://platform.demandu.tech";
/* EL LOGO DEL CORREO ES SU PROPIO ARCHIVO, Y TIENE QUE ESTAR PUBLICADO.
   Es el lockup oficial (marca rosa + logotipo blanco + bajada), recortado al
   contenido y exportado a 570px = tres veces los 190px a los que se ve, para
   que no salga borroso en pantallas retina. Un correo no puede llevar la
   imagen dentro: la direccion es absoluta, asi que hasta que no se publique
   public/demandu-correo.png el correo ensena el texto alternativo. */
const LOGO = SITIO + "/demandu-correo.png";
const LOGO_ANCHO = 190;
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Relleno invisible para que la bandeja no siga leyendo el HTML de abajo. */
const RELLENO = "&#8203;".repeat(30);

/** Resalta en blanco dentro de un parrafo gris. */
const b = (t) => '<b style="color:' + C.ink + ';">' + t + "</b>";

/**
 * El molde.
 *
 * preheader = el texto gris que Gmail y Mail ensenan al lado del asunto en la
 * bandeja. Si no se pone, el cliente de correo coge las primeras palabras del
 * cuerpo — y lo primero del cuerpo es el texto alternativo del logo, asi que la
 * bandeja decia «Demandu Demandu». Lo ponen asi Stripe, Apple y Notion.
 *
 * accion = el bloque del medio. Casi siempre un boton; en el correo del codigo
 * es una caja con el numero. Entra ya armado desde fuera para que el molde no
 * tenga que saber de los dos casos.
 */
function armar(v) {
  const parrafos = v.parrafos
    .map(
      (p) =>
        '<tr><td style="font-size:15px;line-height:1.65;color:' +
        C.ink2 +
        ';padding-bottom:16px;mso-line-height-rule:exactly;">' +
        p +
        "</td></tr>",
    )
    .join("\n                  ");

  const etiqueta = v.etiqueta
    ? '<tr><td style="font-family:' +
      F +
      ";font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:" +
      C.rosa +
      ';padding-bottom:10px;">' +
      v.etiqueta +
      "</td></tr>"
    : "";

  const caduca = v.caduca
    ? '<tr><td style="background:' +
      C.suave +
      ";border-radius:12px;padding:14px 16px;font-family:" +
      F +
      ";font-size:13px;line-height:1.6;color:" +
      C.ink2 +
      ';">' +
      v.caduca +
      '</td></tr>\n              <tr><td style="height:22px;line-height:22px;font-size:0;">&nbsp;</td></tr>'
    : "";

  /* ── LO QUE CAMBIO, EN UNA TABLITA ────────────────────────────────────────
   *
   * Los avisos de seguridad no llevan nada que pulsar: no hay token, no hay
   * enlace de un solo uso. Lo unico que tienen que contestar es «que cambio
   * exactamente», y eso en un parrafo se lee mal. En dos columnas se lee de un
   * vistazo: de que a que.
   *
   * Si no hay nada que ensenar (el aviso de contrasena cambiada no trae ningun
   * dato), no se pinta la caja en vez de pintar una vacia. */
  const detalles = v.detalles && v.detalles.length
    ? '<tr><td style="padding-bottom:22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' +
      C.suave +
      ";border:1px solid " +
      C.linea +
      ';border-radius:12px;">' +
      v.detalles
        .map(
          ([etiqueta, valor], i) =>
            '<tr><td style="padding:' +
            (i === 0 ? "14px" : "0") +
            ' 16px 6px;font-family:' +
            F +
            ";font-size:11px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:" +
            C.ink3 +
            ';">' +
            etiqueta +
            '</td></tr><tr><td style="padding:0 16px ' +
            (i === v.detalles.length - 1 ? "14px" : "12px") +
            ";font-family:" +
            F +
            ";font-size:15px;font-weight:600;color:" +
            C.ink +
            ';word-break:break-all;">' +
            valor +
            "</td></tr>",
        )
        .join("") +
      "</table></td></tr>"
    : "";

  /* LA DIRECCION A MANO NO ES RELLENO: hay correos corporativos que reescriben
     los enlaces y los rompen, y gente que lee el correo en un aparato y entra
     en otro. Sin esto, ahi se acaba el camino. En el correo del codigo no hay
     enlace que copiar, asi que no se pinta. */
  const aMano = v.enlace
    ? '<tr><td style="font-family:' +
      F +
      ";font-size:12px;line-height:1.6;color:" +
      C.ink3 +
      ';padding-bottom:22px;">' +
      "&iquest;No funciona el bot&oacute;n? Copia y pega esta direcci&oacute;n en tu navegador:<br />" +
      '<span style="color:' +
      C.ink2 +
      ';word-break:break-all;">' +
      v.enlace +
      "</span></td></tr>"
    : "";

  return `<!--
  ${v.titulo}

  Se pega TAL CUAL en Supabase -> Authentication -> Emails.
  Generado por correos/armar.mjs. NO se edita a mano: se edita el generador y se
  vuelve a correr, o los seis correos dejan de parecerse entre si.
-->
<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<!-- El diseno YA es oscuro. Sin esto, el modo oscuro de Gmail y de Outlook lo
     invierte por su cuenta: fondo claro con texto gris claro encima, ilegible. -->
<meta name="color-scheme" content="dark light" />
<meta name="supported-color-schemes" content="dark light" />
<title>${v.titulo}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.fondo};">

<!-- El texto que se ve en la bandeja de entrada, oculto dentro del correo. -->
<div style="display:none;font-size:1px;color:${C.fondo};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${v.preheader}${RELLENO}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <tr>
          <td style="padding-bottom:24px;">
            <!-- El logo va como imagen con texto alternativo, y ese texto lleva
                 encima los estilos del logotipo: Outlook bloquea las imagenes
                 por defecto y Gmail lo hace con remitentes nuevos. Con imagenes
                 se ve el logo; sin ellas, la palabra Demandu en su tipografia.
                 Nunca un recuadro roto. -->
            <img src="${LOGO}" width="${LOGO_ANCHO}" alt="Demandu &middot; Tecnolog&iacute;a conversacional"
                 style="display:block;border:0;outline:none;text-decoration:none;width:${LOGO_ANCHO}px;max-width:${LOGO_ANCHO}px;height:auto;font-family:${F};font-size:21px;font-weight:800;color:#ffffff;letter-spacing:-0.6px;" />
          </td>
        </tr>

        <tr>
          <td style="background:${C.tarjeta};border:1px solid ${C.linea};border-radius:18px;padding:36px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              ${etiqueta}
              <tr>
                <td style="font-family:${F};font-size:25px;font-weight:800;line-height:1.25;letter-spacing:-0.6px;color:${C.ink};padding-bottom:14px;mso-line-height-rule:exactly;">
                  ${v.titulo}
                </td>
              </tr>

              <tr><td style="font-family:${F};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${parrafos}
                </table>
              </td></tr>

              ${detalles}
              <tr>
                <td style="padding-top:8px;padding-bottom:26px;">
                  ${v.accion}
                </td>
              </tr>

              ${caduca}
              ${aMano}
              <tr>
                <td style="border-top:1px solid ${C.linea};padding-top:20px;font-family:${F};font-size:13px;line-height:1.65;color:${C.ink3};">
                  ${v.seguridad}
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding-top:22px;font-family:${F};font-size:12px;line-height:1.7;color:${C.ink3};">
            <a href="${SITIO}" style="color:${C.ink2};text-decoration:none;font-weight:600;">Demandu</a>
            &nbsp;&middot;&nbsp; Meta Business Partner &nbsp;&middot;&nbsp; WhatsApp Business Platform
            <br />
            <span style="color:${C.pie};">Este correo se envi&oacute; porque hay una cuenta de Demandu con esta direcci&oacute;n.</span>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
}

/**
 * El boton.
 *
 * Outlook de escritorio no sabe pintar esquinas redondeadas ni un degradado en
 * un enlace, asi que ahi va una pieza de VML: un rectangulo redondeado con el
 * color macizo y el texto dentro. El resto de clientes no ven el VML y usan el
 * enlace normal. Es el unico sitio del correo donde hay dos versiones de lo
 * mismo, y es por Outlook.
 */
function boton(texto, enlace) {
  return [
    "<!--[if mso]>",
    '                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"',
    '                               href="' +
      enlace +
      '" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="24%" stroke="f" fillcolor="' +
      C.macizo +
      '">',
    "                    <w:anchorlock/>",
    '                    <center style="color:#ffffff;font-family:' +
      F +
      ';font-size:15px;font-weight:700;">' +
      texto +
      "</center>",
    "                  </v:roundrect>",
    "                  <![endif]-->",
    "                  <!--[if !mso]><!-- -->",
    '                  <a href="' + enlace + '"',
    '                     style="display:inline-block;font-family:' +
      F +
      ";font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;padding:15px 32px;border-radius:12px;background-color:" +
      C.macizo +
      ";background-image:linear-gradient(120deg," +
      C.rosa +
      " 0%," +
      C.violeta +
      ' 100%);">',
    "                    " + texto,
    "                  </a>",
    "                  <!--<![endif]-->",
  ].join("\n");
}

/** La caja del codigo, para el correo que no lleva enlace. */
function cajaDeCodigo(hueco) {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="background:' +
    C.suave +
    ";border:1px solid " +
    C.linea +
    ";border-radius:14px;padding:18px 30px;font-family:" +
    F +
    ";font-size:30px;font-weight:800;letter-spacing:7px;color:" +
    C.ink +
    ';">' +
    hueco +
    "</td></tr></table>"
  );
}

/* ── LOS SEIS CORREOS ────────────────────────────────────────────────────────
 *
 * Las variables entre llaves las rellena Supabase al enviar y SON DISTINTAS en
 * cada plantilla. Poner ConfirmationURL en la de reautenticacion, por ejemplo,
 * manda un correo con un boton que no lleva a ninguna parte: ahi Supabase solo
 * rellena Token, un codigo que la persona teclea.
 * ──────────────────────────────────────────────────────────────────────────── */
const URL_CONF = "{{ .ConfirmationURL }}";

const CORREOS = {
  "confirmar-cuenta.html": {
    preheader: "Confirma tu correo y tu plataforma queda lista.",
    etiqueta: "Bienvenido",
    titulo: "Confirma tu correo",
    parrafos: [
      "Ya casi. Confirma que esta direcci&oacute;n es tuya y tu plataforma queda lista para conectar WhatsApp y empezar a atender.",
      "Es el &uacute;ltimo paso del registro.",
    ],
    accion: boton("Confirmar mi correo", URL_CONF),
    enlace: URL_CONF,
    caduca:
      "El enlace caduca en " +
      b("24 horas") +
      ". Si se te pasa, vuelve a registrarte con el mismo correo y te mandamos otro.",
    seguridad:
      "Si no creaste ninguna cuenta en Demandu, puedes ignorar este correo: sin confirmar, la cuenta no se activa.",
  },

  "recuperar-contrasena.html": {
    preheader: "Elige una contrase&ntilde;a nueva para tu cuenta de Demandu.",
    etiqueta: "Seguridad",
    titulo: "Cambia tu contrase&ntilde;a",
    parrafos: [
      "Pediste recuperar el acceso a tu cuenta de Demandu. Pulsa el bot&oacute;n y elige una contrase&ntilde;a nueva.",
      "Nadie m&aacute;s puede usar este enlace sin abrir tu correo.",
    ],
    accion: boton("Elegir contrase&ntilde;a nueva", URL_CONF),
    enlace: URL_CONF,
    caduca:
      "El enlace caduca en " +
      b("1 hora") +
      " y solo sirve una vez. Si ya lo usaste, pide otro desde la pantalla de acceso.",
    seguridad:
      "Si no lo pediste t&uacute;, ignora este correo: tu contrase&ntilde;a no cambia hasta que alguien abra este enlace y escriba una nueva. Si te llega varias veces sin haberlo pedido, escr&iacute;benos.",
  },

  "invitacion-equipo.html": {
    preheader: "Te invitaron a un equipo en Demandu.",
    etiqueta: "Invitaci&oacute;n",
    titulo: "Te invitaron a Demandu",
    parrafos: [
      "Alguien de tu equipo te dio acceso a su cuenta de Demandu, la plataforma desde la que atienden WhatsApp, Instagram y Messenger.",
      "Acepta la invitaci&oacute;n y elige tu contrase&ntilde;a para entrar.",
    ],
    accion: boton("Aceptar la invitaci&oacute;n", URL_CONF),
    enlace: URL_CONF,
    caduca:
      "El enlace caduca en " +
      b("24 horas") +
      ". Si se te pasa, p&iacute;dele a quien te invit&oacute; que te mande otra.",
    seguridad:
      "Si no esperabas esta invitaci&oacute;n, ignora el correo. Sin aceptarla no se crea ning&uacute;n acceso a tu nombre.",
  },

  "cambio-de-correo.html": {
    preheader: "Confirma tu nueva direcci&oacute;n de correo.",
    etiqueta: "Seguridad",
    titulo: "Confirma tu correo nuevo",
    parrafos: [
      "Se pidi&oacute; cambiar el correo de tu cuenta de Demandu de " +
        b("{{ .Email }}") +
        " a " +
        b("{{ .NewEmail }}") +
        ".",
      "Conf&iacute;rmalo desde aqu&iacute; y a partir de ese momento entrar&aacute;s con la direcci&oacute;n nueva.",
    ],
    accion: boton("Confirmar el cambio", URL_CONF),
    enlace: URL_CONF,
    caduca:
      "El enlace caduca en " +
      b("24 horas") +
      ". Hasta que lo abras, tu cuenta sigue con el correo de siempre.",
    seguridad:
      "Si no pediste este cambio, NO abras el enlace y escr&iacute;benos: alguien con acceso a tu sesi&oacute;n est&aacute; intentando mover tu correo de acceso.",
  },

  "enlace-de-acceso.html": {
    preheader: "Tu enlace para entrar en Demandu.",
    etiqueta: "Acceso",
    titulo: "Entra sin contrase&ntilde;a",
    parrafos: [
      "Aqu&iacute; tienes tu enlace para entrar en Demandu. No hace falta contrase&ntilde;a: pulsa el bot&oacute;n y est&aacute;s dentro.",
    ],
    accion: boton("Entrar en Demandu", URL_CONF),
    enlace: URL_CONF,
    caduca:
      "El enlace caduca en " +
      b("1 hora") +
      " y solo sirve una vez. No se lo reenv&iacute;es a nadie: quien lo abra entra en tu cuenta.",
    seguridad: "Si no pediste entrar, ignora este correo.",
  },

  /* La reautenticacion NO lleva boton: Supabase solo rellena Token, un codigo
     que la persona teclea en la pantalla donde esta. Un boton aqui seria un
     enlace a ninguna parte. */
  "codigo-de-confirmacion.html": {
    preheader: "Tu c&oacute;digo para confirmar la operaci&oacute;n.",
    etiqueta: "Confirmaci&oacute;n",
    titulo: "Tu c&oacute;digo de confirmaci&oacute;n",
    parrafos: [
      "Para confirmar lo que estabas haciendo en Demandu, escribe este c&oacute;digo en la pantalla donde te lo pide:",
    ],
    accion: cajaDeCodigo("{{ .Token }}"),
    enlace: "", // sin enlace: no hay direccion que copiar
    caduca:
      "El c&oacute;digo caduca en " +
      b("1 hora") +
      ". No se lo dictes a nadie, ni a quien diga ser de Demandu: nunca te lo vamos a pedir.",
    seguridad:
      "Si no estabas haciendo nada en tu cuenta, ignora este correo y cambia tu contrase&ntilde;a por si acaso.",
  },
};

/* ── LOS SIETE AVISOS DE SEGURIDAD ───────────────────────────────────────────
 *
 * Son OTRA cosa que los seis de arriba. Aquellos piden hacer algo —confirma,
 * entra, elige contrasena— y por eso llevan un enlace con un token dentro.
 * Estos no piden nada: AVISAN de que algo ya cambio, para que si no fuiste tu
 * te enteres el mismo dia y no tres semanas despues.
 *
 * Por eso:
 *
 * 1. NO LLEVAN TOKEN. Supabase no rellena ConfirmationURL en estos. Un boton
 *    con esa variable aqui seria un boton a ninguna parte.
 * 2. EL BOTON VA A `/recuperar`, una direccion fija del sitio. Es lo unico
 *    sensato que puede hacer alguien que lee «te cambiaron el correo» y no fue
 *    el: cerrar la puerta cambiando la contrasena. No hace falta token para
 *    eso: esa pantalla pide el correo y manda su propio enlace.
 * 3. EL TEXTO DE SEGURIDAD ES LA PARTE IMPORTANTE, no el adorno del final.
 *    En un aviso, lo que vale es la frase que dice que hacer si no fuiste tu.
 *
 * Las variables de cada uno estan documentadas por Supabase y NO son
 * intercambiables: `.OldEmail` no existe en el de telefono, `.FactorType` solo
 * en los de MFA. Poner la que no es deja un hueco en blanco en la bandeja de un
 * cliente que acaba de recibir un susto.
 * ──────────────────────────────────────────────────────────────────────────── */
const RECUPERAR = SITIO + "/recuperar";
const BOTON_SEGURIDAD = boton("Cambiar mi contrase&ntilde;a", RECUPERAR);

/* La misma frase en los siete, a proposito: quien recibe dos avisos seguidos
   tiene que leer la misma salida, no dos redacciones distintas. */
const SI_NO_FUISTE_TU =
  "<b style=\"color:#FFFFFF;\">Si no fuiste t&uacute;</b>, alguien tiene acceso a tu cuenta. " +
  "Cambia la contrase&ntilde;a ahora mismo con el bot&oacute;n de arriba y av&iacute;sanos.";

const AVISOS = {
  "aviso-contrasena-cambiada.html": {
    preheader: "La contrase&ntilde;a de tu cuenta de Demandu acaba de cambiar.",
    etiqueta: "Aviso de seguridad",
    titulo: "Cambiaron tu contrase&ntilde;a",
    parrafos: [
      "La contrase&ntilde;a de tu cuenta de Demandu (<b style=\"color:#FFFFFF;\">{{ .Email }}</b>) acaba de cambiar.",
      "Si lo hiciste t&uacute;, no tienes que hacer nada m&aacute;s.",
    ],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },

  "aviso-correo-cambiado.html": {
    preheader: "El correo de acceso de tu cuenta de Demandu cambi&oacute;.",
    etiqueta: "Aviso de seguridad",
    titulo: "Cambiaron el correo de tu cuenta",
    parrafos: [
      "El correo con el que se entra a tu cuenta de Demandu acaba de cambiar.",
    ],
    detalles: [
      ["Antes", "{{ .OldEmail }}"],
      ["Ahora", "{{ .Email }}"],
    ],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },

  "aviso-telefono-cambiado.html": {
    preheader: "El tel&eacute;fono de tu cuenta de Demandu cambi&oacute;.",
    etiqueta: "Aviso de seguridad",
    titulo: "Cambiaron el tel&eacute;fono de tu cuenta",
    parrafos: [
      "El tel&eacute;fono asociado a tu cuenta de Demandu acaba de cambiar.",
    ],
    detalles: [
      ["Antes", "{{ .OldPhone }}"],
      ["Ahora", "{{ .Phone }}"],
    ],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },

  "aviso-acceso-vinculado.html": {
    preheader: "Se a&ntilde;adi&oacute; una forma nueva de entrar a tu cuenta.",
    etiqueta: "Aviso de seguridad",
    titulo: "Nueva forma de entrar a tu cuenta",
    parrafos: [
      "Se conect&oacute; una forma nueva de entrar a tu cuenta de Demandu. A partir de ahora tambi&eacute;n se puede entrar con ella.",
    ],
    detalles: [
      ["Se conect&oacute;", "{{ .Provider }}"],
      ["A la cuenta", "{{ .Email }}"],
    ],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },

  "aviso-acceso-quitado.html": {
    preheader: "Se quit&oacute; una forma de entrar a tu cuenta.",
    etiqueta: "Aviso de seguridad",
    titulo: "Se quit&oacute; una forma de entrar",
    parrafos: [
      "Se desconect&oacute; una de las formas de entrar a tu cuenta de Demandu. Ya no se puede entrar con ella.",
    ],
    detalles: [
      ["Se quit&oacute;", "{{ .Provider }}"],
      ["De la cuenta", "{{ .Email }}"],
    ],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },

  "aviso-verificacion-activada.html": {
    preheader: "Activaron un segundo paso de verificaci&oacute;n en tu cuenta.",
    etiqueta: "Aviso de seguridad",
    titulo: "Activaron la verificaci&oacute;n en dos pasos",
    parrafos: [
      "Se a&ntilde;adi&oacute; un segundo paso de verificaci&oacute;n a tu cuenta de Demandu. De ahora en adelante te lo pedir&aacute; al entrar.",
      "Esto hace tu cuenta m&aacute;s segura: con la contrase&ntilde;a sola ya no basta.",
    ],
    detalles: [["M&eacute;todo", "{{ .FactorType }}"]],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },

  "aviso-verificacion-quitada.html": {
    preheader: "Quitaron el segundo paso de verificaci&oacute;n de tu cuenta.",
    etiqueta: "Aviso de seguridad",
    titulo: "Quitaron la verificaci&oacute;n en dos pasos",
    parrafos: [
      "Se quit&oacute; el segundo paso de verificaci&oacute;n de tu cuenta de Demandu. Ahora para entrar basta con la contrase&ntilde;a.",
      "Tu cuenta queda <b style=\"color:#FFFFFF;\">menos protegida</b> que antes.",
    ],
    detalles: [["M&eacute;todo que se quit&oacute;", "{{ .FactorType }}"]],
    accion: BOTON_SEGURIDAD,
    enlace: "",
    caduca: "",
    seguridad: SI_NO_FUISTE_TU,
  },
};

Object.assign(CORREOS, AVISOS);

const destino = join(process.cwd(), "salida");
mkdirSync(destino, { recursive: true });
for (const [nombre, datos] of Object.entries(CORREOS)) {
  const html = armar(datos);
  writeFileSync(join(destino, nombre), html, "utf8");
  console.log("  " + nombre.padEnd(30) + String(html.length).padStart(6) + " bytes");
}
console.log("\n" + Object.keys(CORREOS).length + " plantillas en " + destino);
