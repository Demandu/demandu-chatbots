/**
 * Pruebas de la lógica que decide cómo se comporta la plataforma.
 * Son funciones puras, así que se prueban sin base de datos ni navegador.
 *
 *   node --experimental-strip-types scripts/pruebas/logica.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import { ATAJOS_DEFAULT, detectarAtajo, normalizar, leerAtajos } from "../../src/lib/flow/shortcuts.ts";
import { paletaChat, claridad } from "../../src/lib/chatColors.ts";
import { accionesDelPrompt, CLAVES_DE_ACCION } from "../../src/lib/ai/acciones.ts";
import { aCentavos, leerOpciones, leerModo, recargoDe, comoDinero, sanearGrupos } from "../../src/lib/tienda/variedades.ts";
import { aDireccion, direccionValida } from "../../src/lib/tienda/direccion.ts";
import { leerConfig, CONFIG_POR_DEFECTO, colorValido, soloDigitos, loQueFaltaParaVender, sanearPreguntas, MAX_PREGUNTAS } from "../../src/lib/tienda/config.ts";
import { leerGruposEscritos, escribirGrupos } from "../../src/lib/tienda/escritura.ts";
import { leerPegado, cortarTabla, esSi } from "../../src/lib/tienda/pegar.ts";
import { recalcularPedido } from "../../src/lib/tienda/recalcular.ts";
import {
  comoMontoYappy, montoCobrable, aliasYappy, aliasValido, codigoDePedido, codigoValido,
  claveDeFirma, firmaIpn, ipnValido, esAmbiente, PAGOS_YAPPY, API_YAPPY, CDN_YAPPY,
} from "../../src/lib/tienda/yappy.ts";
import { estadoDelCobro, VENTANA_COBRO_MIN } from "../../src/lib/tienda/cobro.ts";
import { claveDeLinea, precioUnitario, totalDeLinea, totalDelCarrito, cuantasUnidades, faltaElegir, faltaContestar, textoDelPedido, enlaceDeWhatsapp } from "../../src/lib/tienda/pedido.ts";
import { prometioUnaPersona } from "../../src/lib/ai/promesas.ts";
import { leerEventos, abreConversacion, textoParaElFlujo } from "../../src/lib/canales/instagramEntrante.ts";
import { firmaValida, firmarComoMeta } from "../../src/lib/canales/instagramFirma.ts";
import { paisDesdeTelefono, bandera, nombrePais } from "../../src/lib/phoneCountry.ts";
import { limpiarAtajo, rellenar, filtrar } from "../../src/lib/quickReplies.ts";
import { enSilencio, debeAvisar, PREFS_DEFAULT } from "../../src/lib/notifications.ts";
import {
  rangoDePreset, agrupacionSugerida, duracion, porcentaje, numero,
  etiquetaPeriodo, aFechaCorta, deFechaCorta, efectividadAgente,
} from "../../src/lib/analytics.ts";
import { pareceUnaPregunta, decidirDesvio, puenteDeVuelta, esAfirmacion } from "../../src/lib/flow/desvio.ts";
import { htmlToText, cerrarEtiquetasAbiertas } from "../../src/lib/ai/fromUrl.ts";

// ─── Atajos del chatbot (0 = reiniciar, 1 = persona) ────────────────────────
describe("Atajos del chatbot", () => {
  const A = ATAJOS_DEFAULT;

  test("'0' reinicia y '1' pide persona", () => {
    esperar(detectarAtajo("0", A)).igual("reset");
    esperar(detectarAtajo("1", A)).igual("agent");
  });

  test("ignora espacios, mayúsculas, acentos y signos finales", () => {
    for (const t of ["  0  ", "MENU", "Menú", "menú.", "¡inicio!"]) {
      esperar(detectarAtajo(t, A)).igual("reset", `falló con ${JSON.stringify(t)}`);
    }
    esperar(detectarAtajo("Asesor!", A)).igual("agent");
  });

  test("NO se activa dentro de una frase — este es el error clásico", () => {
    for (const t of ["quiero 1 pizza", "son 0 pesos", "reiniciar mi pedido", "el menu del dia", "10", "01"]) {
      esperar(detectarAtajo(t, A)).igual(null, `${JSON.stringify(t)} no debía activar ningún atajo`);
    }
  });

  test("un atajo apagado deja de responder", () => {
    const apagado = leerAtajos({ reset: { enabled: false } });
    esperar(detectarAtajo("0", apagado)).igual(null);
    esperar(detectarAtajo("1", apagado)).igual("agent", "el otro atajo debe seguir vivo");
  });

  test("el atajo de persona gana si una palabra está en los dos", () => {
    const chocado = leerAtajos({ reset: { words: ["x"] }, agent: { words: ["x"] } });
    esperar(detectarAtajo("x", chocado)).igual("agent");
  });

  test("mensajes vacíos o raros no rompen nada", () => {
    esperar(detectarAtajo("", A)).igual(null);
    esperar(detectarAtajo("   ", A)).igual(null);
    esperar(detectarAtajo(null, A)).igual(null);
    esperar(normalizar(undefined)).igual("");
  });

  test("palabras que el cliente agregue funcionan igual", () => {
    const propio = leerAtajos({ agent: { words: ["quiero hablar con alguien"] } });
    esperar(detectarAtajo("Quiero hablar con alguien", propio)).igual("agent");
  });
});

// ─── Colores del chat ────────────────────────────────────────────────────────
describe("Paleta del chat (contraste)", () => {
  const COLORES = [
    "#e7ddff", "#dcf8c6", "#ffe0ef", "#dbeafe", "#fff3c4", "#e2e8f0",
    "#d1fae5", "#ffe4d0", "#6e42ff", "#1b1c39", "#000000", "#ffffff",
    "#f8f8ff", "#25d366", "#ff0000", "#808080", "#f5f5f5", "#fffef5",
  ];

  test("con cualquier color, la burbuja se distingue del fondo", () => {
    for (const c of COLORES) {
      const p = paletaChat(c);
      const d = Math.abs(claridad(p.out) - claridad(p.canvas));
      esperar(d).mayorQue(0.03, `${c}: burbuja y fondo casi iguales`);
    }
  });

  test("las dos burbujas nunca se confunden entre sí", () => {
    for (const c of COLORES) {
      const p = paletaChat(c);
      const d = Math.abs(claridad(p.out) - claridad(p.in));
      esperar(d).mayorQue(0.04, `${c}: burbuja propia y la del cliente casi iguales`);
    }
  });

  test("el texto siempre se lee sobre su burbuja", () => {
    for (const c of COLORES) {
      const p = paletaChat(c);
      const d = Math.abs(claridad(p.out) - claridad(p.textOut));
      esperar(d).mayorQue(0.35, `${c}: texto poco legible`);
    }
  });

  test("un color inválido no rompe: cae al violeta de Demandu", () => {
    for (const malo of ["", "rojo", "#zzz", null, undefined, "javascript:alert(1)"]) {
      const p = paletaChat(malo);
      esperar(/^#[0-9a-f]{6}$/i.test(p.out)).verdadero(`${malo} produjo "${p.out}"`);
    }
    esperar(paletaChat(null).out.toLowerCase()).igual("#e7ddff");
  });
});

// ─── País y bandera del lead ─────────────────────────────────────────────────
describe("País del lead por su teléfono", () => {
  test("reconoce los países donde venderemos", () => {
    esperar(paisDesdeTelefono("5215580044107")).igual("MX");
    esperar(paisDesdeTelefono("+57 300 123 4567")).igual("CO");
    esperar(paisDesdeTelefono("5491123456789")).igual("AR");
    esperar(paisDesdeTelefono("34600123456")).igual("ES");
    esperar(paisDesdeTelefono("13055551234")).igual("US");
  });

  test("distingue prefijos que comparten inicio (+1 vs +1809)", () => {
    esperar(paisDesdeTelefono("18095551234")).igual("DO");
    esperar(paisDesdeTelefono("17875551234")).igual("PR");
    esperar(paisDesdeTelefono("12125551234")).igual("US");
  });

  test("sin teléfono no inventa un país", () => {
    esperar(paisDesdeTelefono("")).igual(null);
    esperar(paisDesdeTelefono(null)).igual(null);
    esperar(paisDesdeTelefono("abc")).igual(null);
  });

  test("la bandera y el nombre salen bien, y no truenan con basura", () => {
    esperar(bandera("MX")).igual("🇲🇽");
    esperar(bandera("mx")).igual("🇲🇽");
    esperar(bandera(null)).igual("🏳️");
    esperar(bandera("XXXX")).igual("🏳️");
    esperar(nombrePais("MX")).contiene("xic");
    esperar(nombrePais(null)).igual("—");
  });
});

// ─── Respuestas rápidas ──────────────────────────────────────────────────────
describe("Respuestas rápidas", () => {
  test("el atajo queda limpio y usable", () => {
    esperar(limpiarAtajo("/Gracias")).igual("gracias");
    esperar(limpiarAtajo("  SALUDO ")).igual("saludo");
    esperar(limpiarAtajo("envío-1")).igual("envio-1");
    esperar(limpiarAtajo("a b c")).igual("abc");
    esperar(limpiarAtajo("///x")).igual("x");
    esperar(limpiarAtajo("")).igual("");
  });

  test("las variables se rellenan con los datos del lead", () => {
    const r = rellenar("Hola {{nombre}}, te escribe {{agente}}.", { nombre: "Ana", agente: "Luis" });
    esperar(r).igual("Hola Ana, te escribe Luis.");
  });

  test("si falta un dato, el texto no queda cojo", () => {
    esperar(rellenar("Hola {{nombre}}, ¿cómo estás?", { nombre: "" })).igual("Hola, ¿cómo estás?");
    esperar(rellenar("Hola {{nombre}}!", {})).igual("Hola!");
    esperar(rellenar("{{noExiste}} listo", {})).igual("listo");
  });

  test("la búsqueda prioriza el atajo sobre el contenido", () => {
    const lista = [
      { id: "1", shortcut: "gracias", title: "Agradecer", body: "Mil gracias", category: null, sort: 0, uses: 0 },
      { id: "2", shortcut: "precio", title: "Cotización", body: "Gracias por preguntar el precio", category: null, sort: 1, uses: 0 },
    ];
    esperar(filtrar(lista, "graci").map((r) => r.id)).igual(["1", "2"], "primero el del atajo");
    esperar(filtrar(lista, "coti").map((r) => r.id)).igual(["2"]);
    esperar(filtrar(lista, "").length).igual(2, "sin búsqueda, salen todas");
    esperar(filtrar(lista, "zzz").length).igual(0);
  });
});

// ─── Silencio de notificaciones ──────────────────────────────────────────────
describe("Horario de silencio", () => {
  const conHorario = (desde, hasta) => ({ ...PREFS_DEFAULT, silencioActivo: true, silencioDesde: desde, silencioHasta: hasta });
  const alas = (h, m = 0) => { const d = new Date(2026, 0, 15, h, m); return d; };

  test("rango normal (09:00 a 18:00)", () => {
    const p = conHorario("09:00", "18:00");
    esperar(enSilencio(p, alas(10))).verdadero();
    esperar(enSilencio(p, alas(20))).falso();
    esperar(enSilencio(p, alas(8, 59))).falso();
  });

  test("rango que cruza la medianoche (20:00 a 08:00) — el caso que se rompe siempre", () => {
    const p = conHorario("20:00", "08:00");
    esperar(enSilencio(p, alas(22))).verdadero("22:00 debe estar en silencio");
    esperar(enSilencio(p, alas(3))).verdadero("03:00 debe estar en silencio");
    esperar(enSilencio(p, alas(12))).falso("mediodía NO debe estar en silencio");
    esperar(enSilencio(p, alas(8, 1))).falso();
  });

  test("apagar los avisos manda sobre todo lo demás", () => {
    esperar(debeAvisar({ ...PREFS_DEFAULT, activo: false })).falso();
    esperar(debeAvisar(PREFS_DEFAULT)).verdadero();
  });

  test("silenciar un rato caduca solo", () => {
    esperar(enSilencio({ ...PREFS_DEFAULT, silenciarHasta: Date.now() + 60000 })).verdadero();
    esperar(enSilencio({ ...PREFS_DEFAULT, silenciarHasta: Date.now() - 60000 })).falso();
  });
});

// ─── Resultados: fechas y cómo se leen los números ──────────────────────────
describe("Resultados: rangos de fecha", () => {
  // Un martes cualquiera a media tarde, para que los cálculos sean predecibles.
  const AHORA = new Date(2026, 7, 18, 15, 30); // 18 de agosto de 2026

  test("'hoy' cubre el día completo, ni un minuto de mañana", () => {
    const { desde, hasta } = rangoDePreset("hoy", AHORA);
    esperar(aFechaCorta(desde)).igual("2026-08-18");
    esperar(aFechaCorta(hasta)).igual("2026-08-19", "el fin es exclusivo: arranque del día siguiente");
    esperar(desde.getHours()).igual(0, "empieza a medianoche, no a la hora actual");
  });

  test("'7 días' incluye hoy y los seis anteriores", () => {
    const { desde, hasta } = rangoDePreset("7d", AHORA);
    esperar(aFechaCorta(desde)).igual("2026-08-12");
    esperar(aFechaCorta(hasta)).igual("2026-08-19");
    esperar(Math.round((hasta - desde) / 86400000)).igual(7);
  });

  test("'este mes' arranca el día 1", () => {
    esperar(aFechaCorta(rangoDePreset("mes", AHORA).desde)).igual("2026-08-01");
  });

  test("'trimestre' arranca en julio para una fecha de agosto", () => {
    esperar(aFechaCorta(rangoDePreset("trimestre", AHORA).desde)).igual("2026-07-01");
  });

  test("'este año' arranca el 1 de enero", () => {
    esperar(aFechaCorta(rangoDePreset("anio", AHORA).desde)).igual("2026-01-01");
  });

  test("la agrupación se adapta al largo del rango", () => {
    // Un año agrupado por día son 365 barras: ilegible en cualquier pantalla.
    const dias = (n) => ({ desde: new Date(2026, 0, 1), hasta: new Date(2026, 0, 1 + n) });
    const { desde: d1, hasta: h1 } = dias(7);
    esperar(agrupacionSugerida(d1, h1)).igual("day");
    const { desde: d2, hasta: h2 } = dias(120);
    esperar(agrupacionSugerida(d2, h2)).igual("week");
    const { desde: d3, hasta: h3 } = dias(700);
    esperar(agrupacionSugerida(d3, h3)).igual("month");
    const { desde: d4, hasta: h4 } = dias(2000);
    esperar(agrupacionSugerida(d4, h4)).igual("quarter");
  });

  test("una fecha escrita a mano se lee bien, y una basura no rompe nada", () => {
    esperar(aFechaCorta(deFechaCorta("2026-08-18"))).igual("2026-08-18");
    // El campo "hasta" guarda el día siguiente, para que el último día entre entero.
    esperar(aFechaCorta(deFechaCorta("2026-08-18", true))).igual("2026-08-19");
    esperar(deFechaCorta("18/08/2026")).igual(null);
    esperar(deFechaCorta("")).igual(null);
    esperar(deFechaCorta(null)).igual(null);
  });
});

describe("Resultados: cómo se leen los números", () => {
  test("los tiempos de respuesta se dicen en palabras", () => {
    esperar(duracion(0)).igual("0 s");
    esperar(duracion(45)).igual("45 s");
    esperar(duracion(120)).igual("2 min");
    esperar(duracion(3600)).igual("1 h");
    esperar(duracion(4800)).igual("1 h 20 min");
    esperar(duracion(172800)).igual("2 d");
  });

  test("sin respuestas se muestra un guion, NO cero", () => {
    // Un "0 s" se leería como "contestamos al instante", que es lo contrario.
    esperar(duracion(null)).igual("—");
    esperar(duracion(undefined)).igual("—");
    esperar(porcentaje(null)).igual("—");
  });

  test("los porcentajes y los miles se ven como espera un cliente", () => {
    esperar(porcentaje(66.666, 1)).igual("66.7 %");
    esperar(porcentaje(0)).igual("0 %");
    esperar(numero(null)).igual("0");
    esperar(numero(12345).replace(/\s|,/g, "")).igual("12345");
  });

  test("las etiquetas del eje cambian según la agrupación", () => {
    esperar(etiquetaPeriodo("2026-08-18", "day")).igual("18 ago");
    esperar(etiquetaPeriodo("2026-08-01", "month")).igual("ago 2026");
    esperar(etiquetaPeriodo("2026-07-01", "quarter")).igual("T3 2026");
    esperar(etiquetaPeriodo("2026-01-01", "year")).igual("2026");
    esperar(etiquetaPeriodo("", "day")).igual("", "una fecha vacía no revienta la gráfica");
  });

  test("la efectividad de un agente sin cierres es '—', no 0 %", () => {
    esperar(efectividadAgente({ ganadas: 3, perdidas: 1 })).igual(75);
    esperar(efectividadAgente({ ganadas: 0, perdidas: 2 })).igual(0);
    esperar(efectividadAgente({ ganadas: 0, perdidas: 0 })).igual(null, "sin cierres no se puede opinar");
  });
});

// ─── Cuando el cliente se sale del flujo ────────────────────────────────────
describe("El cliente se sale del flujo", () => {
  const base = {
    esperando: null, capturaDato: false, coincidioBoton: false,
    tieneSalidaPorDefecto: false, flujoTerminado: false, esInicio: false,
    texto: "hola", iaDeRespaldo: true,
  };

  test("distingue una pregunta de un dato", () => {
    // Equivocarse hacia "es pregunta" deja a la persona atorada repitiendo el
    // mismo paso, así que ante la duda tiene que ganar "es un dato".
    esperar(pareceUnaPregunta("¿cuánto cuesta?")).verdadero();
    esperar(pareceUnaPregunta("cuanto cuesta")).verdadero();
    esperar(pareceUnaPregunta("para que sirves?")).verdadero();
    esperar(pareceUnaPregunta("tienen envio a domicilio")).verdadero();

    esperar(pareceUnaPregunta("Alex")).falso("un nombre no es pregunta");
    esperar(pareceUnaPregunta("Ana Sofía Ramírez")).falso();
    esperar(pareceUnaPregunta("Monterrey")).falso();
    esperar(pareceUnaPregunta("si")).falso();
    esperar(pareceUnaPregunta("mi correo es alex@demandu.tech")).falso();
    esperar(pareceUnaPregunta("")).falso();
  });

  test("el flujo terminó y la persona sigue escribiendo → contesta la IA", () => {
    // Es EL fallo que se ve: sin esto el motor reinicia el flujo y el bot
    // repite el saludo una y otra vez.
    esperar(decidirDesvio({ ...base, flujoTerminado: true, texto: "para que sirves?" }))
      .igual("flujo_terminado");
  });

  test("hay botones y escribió otra cosa → contesta la IA y reofrece", () => {
    esperar(decidirDesvio({
      ...base, esperando: { type: "buttons", nodeId: "n2" },
      coincidioBoton: false, texto: "¿tienen envío?",
    })).igual("otra_cosa_en_botones");
  });

  test("si el bloque de botones tiene salida por defecto, manda el flujo", () => {
    // El cliente ya decidió qué hacer con lo que no coincide: no nos metemos.
    esperar(decidirDesvio({
      ...base, esperando: { type: "buttons", nodeId: "n2" },
      tieneSalidaPorDefecto: true, texto: "cualquier cosa",
    })).igual(null);
  });

  test("si tocó una opción válida, el flujo sigue normal", () => {
    esperar(decidirDesvio({
      ...base, esperando: { type: "buttons", nodeId: "n2" }, coincidioBoton: true, texto: "Precios",
    })).igual(null);
  });

  test("le piden un dato y pregunta → contesta la IA y vuelve a pedirlo", () => {
    esperar(decidirDesvio({
      ...base, esperando: { type: "question", nodeId: "n3" },
      capturaDato: true, texto: "¿cuánto cuesta?",
    })).igual("pregunta_en_captura");
  });

  test("le piden un dato y lo da → se guarda, no se desvía", () => {
    esperar(decidirDesvio({
      ...base, esperando: { type: "question", nodeId: "n3" },
      capturaDato: true, texto: "Alex Molina",
    })).igual(null);
  });

  test("un bloque de IA ya escucha solo: no se desvía", () => {
    esperar(decidirDesvio({
      ...base, esperando: { type: "question", nodeId: "ia" },
      capturaDato: false, texto: "¿cuánto cuesta?",
    })).igual(null);
  });

  test("el primer mensaje siempre lo contesta el flujo", () => {
    // El saludo es del flujo. Si lo diera la IA, cada conversación empezaría
    // distinta y el cliente perdería el control de su propio guion.
    esperar(decidirDesvio({ ...base, esInicio: true, flujoTerminado: true, texto: "hola" }))
      .igual(null);
  });

  test("con la IA de respaldo apagada, nunca se desvía", () => {
    esperar(decidirDesvio({ ...base, iaDeRespaldo: false, flujoTerminado: true, texto: "que precio" }))
      .igual(null);
    esperar(decidirDesvio({
      ...base, iaDeRespaldo: false, esperando: { type: "buttons", nodeId: "n2" }, texto: "otra cosa",
    })).igual(null);
  });

  test("un mensaje vacío no despierta a la IA", () => {
    esperar(decidirDesvio({ ...base, flujoTerminado: true, texto: "   " })).igual(null);
  });

  test("el puente de vuelta solo aparece cuando hay algo a qué volver", () => {
    esperar(puenteDeVuelta("otra_cosa_en_botones").length).mayorQue(0);
    esperar(puenteDeVuelta("pregunta_en_captura").length).mayorQue(0);
    esperar(puenteDeVuelta("flujo_terminado")).igual("", "ahí no hay nada que retomar");
    esperar(puenteDeVuelta(null)).igual("");
  });
});


// --- Aceptar la oferta de pasar con una persona ------------------------------
describe("Decir que si a hablar con una persona", () => {
  // Solo se consulta en el turno siguiente a que el bot ofrezca. Aun asi tiene
  // que ser estrecho: un falso positivo saca al cliente del flujo y lo manda a
  // una cola humana que quiza no hay quien atienda.

  test("las formas normales de decir que si", () => {
    for (const t of ["si", "sí", "Sí", "SI", "claro", "ok", "va", "dale",
                     "por favor", "porfa", "sí, por favor", "adelante", "yes"]) {
      esperar(esAfirmacion(t)).verdadero(`"${t}" deberia contar como si`);
    }
  });

  test("un no nunca cuenta como si", () => {
    for (const t of ["no", "no gracias", "ahorita no", "nel"]) {
      esperar(esAfirmacion(t)).falso(`"${t}" no puede pasar a un humano`);
    }
  });

  test("una frase larga que empieza con si NO cuenta", () => {
    // "si, pero antes dime el precio" es otra pregunta, no un si a un humano:
    // la tiene que seguir contestando la IA.
    esperar(esAfirmacion("si pero antes dime el precio")).falso();
    esperar(esAfirmacion("claro, cuanto cuesta el plan grande")).falso();
  });

  test("un dato cualquiera no cuenta como si", () => {
    for (const t of ["Juan", "Monterrey", "5512345678", "", "   "]) {
      esperar(esAfirmacion(t)).falso(`"${t}" no es una aceptacion`);
    }
  });
});


// --- Aprender del sitio web del cliente ------------------------------------
describe("Leer una pagina web", () => {
  test("saca el texto y descarta lo que no se lee", () => {
    const html = `<html><head><title>Precios | La Dulce</title>
      <style>.x{color:red}</style><script>var a=1;</script></head>
      <body><nav>Inicio Productos</nav>
      <h1>Nuestros precios</h1>
      <p>Pastel chico $499.</p><ul><li>Cupcakes $180</li></ul>
      <footer>Aviso legal</footer></body></html>`;
    const { title, text } = htmlToText(html);
    esperar(title).igual("Precios | La Dulce");
    esperar(text.includes("Nuestros precios")).verdadero();
    esperar(text.includes("$499")).verdadero();
    esperar(text.includes("Cupcakes")).verdadero();
    // Guiones, estilos y menus no son informacion del negocio: ensucian el RAG.
    esperar(text.includes("var a=1")).falso("el codigo no puede entrar al conocimiento");
    esperar(text.includes("color:red")).falso("los estilos tampoco");
    esperar(text.includes("Inicio Productos")).falso("el menu de navegacion tampoco");
  });

  test("las entidades HTML se convierten a texto de verdad", () => {
    // Si no, el chatbot le contesta al cliente "Env&iacute;o &amp; entrega".
    const { text } = htmlToText("<body><p>Caf&eacute; &amp; t&eacute; &#8212; 100&nbsp;g</p></body>");
    esperar(text.includes("&amp;")).falso("el cliente veria los codigos en crudo");
    esperar(text.includes("&nbsp;")).falso();
  });

  test("un HTML cortado a media etiqueta no cuela codigo como texto", () => {
    // Al leer solo los primeros megas, el corte puede caer dentro de un
    // <script>. Sin cierre, la limpieza no encuentra la pareja y TODO el
    // codigo entraria como "informacion del negocio": el chatbot acabaria
    // citandole JavaScript a un cliente que pregunto por precios.
    const cortado = "<body><p>Precios: $499</p><script>var config={apiKey:'secreto'};function x(){";
    const { text } = htmlToText(cerrarEtiquetasAbiertas(cortado));
    esperar(text.includes("$499")).verdadero("el texto bueno debe conservarse");
    esperar(text.includes("apiKey")).falso("el codigo no puede entrar al conocimiento");
    esperar(text.includes("function x")).falso();
  });

  test("un HTML completo no se toca", () => {
    const entero = "<body><p>Hola</p><script>var a=1;</script><p>Adios</p></body>";
    esperar(cerrarEtiquetasAbiertas(entero)).igual(entero, "no debe recortar lo que esta bien");
  });

  test("no se pierde la separacion entre bloques", () => {
    // Sin saltos, "Horario9 a 18Telefono" queda pegado y la IA lo lee mal.
    const { text } = htmlToText("<body><p>Horario</p><p>9 a 18</p><p>Telefono</p></body>");
    esperar(text.split("\n").length).mayorQue(2, "los parrafos deben quedar separados");
  });
});

// ─── Las acciones «/» del prompt ─────────────────────────────────────────────
/**
 * El «/» del prompt enciende herramientas que ESCRIBEN en la ficha de los
 * leads y transfieren conversaciones. Que se encienda de más es tan malo como
 * que no se encienda: por eso las pruebas de lo que NO debe contar pesan más
 * que las de lo que sí.
 */
describe("Acciones escritas con «/» en el prompt", () => {
  test("reconoce una acción al principio y en medio del texto", () => {
    esperar(accionesDelPrompt("/etiquetar como lead-alto")).igual(["etiquetar"]);
    esperar(accionesDelPrompt("Si pide factura, /pasar_a_humano.")).igual(["pasar_a_humano"]);
  });

  test("no repite la misma acción", () => {
    esperar(accionesDelPrompt("/etiquetar aquí y /etiquetar allá")).igual(["etiquetar"]);
  });

  test("una FECHA no enciende nada", () => {
    // «Atendemos del 12/09 al 30/09» no puede activar herramientas.
    esperar(accionesDelPrompt("Promoción del 12/09 al 30/09")).igual([]);
  });

  test("una DIRECCIÓN no enciende nada", () => {
    // Ni aunque lleve el nombre de una acción dentro de la ruta.
    esperar(accionesDelPrompt("Consulta https://misitio.com/etiquetar/precios")).igual([]);
  });

  test("una palabra inventada no enciende nada", () => {
    // Pasó de verdad: un prompt pedía `crear_lead_hubspot`, que no existe.
    esperar(accionesDelPrompt("/crear_lead_hubspot con el nombre")).igual([]);
  });

  test("una barra pegada a una letra no cuenta", () => {
    esperar(accionesDelPrompt("cliente/etiquetar")).igual([]);
    esperar(accionesDelPrompt("y/o /etiquetar")).igual(["etiquetar"]);
  });

  test("un prompt vacío o nulo no revienta", () => {
    esperar(accionesDelPrompt("")).igual([]);
    esperar(accionesDelPrompt(null)).igual([]);
    esperar(accionesDelPrompt(undefined)).igual([]);
  });

  test("reconoce todas las acciones del catálogo", () => {
    // Guardián: si alguien añade una acción al catálogo y no al motor, o al
    // revés, esto lo destapa antes de que un cliente escriba una que no hace nada.
    const texto = CLAVES_DE_ACCION.map((c) => `/${c}`).join(" ");
    esperar(accionesDelPrompt(texto).sort()).igual([...CLAVES_DE_ACCION].sort());
    esperar(CLAVES_DE_ACCION.length >= 6).verdadero("el catálogo se quedó corto");
  });
});

// ─── Promesas que el bot hace y no cumple ────────────────────────────────────
/**
 * Caso real del 1 sep: el bot escribió «Un asesor se va a comunicar contigo en
 * los próximos días» y NO llamó a `pasar_a_humano`. La conversación se quedó
 * abierta, sin dueño, y nadie del equipo se enteró. El lead esperaba a alguien
 * que no iba a llegar.
 *
 * Las pruebas de lo que NO es una promesa pesan tanto como las otras: pasar a
 * un humano de más cuesta el tiempo de un agente; no cumplir cuesta el lead.
 */
describe("El bot promete una persona", () => {
  const SI = [
    "Un asesor se va a comunicar contigo en los próximos días.",
    "Un asesor se comunicará contigo pronto.",
    "Te paso con un asesor.",
    "Le comunico con una persona del equipo.",
    "En un momento te atiende una persona del equipo 🙌",
    "Gracias por los datos. Un ejecutivo te contactará mañana.",
    "Perfecto. Te conecto con alguien del equipo.",
  ];
  const NO = [
    "¿Quieres que te comunique con una persona del equipo?",
    "Esa no me la sé todavía 🙈 ¿Quieres que te comunique con alguien?",
    "Si prefieres, un asesor puede ayudarte con eso.",
    "Nuestros asesores atienden de lunes a viernes.",
    "Con ese ingreso el crédito bancario se complica, pero tenemos opciones.",
    "Le mando las opciones desde 120 mil dólares.",
    "",
  ];

  for (const t of SI) {
    test(`promesa: "${t.slice(0, 42)}…"`, () => {
      esperar(prometioUnaPersona(t)).verdadero("esto es una promesa y hay que cumplirla");
    });
  }
  for (const t of NO) {
    test(`no es promesa: "${(t || "(vacío)").slice(0, 42)}…"`, () => {
      esperar(prometioUnaPersona(t)).falso("esto NO promete a nadie: no debe pasar a un humano");
    });
  }

  test("una oferta y una promesa en el mismo mensaje: manda la promesa", () => {
    // Un mensaje puede preguntar algo y además comprometerse dos líneas abajo.
    esperar(prometioUnaPersona("¿Te sirve el martes? Mientras tanto, te paso con un asesor.")).verdadero();
  });
});

// ─── De qué anuncio viene quien escribe ──────────────────────────────────────
//
// Meta manda un objeto `referral` cuando el lead llega desde un anuncio suyo.
// GOOGLE NO MANDA NADA: un anuncio de Google que lleva a WhatsApp abre un
// `wa.me/...` como cualquier enlace, y al motor le llega un mensaje normal. La
// única forma de atribuirlo es que el enlace traiga un mensaje ya escrito con
// un código — `[cmp:google-verano]` — y eso es lo que lee esta función.
//
// SE PRUEBA LA FUNCIÓN DE VERDAD, no su texto. El motor de WhatsApp corre en
// Deno y no se puede importar desde aquí, así que se recorta del archivo y se
// evalúa. Una prueba que solo buscara la palabra «origenDelEnlace» en el
// código pasaría aunque la expresión regular estuviera mal escrita, que es
// justo lo único que puede fallar aquí.
describe("Origen por enlace [cmp:...]", () => {
  const fuente = fs.readFileSync(
    path.join(import.meta.dirname, "../../supabase/functions/whatsapp/index.ts"),
    "utf8",
  );
  const desde = fuente.indexOf("function origenDelEnlace");
  if (desde < 0) throw new Error("no encuentro origenDelEnlace en el motor de WhatsApp");
  // Hasta la siguiente declaración de primer nivel: el cuerpo entero, ni más ni menos.
  const resto = fuente.slice(desde);
  const fin = resto.slice(1).search(/\n(?:function|const|async function|type|interface) /);
  const cuerpo = resto.slice(0, fin > 0 ? fin + 1 : resto.length);
  // Deno usa TypeScript; aquí solo hacen falta las anotaciones fuera.
  const origenDelEnlace = new Function(
    `${cuerpo.replace(/:\s*(string \| null \| undefined|any \| null|any)\b/g, "")}; return origenDelEnlace;`,
  )();

  test("lee el código del marcador", () => {
    const o = origenDelEnlace("Hola [cmp:gads-verano] quiero info");
    esperar(o?.anuncio_id).igual("gads-verano");
    esperar(o?.tipo).igual("enlace");
  });

  test("un mensaje normal NO atribuye nada", () => {
    // Lo más importante de todo: inventarse un origen es peor que no tenerlo.
    // Quien mira el informe movería presupuesto con un número falso.
    for (const t of ["Hola, quiero información", "", null, undefined, "cmp:algo", "[cmp:]", "[cmp: ]"]) {
      esperar(origenDelEnlace(t)).igual(null, `${JSON.stringify(t)} no debía atribuir ninguna campaña`);
    }
  });

  test("agrupa por plataforma cuando el código lo dice", () => {
    esperar(origenDelEnlace("[cmp:google-verano]")?.plataforma).igual("google");
    esperar(origenDelEnlace("[cmp:gads.black]")?.plataforma).igual("google");
    esperar(origenDelEnlace("[cmp:tt-septiembre]")?.plataforma).igual("tiktok");
    esperar(origenDelEnlace("[cmp:ig_historias]")?.plataforma).igual("meta");
  });

  test("un código que no empieza por plataforma conocida NO se inventa una", () => {
    // «volante-feria» es un QR en papel. Meterlo en Google porque empieza por
    // «g»… no empieza; pero «gimnasio-mayo» sí, y ESO es lo que se prueba: el
    // prefijo tiene que ir seguido de un separador, no ser cualquier palabra
    // que empiece por «g».
    esperar(origenDelEnlace("[cmp:gimnasio-mayo]")?.plataforma).igual("enlace");
    esperar(origenDelEnlace("[cmp:volante-feria]")?.plataforma).igual("enlace");
    esperar(origenDelEnlace("[cmp:google]")?.plataforma).igual("google", "«google» a secas sí es Google");
  });

  test("mayúsculas y espacios no rompen la atribución", () => {
    esperar(origenDelEnlace("Hola [CMP:Google-Verano]")?.anuncio_id).igual("Google-Verano");
    esperar(origenDelEnlace("[cmp: gads-verano ]")?.anuncio_id).igual("gads-verano");
  });
});

// ─── Qué llega por Instagram ─────────────────────────────────────────────────
//
// LOS JSON DE ABAJO SON LOS DE LA DOCUMENTACIÓN DE META, copiados tal cual el
// 1 sep 2026, no inventados. Es la única forma de que estas pruebas signifiquen
// algo: si me invento el formato, pruebo que mi código entiende mi invento.
describe("Instagram: entender lo que llega", () => {
  const NEGOCIO = "17841453763777297";

  const sobre = (entry) => ({ object: "instagram", entry: [{ id: NEGOCIO, time: 1569262486134, ...entry }] });

  test("un mensaje directo normal", () => {
    const e = leerEventos(sobre({
      messaging: [{
        sender: { id: "SENDER" }, recipient: { id: NEGOCIO }, timestamp: 1569262485349,
        message: { mid: "MID_1", text: "Hola, ¿cuánto cuesta?" },
      }],
    }));
    esperar(e.length).igual(1);
    esperar(e[0].tipo).igual("dm");
    esperar(e[0].texto).igual("Hola, ¿cuánto cuesta?");
    esperar(e[0].de).igual("SENDER");
    esperar(e[0].cuentaNegocio).igual(NEGOCIO, "el id del entry es la cuenta del NEGOCIO, no de quien escribe");
  });

  test("EL ECO NO SE ATIENDE — esto es lo que evita el bucle infinito", () => {
    // Instagram devuelve por el webhook los mensajes que manda el propio
    // negocio. Sin descartarlos, el bot se lee, se contesta, se vuelve a leer
    // y no para nunca. Es el error clásico de toda integración de Messenger, y
    // el más caro: consume la cuota del cliente y le llena la Bandeja.
    const e = leerEventos(sobre({
      messaging: [{
        sender: { id: NEGOCIO }, recipient: { id: "SENDER" }, timestamp: 1,
        message: { mid: "MID_ECO", text: "Claro, cuesta $100", is_echo: true },
      }],
    }));
    esperar(e.length).igual(0, "un eco del propio negocio no puede entrar como mensaje del cliente");
  });

  test("una respuesta a una historia se distingue de un DM", () => {
    const e = leerEventos(sobre({
      messaging: [{
        sender: { id: "SENDER" }, recipient: { id: NEGOCIO }, timestamp: 1,
        message: {
          mid: "MID_2",
          text: "me interesa",
          reply_to: { story: { url: "https://cdn/story.jpg", id: "STORY_9" } },
        },
      }],
    }));
    esperar(e[0].tipo).igual("respuesta_historia");
    esperar(e[0].historiaId).igual("STORY_9");
    esperar(e[0].texto).igual("me interesa");
  });

  test("una mención en historia entra aunque no traiga texto", () => {
    // No trae texto ninguno. Si el motor recibiera la cadena vacía no
    // dispararía nada, y el cliente quiere justo eso: «me mencionas y te mando
    // el catálogo».
    const e = leerEventos(sobre({
      messaging: [{
        sender: { id: "SENDER" }, recipient: { id: NEGOCIO }, timestamp: 1,
        message: {
          mid: "MID_3",
          attachments: [{ type: "story_mention", payload: { url: "https://cdn/m.jpg" } }],
        },
      }],
    }));
    esperar(e.length).igual(1);
    esperar(e[0].tipo).igual("mencion_historia");
    esperar(textoParaElFlujo(e[0]).length > 0).verdadero(
      "sin texto el flujo no arrancaría: hace falta una palabra estable contra la que escribir un disparador",
    );
  });

  test("un comentario en una publicación", () => {
    const e = leerEventos(sobre({
      changes: [{
        field: "comments",
        value: {
          id: "COMENTARIO_1",
          from: { id: "IGSID_7", username: "juanito" },
          text: "PRECIO",
          media: { id: "MEDIA_5", media_product_type: "FEED" },
        },
      }],
    }));
    esperar(e[0].tipo).igual("comentario");
    esperar(e[0].comentarioId).igual("COMENTARIO_1");
    esperar(e[0].mediaId).igual("MEDIA_5");
    esperar(e[0].usuario).igual("juanito");
    esperar(e[0].tipoDeMedia).igual("FEED");
  });

  test("el comentario también se entiende si Meta lo cuelga del entry", () => {
    // La documentación lo enseña de las dos formas según la página. Apostar
    // por una sola es firmar que el día que cambien, el cliente se queda sin
    // comentarios y nadie sabe por qué.
    const e = leerEventos({
      object: "instagram",
      entry: [{
        id: NEGOCIO, time: 1,
        field: "comments",
        value: { id: "C2", from: { id: "U", username: "ana" }, text: "info", media: { id: "M" } },
      }],
    });
    esperar(e.length).igual(1);
    esperar(e[0].comentarioId).igual("C2");
  });

  test("EL BOT NO SE RESPONDE A SÍ MISMO EN PÚBLICO", () => {
    // Cuando el bot contesta en público a un comentario, esa respuesta vuelve
    // por el webhook como un comentario más. Sin esta guardia se contesta a sí
    // mismo, en público, delante de todos los seguidores del cliente.
    const e = leerEventos(sobre({
      changes: [{
        field: "comments",
        value: { id: "C3", from: { id: NEGOCIO, username: "demandu.tech" }, text: "¡Te escribimos por DM!" },
      }],
    }));
    esperar(e.length).igual(0, "un comentario del propio negocio no se atiende");
  });

  test("un comentario en vivo se distingue del normal", () => {
    const e = leerEventos(sobre({
      changes: [{ field: "live_comments", value: { id: "C4", from: { id: "U" }, text: "hola" } }],
    }));
    esperar(e[0].tipo).igual("comentario_vivo");
  });

  test("solo los DM y las historias abren conversación; un comentario no", () => {
    // Hasta que la persona no contesta al DM, Instagram no deja escribirle.
    // Meter el comentario en la Bandeja como una charla normal haría que el
    // equipo intentara responder a alguien que no puede recibir.
    const dm = leerEventos(sobre({ messaging: [{ sender: { id: "S" }, message: { mid: "m", text: "hola" } }] }))[0];
    const com = leerEventos(sobre({ changes: [{ field: "comments", value: { id: "C", from: { id: "U" }, text: "x" } }] }))[0];
    esperar(abreConversacion(dm)).verdadero();
    esperar(abreConversacion(com)).falso("un comentario todavía no es una conversación");
  });

  test("las reacciones y los acuses de lectura no son mensajes", () => {
    // Un corazón no es una pregunta. Contestarlo haría que el bot hablara solo.
    //
    // OJO CON CÓMO SE ESCRIBE ESTA PRUEBA. La primera versión mandaba estos
    // avisos CON un `message` de texto vacío, así que los descartaba la
    // guardia de «sin texto y sin adjuntos» y la guardia de reacciones no se
    // ejercitaba nunca: la prueba pasaba igual con la guardia borrada. Se
    // descubrió mutando el código a propósito, que es justo para lo que sirve.
    //
    // Ahora se manda la forma REAL (sin `message`) y además una reacción que sí
    // trae texto, que es el caso en el que la guardia es lo único que separa
    // «el cliente preguntó algo» de «el cliente puso un corazón».
    for (const ruido of [
      { sender: { id: "S" }, reaction: { mid: "m", action: "react", emoji: "❤️", reaction: "love" } },
      { sender: { id: "S" }, read: { mid: "m", watermark: 1 } },
      { sender: { id: "S" }, delivery: { mids: ["m"], watermark: 1 } },
      { sender: { id: "S" }, reaction: { mid: "m", action: "react", emoji: "❤️" }, message: { mid: "m", text: "❤️" } },
      { sender: { id: "S" }, read: { mid: "m" }, message: { mid: "m", text: "leído" } },
    ]) {
      esperar(leerEventos(sobre({ messaging: [ruido] })).length).igual(0, JSON.stringify(ruido).slice(0, 60));
    }
  });

  test("basura y campos nuevos no revientan el webhook", () => {
    // El día que Meta añada un campo, el webhook de un cliente no puede caerse.
    for (const raro of [
      null, undefined, {}, { object: "page", entry: [] }, { object: "instagram" },
      { object: "instagram", entry: [{}] },
      { object: "instagram", entry: [{ id: NEGOCIO, changes: [{ field: "invento_nuevo", value: { x: 1 } }] }] },
      { object: "instagram", entry: [{ id: NEGOCIO, messaging: [{ sender: {} }] }] },
    ]) {
      esperar(Array.isArray(leerEventos(raro))).verdadero(`reventó con ${JSON.stringify(raro)}`);
    }
    esperar(leerEventos({ object: "instagram", entry: [{ id: NEGOCIO, changes: [{ field: "invento_nuevo" }] }] }).length)
      .igual(0, "un campo que no conocemos se ignora, no se inventa un evento");
  });

  test("la firma de Meta: solo pasa la buena", () => {
    // El webhook de Instagram es PÚBLICO y sin sesión: Meta llama desde sus
    // servidores, así que no hay cookie ni RLS. Esta firma es lo único que
    // impide que cualquiera invente mensajes de clientes, llene la Bandeja de
    // un negocio con conversaciones falsas y le gaste la cuota de IA.
    const cuerpo = JSON.stringify({ object: "instagram", entry: [{ id: NEGOCIO }] });
    const secreto = "secreto-de-la-app";

    esperar(firmaValida(cuerpo, firmarComoMeta(cuerpo, secreto), secreto)).verdadero(
      "la firma correcta tiene que pasar",
    );

    const malas = [
      [firmarComoMeta(cuerpo, "otro-secreto"), "firmado con otro secreto"],
      [firmarComoMeta(cuerpo + " ", secreto), "el cuerpo cambió aunque sea un espacio"],
      [null, "sin cabecera"],
      [undefined, "cabecera indefinida"],
      ["", "cabecera vacía"],
      [firmarComoMeta(cuerpo, secreto).replace("sha256=", ""), "sin el prefijo sha256="],
      ["sha256=" + "0".repeat(64), "todo ceros"],
      ["sha256=no-es-hex-en-absoluto", "no es hexadecimal"],
      ["sha256=abc", "hex demasiado corto"],
      ["sha1=" + "0".repeat(40), "algoritmo viejo"],
    ];
    for (const [cabecera, porque] of malas) {
      esperar(firmaValida(cuerpo, cabecera, secreto)).falso(`no debía pasar: ${porque}`);
    }
  });

  test("sin secreto configurado NO se acepta nada", () => {
    // La tentación es devolver `true` cuando falta el secreto «para que
    // funcione en pruebas». Eso convertiría un despliegue mal configurado en un
    // endpoint abierto a internet, y nadie se enteraría: todo seguiría
    // pareciendo correcto desde fuera.
    const cuerpo = "{}";
    esperar(firmaValida(cuerpo, firmarComoMeta(cuerpo, ""), "")).falso(
      "sin secreto no se puede verificar nada, así que no se acepta nada",
    );
  });

  test("un webhook con varias cosas dentro las devuelve todas", () => {
    // Meta agrupa. Atender solo la primera perdería mensajes en silencio.
    const e = leerEventos(sobre({
      messaging: [
        { sender: { id: "A" }, message: { mid: "m1", text: "uno" } },
        { sender: { id: "B" }, message: { mid: "m2", text: "dos" } },
      ],
      changes: [{ field: "comments", value: { id: "C9", from: { id: "U" }, text: "tres" } }],
    }));
    esperar(e.length).igual(3);
    esperar(e.map((x) => x.texto).join(",")).igual("uno,dos,tres");
  });
});

// ─── La firma del webhook de WhatsApp ────────────────────────────────────────
//
// ESTE ENDPOINT ESTUVO ABIERTO A INTERNET durante meses: atendía POST sin
// comprobar nada. La barrera nueva se prueba EJECUTÁNDOLA de verdad —firmando
// bien y firmando mal— y no buscando palabras en el archivo. Una prueba que
// solo comprobara que existe la palabra «firma» habría pasado igual con la
// comprobación rota, que es exactamente el peligro de una barrera de seguridad.
describe("WhatsApp: la firma de Meta", () => {
  const fuente = fs.readFileSync(
    path.join(import.meta.dirname, "../../supabase/functions/whatsapp/index.ts"),
    "utf8",
  );
  const desde = fuente.indexOf("async function firmaDeMetaValida");
  if (desde < 0) throw new Error("no encuentro firmaDeMetaValida en el motor de WhatsApp");
  const resto = fuente.slice(desde);
  const fin = resto.slice(1).search(/\n(?:function|const|async function|type|interface) /);
  const cuerpo = resto.slice(0, fin > 0 ? fin + 1 : resto.length);
  // Deno es TypeScript; aquí solo estorban las anotaciones.
  const firmaDeMetaValida = new Function(
    `${cuerpo
      .replace(/:\s*Promise<boolean>/g, "")
      .replace(/:\s*string \| null \| undefined/g, "")
      .replace(/:\s*string/g, "")}; return firmaDeMetaValida;`,
  )();

  const SECRETO = "0123456789abcdef0123456789abcdef";
  const CUERPO = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.X" }] } }] }] });

  // La firma que mandaría Meta, calculada aparte con el crypto de Node: si la
  // calculara con la misma función que estoy probando, la prueba se estaría
  // dando la razón a sí misma.
  const firmarComoMeta = (texto, clave) =>
    "sha256=" + crypto.createHmac("sha256", clave).update(texto, "utf8").digest("hex");

  test("acepta una firma de verdad", async () => {
    esperar(await firmaDeMetaValida(CUERPO, firmarComoMeta(CUERPO, SECRETO), SECRETO)).verdadero(
      "una firma correcta tiene que pasar, o el webhook deja mudos a todos los clientes",
    );
  });

  test("rechaza si el cuerpo fue manipulado", async () => {
    // El ataque real: la firma es de un cuerpo y el cuerpo es otro.
    const firma = firmarComoMeta(CUERPO, SECRETO);
    const manipulado = CUERPO.replace("wamid.X", "wamid.Y");
    esperar(await firmaDeMetaValida(manipulado, firma, SECRETO)).falso(
      "cambiar el cuerpo tiene que invalidar la firma",
    );
  });

  test("rechaza una firma hecha con otro secreto", async () => {
    const otra = firmarComoMeta(CUERPO, "ffffffffffffffffffffffffffffffff");
    esperar(await firmaDeMetaValida(CUERPO, otra, SECRETO)).falso(
      "quien no tiene la clave no puede firmar",
    );
  });

  test("sin secreto no valida NADA", async () => {
    // Un despliegue sin el secreto puesto NO puede comportarse como si todo
    // estuviera firmado: eso deja el endpoint igual de abierto que antes, y
    // encima pareciendo protegido.
    esperar(await firmaDeMetaValida(CUERPO, firmarComoMeta(CUERPO, SECRETO), "")).falso(
      "sin secreto hay que fallar cerrado",
    );
  });

  test("rechaza cabeceras ausentes o con mala pinta", async () => {
    const malas = [
      null, undefined, "", "sha1=abc", "abc",
      "sha256=", "sha256=zz", "sha256=" + "a".repeat(63), "sha256=" + "a".repeat(65),
    ];
    for (const c of malas) {
      esperar(await firmaDeMetaValida(CUERPO, c, SECRETO)).falso(
        `${JSON.stringify(c)} no debía pasar`,
      );
    }
  });

  test("una firma válida de OTRO cuerpo no sirve para este", async () => {
    // Reutilizar una firma capturada es el ataque más obvio.
    const firmaDeOtro = firmarComoMeta(JSON.stringify({ entry: [] }), SECRETO);
    esperar(await firmaDeMetaValida(CUERPO, firmaDeOtro, SECRETO)).falso(
      "una firma solo vale para el cuerpo con el que se calculó",
    );
  });

  test("no corta al primer byte distinto", () => {
    // NINGUNA PRUEBA FUNCIONAL PUEDE VIGILAR ESTO: comparar con `===` da el
    // mismo resultado y solo cambia CUÁNTO tarda, que es justo lo que deja
    // adivinar una firma byte a byte. Por eso se lee el código.
    esperar(/diferencia \|= mio\[i\] \^ suyo\[i\]/.test(cuerpo)).verdadero(
      "la comparación tiene que recorrer todos los bytes y acumular la diferencia",
    );
    esperar(/return\s+diferencia === 0/.test(cuerpo)).verdadero(
      "el veredicto sale de la diferencia acumulada, no de un corte anticipado",
    );
  });
});

// ─── La tienda: precios y variedades ─────────────────────────────────────────
//
// ESTO DECIDE CUÁNTO SE LE COBRA A UNA PERSONA. Un fallo aquí no es un texto
// mal puesto: es dinero mal cobrado, y el cliente lo ve en su recibo. Por eso
// se prueba con los casos raros de las hojas de verdad, no con ejemplos
// cómodos.
describe("Tienda: leer precios de una hoja", () => {
  test("acepta punto y coma como decimal", () => {
    // En Panamá y media Latinoamérica se escriben las dos formas, y quien
    // llena la hoja no tiene por qué saber cuál espera el programa.
    esperar(aCentavos("2.50")).igual(250, "2.50 son 250 centavos");
    esperar(aCentavos("2,50")).igual(250, "rechazar la coma cobraría CERO en vez de 2.50");
    esperar(aCentavos("5")).igual(500);
    esperar(aCentavos(16.35)).igual(1635, "también los que ya vienen como número");
  });

  test("no confunde separador de miles con decimales", () => {
    // EN LA HOJA REAL HAY UN «1,600.0». Leerlo como uno coma seis convertiría
    // un producto de mil seiscientos en uno de dos dólares.
    esperar(aCentavos("1,600.0")).igual(160000, "mil seiscientos, no uno coma seis");
    esperar(aCentavos("1.600,50")).igual(160050, "formato europeo: el último manda");
    esperar(aCentavos("1,600")).igual(160000, "tres dígitos detrás = miles");
    esperar(aCentavos("1,60")).igual(160, "dos dígitos detrás = decimales");
  });

  test("quita símbolos de moneda y no se rompe con basura", () => {
    esperar(aCentavos("B/. 2.50")).igual(250);
    esperar(aCentavos("$ 12")).igual(1200);
    for (const v of ["", null, undefined, "gratis", "  "]) {
      esperar(aCentavos(v)).igual(0, `${JSON.stringify(v)} no puede inventarse un precio`);
    }
  });

  test("redondea al centavo, porque el dinero no tiene milésimas", () => {
    esperar(aCentavos("2.505")).igual(251);
    esperar(aCentavos("0.004")).igual(0);
  });
});

describe("Tienda: variedades con recargo", () => {
  test("lee el formato de la hoja tal cual", () => {
    const o = leerOpciones("Pollo, Salmón {2.50}, Res {5}");
    esperar(o.length).igual(3);
    esperar(o[0]).igual({ texto: "Pollo", recargo: 0 });
    esperar(o[1]).igual({ texto: "Salmón", recargo: 250 });
    esperar(o[2]).igual({ texto: "Res", recargo: 500 });
  });

  test("una coma de más no crea una opción vacía", () => {
    // El error de tecleo más común de todos. Pintaría un botón en blanco que
    // el cliente puede pulsar sin saber qué está eligiendo.
    const o = leerOpciones("Pollo, Salmón, ");
    esperar(o.length).igual(2);
    esperar(o.map((x) => x.texto).join("|")).igual("Pollo|Salmón");
  });

  test("ante una llave rota NO se cobra de más", () => {
    // Cobrar por un error de tecleo es mucho peor que no cobrar: el cliente
    // paga de más y nadie se entera hasta que reclama.
    esperar(leerOpciones("Salmón {2.50")).igual([{ texto: "Salmón 2.50", recargo: 0 }]);
    esperar(leerOpciones("Salmón {}")).igual([{ texto: "Salmón", recargo: 0 }]);
  });

  test("sin variedades no hay variedades", () => {
    for (const v of ["", null, undefined, "  "]) esperar(leerOpciones(v)).igual([]);
  });

  test("el modo se entiende como lo escribe el cliente", () => {
    esperar(leerModo("HASTA COMPLETAR")).igual("hasta_completar");
    esperar(leerModo("hasta completar 3")).igual("hasta_completar");
    esperar(leerModo("varias")).igual("varias");
    esperar(leerModo("")).igual("una", "por defecto se elige UNA: es lo menos sorprendente");
    esperar(leerModo(null)).igual("una");
  });

  test("el recargo total sale de lo que el cliente eligió", () => {
    const grupos = [
      { nombre: "Tamaño", modo: "una", opciones: leerOpciones("5 lbs., 15 lbs. {3}") },
      { nombre: "Sabor", modo: "varias", opciones: leerOpciones("Pollo, Salmón {2.50}") },
    ];
    esperar(recargoDe(grupos, ["15 lbs.", "Salmón"])).igual(550, "3.00 + 2.50");
    esperar(recargoDe(grupos, ["5 lbs.", "Pollo"])).igual(0);
    esperar(recargoDe(grupos, ["no existe"])).igual(0, "una opción inventada no cobra nada");
    esperar(recargoDe([], ["lo que sea"])).igual(0);
  });

  test("sumar en centavos no arrastra el error de los decimales", () => {
    // LA RAZÓN DE QUE TODO ESTO SEA ENTERO. Con coma flotante, 0.1 + 0.2 no da
    // 0.3, y un carrito de veinte productos acaba con un centavo de más o de
    // menos. El cliente lo ve en el total y pierde la confianza.
    esperar(0.1 + 0.2 === 0.3).falso("así se comporta la coma flotante");
    const g = [{ nombre: "x", modo: "varias", opciones: leerOpciones("A {0.10}, B {0.20}") }];
    esperar(recargoDe(g, ["A", "B"])).igual(30, "en centavos la suma es exacta");
  });

  test("el dinero se escribe como lo lee una persona", () => {
    esperar(comoDinero(250)).igual("$2.50");
    esperar(comoDinero(160000)).igual("$1600.00");
    esperar(comoDinero(5)).igual("$0.05", "los centavos sueltos no se pierden");
    esperar(comoDinero(0)).igual("$0.00");
  });
});


describe("Tienda: la dirección pública", () => {
  test("un nombre de negocio se convierte en una dirección usable", () => {
    esperar(aDireccion("Paws at Home")).igual("paws-at-home");
    esperar(aDireccion("  Pizza  &  Pasta  ")).igual("pizza-pasta");
  });

  test("los acentos y las mayúsculas no llegan al enlace", () => {
    // «panadería» y «panaderia» tienen que llevar al MISMO sitio: nadie
    // escribe la tilde al teclear una dirección, y menos al dictarla.
    esperar(aDireccion("Panadería Ñam")).igual("panaderia-nam");
    esperar(aDireccion("PAWSATHOME")).igual("pawsathome");
  });

  test("la dirección solo lleva letras, números y guiones por dentro", () => {
    // La base exige `^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`. Limpiar no puede
    // INVENTAR letras —de «x» no salen tres— así que lo que se garantiza aquí
    // es la FORMA; del largo mínimo se encarga `direccionValida` antes de
    // guardar, para que el cliente lea una explicación y no un error de
    // Postgres en inglés.
    for (const entrada of [
      "Paws at Home", "---hola---", "Tienda 2026!!!", "a".repeat(80),
      "Café — Panamá", "  --  x  --  ", "el/la--tienda_2",
    ]) {
      const d = aDireccion(entrada);
      esperar(/^[a-z0-9-]*$/.test(d)).verdadero(`«${entrada}» dio «${d}»`);
      esperar(d.startsWith("-") || d.endsWith("-")).falso(`«${entrada}» dio «${d}»`);
      esperar(d.length <= 50).verdadero(`«${entrada}» dio «${d}»`);
      // Y lo que sí llega a tres caracteres tiene que pasar la regla entera.
      if (d.length >= 3) esperar(direccionValida(d)).verdadero(`«${entrada}» dio «${d}»`);
    }
  });

  test("lo que se queda demasiado corto se para ANTES de guardar", () => {
    // «  --  x  --  » se limpia a «x», un solo carácter, y eso la base lo
    // rechaza. Quien tiene que frenarlo es la validación de la acción, con un
    // mensaje que se entiende — no un reventón al insertar.
    esperar(aDireccion("  --  x  --  ")).igual("x");
    esperar(direccionValida("x")).falso();
  });

  test("recortar a 50 no deja un guion colgando", () => {
    // AQUÍ ESTÁ LA TRAMPA: el corte se hace DESPUÉS de meter los guiones, así
    // que puede caer justo encima de uno y dejar «...abc-», que la base
    // rechaza. Por eso se vuelve a limpiar el final después de cortar.
    const largo = "a".repeat(49) + " " + "b".repeat(20);
    const d = aDireccion(largo);
    esperar(d.endsWith("-")).falso("no puede acabar en guion");
    esperar(direccionValida(d)).verdadero(d);
    esperar(d.length <= 50).verdadero();
  });

  test("lo que no da una dirección da vacío, no basura", () => {
    for (const v of ["", "   ", "!!!", "---", null, undefined]) {
      esperar(aDireccion(v)).igual("");
    }
  });

  test("una dirección demasiado corta NO se acepta", () => {
    // Dos letras no encajan en la regla de la base. Se rechaza aquí, con un
    // mensaje que se entiende, en vez de dejar que reviente al guardar.
    esperar(direccionValida("ab")).falso();
    esperar(direccionValida("abc")).verdadero();
    esperar(direccionValida("-abc")).falso("no puede empezar con guion");
    esperar(direccionValida("abc-")).falso("ni acabar con guion");
    esperar(direccionValida("ABC")).falso("mayúsculas no");
  });
});


describe("Tienda: cómo se ve y qué pregunta", () => {
  test("una configuración vacía sigue dando una tienda que se puede pintar", () => {
    // LA CONFIGURACIÓN VIVE EN UN `jsonb` que pudo escribir una versión
    // anterior, un importador o alguien con la consola abierta. Si el
    // escaparate confiara en que están todas las claves, un campo que falta
    // sería una tienda EN BLANCO para un cliente de verdad.
    for (const entrada of [null, undefined, {}, "no soy un objeto", 42]) {
      const c = leerConfig(entrada);
      esperar(colorValido(c.colores.principal)).verdadero();
      esperar(colorValido(c.colores.fondo)).verdadero();
      esperar(c.moneda.length > 0).verdadero();
      esperar(c.preguntas.length > 0).verdadero("un formulario sin preguntas no recoge un pedido");
    }
  });

  test("un color roto no tumba la tienda: se usa el de siempre", () => {
    // Alguien escribe «azul» o «#GGG» y la tienda entera se quedaría sin
    // pintar. Vale más una tienda con el color por defecto que ninguna.
    const c = leerConfig({ colores: { principal: "azul", acento: "#F5247D", fondo: "#GGGGGG" } });
    esperar(c.colores.principal).igual(CONFIG_POR_DEFECTO.colores.principal);
    esperar(c.colores.acento).igual("#F5247D", "el que SÍ es válido se respeta");
    esperar(c.colores.fondo).igual(CONFIG_POR_DEFECTO.colores.fondo);
  });

  test("el teléfono se guarda como lo quiere WhatsApp", () => {
    // «+507 6238-1138» rompe el enlace de wa.me EN SILENCIO: abre y no
    // encuentra a nadie. Nadie se entera hasta que un cliente se queja.
    esperar(soloDigitos("+507 6238-1138")).igual("50762381138");
    esperar(soloDigitos("(507) 6238 1138")).igual("50762381138");
    esperar(leerConfig({ whatsapp: { numero: "+507 6238-1138" } }).whatsapp.numero).igual("50762381138");
    esperar(soloDigitos(null)).igual("");
  });

  test("una lista sin opciones se convierte en texto libre", () => {
    // Un desplegable vacío es una pregunta que NO se puede contestar, y si es
    // obligatoria el cliente se queda encerrado sin poder pedir.
    const c = leerConfig({
      preguntas: [{ id: "pago", etiqueta: "Forma de Pago", tipo: "lista", opciones: [] }],
    });
    esperar(c.preguntas[0].tipo).igual("texto");
    const b = leerConfig({
      preguntas: [{ id: "pago", etiqueta: "Forma de Pago", tipo: "lista", opciones: ["Yappy", "Efectivo"] }],
    });
    esperar(b.preguntas[0].tipo).igual("lista");
    esperar(b.preguntas[0].opciones.join("|")).igual("Yappy|Efectivo");
  });

  test("una pregunta sin etiqueta se descarta", () => {
    // Pintaría un campo en blanco que el cliente tiene que rellenar sin saber
    // qué le están preguntando.
    const c = leerConfig({
      preguntas: [
        { id: "a", etiqueta: "Nombre completo", tipo: "texto", obligatoria: true },
        { id: "b", etiqueta: "   ", tipo: "texto" },
        { id: "c", etiqueta: "Nombre PH", tipo: "texto", obligatoria: true },
      ],
    });
    esperar(c.preguntas.length).igual(2);
    esperar(c.preguntas.map((p) => p.etiqueta).join("|")).igual("Nombre completo|Nombre PH");
  });

  test("el id de una pregunta sale de su texto, no de quien lo mande", () => {
    // Antes el id venía de fuera y, si faltaba, se inventaba por posición
    // (`pregunta_1`). Eso hacía que reordenar el formulario cambiara los ids y
    // los pedidos viejos dejaran de cuadrar. Ahora sale SIEMPRE de la etiqueta,
    // y un id que venga de fuera se ignora.
    const c = leerConfig({
      preguntas: [
        { id: "loquesea", etiqueta: "Nombre del perro" },
        { etiqueta: "Raza" },
      ],
    });
    esperar(c.preguntas[0].id).igual("nombre_del_perro");
    esperar(c.preguntas[1].id).igual("raza");
  });

  test("una tienda sin WhatsApp NO está lista para vender", () => {
    // EL FALLO MÁS CARO DE TODOS, porque no se ve: la tienda queda preciosa,
    // el cliente llena el carrito, pulsa el botón y no pasa nada.
    const sin = leerConfig({ titulo: "Paws at Home" });
    esperar(loQueFaltaParaVender(sin).length > 0).verdadero();
    esperar(loQueFaltaParaVender(sin).join(" ").includes("WhatsApp")).verdadero();

    const corto = leerConfig({ titulo: "Paws at Home", whatsapp: { numero: "62381" } });
    esperar(loQueFaltaParaVender(corto).join(" ").includes("código de país")).verdadero();

    const lista = leerConfig({ titulo: "Paws at Home", whatsapp: { numero: "+507 6238-1138" } });
    esperar(loQueFaltaParaVender(lista)).igual([]);
  });

  test("un banner sin imagen no se pinta", () => {
    const c = leerConfig({
      banners: [{ imagen_url: "https://x/1.png", enlace: "https://x" }, { imagen_url: "  " }, {}],
    });
    esperar(c.banners.length).igual(1);
    esperar(c.banners[0].imagen_url).igual("https://x/1.png");
  });

  test("el mínimo de pedido es un entero de centavos, nunca negativo", () => {
    esperar(leerConfig({ minimo_pedido: 1500 }).minimo_pedido).igual(1500);
    esperar(leerConfig({ minimo_pedido: -5 }).minimo_pedido).igual(0);
    esperar(leerConfig({ minimo_pedido: "no" }).minimo_pedido).igual(0);
    esperar(leerConfig({ minimo_pedido: 10.6 }).minimo_pedido).igual(11, "medio centavo no existe");
  });
});


describe("Tienda: lo que se escribe a mano", () => {
  test("el formulario admite los tipos que hace falta preguntar", () => {
    const p = sanearPreguntas([
      { etiqueta: "Nombre Completo", tipo: "texto", obligatoria: true },
      { etiqueta: "Método de pago", tipo: "lista", obligatoria: true, opciones: ["Efectivo", "Yappy", "MercadoPago", "Tarjeta de crédito"] },
      { etiqueta: "Comentarios", tipo: "parrafo" },
      { etiqueta: "Teléfono", tipo: "telefono" },
    ]);
    esperar(p.length).igual(4);
    esperar(p[0].id).igual("nombre_completo");
    esperar(p[1].tipo).igual("lista");
    esperar(p[1].opciones.join("|")).igual("Efectivo|Yappy|MercadoPago|Tarjeta de crédito");
    esperar(p[2].tipo).igual("parrafo");
    esperar(p[3].obligatoria).falso();
  });

  test("una lista sin opciones de verdad no se pinta como desplegable", () => {
    // Un desplegable vacío —o de un solo elemento— es una pregunta que el
    // cliente no puede contestar. Si además es obligatoria, se queda encerrado
    // sin poder pedir.
    esperar(sanearPreguntas([{ etiqueta: "Sucursal", tipo: "lista", opciones: [] }])[0].tipo).igual("texto");
    esperar(sanearPreguntas([{ etiqueta: "Sucursal", tipo: "lista", opciones: ["Centro"] }])[0].tipo).igual("texto");
    esperar(sanearPreguntas([{ etiqueta: "Sucursal", tipo: "lista", opciones: ["Centro", "Norte"] }])[0].tipo).igual("lista");
  });

  test("las opciones repetidas de una lista se quitan", () => {
    const p = sanearPreguntas([
      { etiqueta: "Pago", tipo: "lista", opciones: ["Yappy", " Yappy ", "Efectivo", ""] },
    ]);
    esperar(p[0].opciones).igual(["Yappy", "Efectivo"]);
  });

  test("el id sobrevive a mover las preguntas de sitio", () => {
    // EL ID ES LO QUE SE GUARDA CON CADA PEDIDO. Si saliera de la posición,
    // reordenar el formulario haría ilegibles todos los pedidos anteriores.
    const antes = sanearPreguntas([{ etiqueta: "Nombre" }, { etiqueta: "Dirección" }]);
    const despues = sanearPreguntas([{ etiqueta: "Dirección" }, { etiqueta: "Nombre" }]);
    esperar(antes[0].id).igual(despues[1].id);
    esperar(antes[1].id).igual(despues[0].id);
    esperar(antes[1].id).igual("direccion", "los acentos no llegan al id");
  });

  test("dos preguntas iguales no comparten respuesta", () => {
    const p = sanearPreguntas([{ etiqueta: "Talla" }, { etiqueta: "Talla" }, { etiqueta: "Talla" }]);
    esperar(new Set(p.map((x) => x.id)).size).igual(3);
  });

  test("una pregunta sin texto no se guarda", () => {
    // Pintaría una casilla en blanco que el cliente tiene que rellenar sin
    // saber qué le están preguntando.
    esperar(sanearPreguntas([{ etiqueta: "   " }, { etiqueta: "" }, {}])).igual([]);
    for (const v of [null, undefined, "texto", 42, {}]) esperar(sanearPreguntas(v)).igual([]);
  });

  test("el formulario se corta en diez, como la hoja", () => {
    // `pr_preg1`…`pr_preg10`. Y hay motivo además del histórico: cada pregunta
    // es una casilla más entre el carrito y el pedido enviado.
    const muchas = Array.from({ length: 25 }, (_, i) => ({ etiqueta: `Pregunta ${i + 1}` }));
    esperar(sanearPreguntas(muchas).length).igual(MAX_PREGUNTAS);
    esperar(MAX_PREGUNTAS).igual(10);
  });

  test("las variedades se escriben igual que en la hoja", () => {
    const g = leerGruposEscritos("Tamaño | una | 5 lbs., 15 lbs. {3}\nSabor | hasta completar 3 | Pollo, Salmón {2.50}");
    esperar(g.length).igual(2);
    esperar(g[0].modo).igual("una");
    esperar(g[0].opciones[1]).igual({ texto: "15 lbs.", recargo: 300 });
    esperar(g[1].modo).igual("hasta_completar");
    esperar(g[1].cantidad).igual(3);
    esperar(g[1].opciones[1].recargo).igual(250);
  });

  test("un grupo sin opciones no se guarda", () => {
    // Sería una pregunta que el cliente no puede contestar; si el producto la
    // necesita, no se puede ni pedir.
    esperar(leerGruposEscritos("Tamaño | una |")).igual([]);
    esperar(leerGruposEscritos(" | una | A, B")).igual([]);
  });

  test("las variedades también cuadran de ida y vuelta", () => {
    const texto = "Tamaño | una | 5 lbs., 15 lbs. {3.00}\nSabor | hasta completar 3 | Pollo, Salmón {2.50}";
    esperar(escribirGrupos(leerGruposEscritos(texto))).igual(texto);
  });
});


describe("Tienda: pegar el catálogo desde una hoja", () => {
  // La cabecera REAL de la hoja que ya usan, con sus nombres tal cual.
  const CABECERA =
    "Nombre\tDescripcion\tVariedades\tVariedades2\tVariedades2 Modo\tVariedades2 Cantidad\tVariedades3\tPrecio\tPrecio Anterior\tOcultar\tCategoria";

  test("se entienden las columnas de la hoja que ya usan", () => {
    // SIN ESTO NO HAY MIGRACIÓN. Cargar cincuenta productos a mano no lo hace
    // nadie: se abandona a la mitad y la tienda se queda en la hoja vieja.
    const p = leerPegado(
      CABECERA +
        "\nCroquetas\tPara adulto\t5 lbs., 15 lbs. {3}\tPollo, Salmón {2.50}\tHASTA COMPLETAR\t3\t\t12.50\t15.00\t\tRoyal Canin",
    );
    esperar(p.length).igual(1);
    esperar(p[0].nombre).igual("Croquetas");
    esperar(p[0].categoria).igual("Royal Canin");
    esperar(p[0].precio).igual(1250, "en centavos, siempre");
    esperar(p[0].precio_anterior).igual(1500);
    esperar(p[0].oculto).falso();
    esperar(p[0].variedades.length).igual(2);
    esperar(p[0].variedades[0].opciones[1]).igual({ texto: "15 lbs.", recargo: 300 });
    esperar(p[0].variedades[1].modo).igual("hasta_completar");
    esperar(p[0].variedades[1].cantidad).igual(3);
    esperar(p[0].variedades[1].opciones[1].recargo).igual(250);
  });

  test("«Ocultar» se escribe de seis maneras y todas valen", () => {
    for (const v of ["SI", "si", "x", "TRUE", "1", "Sí"]) esperar(esSi(v)).verdadero(v);
    for (const v of ["", "no", "NO", "0", "falso"]) esperar(esSi(v)).falso(v);
  });

  test("una descripción con salto de línea no parte la tabla en dos", () => {
    // LA HOJA ENTRECOMILLA esas celdas y mete el salto tal cual. Cortando por
    // «\n» a secas, ese producto se rompería y arrastraría el resto: se
    // perderían filas SIN QUE NADIE LO NOTE hasta ver la tienda mal.
    const p = leerPegado(
      "Nombre\tDescripcion\tPrecio\n" +
        '"Pastel"\t"Dos pisos.\nCon fresas."\t25.00\n' +
        "Galletas\tSencillas\t3.00",
    );
    esperar(p.length).igual(2);
    esperar(p[0].descripcion).igual("Dos pisos.\nCon fresas.");
    esperar(p[1].nombre).igual("Galletas");
  });

  test("las comillas dobles dentro de una celda se conservan", () => {
    const filas = cortarTabla('"Pizza 12"" grande"\t10.00');
    esperar(filas[0][0]).igual('Pizza 12" grande');
  });

  test("las filas en blanco del final no crean productos fantasma", () => {
    // Seleccionar de más en la hoja es lo más común del mundo.
    const p = leerPegado("Nombre\tPrecio\nPan\t1.50\n\t\n\n");
    esperar(p.length).igual(1);
    esperar(p[0].nombre).igual("Pan");
  });

  test("sin fila de encabezados se asume el orden de la tabla", () => {
    const p = leerPegado("Pan\tIntegral\tPanadería\t1.50");
    esperar(p.length).igual(1);
    esperar(p[0].nombre).igual("Pan");
    esperar(p[0].categoria).igual("Panadería");
    esperar(p[0].precio).igual(150);
  });

  test("un encabezado NO se confunde con un producto llamado «Precio»", () => {
    // Hace falta que coincidan DOS columnas para dar la fila por encabezado.
    // Con una sola, se perdería un producto de verdad.
    // UNA sola coincidencia no basta. Aquí «Precio» SÍ es un nombre de columna
    // conocido, pero el resto de la fila no lo es: es un producto que se llama
    // así, y darlo por encabezado lo haría desaparecer sin avisar.
    const p = leerPegado("Precio\tsuelto\t9.00");
    esperar(p.length).igual(1, "esta fila es un producto, no un encabezado");
    esperar(p[0].nombre).igual("Precio");

    // Con DOS sí es encabezado, y entonces la fila no es un producto.
    const q = leerPegado("Nombre\tPrecio\nPan\t1.50");
    esperar(q.length).igual(1);
    esperar(q[0].nombre).igual("Pan");
  });

  test("un «antes» que no es oferta no se pinta tachado", () => {
    // Un precio tachado que no es menor hace desconfiar de la tienda entera.
    const p = leerPegado("Nombre\tPrecio\tPrecio Anterior\nPan\t10.00\t8.00");
    esperar(p[0].precio_anterior).igual(null);
  });

  test("el stock vacío NO es cero", () => {
    // Vacío = no llevo control. Cero = agotado. Confundirlos esconde del
    // escaparate productos que sí hay.
    const p = leerPegado("Nombre\tPrecio\tStock\nPan\t1.00\t\nLeche\t2.00\t0");
    esperar(p[0].stock).igual(null);
    esperar(p[1].stock).igual(0);
  });

  test("pegar nada no rompe nada", () => {
    for (const v of ["", "   ", null, undefined, "\n\n"]) esperar(leerPegado(v)).igual([]);
  });
});


describe("Tienda: las opciones que llegan del navegador", () => {
  // `sanearGrupos` es LA PUERTA. La pantalla de opciones es una comodidad; esto
  // llega como JSON desde el navegador y decide cuánto se le cobra a alguien.

  test("un grupo sin nombre no se guarda", () => {
    // En el escaparate sería una pregunta sin enunciado.
    esperar(sanearGrupos([{ nombre: "  ", modo: "una", opciones: [{ texto: "A", recargo: 0 }] }])).igual([]);
  });

  test("un grupo sin opciones no se guarda", () => {
    // Una pregunta que el cliente no puede contestar; si el producto la
    // necesita, no se puede ni pedir.
    esperar(sanearGrupos([{ nombre: "Sabor", modo: "una", opciones: [] }])).igual([]);
    esperar(sanearGrupos([{ nombre: "Sabor", modo: "una", opciones: [{ texto: "  " }] }])).igual([]);
  });

  test("una opción repetida se cobraría dos veces, así que se quita", () => {
    // Las elecciones se buscan POR SU TEXTO al sumar el recargo. Dos opciones
    // con el mismo nombre en un grupo cobran doble sin que nadie lo vea.
    const g = sanearGrupos([
      {
        nombre: "Extras",
        modo: "varias",
        opciones: [
          { texto: "Queso", recargo: 100 },
          { texto: "queso", recargo: 100 },
          { texto: "Tocino", recargo: 150 },
        ],
      },
    ]);
    esperar(g[0].opciones.length).igual(2);
    esperar(g[0].opciones.map((o) => o.texto).join("|")).igual("Queso|Tocino");
  });

  test("un recargo negativo o roto NO baja el precio a escondidas", () => {
    const g = sanearGrupos([
      {
        nombre: "Tamaño",
        modo: "una",
        opciones: [
          { texto: "Chico", recargo: -500 },
          { texto: "Grande", recargo: "no soy un número" },
          { texto: "Gigante", recargo: 250 },
        ],
      },
    ]);
    esperar(g[0].opciones.map((o) => o.recargo)).igual([0, 0, 250]);
  });

  test("un modo inventado cae en «elige una»", () => {
    // Lo menos sorprendente. Un modo desconocido dejaría el grupo sin reglas.
    esperar(sanearGrupos([{ nombre: "X", modo: "loquesea", opciones: [{ texto: "A" }] }])[0].modo).igual("una");
  });

  test("la cantidad solo cuenta en «elige una cantidad exacta»", () => {
    const a = sanearGrupos([{ nombre: "X", modo: "una", cantidad: 5, opciones: [{ texto: "A" }] }]);
    esperar(a[0].cantidad === undefined).verdadero("una cantidad en «elige una» no significa nada");

    const b = sanearGrupos([
      { nombre: "X", modo: "hasta_completar", cantidad: 6, opciones: [{ texto: "A" }] },
    ]);
    esperar(b[0].cantidad).igual(6);

    // Uno no es una cantidad: es elegir una.
    const c = sanearGrupos([
      { nombre: "X", modo: "hasta_completar", cantidad: 1, opciones: [{ texto: "A" }] },
    ]);
    esperar(c[0].cantidad === undefined).verdadero();
  });

  test("«hasta completar» SIN cantidad no puede bloquear el grupo", () => {
    // ESTO COSTÓ UNA TIENDA. La hoja traía `Variedades2 Modo = HASTA COMPLETAR`
    // con la casilla de cantidad vacía. El tope quedaba en cero, y el
    // escaparate bloqueaba EN SILENCIO cada clic de ese grupo: el cliente veía
    // las opciones, las pulsaba, y no pasaba nada. Sin nombre para el fallo,
    // parece que la tienda está rota.
    //
    // Un grupo así no es «elige exactamente N»: es «elige las que quieras».
    for (const cantidad of [undefined, null, 0, 1, "", "no", NaN]) {
      const g = sanearGrupos([
        { nombre: "Variedades 2", modo: "hasta_completar", cantidad, opciones: [{ texto: "A" }, { texto: "B" }] },
      ]);
      esperar(g[0].modo).igual("varias", `con cantidad ${JSON.stringify(cantidad)}`);
      esperar(g[0].cantidad === undefined).verdadero();
    }

    // Con una cantidad de verdad sí se respeta.
    const bien = sanearGrupos([
      { nombre: "Sabor", modo: "hasta_completar", cantidad: 3, opciones: [{ texto: "A" }] },
    ]);
    esperar(bien[0].modo).igual("hasta_completar");
    esperar(bien[0].cantidad).igual(3);
  });

  test("un grupo convertido a «varias» deja de ser obligatorio", () => {
    // Y esa es justo la salida: como «varias» nunca es obligatoria, el cliente
    // puede pedir aunque no elija nada de ese grupo.
    const g = sanearGrupos([
      { nombre: "Variedades 2", modo: "hasta_completar", opciones: [{ texto: "A" }] },
    ]);
    esperar(faltaElegir(g, [])).igual([]);
  });

  test("basura no rompe nada", () => {
    for (const v of [null, undefined, "texto", 42, {}, [null], [{}], [[]]]) {
      esperar(Array.isArray(sanearGrupos(v))).verdadero();
    }
    esperar(sanearGrupos([null, { nombre: "X", opciones: [{ texto: "A" }] }]).length).igual(1);
  });

  test("lo saneado se puede cobrar sin sorpresas", () => {
    // La prueba de que las dos piezas encajan: lo que sale de aquí es lo que
    // `recargoDe` va a sumar en el carrito.
    const g = sanearGrupos([
      {
        nombre: "Extras",
        modo: "varias",
        opciones: [
          { texto: "Queso", recargo: 100 },
          { texto: "Tocino", recargo: 150 },
        ],
      },
    ]);
    esperar(recargoDe(g, ["Queso", "Tocino"])).igual(250);
  });
});


describe("Tienda: el carrito y el pedido", () => {
  const linea = (extra = {}) => ({
    clave: "x",
    producto_id: "p1",
    nombre: "Croquetas",
    precio: 1250,
    cantidad: 1,
    elegidas: [],
    nota: "",
    ...extra,
  });

  test("el precio de una unidad incluye los recargos", () => {
    const l = linea({ elegidas: [{ grupo: "Tamaño", texto: "15 lbs.", recargo: 300 }] });
    esperar(precioUnitario(l)).igual(1550);
  });

  test("tres unidades cuestan tres veces, sin arrastrar centavos", () => {
    // POR ESTO TODO ES ENTERO. Con coma flotante, 12.50 + recargos por tres
    // acaba con un centavo de diferencia entre la pantalla y el mensaje — y el
    // cliente lo ve.
    const l = linea({ cantidad: 3, elegidas: [{ grupo: "Sabor", texto: "Salmón", recargo: 250 }] });
    esperar(totalDeLinea(l)).igual(4500);
    esperar(totalDelCarrito([l, linea({ clave: "y" })])).igual(5750);
    esperar(cuantasUnidades([l, linea({ clave: "y", cantidad: 2 })])).igual(5);
  });

  test("el mismo producto con distintas opciones son DOS líneas", () => {
    // Si se juntaran por el id del producto, pedir una pizza con piña y otra
    // sin piña daría «2 pizzas» y una de las dos saldría mal.
    const conPina = claveDeLinea("p1", [{ grupo: "Extras", texto: "Piña" }], "");
    const sinPina = claveDeLinea("p1", [], "");
    esperar(conPina === sinPina).falso();

    // Y el mismo producto con las mismas opciones en otro orden es LA MISMA.
    const a = claveDeLinea("p1", [{ grupo: "A", texto: "1" }, { grupo: "B", texto: "2" }], "");
    const b = claveDeLinea("p1", [{ grupo: "B", texto: "2" }, { grupo: "A", texto: "1" }], "");
    esperar(a).igual(b, "el orden en que se pulsaron no hace otro producto");

    // Una nota distinta SÍ es otra línea: «sin cebolla» no se puede juntar.
    esperar(claveDeLinea("p1", [], "sin cebolla") === sinPina).falso();
  });

  test("no se deja pedir sin elegir lo obligatorio", () => {
    // Un pedido sin el tamaño obliga a llamar al cliente, y esa llamada es
    // donde se pierden los pedidos pequeños.
    const grupos = [
      { nombre: "Tamaño", modo: "una", opciones: [{ texto: "5 lbs.", recargo: 0 }] },
      { nombre: "Extras", modo: "varias", opciones: [{ texto: "Juguete", recargo: 100 }] },
      { nombre: "Sabor", modo: "hasta_completar", cantidad: 3, opciones: [{ texto: "Pollo", recargo: 0 }] },
    ];
    esperar(faltaElegir(grupos, [])).igual(["Tamaño", "Sabor"], "«las que quiera» nunca es obligatoria");

    const casi = [
      { grupo: "Tamaño", texto: "5 lbs." },
      { grupo: "Sabor", texto: "Pollo" },
      { grupo: "Sabor", texto: "Pollo" },
    ];
    esperar(faltaElegir(grupos, casi)).igual(["Sabor"], "dos de tres todavía no completa");

    esperar(faltaElegir(grupos, [...casi, { grupo: "Sabor", texto: "Pollo" }])).igual([]);
  });

  test("el formulario obligatorio se comprueba antes de enviar", () => {
    const preguntas = [
      { id: "nombre", etiqueta: "Nombre completo", tipo: "texto", obligatoria: true },
      { id: "nota", etiqueta: "Comentarios", tipo: "parrafo", obligatoria: false },
    ];
    esperar(faltaContestar(preguntas, {})).igual(["Nombre completo"]);
    esperar(faltaContestar(preguntas, { nombre: "   " })).igual(["Nombre completo"], "espacios no cuentan");
    esperar(faltaContestar(preguntas, { nombre: "Ana" })).igual([]);
  });

  test("el mensaje lleva todo lo que hace falta para preparar y cobrar", () => {
    const texto = textoDelPedido({
      tienda: "Paws at Home",
      lineas: [
        linea({
          cantidad: 2,
          elegidas: [
            { grupo: "Tamaño", texto: "15 lbs.", recargo: 300 },
            { grupo: "Sabor", texto: "Salmón", recargo: 250 },
          ],
          nota: "tocar el timbre",
        }),
      ],
      respuestas: { nombre: "Ana", ph: "Torre 3" },
      preguntas: [
        { id: "nombre", etiqueta: "Nombre Completo", tipo: "texto", obligatoria: true },
        { id: "ph", etiqueta: "Nombre PH", tipo: "texto", obligatoria: true },
        { id: "vacia", etiqueta: "Comentarios", tipo: "texto", obligatoria: false },
      ],
      moneda: "$",
    });

    esperar(texto.includes("2 × Croquetas")).verdadero();
    esperar(texto.includes("Tamaño: 15 lbs. (+$3.00)")).verdadero();
    esperar(texto.includes("Nota: tocar el timbre")).verdadero();
    esperar(texto.includes("*Total: $36.00*")).verdadero("(12.50+3.00+2.50) × 2");
    esperar(texto.includes("Nombre PH: Torre 3")).verdadero();
    esperar(texto.includes("Comentarios")).falso("una pregunta sin contestar no ensucia el mensaje");
  });

  test("el total sale SIEMPRE, aunque haya una sola cosa", () => {
    // Es el número que se cobra. Buscarlo sumando de cabeza es como se cobra
    // mal, y en un teléfono es peor.
    const texto = textoDelPedido({
      tienda: "X",
      lineas: [linea()],
      respuestas: {},
      preguntas: [],
      moneda: "$",
    });
    esperar(texto.includes("*Total: $12.50*")).verdadero();
  });

  test("el enlace de WhatsApp no se corta a la mitad", () => {
    // Un pedido lleva saltos de línea, acentos, almohadillas y signos de más.
    // Sin codificar, lo que se pierde es el FINAL: el total y la dirección.
    const url = enlaceDeWhatsapp("+507 6238-1138", "Línea 1\nTotal: $5+2 #1 & ya");
    esperar(url.startsWith("https://wa.me/50762381138?text=")).verdadero();
    esperar(url.includes("\n")).falso();
    esperar(url.includes(" ")).falso();
    esperar(decodeURIComponent(url.split("text=")[1])).igual("Línea 1\nTotal: $5+2 #1 & ya");
  });

  test("una línea en cero no se cuela en el mensaje", () => {
    const texto = textoDelPedido({
      tienda: "X",
      lineas: [linea({ cantidad: 0 }), linea({ clave: "y", cantidad: 1 })],
      respuestas: {},
      preguntas: [],
      moneda: "$",
    });
    esperar(texto.split("Croquetas").length - 1).igual(1);
  });
});


describe("Tienda: el pedido se recalcula en el servidor", () => {
  // ESTA ES LA PIEZA QUE IMPIDE QUE TE ROBEN. El escaparate es una página
  // pública: cualquiera abre la consola del navegador y manda lo que quiera.

  const catalogo = [
    {
      id: "p1",
      nombre: "Croquetas",
      precio: 6000,
      oculto: false,
      stock: null,
      variedades: [
        {
          nombre: "Tamaño",
          modo: "una",
          opciones: [
            { texto: "5 lbs.", recargo: 0 },
            { texto: "15 lbs.", recargo: 300 },
          ],
        },
      ],
    },
    { id: "p2", nombre: "Juguete", precio: 500, oculto: false, stock: 3, variedades: [] },
    { id: "oculto", nombre: "Escondido", precio: 100, oculto: true, stock: null, variedades: [] },
    { id: "agotado", nombre: "Agotado", precio: 100, oculto: false, stock: 0, variedades: [] },
  ];

  test("el precio SIEMPRE sale del catálogo, no de lo que mandan", () => {
    // El intento clásico: pedir un saco de 60 dólares por un centavo.
    const r = recalcularPedido(catalogo, [
      { producto_id: "p1", cantidad: 1, precio: 1, elegidas: [{ grupo: "Tamaño", texto: "5 lbs." }] },
    ]);
    esperar(r.lineas[0].precio).igual(6000);
    esperar(r.total).igual(6000);
  });

  test("los recargos también salen del catálogo", () => {
    // Inventarse «15 lbs.» con recargo 0 no puede abaratar el saco grande.
    const r = recalcularPedido(catalogo, [
      {
        producto_id: "p1",
        cantidad: 2,
        elegidas: [{ grupo: "Tamaño", texto: "15 lbs.", recargo: 0 }],
      },
    ]);
    esperar(r.lineas[0].elegidas[0].recargo).igual(300);
    esperar(r.lineas[0].precio).igual(6300);
    esperar(r.total).igual(12600);
  });

  test("una opción que ese producto no tiene tumba la línea entera", () => {
    // No se acepta a medias: un pedido a medio validar parece válido y se
    // prepara, que es peor que rechazarlo.
    const r = recalcularPedido(catalogo, [
      { producto_id: "p1", cantidad: 1, elegidas: [{ grupo: "Tamaño", texto: "500 lbs." }] },
    ]);
    esperar(r.lineas).igual([]);
    esperar(r.total).igual(0);
    esperar(r.rechazos.length).igual(1);
  });

  test("lo obligatorio se exige también aquí, no solo en la pantalla", () => {
    const r = recalcularPedido(catalogo, [{ producto_id: "p1", cantidad: 1, elegidas: [] }]);
    esperar(r.lineas).igual([]);
    esperar(r.rechazos[0].includes("Tamaño")).verdadero();
  });

  test("lo oculto y lo agotado no se pueden pedir", () => {
    const r = recalcularPedido(catalogo, [
      { producto_id: "oculto", cantidad: 1, elegidas: [] },
      { producto_id: "agotado", cantidad: 1, elegidas: [] },
      { producto_id: "no-existe", cantidad: 1, elegidas: [] },
    ]);
    esperar(r.lineas).igual([]);
    esperar(r.rechazos.length).igual(3);
  });

  test("no se vende más de lo que hay", () => {
    esperar(recalcularPedido(catalogo, [{ producto_id: "p2", cantidad: 4, elegidas: [] }]).lineas).igual([]);
    const bien = recalcularPedido(catalogo, [{ producto_id: "p2", cantidad: 3, elegidas: [] }]);
    esperar(bien.total).igual(1500);
  });

  test("las cantidades raras no pasan", () => {
    for (const cantidad of [0, -3, 1.5, "muchas", null, undefined, NaN, Infinity]) {
      const r = recalcularPedido(catalogo, [{ producto_id: "p2", cantidad, elegidas: [] }]);
      // 1.5 se trunca a 1, que es aceptable; el resto se cae.
      if (cantidad === 1.5) esperar(r.lineas[0].cantidad).igual(1);
      else esperar(r.lineas).igual([], String(cantidad));
    }
  });

  test("un pedido vacío o con basura da cero, no un error", () => {
    for (const v of [[], null, undefined, "texto", 42, [null], [{}]]) {
      const r = recalcularPedido(catalogo, v);
      esperar(r.total).igual(0);
      esperar(Array.isArray(r.lineas)).verdadero();
    }
  });

  test("lo bueno pasa aunque venga con algo malo al lado", () => {
    // Un pedido mixto no se descarta entero: se queda lo que cuadra y se dice
    // qué se cayó, para poder explicárselo a quien pidió.
    const r = recalcularPedido(catalogo, [
      { producto_id: "p2", cantidad: 2, elegidas: [] },
      { producto_id: "agotado", cantidad: 1, elegidas: [] },
    ]);
    esperar(r.lineas.length).igual(1);
    esperar(r.total).igual(1000);
    esperar(r.rechazos.length).igual(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Yappy
 * ──────────────────────────────────────────────────────────────────────────*/

describe("Tienda: el aviso de pago de Yappy", () => {
  // Un secreto con la forma que documenta Yappy: base64 de «parte1.parte2».
  const SECRETO = Buffer.from("llavebuena.otracosa", "utf-8").toString("base64");
  const DOMINIO = "https://store.demandu.tech";

  const avisoDe = (orderId, status, secreto = SECRETO, domain = DOMINIO) => ({
    secreto,
    orderId,
    status,
    domain,
    hash: firmaIpn(secreto, orderId, status, domain),
    dominioEsperado: DOMINIO,
  });

  test("la llave sale de la primera parte del secreto", () => {
    esperar(claveDeFirma(SECRETO)).igual("llavebuena");
  });

  test("un secreto que no es base64 se usa tal cual, no se rompe", () => {
    esperar(claveDeFirma("asi-tal-cual")).igual("asi-tal-cual");
  });

  test("la firma es exactamente la que documenta Yappy", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // SE CALCULA A MANO, sin usar nada de yappy.ts salvo lo que se prueba. Si
    // esta prueba llamara a las mismas funciones para esperar y para
    // comprobar, pasaría igual con el algoritmo equivocado — y el fallo
    // aparecería el día del primer pago real, en forma de pago rechazado.
    // ─────────────────────────────────────────────────────────────────────────
    const aMano = crypto
      .createHmac("sha256", "llavebuena")
      .update("ABC123" + "E" + DOMINIO)
      .digest("hex");
    esperar(firmaIpn(SECRETO, "ABC123", "E", DOMINIO)).igual(aMano);
  });

  test("un aviso bien firmado se acepta", () => {
    esperar(ipnValido(avisoDe("ABC123", "E")).ok).verdadero();
  });

  test("SIN FIRMA NO SE COBRA: un aviso inventado se rechaza", () => {
    const malo = { ...avisoDe("ABC123", "E"), hash: "a".repeat(64) };
    esperar(ipnValido(malo).ok).falso();
  });

  test("una firma de otro pedido no sirve para este", () => {
    // Es el ataque obvio: pagar un pedido de un dólar y reusar ese aviso.
    const otro = firmaIpn(SECRETO, "OTRO999", "E", DOMINIO);
    esperar(ipnValido({ ...avisoDe("ABC123", "E"), hash: otro }).ok).falso();
  });

  test("una firma de «rechazado» no vale para «pagado»", () => {
    const rechazado = firmaIpn(SECRETO, "ABC123", "R", DOMINIO);
    esperar(ipnValido({ ...avisoDe("ABC123", "E"), hash: rechazado }).ok).falso();
  });

  test("un aviso firmado para otro dominio no se recicla", () => {
    const ajeno = avisoDe("ABC123", "E", SECRETO, "https://otra-tienda.com");
    esperar(ipnValido(ajeno).ok).falso();
  });

  test("una tienda sin secreto guardado no puede recibir pagos", () => {
    esperar(ipnValido({ ...avisoDe("ABC123", "E"), secreto: "" }).ok).falso();
  });

  test("la firma con otro secreto no cuela", () => {
    const otroSecreto = Buffer.from("llavemala.otracosa", "utf-8").toString("base64");
    const conOtra = firmaIpn(otroSecreto, "ABC123", "E", DOMINIO);
    esperar(ipnValido({ ...avisoDe("ABC123", "E"), hash: conOtra }).ok).falso();
  });

  test("la barra final del dominio no rompe un aviso legítimo", () => {
    const conBarra = avisoDe("ABC123", "E", SECRETO, DOMINIO);
    // Yappy devuelve el dominio tal y como se registró; una barra de más es un
    // error de configuración, no un pago falso.
    esperar(
      ipnValido({ ...conBarra, dominioEsperado: DOMINIO + "/" }).ok,
    ).verdadero();
  });

  test("cada estado de Yappy se traduce a uno nuestro", () => {
    esperar(PAGOS_YAPPY.E).igual("pagado");
    esperar(PAGOS_YAPPY.R).igual("rechazado");
    esperar(PAGOS_YAPPY.C).igual("cancelado");
    esperar(PAGOS_YAPPY.X).igual("expirado");
  });
});

describe("Tienda: los datos que se le mandan a Yappy", () => {
  test("los centavos se escriben con dos decimales y con punto", () => {
    esperar(comoMontoYappy(0)).igual("0.00");
    esperar(comoMontoYappy(5)).igual("0.05");
    esperar(comoMontoYappy(1999)).igual("19.99");
    esperar(comoMontoYappy(100000)).igual("1000.00");
    esperar(comoMontoYappy(29)).igual("0.29");
    esperar(comoMontoYappy(1010)).igual("10.10");
  });

  test("por debajo de un centavo no hay cobro que crear", () => {
    esperar(montoCobrable(0)).falso();
    esperar(montoCobrable(1)).verdadero();
    esperar(montoCobrable(-500)).falso();
  });

  test("el teléfono se normaliza como lo escriba el cliente", () => {
    for (const v of ["61234567", "6123-4567", "+507 6123 4567", "507-6123-4567", "(507) 6123.4567"]) {
      esperar(aliasYappy(v)).igual("61234567");
    }
  });

  test("un número que no es un celular de Panamá no pasa", () => {
    esperar(aliasValido("61234567")).verdadero();
    esperar(aliasValido("2123456")).falso();   // fijo, 7 dígitos
    esperar(aliasValido("71234567")).falso();  // no empieza en 6
    esperar(aliasValido("")).falso();
    esperar(aliasValido("+1 305 555 1234")).falso();
  });

  test("el código del pedido cabe en lo que Yappy admite", () => {
    for (let i = 0; i < 50; i++) {
      const c = codigoDePedido();
      esperar(c.length <= 15).verdadero();
      esperar(codigoValido(c)).verdadero();
    }
  });

  test("el código no lleva letras que se confunden al dictarlas", () => {
    // Con un azar fijo se recorre el alfabeto entero, no una muestra.
    let i = 0;
    const codigos = [];
    for (let v = 0; v < 40; v++) codigos.push(codigoDePedido(() => ((i++) % 32) / 32));
    const usadas = new Set(codigos.join("").split(""));
    for (const prohibida of ["O", "0", "I", "1"]) {
      esperar(usadas.has(prohibida)).falso();
    }
  });

  test("dos códigos seguidos no son el mismo", () => {
    const vistos = new Set();
    for (let i = 0; i < 200; i++) vistos.add(codigoDePedido());
    esperar(vistos.size).igual(200);
  });

  test("el entorno por defecto es el de pruebas, nunca el de dinero real", () => {
    esperar(esAmbiente(undefined)).igual("prueba");
    esperar(esAmbiente("")).igual("prueba");
    esperar(esAmbiente("cualquier-cosa")).igual("prueba");
    esperar(esAmbiente("produccion")).igual("produccion");
  });

  test("cada entorno apunta a su propia dirección", () => {
    esperar(API_YAPPY.prueba === API_YAPPY.produccion).falso();
    esperar(CDN_YAPPY.prueba === CDN_YAPPY.produccion).falso();
  });
});

describe("Tienda: un cobro sin respuesta no se da por vivo para siempre", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // POR QUÉ ESTO EXISTE: Yappy no publica ninguna consulta de estado, y el
  // aviso de «el cliente no confirmó» puede no llegar nunca. Sin reloj, ese
  // pedido se quedaría diciendo «pagando…», que en un tablero se lee como
  // dinero en camino — y el negocio entrega contra un pago que no existe.
  // ───────────────────────────────────────────────────────────────────────────
  const ahora = new Date("2026-09-03T12:00:00Z");
  const haceMinutos = (m) => new Date(ahora.getTime() - m * 60000).toISOString();

  test("recién iniciado, se está esperando", () => {
    esperar(estadoDelCobro("pendiente", haceMinutos(1), ahora)).igual("esperando");
    esperar(estadoDelCobro("pendiente", haceMinutos(VENTANA_COBRO_MIN), ahora)).igual("esperando");
  });

  test("pasada la ventana SIN aviso, deja de darse por vivo", () => {
    esperar(estadoDelCobro("pendiente", haceMinutos(VENTANA_COBRO_MIN + 1), ahora)).igual("sin_confirmar");
    esperar(estadoDelCobro("pendiente", haceMinutos(600), ahora)).igual("sin_confirmar");
  });

  test("un pendiente sin hora se trata como sin confirmar, no como recién hecho", () => {
    // Prudencia: lo caro es decir que un pago va en camino cuando no lo va.
    esperar(estadoDelCobro("pendiente", null, ahora)).igual("sin_confirmar");
    esperar(estadoDelCobro("pendiente", "no es una fecha", ahora)).igual("sin_confirmar");
  });

  test("el reloj NO puede convertir un pagado en dudoso", () => {
    // Lo que dice el aviso firmado manda por encima del tiempo: un pedido
    // pagado hace un año sigue pagado.
    esperar(estadoDelCobro("pagado", haceMinutos(100000), ahora)).igual("pagado");
    esperar(estadoDelCobro("pagado", null, ahora)).igual("pagado");
  });

  test("los finales de Yappy se cuentan como fallidos, no como pendientes", () => {
    for (const v of ["rechazado", "cancelado", "expirado"]) {
      esperar(estadoDelCobro(v, haceMinutos(1), ahora)).igual("fallido");
    }
  });

  test("un pedido que nunca intentó cobrar en línea no lleva sello", () => {
    esperar(estadoDelCobro("sin_cobro", null, ahora)).igual("sin_cobro");
  });

  test("un pago devuelto NO se cuenta igual que uno que nunca entró", () => {
    // La segunda API de Yappy trae un estado que el aviso del botón no tiene:
    // «anulada» (REVERSED), un cobro que se ejecutó y luego se deshizo. Meterlo
    // en el mismo saco que un rechazo haría que el negocio reclame lo que no
    // debe: no es lo mismo perseguir un pago que nunca entró que uno devuelto.
    esperar(estadoDelCobro("anulado", haceMinutos(1), ahora)).igual("anulado");
    esperar(estadoDelCobro("anulado", null, ahora)).igual("anulado");
  });
});

process.exit(await correrPruebas());
