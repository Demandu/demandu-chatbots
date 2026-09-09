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
import {
  comoAjustes, ajustesQueMandan, tiendaQueManda,
} from "../../src/lib/ai/agenteAjustes.ts";
import {
  agendaQueManda, hayQueElegir, leerPreferida, tipoDeEventoDeCalendly,
  agendaDelBloque, leerEleccionDelBloque,
} from "../../src/lib/agendaElegida.ts";
import {
  nuevoVerificador, retoDe, urlDeAutorizacion, ventanaDeBusqueda, MAX_DIAS,
  necesitaPlanDePago, firmaValida as firmaDeCalendlyValida, TOLERANCIA_SEG,
  EVENTOS, nuevaClaveDeFirma,
} from "../../src/lib/integrations/calendly.ts";
import { accionesDelPrompt, CLAVES_DE_ACCION, sinMarcadores } from "../../src/lib/ai/acciones.ts";
import {
  ZONA_POR_PREFIJO, zonaDelTelefono, zonaValida, comoSeLee, hayQueConfirmar, zonaQueManda,
} from "../../src/lib/zonaHoraria.ts";
import {
  superficieDe, coincidenLasPalabras, reglaQueAplica, dondeContestar,
  puedeEscribirEnPrivado, TIENE_COMENTARIO_PUBLICO,
} from "../../src/lib/canales/instagramReglas.ts";
import { ORIGENES, origenPara, infoOrigen } from "../../src/lib/flow/origenes.ts";
import {
  MODOS_PUBLICOS, MAX_PUBLICO, modoDeRespuestaPublica, limpiarParaComentario,
  sePuedePublicar, preguntaParaElComentario,
} from "../../src/lib/canales/comentarioPublico.ts";
import {
  superficiesDe, nombreDeLana, nombreDePromo, limpiarPalabra, esPromo,
  grafoDeLana, grafoDePromo, origenesDePromo, dondeDeLosOrigenes, DONDE_PROMO,
  laLlevaLaPantallaSimple,
} from "../../src/lib/canales/respuestasAutomaticas.ts";
import {
  POR_LA_AGENDA, POR_LA_TIENDA, requisitoDe, herramientasAutomaticas,
  herramientasQueManda, deDondeSale, apagadasDespuesDeGuardar,
} from "../../src/lib/ai/capacidades.ts";
import {
  repartirHorarios, esHorarioElegido, correoValido, quiereOmitir,
  mensajeParaElCliente, CORTE_DE_TURNO,
  opcionesDeHorario, horaDelFormulario, correoDelFormulario, nombreDelFormulario,
  TITULO_MAX,
  horarioQuePidio, diaQueDijo, horasQueDijo, horaDeLaEtiqueta, comoRecordarLosHorarios,
  comoSeLoDigo, enLaZonaDelCliente, etiquetaEnZona,
} from "../../src/lib/agendaHorarios.ts";
import { loQueFaltaParaAgendar } from "../../src/lib/ai/agenda.ts";
import {
  MEDIDAS, PROPORCION, proporcionDe, comoMedida, instruccionesDeImagenes,
} from "../../src/lib/tienda/imagenes.ts";
import {
  rangoDeFechas, rangoEscrito, comoRango, cambio, comoCsv, aQuienSePuedeEscribir,
} from "../../src/lib/tienda/panel.ts";
import {
  API_ASAP, esAmbienteEnvio, VEHICULOS, vehiculoValido, latitud, longitud,
  ubicacionDe, telefonoAsap, instrucciones, loQueFaltaParaMandar, cuerpoDeOrden,
  leerDeliveryId, loAcepto, leerEstado, motivoDelFallo, ESTADOS_ASAP, estadoDeCodigo, envioTerminado,
  AVISOS_ASAP,
  estadoDelPedido, estadoDeAviso, estadoDeAvisoConEstado,
} from "../../src/lib/tienda/asap.ts";
import { comoEstaApple, diasParaElSecretoDeApple } from "../../src/lib/estado/apple.ts";
import { membresiaActiva, soporteVigente } from "../../src/lib/membresia.ts";
import { FEATURES, feature, tiene } from "../../src/lib/planes/features.ts";
import { explicar, revisar } from "../../src/lib/billing/descuentos.ts";
import {
  PLANTILLAS, NOMBRES_DE_PEDIDO, plantillaDe, valoresDe, faltaAlgunDato,
  dentroDeLaVentana, esFueraDeVentana, VENTANA_HORAS, MARGEN_MINUTOS, FUERA_DE_VENTANA,
} from "../../src/lib/tienda/plantillasDePedido.ts";
import {
  PRECIO_TIENDA, COMISION_APPS, BENEFICIOS, INCLUYE, GANCHO, LETRA_CHICA,
  loQueTeAhorras, desdeCuantoSePagaSola, precioEscrito,
} from "../../src/lib/planes/tiendaAddon.ts";
import {
  tiendaDelBot, enlaceDelBot, mensajeDeTienda, productosQueSePuedenOfrecer,
  categoriasDelBot, precioDelBot, paginaDeCatalogo, desdeDondeSigue, productoElegido,
  comoVaElPedido, pedidoDelQueHablar, MAX_FILAS_LISTA,
} from "../../src/lib/tienda/paraElBot.ts";
import {
  MOMENTOS, MAX_AVISO, sanearAvisos, rellenarAviso, textoDelAviso, momentoDelEstado, botonDelAviso,
} from "../../src/lib/tienda/avisos.ts";
import {
  cabeEnElChat, siguientePaso, empezarProducto, elegirOpcion, avanzarGrupo,
  meterAlCarrito, cerrarCarrito, contestar, leerCantidad, loQueYaSabemos,
  filasDeVariedad, opcionElegida, cuantasCosas, huella, carritoVacio,
  MAX_GRUPOS_EN_CHAT, MAX_ELECCIONES_POR_GRUPO, MAX_FILAS, MAX_POR_LINEA,
} from "../../src/lib/tienda/pedirPorChat.ts";
import { aCentavos, leerOpciones, leerModo, recargoDe, comoDinero, sanearGrupos } from "../../src/lib/tienda/variedades.ts";
import { aDireccion, direccionValida, enlaceDePago, enlaceDeTienda, hostDeLaPeticion } from "../../src/lib/tienda/direccion.ts";
import { leerConfig, CONFIG_POR_DEFECTO, colorValido, soloDigitos, loQueFaltaParaVender, sanearPreguntas, MAX_PREGUNTAS, TIPOS_PREGUNTA } from "../../src/lib/tienda/config.ts";
import {
  comoRespuesta, leerUbicacion, esEnlaceAcortado, porQueNoSirve, enlaceDeMapa,
  precisionDudosa, comoSeLeeLaPrecision, preguntaDeUbicacion,
  ubicacionDeLasRespuestas, direccionDeLasRespuestas, hayQuePedirLaUbicacion, nombreDeLasRespuestas, telefonoDeLasRespuestas,} from "../../src/lib/tienda/ubicacion.ts";
import {
  aQuePedidoVa, ubicacionDelMensaje, VENTANA_UBICACION_HORAS,
} from "../../src/lib/tienda/ubicacionQueLlega.ts";
import {
  primerNombre, saludo, correoDeBienvenida, correoDelEquipo, loQueFaltaParaEscribir, LOGO,
  rellenarHuecos, cuerpoEnHtml, laPlantilla, BIENVENIDA_POR_DEFECTO, HUECOS,
} from "../../src/lib/correo/plantillas.ts";
import {
  LETRAS_MINIMAS, ESPERA_MS, MAX_POR_BUSQUEDA, valeLaPenaBuscar, nuevaBusqueda,
  cuerpoDeSugerencias, leerSugerencias, leerPunto, CAMPOS_DEL_PUNTO,
} from "../../src/lib/lugares/google.ts";
import { esElReciboDeUnPedido, codigoDelRecibo } from "../../src/lib/tienda/pedidoQueLlega.ts";
import { historialParaLaIA, MARCA_AGENTE } from "../../src/lib/ai/historial.ts";
import { sinLoQueNoPuedeDecir, afirmaAlgoQueNoSabe, quedaAlgoQueDecir } from "../../src/lib/ai/loQueNoPuedeDecir.ts";
import { REMITENTE } from "../../src/lib/correo/enviar.ts";
import { leerGruposEscritos, escribirGrupos } from "../../src/lib/tienda/escritura.ts";
import { leerPegado, cortarTabla, esSi } from "../../src/lib/tienda/pegar.ts";
import { recalcularPedido } from "../../src/lib/tienda/recalcular.ts";
import {
  comoMontoYappy, montoCobrable, aliasYappy, aliasValido, codigoDePedido, codigoValido,
  claveDeFirma, firmaIpn, ipnValido, esAmbiente, PAGOS_YAPPY, API_YAPPY, CDN_YAPPY,
  dominioDeCobro, falloDeComercio,
} from "../../src/lib/tienda/yappy.ts";
import { estadoDelCobro, VENTANA_COBRO_MIN } from "../../src/lib/tienda/cobro.ts";
import { aWhatsapp, telefonoUtil } from "../../src/lib/tienda/telefono.ts";
import { metricasDeCliente, comoFrecuencia, SIN_COMPRAS } from "../../src/lib/tienda/metricas.ts";
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
import { correoParaLaCita, pareceUnCorreo } from "../../src/lib/ai/correoDeLaCita.ts";
import { agendaDelNegocio, cuantasAgendoLana } from "../../src/lib/agenda/vista.ts";
import { mesEnCuadricula, diaEnZona, mesVecino } from "../../src/lib/agenda/mes.ts";
import { queQuisoDecir, cuandoEnPalabras, BOTON_CONFIRMA, BOTON_CAMBIA } from "../../src/lib/agenda/recordatorio.ts";
import { RECORDATORIO_CITA, PARA_LA_AGENDA } from "../../src/lib/whatsapp/plantillasDeLaCasa.ts";
import {
  revisar as revisarPlantilla, hayGraves as plantillaGrave,
  aComponentesDeMeta, cuantasVariables,
} from "../../src/lib/whatsapp/plantillas.ts";

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
    esperar(loQueFaltaParaVender(sin, true).length > 0).verdadero();
    esperar(loQueFaltaParaVender(sin, true).join(" ").includes("WhatsApp")).verdadero();

    const corto = leerConfig({ titulo: "Paws at Home", whatsapp: { numero: "62381" } });
    esperar(loQueFaltaParaVender(corto, true).join(" ").includes("código de país")).verdadero();

    const lista = leerConfig({ titulo: "Paws at Home", whatsapp: { numero: "+507 6238-1138" } });
    esperar(loQueFaltaParaVender(lista, true)).igual([]);

    // SIN YAPPY NO PUEDE VENDER, por bien configurado que esté todo lo demás:
    // aquí se cobra antes de procesar el pedido y no hay otra vía.
    esperar(loQueFaltaParaVender(lista, false).join(" ").includes("Yappy")).verdadero();
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

  test("un rechazo en PRUEBAS dice por qué, no solo lo que dijo el banco", () => {
    // ───────────────────────────────────────────────────────────────────────
    // ESTO PASÓ DE VERDAD: el banco contestó «Algo salió mal» y se quedó tan
    // ancho. La causa era llaves de producción contra el entorno de pruebas —
    // algo que el sistema SABE y se estaba callando. Se tardó una tarde y una
    // consulta a la base en averiguar lo que la pantalla podía haber dicho.
    // ───────────────────────────────────────────────────────────────────────
    const enPruebas = falloDeComercio("Algo salió mal", "prueba");
    esperar(enPruebas.includes("Algo salió mal")).verdadero("se pierde lo que dijo el banco");
    esperar(/PRUEBAS/.test(enPruebas)).verdadero("no se avisa del entorno, que es la causa más común");

    // En producción no se inventa una explicación que no toca.
    esperar(falloDeComercio("Algo salió mal", "produccion")).igual("Algo salió mal");
  });

  test("un rechazo sin mensaje del banco no deja al negocio en blanco", () => {
    esperar(falloDeComercio("", "produccion").length > 10).verdadero();
  });

  test("EL DOMINIO NUNCA SE QUEDA VACÍO", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // ESTO PASÓ DE VERDAD: una tienda configurada antes de que existiera la
    // columna la tenía en blanco. El cobro se habría creado igual, pero la
    // firma del aviso se comprueba contra ese mismo dominio — y con el campo
    // vacío NINGÚN aviso habría cuadrado nunca. El cliente paga, el banco
    // avisa, y el pedido se queda sin marcar. Silencioso, y del lado del
    // dinero.
    // ─────────────────────────────────────────────────────────────────────────
    esperar(dominioDeCobro("", "store.demandu.tech")).igual("https://store.demandu.tech");
    esperar(dominioDeCobro(null, "store.demandu.tech")).igual("https://store.demandu.tech");
    esperar(dominioDeCobro(undefined, "store.demandu.tech")).igual("https://store.demandu.tech");
    esperar(dominioDeCobro("   ", "store.demandu.tech")).igual("https://store.demandu.tech");
  });

  test("un dominio guardado manda sobre el de la plataforma", () => {
    // El día que una tienda tenga su propio subdominio, lo suyo pesa más.
    esperar(dominioDeCobro("https://mitienda.com", "store.demandu.tech")).igual("https://mitienda.com");
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

  test("UN PEDIDO QUE NUNCA SE COBRÓ ES UNA ALARMA, no un caso neutro", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Antes esto devolvía «sin_cobro» y el tablero no pintaba nada, tratándolo
    // como lo normal de una tienda que cobra al entregar. No existe esa
    // tienda: aquí SIEMPRE se cobra antes de preparar y siempre por Yappy. Un
    // pedido sin cobro es un cobro que falló al crearse o una tienda sin
    // Yappy configurado — y se veía exactamente igual que uno pagado.
    // ───────────────────────────────────────────────────────────────────────
    esperar(estadoDelCobro("sin_cobro", null, ahora)).igual("sin_cobrar");
    esperar(estadoDelCobro("", null, ahora)).igual("sin_cobrar");
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

describe("Tienda: el pedido se ata a la persona que lo hizo", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // ES EL ESLABÓN QUE NO SE PUEDE REHACER. Si un pedido entra sin contacto, más
  // adelante ya no se sabe de quién era, y ese cliente queda fuera de todas las
  // métricas para siempre. Por eso el número se normaliza IGUAL que lo hace el
  // motor de WhatsApp: si no, cada persona acaba partida en dos fichas, una que
  // compra y otra que escribe.
  // ───────────────────────────────────────────────────────────────────────────
  const TIENDA_PA = "50761112222";

  test("un número local se completa con el país de la tienda", () => {
    for (const v of ["61234567", "6123-4567", "6123 4567", "(6123) 4567"]) {
      esperar(aWhatsapp(v, TIENDA_PA)).igual("50761234567");
    }
  });

  test("un número que ya viene completo no se toca", () => {
    esperar(aWhatsapp("50761234567", TIENDA_PA)).igual("50761234567");
    esperar(aWhatsapp("+507 6123-4567", TIENDA_PA)).igual("50761234567");
  });

  test("un cliente de OTRO país no se convierte en local", () => {
    // Una panadería panameña también le vende a alguien con número colombiano.
    // Ponerle 507 delante crearía un contacto que no existe y una conversación
    // que nunca va a llegar.
    esperar(aWhatsapp("573001234567", TIENDA_PA)).igual("573001234567");
    esperar(aWhatsapp("+52 55 1234 5678", TIENDA_PA)).igual("525512345678");
  });

  test("el cero de marcado nacional no se cuela", () => {
    esperar(aWhatsapp("0061234567", TIENDA_PA)).igual("50761234567");
  });

  test("sin país de referencia NO se inventa un contacto", () => {
    // Mejor un pedido sin contacto que un contacto equivocado: ese ensucia la
    // Bandeja de alguien de verdad.
    esperar(aWhatsapp("61234567", "")).igual("");
    esperar(aWhatsapp("61234567", "no-es-un-numero")).igual("");
  });

  test("lo que no es un teléfono no crea ficha", () => {
    esperar(telefonoUtil("50761234567")).verdadero();
    esperar(telefonoUtil("1234")).falso();
    esperar(telefonoUtil("")).falso();
    esperar(telefonoUtil("5076123456789012345")).falso();
    esperar(telefonoUtil("507-6123-4567")).falso();
  });
});

describe("Tienda: lo que este cliente vale", () => {
  const dia = (n) => new Date(Date.UTC(2026, 0, n)).toISOString();
  const pedido = (n, total, estado = "entregado", lineas = []) => ({
    created_at: dia(n),
    estado,
    total,
    lineas,
  });

  test("sin pedidos no hay métricas que enseñar", () => {
    esperar(metricasDeCliente([]).pedidos).igual(0);
    esperar(metricasDeCliente(null).pedidos).igual(0);
    esperar(metricasDeCliente([{ created_at: "no es fecha", estado: "recibido", total: 100 }]).pedidos).igual(0);
  });

  test("el gasto y el ticket salen de lo que sí se vendió", () => {
    const m = metricasDeCliente([pedido(1, 1000), pedido(8, 2000), pedido(15, 3000)]);
    esperar(m.gastado).igual(6000);
    esperar(m.ticket).igual(2000);
    esperar(m.pedidos).igual(3);
    esperar(m.entregados).igual(3);
  });

  test("UN PEDIDO CANCELADO NO ES DINERO, pero tampoco se esconde", () => {
    // Meterlo en el gasto infla el ticket y hace parecer bueno a quien no lo
    // es; borrarlo del todo oculta a quien cancela la mitad de lo que pide.
    const m = metricasDeCliente([pedido(1, 1000), pedido(2, 9000, "cancelado")]);
    esperar(m.gastado).igual(1000);
    esperar(m.ticket).igual(1000);
    esperar(m.cancelados).igual(1);
    esperar(m.pedidos).igual(2);
    esperar(m.volvio).falso();
  });

  test("volver es haber comprado dos veces, no dos visitas", () => {
    esperar(metricasDeCliente([pedido(1, 1000)]).volvio).falso();
    esperar(metricasDeCliente([pedido(1, 1000), pedido(9, 1000)]).volvio).verdadero();
  });

  test("con un solo pedido NO se inventa una frecuencia", () => {
    // «Cada 0 días» sería mentir con un número.
    //
    // SE COMPRUEBA QUE SEA EXACTAMENTE `null`, no «algo parecido a null»: al
    // comparar valores serializados, un NaN se ve igual que un null, y NaN es
    // justo lo que sale de dividir entre cero intervalos. Esta prueba pasaba
    // con el fallo dentro hasta que la mutación lo enseñó.
    const f = metricasDeCliente([pedido(1, 1000)]).frecuencia;
    esperar(f === null).verdadero("la frecuencia de un solo pedido tiene que ser null");
  });

  test("la frecuencia es el promedio entre la primera y la última", () => {
    // 1, 8, 15 y 22 de enero: tres intervalos de siete días.
    const m = metricasDeCliente([pedido(22, 100), pedido(1, 100), pedido(15, 100), pedido(8, 100)]);
    esperar(m.frecuencia).igual(7);
    esperar(m.primera.slice(0, 10)).igual("2026-01-01");
    esperar(m.ultima.slice(0, 10)).igual("2026-01-22");
  });

  test("el favorito es lo que más se lleva, no lo último que pidió", () => {
    const m = metricasDeCliente([
      pedido(1, 100, "entregado", [{ nombre: "Saco 30 lb", cantidad: 2, precio: 50 }]),
      pedido(8, 100, "entregado", [
        { nombre: "Saco 30 lb", cantidad: 1, precio: 50 },
        { nombre: "Collar", cantidad: 1, precio: 50 },
      ]),
    ]);
    esperar(m.favoritos[0].nombre).igual("Saco 30 lb");
    esperar(m.favoritos[0].unidades).igual(3);
    esperar(m.favoritos[0].veces).igual(2);
    esperar(m.favoritos[1].nombre).igual("Collar");
  });

  test("dos unidades en una compra no cuentan como dos compras", () => {
    const m = metricasDeCliente([
      pedido(1, 100, "entregado", [
        { nombre: "Saco", cantidad: 1, precio: 50 },
        { nombre: "Saco", cantidad: 1, precio: 50 },
      ]),
    ]);
    esperar(m.favoritos[0].unidades).igual(2);
    esperar(m.favoritos[0].veces).igual(1);
  });

  test("lo que compró en un pedido cancelado no es su favorito", () => {
    const m = metricasDeCliente([
      pedido(1, 100, "cancelado", [{ nombre: "Nunca llegó", cantidad: 9, precio: 50 }]),
      pedido(2, 100, "entregado", [{ nombre: "Sí compró", cantidad: 1, precio: 50 }]),
    ]);
    esperar(m.favoritos.length).igual(1);
    esperar(m.favoritos[0].nombre).igual("Sí compró");
  });

  test("la frecuencia se dice en palabras, no en días sueltos", () => {
    esperar(comoFrecuencia(null)).igual("");
    esperar(comoFrecuencia(7)).igual("cada semana");
    esperar(comoFrecuencia(30)).igual("cada mes");
    esperar(comoFrecuencia(400)).igual("muy de vez en cuando");
  });

  test("la ficha vacía existe y no rompe nada", () => {
    esperar(SIN_COMPRAS.pedidos).igual(0);
    esperar(SIN_COMPRAS.favoritos.length).igual(0);
  });
});

describe("Tienda: el enlace de pago que va en el mensaje", () => {
  test("lleva el código del pedido y NADA más", () => {
    // ───────────────────────────────────────────────────────────────────────
    // La tienda anterior mandaba el importe dentro de la dirección
    // (`?c=ESEQ&name=pawsathome&amount=25`), donde quien recibe el mensaje lo
    // puede editar antes de abrirla. Aquí el precio se lee de la base.
    // ───────────────────────────────────────────────────────────────────────
    const url = enlaceDePago("pawsathome", "8EXUCM4WUVLC");
    esperar(url.includes("8EXUCM4WUVLC")).verdadero();
    esperar(url.includes("?")).falso("el enlace de pago no puede llevar parámetros");
    esperar(/amount|total|precio|monto/i.test(url)).falso("el importe no puede viajar en la dirección");
  });

  test("va bajo la tienda, no en la raíz del dominio", () => {
    // `store.demandu.tech/pagar/...` chocaría con una tienda que se llamara
    // «pagar». Bajo el nombre de la tienda no hay colisión posible.
    esperar(enlaceDePago("pawsathome", "ABC123")).igual(
      "https://store.demandu.tech/pawsathome/pagar/ABC123",
    );
  });

  test("el código se escribe siempre igual, lo dicten como lo dicten", () => {
    esperar(enlaceDePago("x", "abc123")).igual(enlaceDePago("x", "ABC123"));
  });
});

describe("Tienda: de qué dominio llega la visita", () => {
  const cabeceras = (o) => ({ get: (n) => o[n.toLowerCase()] ?? null });

  test("el proxy manda sobre el host interno", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Sin esto, un proxy que reescribe `host` con su nombre interno hace que
    // el dominio de tiendas deje de reconocerse: 404 en la dirección propia de
    // la tienda, y ni un error en ningún registro.
    // ───────────────────────────────────────────────────────────────────────
    esperar(
      hostDeLaPeticion(cabeceras({ "x-forwarded-host": "store.demandu.tech", host: "interno.netlify.app" })),
    ).igual("store.demandu.tech");
  });

  test("sin proxy vale el host de siempre", () => {
    esperar(hostDeLaPeticion(cabeceras({ host: "store.demandu.tech" }))).igual("store.demandu.tech");
  });

  test("el puerto y las mayúsculas no cuentan", () => {
    esperar(hostDeLaPeticion(cabeceras({ host: "Store.Demandu.Tech:3000" }))).igual("store.demandu.tech");
  });

  test("de una lista reenviada se toma el primero", () => {
    esperar(
      hostDeLaPeticion(cabeceras({ "x-forwarded-host": "store.demandu.tech, otro.interno" })),
    ).igual("store.demandu.tech");
  });

  test("sin cabeceras no se inventa un dominio", () => {
    esperar(hostDeLaPeticion(cabeceras({}))).igual("");
  });
});

describe("IA: marcar «agendar» no es tener agenda", () => {
  const abierto = { mon: { enabled: true, open: "09:00", close: "18:00" } };
  const base = { conectado: true, timezone: "America/Panama", horas: abierto };

  test("sin acciones de agenda, este bloque ni aparece", () => {
    const r = loQueFaltaParaAgendar({ ...base, herramientas: ["etiquetar"] });
    esperar(r.usaAgenda).falso();
    esperar(r.problemas.length).igual(0);
  });

  test("SIN CALENDAR CONECTADO NO SE PUEDE AGENDAR, y hay que decirlo", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Hoy se puede marcar la casilla, guardar, y quedarse tranquilo mientras
    // Google Calendar no está conectado. El bot no avisa: no encuentra huecos
    // nunca, y el negocio se entera cuando un cliente pregunta por qué nadie
    // lo atendió.
    // ───────────────────────────────────────────────────────────────────────
    const r = loQueFaltaParaAgendar({ ...base, conectado: false, herramientas: ["agendar_cita", "ver_horarios"] });
    esperar(r.lista).falso();
    esperar(r.problemas.some((p) => /Calendar/i.test(p))).verdadero();
  });

  test("sin ningún día abierto no hay hueco posible", () => {
    const r = loQueFaltaParaAgendar({
      ...base,
      horas: { mon: { enabled: false, open: "09:00", close: "18:00" } },
      herramientas: ["ver_horarios"],
    });
    esperar(r.lista).falso();
    esperar(r.problemas.some((p) => /día abierto/i.test(p))).verdadero();
  });

  test("RESERVAR SIN PODER MIRAR es cómo se pisan dos citas", () => {
    // La acción de reservar no consulta disponibilidad por su cuenta: si no
    // puede ver los huecos, agenda encima de lo que ya haya.
    const r = loQueFaltaParaAgendar({ ...base, herramientas: ["agendar_cita"] });
    esperar(r.lista).falso();
    esperar(r.problemas.some((p) => /encima/i.test(p))).verdadero();
  });

  test("mirar sin reservar es una configuración legítima", () => {
    // Un bot que dice las horas libres y deja que una persona confirme es un
    // caso real, no un error a medio hacer.
    const r = loQueFaltaParaAgendar({ ...base, herramientas: ["ver_horarios"] });
    esperar(r.lista).verdadero();
    esperar(r.problemas.length).igual(0);
  });

  test("sin zona horaria las horas que ofrezca no son las tuyas", () => {
    const r = loQueFaltaParaAgendar({ ...base, timezone: "", herramientas: ["ver_horarios"] });
    esperar(r.lista).falso();
    esperar(r.problemas.some((p) => /zona horaria/i.test(p))).verdadero();
  });

  test("todo en su sitio: lista, y sin ruido", () => {
    const r = loQueFaltaParaAgendar({ ...base, herramientas: ["ver_horarios", "agendar_cita"] });
    esperar(r.lista).verdadero();
    esperar(r.problemas.length).igual(0);
  });
});

describe("Tienda: lo que el cliente recibe cuando su pedido se mueve", () => {
  const datos = {
    numero: 128,
    tienda: "Paws at Home",
    total: "$25.00",
    codigo: "C9UYJC3S76SB",
    cliente: "María",
  };

  test("«recibido» NO avisa: el cliente acaba de escribir", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Contestarle «recibimos tu pedido» a la vez que su propio mensaje no le
    // dice nada nuevo, y abre una conversación que WhatsApp le factura al
    // negocio. Es una decisión, no un olvido.
    // ───────────────────────────────────────────────────────────────────────
    esperar(momentoDelEstado("recibido") === null).verdadero("«recibido» no puede avisar");
    esperar(momentoDelEstado("en_camino")).igual("en_camino");
    esperar(momentoDelEstado("entregado")).igual("entregado");
  });

  test("un estado inventado no manda nada", () => {
    esperar(momentoDelEstado("caminando") === null).verdadero();
    esperar(momentoDelEstado("") === null).verdadero();
  });

  test("«pagado» no es un estado del tablero, así que no se alcanza arrastrando", () => {
    // El aviso de pago lo dispara el banco, no una tarjeta movida a mano. Si
    // «pagado» se pudiera alcanzar desde el tablero habría dos caminos hacia
    // el mismo mensaje y el cliente lo recibiría dos veces.
    esperar(momentoDelEstado("pagado") === null).verdadero();
  });

  test("UN HUECO SIN VALOR SE VA ENTERO, con su coma y su espacio", () => {
    // «Ya lo tenemos anotado, {cliente}.» sin nombre no puede quedar
    // «Ya lo tenemos anotado, .» — es exactamente el detalle por el que un
    // mensaje se nota automático.
    const r = rellenarAviso("Confirmado, {cliente}. Gracias.", { ...datos, cliente: "" });
    esperar(r).igual("Confirmado. Gracias.");
  });

  test("con nombre, el nombre se pone", () => {
    esperar(rellenarAviso("Hola {cliente}, tu pedido #{numero}", datos))
      .igual("Hola María, tu pedido #128");
  });

  test("UN HUECO QUE NO EXISTE SE QUEDA A LA VISTA", () => {
    // Si el negocio escribe {pedido} en vez de {numero}, verlo en la vista
    // previa es lo que hace que lo corrija. Borrarlo en silencio deja un
    // mensaje sin el dato más importante y nadie se entera hasta que sale.
    esperar(rellenarAviso("Pedido {pedido} listo", datos)).igual("Pedido {pedido} listo");
  });

  test("el total y el código salen tal cual se los dan", () => {
    esperar(rellenarAviso("{total} · {codigo} · {tienda}", datos))
      .igual("$25.00 · C9UYJC3S76SB · Paws at Home");
  });

  test("EL INTERRUPTOR GENERAL APAGA TODO, aunque el momento esté encendido", () => {
    const a = sanearAvisos({ activo: false });
    esperar(a.momentos.en_camino.activo).verdadero("el momento sigue encendido por dentro");
    esperar(textoDelAviso("en_camino", a, datos) === null).verdadero("y aun así no sale nada");
  });

  test("un momento apagado no manda, y los demás sí", () => {
    const a = sanearAvisos({ momentos: { en_camino: { activo: false } } });
    esperar(textoDelAviso("en_camino", a, datos) === null).verdadero();
    esperar(typeof textoDelAviso("entregado", a, datos)).igual("string");
  });

  test("«Preparando» viene APAGADO de fábrica", () => {
    // Cada aviso cuesta dinero y gasta la paciencia del cliente. Este es el
    // único paso que casi nunca le dice algo que no supiera ya.
    const a = sanearAvisos({});
    esperar(a.momentos.preparando.activo).falso();
    esperar(a.momentos.en_camino.activo).verdadero();
  });

  test("UN TEXTO VACÍO NO ES SILENCIO: vuelve el de fábrica", () => {
    // Si un campo en blanco significara «no avisar», cualquiera lo borraría
    // sin querer y el cliente dejaría de recibir avisos sin que se pueda ver
    // por qué. Para callar está la casilla.
    const a = sanearAvisos({ momentos: { entregado: { activo: true, texto: "   " } } });
    esperar(a.momentos.entregado.texto.length > 0).verdadero();
    esperar(textoDelAviso("entregado", a, datos) === null).falso();
  });

  test("una configuración a medias no manda un mensaje vacío", () => {
    // El JSON lo pudo escribir una versión anterior o alguien con la consola
    // abierta. Un aviso en blanco llega, no dice nada, y el cliente escribe
    // preguntando qué fue eso.
    const a = sanearAvisos({ activo: true, momentos: { pagado: {} } });
    for (const m of MOMENTOS) {
      esperar(a.momentos[m.clave].texto.trim().length > 0).verdadero(`${m.clave} salió vacío`);
    }
  });

  test("un texto larguísimo se recorta: esto se lee en una notificación", () => {
    const a = sanearAvisos({ momentos: { entregado: { activo: true, texto: "x".repeat(5000) } } });
    esperar(a.momentos.entregado.texto.length).igual(MAX_AVISO);
  });

  test("los textos de fábrica salen enteros y sin huecos sueltos", () => {
    // Una tienda que nunca abrió esta pantalla avisa igual, así que lo de
    // fábrica tiene que poder salir tal cual hacia un cliente de verdad.
    const a = sanearAvisos(undefined);
    for (const m of MOMENTOS) {
      const t = rellenarAviso(a.momentos[m.clave].texto, datos);
      esperar(/[{}]/.test(t)).falso(`${m.clave} dejó un hueco sin rellenar: ${t}`);
      esperar(/ ,|, \./.test(t)).falso(`${m.clave} quedó con puntuación suelta: ${t}`);
    }
  });

  test("y siguen saliendo enteros aunque no sepamos el nombre del cliente", () => {
    const a = sanearAvisos(undefined);
    for (const m of MOMENTOS) {
      const t = rellenarAviso(a.momentos[m.clave].texto, { ...datos, cliente: "" });
      esperar(t.trim().length > 10).verdadero(`${m.clave} se quedó en nada: ${t}`);
      esperar(/ ,|,\./.test(t)).falso(`${m.clave} quedó con puntuación suelta: ${t}`);
    }
  });

  test("LOS AVISOS VIAJAN DENTRO DE `config` y sobreviven a guardar el diseño", () => {
    // `guardarDiseno` reescribe la configuración entera. Si `leerConfig` no
    // conservara los avisos, tocar un color borraría los textos que el negocio
    // escribió — y dejaría de avisar sin decírselo a nadie.
    const guardada = leerConfig({
      titulo: "Paws",
      avisos: { activo: true, momentos: { en_camino: { activo: true, texto: "Ya va {numero}" } } },
    });
    esperar(guardada.avisos.momentos.en_camino.texto).igual("Ya va {numero}");

    const otraVez = leerConfig({ ...guardada, titulo: "Paws at Home" });
    esperar(otraVez.avisos.momentos.en_camino.texto).igual("Ya va {numero}");
    esperar(otraVez.avisos.momentos.preparando.activo).falso();
  });

  test("una tienda vieja, sin nada guardado, avisa igual", () => {
    const c = leerConfig({ titulo: "Vieja" });
    esperar(c.avisos.activo).verdadero();
    esperar(typeof textoDelAviso("pagado", c.avisos, datos)).igual("string");
  });
});

describe("Tienda: cuando el cobro no llega a buen puerto", () => {
  const datos = {
    numero: 128, tienda: "Paws at Home", total: "$25.00",
    codigo: "C9UYJC3S76SB", cliente: "María",
  };

  test("VENCIDO Y RECHAZADO NO SON LO MISMO, y no dicen lo mismo", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Los dos se leen como «no pagó», pero lo que la persona tiene que hacer
    // después es distinto: en uno su pedido ya no existe y en el otro sigue
    // ahí. Un mensaje único —«hubo un problema»— la deja sin saber cuál de
    // los dos le tocó, que es la peor de las tres respuestas posibles.
    // ───────────────────────────────────────────────────────────────────────
    const a = sanearAvisos(undefined);
    const vencido = textoDelAviso("enlace_vencido", a, datos);
    const fallido = textoDelAviso("pago_no_completado", a, datos);

    esperar(typeof vencido).igual("string");
    esperar(typeof fallido).igual("string");
    esperar(vencido === fallido).falso("los dos avisos dicen exactamente lo mismo");
    esperar(/cancelad/i.test(vencido)).verdadero("el de vencido no dice que el pedido se canceló");
    esperar(/cancelad/i.test(fallido)).falso(
      "el de pago rechazado dice que se canceló, y el pedido sigue vivo",
    );
  });

  test("cada uno lleva SU botón, y a sitios distintos", () => {
    // Mandar a «volver a pedir» a quien todavía tiene el pedido vivo le hace
    // rehacer el carrito para nada; mandar a «pagar de nuevo» a quien ya no
    // tiene pedido lo lleva a una pantalla que no le va a dejar pagar.
    esperar(botonDelAviso("enlace_vencido")?.a).igual("tienda");
    esperar(botonDelAviso("pago_no_completado")?.a).igual("pago");
    esperar(botonDelAviso("enlace_vencido")?.texto).igual("Volver a pedir");
  });

  test("un aviso sin nada que hacer NO lleva botón", () => {
    // Un botón en «va en camino» no lleva a ninguna parte útil y enseña a la
    // gente que los botones de estos mensajes no sirven para nada.
    for (const m of ["pagado", "confirmado", "preparando", "en_camino", "entregado", "cancelado"]) {
      esperar(botonDelAviso(m) === null).verdadero(`${m} lleva botón y no debería`);
    }
  });

  test("NINGUNO DE LOS TRES DEL BANCO se alcanza arrastrando la tarjeta", () => {
    // El pago, el enlace vencido y el rechazo los dispara el banco. Si el
    // tablero también llegara a ellos habría dos caminos hacia el mismo
    // mensaje y el cliente lo recibiría dos veces.
    for (const m of ["pagado", "enlace_vencido", "pago_no_completado"]) {
      esperar(momentoDelEstado(m) === null).verdadero(`${m} se alcanza desde el tablero`);
    }
    // Y los del tablero sí, que es la otra mitad de la regla.
    for (const m of ["confirmado", "preparando", "en_camino", "entregado", "cancelado"]) {
      esperar(momentoDelEstado(m)).igual(m);
    }
  });

  test("los dos textos nuevos salen enteros, con y sin nombre del cliente", () => {
    const a = sanearAvisos(undefined);
    for (const m of ["enlace_vencido", "pago_no_completado"]) {
      for (const cliente of ["María", ""]) {
        const t = rellenarAviso(a.momentos[m].texto, { ...datos, cliente });
        esperar(/[{}]/.test(t)).falso(`${m} dejó un hueco: ${t}`);
        esperar(t.length > 20).verdadero(`${m} se quedó en nada: ${t}`);
      }
    }
  });

  test("el negocio puede apagarlos, como cualquier otro", () => {
    const a = sanearAvisos({ momentos: { enlace_vencido: { activo: false } } });
    esperar(textoDelAviso("enlace_vencido", a, datos) === null).verdadero();
    esperar(typeof textoDelAviso("pago_no_completado", a, datos)).igual("string");
  });

  test("el enlace del botón se arma con la dirección de HOY", () => {
    // Un enlace guardado dentro del texto apuntaría a la dirección vieja el
    // día que el negocio cambie la suya — y estos son justamente los mensajes
    // que llevan dinero dentro.
    esperar(enlaceDePago("paws-at-home", "C9UYJC3S76SB"))
      .igual("https://store.demandu.tech/paws-at-home/pagar/C9UYJC3S76SB");
    esperar(enlaceDeTienda("paws-at-home")).igual("https://store.demandu.tech/paws-at-home");
  });
});

describe("Tienda: las medidas de las imágenes", () => {
  test("DOS PROPORCIONES Y NADA MÁS", () => {
    // No es una limitación técnica: es que la instrucción tiene que caber en un
    // mensaje de WhatsApp. «Todo cuadrado menos la portada y los banners» se
    // sigue; una tabla de cinco medidas distintas no la sigue nadie, y llegan
    // cinco fotos mal cortadas.
    const formas = new Set(MEDIDAS.map((m) => m.forma));
    esperar(formas.size).igual(2, "hay más de dos proporciones que explicar");
  });

  test("los píxeles CUADRAN con la proporción que declaran", () => {
    // Una medida que no cumple su propia proporción es peor que no decir nada:
    // el cliente hace justo lo que le pedimos y aun así se le corta.
    for (const m of MEDIDAS) {
      const [a, b] = PROPORCION[m.forma].split("/").map((x) => Number(x.trim()));
      esperar(m.ancho * b).igual(m.alto * a, `${m.clave} no cumple ${PROPORCION[m.forma]}`);
    }
  });

  test("cada medida explica QUÉ PASA CON LO QUE SOBRA", () => {
    // Lo que la gente manda mal no es el tamaño, es la composición. Una portada
    // preciosa con el nombre abajo a la izquierda queda tapada por el logo.
    for (const m of MEDIDAS) {
      esperar(m.recorte.trim().length > 20).verdadero(`${m.clave} no explica el recorte`);
    }
  });

  test("la proporción sale en el formato que entiende CSS", () => {
    esperar(proporcionDe("banner")).igual("4 / 1");
    esperar(proporcionDe("portada")).igual("4 / 1");
    esperar(proporcionDe("logo")).igual("1 / 1");
    esperar(proporcionDe("producto")).igual("1 / 1");
  });

  test("la instrucción se puede copiar y pegar entera", () => {
    // Viaja por WhatsApp entre el negocio y quien le hace las artes: si hay que
    // reescribirla a mano, se reescribe mal.
    const texto = instruccionesDeImagenes();
    for (const m of MEDIDAS) {
      esperar(texto.includes(comoMedida(m))).verdadero(`falta la medida de ${m.clave}`);
      esperar(texto.includes(m.titulo)).verdadero(`falta ${m.titulo}`);
    }
    esperar(/4 a 1/.test(texto)).verdadero("no dice el resumen de las proporciones");
  });
});

describe("Tienda: el panel de arriba de los pedidos", () => {
  // Un miércoles cualquiera, a media tarde.
  const ahora = new Date(2026, 8, 16, 15, 30);

  test("«HOY» INCLUYE LOS PEDIDOS DE ESTA TARDE", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Si el final del rango fuera «hoy a las 00:00», los pedidos que el
    // negocio acaba de ver entrar no aparecerían en «Hoy» — y esa es
    // exactamente la pantalla donde los va a buscar. Sale un número, es
    // plausible, y está mal.
    // ───────────────────────────────────────────────────────────────────────
    const r = rangoDeFechas("hoy", ahora);
    esperar(r.desde.getDate()).igual(16);
    esperar(r.desde.getHours()).igual(0);
    esperar(r.hasta > ahora).verdadero("el rango termina antes de ahora mismo");
    esperar(r.hasta.getDate()).igual(17);
  });

  test("«este mes» empieza el día 1 A LAS CERO HORAS", () => {
    // Usar la hora actual dejaría fuera todo lo del día 1 por la mañana.
    const r = rangoDeFechas("mes", ahora);
    esperar(r.desde.getDate()).igual(1);
    esperar(r.desde.getMonth()).igual(8);
    esperar(r.desde.getHours() + r.desde.getMinutes()).igual(0);
  });

  test("«últimos 7 días» son siete, contando hoy", () => {
    const r = rangoDeFechas("semana", ahora);
    esperar(r.desde.getDate()).igual(10);
    esperar(Math.round((r.hasta - r.desde) / 86400000)).igual(7);
  });

  test("«mes pasado» NO se solapa con este mes", () => {
    // Con un rango cerrado por arriba, un pedido del 31 a las 23:59 caería en
    // los dos meses y la suma del año no cuadraría con la de los meses.
    const pasado = rangoDeFechas("mes_pasado", ahora);
    const este = rangoDeFechas("mes", ahora);
    esperar(pasado.hasta.getTime()).igual(este.desde.getTime());
    esperar(pasado.desde.getMonth()).igual(7);
  });

  test("UNA FECHA ESCRITA NO SE LEE COMO UTC", () => {
    // `new Date("2026-09-01")` es medianoche UTC: en Panamá eso es el 31 de
    // agosto a las 19:00, así que el negocio pide septiembre y le falta el
    // primer día. Es invisible hasta que alguien cuadra a mano.
    const r = rangoEscrito("2026-09-01", "2026-09-30");
    esperar(r.desde.getMonth()).igual(8, "el mes se corrió");
    esperar(r.desde.getDate()).igual(1, "se perdió el primer día");
  });

  test("el «hasta» escrito incluye su día entero", () => {
    // Quien escribe «al 30» quiere el 30, no hasta el 30 a las cero horas.
    const r = rangoEscrito("2026-09-01", "2026-09-30");
    esperar(r.hasta.getDate()).igual(1);
    esperar(r.hasta.getMonth()).igual(9, "el final tiene que ser el 1 de octubre");
  });

  test("un rango al revés o a medias no se acepta", () => {
    esperar(rangoEscrito("2026-09-30", "2026-09-01") === null).verdadero();
    esperar(rangoEscrito("", "2026-09-30") === null).verdadero();
    esperar(rangoEscrito("30/09/2026", "2026-09-30") === null).verdadero();
    // Un solo día SÍ vale: del 5 al 5 es el 5 entero.
    esperar(rangoEscrito("2026-09-05", "2026-09-05") !== null).verdadero();
  });

  test("el rango se lee por el ÚLTIMO DÍA INCLUIDO", () => {
    // Decir «al 1 de octubre» cuando octubre no entra es la forma más rápida
    // de que alguien crea que la cifra está mal.
    esperar(comoRango(rangoEscrito("2026-09-01", "2026-09-30"))).igual("1 – 30 de septiembre");
    esperar(comoRango(rangoEscrito("2026-09-05", "2026-09-05"))).igual("5 de septiembre");
  });

  test("DE CERO A ALGO ES «NUEVO», NO INFINITO", () => {
    // El primer mes de cualquier tienda pasa por aquí. Una pantalla que enseña
    // «Infinity%» el primer día no la vuelve a abrir nadie.
    esperar(cambio(500, 0).texto).igual("nuevo");
    esperar(cambio(120, 100).texto).igual("+20%");
    esperar(cambio(80, 100).texto).igual("-20%");
    esperar(cambio(0, 100).texto).igual("-100%");
    esperar(cambio(100, 100) === null).verdadero("sin cambio no se pinta nada");
  });

  test("EL TELÉFONO NO PUEDE SALIR COMO 5,07624E+10", () => {
    // Excel convierte un número largo a notación científica y la lista de
    // contactos se vuelve inservible. No se recupera después.
    const csv = comoCsv(
      [{ id: "1", name: "Ana", phone: "50762381138", gastado: 1763 }],
      [{ clave: "name", titulo: "Nombre" }, { clave: "phone", titulo: "Teléfono" }, { clave: "gastado", titulo: "Gastado" }],
    );
    esperar(csv.includes("'50762381138")).verdadero("el teléfono no está protegido");
    esperar(csv.includes("$17.63")).verdadero("el importe no se convirtió de centavos");
  });

  test("PUNTO Y COMA, y las comillas dobladas", () => {
    // El Excel en español separa por punto y coma; con comas mete todo en la
    // primera columna y quien lo recibe cree que el archivo está roto. Y un
    // nombre con un separador dentro desplazaría todas las columnas.
    const csv = comoCsv(
      [{ name: 'Ana "La jefa"; S.A.', phone: "507" }],
      [{ clave: "name", titulo: "Nombre" }, { clave: "phone", titulo: "Teléfono" }],
    );
    esperar(csv.split("\r\n")[0]).igual('"Nombre";"Teléfono"');
    esperar(csv.split("\r\n")[1].startsWith('"Ana ""La jefa""; S.A."')).verdadero(csv);
  });

  test("UNA PERSONA CON DOS PEDIDOS SIN PAGAR ES UNA PERSONA", () => {
    // La lista de impagos es de PEDIDOS, así que el mismo contacto puede salir
    // dos veces. Mandarle dos mensajes iguales es la forma más rápida de que
    // te silencie.
    const filas = [
      { id: "c1", phone: "507111", numero: 1 },
      { id: "c1", phone: "507111", numero: 2 },
      { id: "c2", phone: "507222", numero: 3 },
      { id: "c3", phone: "" },
    ];
    esperar(aQuienSePuedeEscribir(filas).length).igual(2, "no se agrupó por persona");
  });

  test("sin teléfono no se le puede escribir", () => {
    esperar(aQuienSePuedeEscribir([{ id: "c1", phone: null }]).length).igual(0);
  });

  test("QUIEN PIDIÓ NO RECIBIR MENSAJES NO ENTRA NUNCA", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Es la regla de Meta y también la decencia mínima. Y no es solo cortesía:
    // una difusión a alguien que pidió no recibirlas es la forma más rápida de
    // que reporte el número y se caiga la cuenta de WhatsApp entera del
    // cliente — todas sus conversaciones, no solo esa.
    // ───────────────────────────────────────────────────────────────────────
    const filas = [
      { id: "c1", phone: "507111" },
      { id: "c2", phone: "507222", opted_out: true },
      { id: "c3", phone: "507333" },
    ];
    const quienes = aQuienSePuedeEscribir(filas);
    esperar(quienes.length).igual(2, "se coló alguien dado de baja");
    esperar(quienes.includes("c2")).falso();
  });
});

describe("Entrar con Apple: el secreto que caduca solo", () => {
  const hoy = new Date(Date.UTC(2026, 8, 4));

  test("SIN FECHA NO SE PINTA VERDE", () => {
    // ───────────────────────────────────────────────────────────────────────
    // Es la regla del tablero de estado: «no pude medirlo» va en gris. Decir
    // que está bien porque nadie apuntó la fecha es exactamente la
    // tranquilidad falsa que hace inútil un tablero de salud.
    // ───────────────────────────────────────────────────────────────────────
    for (const v of ["", null, undefined, "no sé", "04/03/2027"]) {
      esperar(comoEstaApple(v, hoy).ok === null).verdadero(`«${v}» debería ser gris`);
    }
  });

  test("caducado es ROJO, y dice desde cuándo", () => {
    // Cuando caduca, el botón sigue apareciendo y el acceso falla en el último
    // paso: desde fuera parece que se rompió la plataforma. Hay que poder
    // verlo sin adivinarlo.
    const r = comoEstaApple("2026-08-30", hoy);
    esperar(r.ok).falso();
    esperar(/caducó hace 5 días/.test(r.detalle)).verdadero(r.detalle);
  });

  test("un mes antes ya avisa", () => {
    // Renovarlo exige entrar a la cuenta de Apple y firmar de nuevo: avisar el
    // mismo día no sirve de nada.
    esperar(comoEstaApple("2026-10-01", hoy).ok).falso("faltan 27 días y no avisó");
    esperar(comoEstaApple("2026-10-04", hoy).ok).falso("faltan 30 días justos: avisa");
    esperar(comoEstaApple("2026-10-05", hoy).ok).verdadero("faltan 31 días: todavía no molesta");
  });

  test("el mismo día cuenta como caducado hoy, no como −1", () => {
    // Se compara por DÍA y en UTC. Con horas de por medio, «caduca hoy» daría
    // 0 o −1 según la hora a la que se abriera la pantalla, y un tablero que
    // cambia de color según cuándo lo mires no se lo cree nadie.
    esperar(diasParaElSecretoDeApple("2026-09-04", hoy)).igual(0);
    esperar(diasParaElSecretoDeApple("2026-09-04", new Date(Date.UTC(2026, 8, 4, 23, 59)))).igual(0);
  });

  test("seis meses es el máximo que permite Apple", () => {
    // El generador firma 180 días. Si alguien lo subiera, Apple rechaza el
    // secreto entero y el botón deja de funcionar desde el primer día.
    const generador = fs.readFileSync(
      path.join(import.meta.dirname, "../apple-secreto.mjs"), "utf8");
    const dias = /DURACION_SEG = (\d+) \* 24 \* 60 \* 60/.exec(generador);
    esperar(Boolean(dias)).verdadero("cambió la forma del generador, revisa esta prueba");
    esperar(Number(dias[1]) <= 180).verdadero(`firma ${dias[1]} días y Apple acepta 180 como mucho`);
  });
});


describe("En cuál de tus cuentas estás (membresiaActiva)", () => {
  // El fallo real: el dueño entró como soporte a la cuenta de un cliente y la
  // plataforma le enseñó SU PROPIA cuenta. Dos filas en `memberships` y un
  // `limit(1)` sin orden.
  const mia = {
    org_id: "org-propia",
    role: "owner",
    permisos: {},
    soporte_hasta: null,
    created_at: "2026-08-15T02:35:15Z",
  };
  const soporte = (hasta) => ({
    org_id: "org-cliente",
    role: "viewer",
    permisos: {},
    soporte_hasta: hasta,
    created_at: "2026-09-04T03:26:35Z",
  });
  const ahora = new Date("2026-09-04T03:30:00Z");

  test("sin nada, no estás en ninguna cuenta", () => {
    esperar(membresiaActiva([], ahora)).igual(null);
    esperar(membresiaActiva(null, ahora)).igual(null);
    esperar(membresiaActiva(undefined, ahora)).igual(null);
  });

  test("con una sola, esa", () => {
    esperar(membresiaActiva([mia], ahora)?.org_id).igual("org-propia");
  });

  test("EL FALLO: con soporte abierto manda la cuenta del cliente, no la propia", () => {
    const abierto = soporte("2026-09-04T04:26:35Z");
    // En los dos órdenes de llegada: lo que rompía antes era justamente que el
    // resultado dependiera de en qué orden viniesen las filas.
    esperar(membresiaActiva([mia, abierto], ahora)?.org_id).igual("org-cliente");
    esperar(membresiaActiva([abierto, mia], ahora)?.org_id).igual("org-cliente");
  });

  test("EL CRUCE PELIGROSO: el rol viene de la MISMA fila que la cuenta", () => {
    // Esto es lo que de verdad importaba. Antes la organización y los permisos
    // salían de dos consultas distintas: podía tocar cuenta del cliente con rol
    // `owner` de la propia, y `owner` da por bueno cualquier permiso.
    const m = membresiaActiva([mia, soporte("2026-09-04T04:26:35Z")], ahora);
    esperar(m?.org_id).igual("org-cliente");
    esperar(m?.role).igual("viewer");
    esperar(m?.role === "owner").falso("un soporte NUNCA puede salir como dueño");
  });

  test("el soporte caducado no cuenta: vuelves a tu cuenta", () => {
    const vencido = soporte("2026-09-04T03:00:00Z");
    esperar(membresiaActiva([mia, vencido], ahora)?.org_id).igual("org-propia");
    esperar(membresiaActiva([vencido, mia], ahora)?.org_id).igual("org-propia");
  });

  test("solo un soporte caducado y nada más: no estás en ninguna cuenta", () => {
    // Devolver la caducada pintaría una pantalla con datos que la base ya no
    // deja leer: tablas vacías sin explicación.
    esperar(membresiaActiva([soporte("2026-09-04T03:00:00Z")], ahora)).igual(null);
  });

  test("justo en el instante de caducar ya no vale", () => {
    esperar(membresiaActiva([mia, soporte("2026-09-04T03:30:00Z")], ahora)?.org_id).igual("org-propia");
  });

  test("una fecha ilegible no abre la cuenta de nadie", () => {
    esperar(soporteVigente({ org_id: "x", soporte_hasta: "manana" }, ahora)).falso();
    esperar(membresiaActiva([mia, { ...soporte("x"), soporte_hasta: "manana" }], ahora)?.org_id)
      .igual("org-propia");
  });

  test("con dos propias, siempre la más antigua y siempre la misma", () => {
    // No debería pasar (no hay selector de cuentas), pero si pasa tiene que ser
    // estable: una pantalla que cambia de negocio al recargar es peor que un error.
    const otra = { ...mia, org_id: "org-nueva", created_at: "2026-09-01T00:00:00Z" };
    esperar(membresiaActiva([mia, otra], ahora)?.org_id).igual("org-propia");
    esperar(membresiaActiva([otra, mia], ahora)?.org_id).igual("org-propia");
  });

  test("con dos soportes abiertos gana el último que se abrió", () => {
    // La base lo impide con un índice único, pero si llegaran dos el resultado
    // no puede ser el azar.
    const viejo = { ...soporte("2026-09-04T03:40:00Z"), org_id: "cliente-viejo" };
    const nuevo = { ...soporte("2026-09-04T04:26:35Z"), org_id: "cliente-nuevo" };
    esperar(membresiaActiva([viejo, nuevo], ahora)?.org_id).igual("cliente-nuevo");
    esperar(membresiaActiva([nuevo, viejo], ahora)?.org_id).igual("cliente-nuevo");
  });

  test("filas basura no tumban la pantalla", () => {
    esperar(membresiaActiva([null, undefined, { role: "owner" }, mia], ahora)?.org_id)
      .igual("org-propia");
  });
});


describe("El logo llena el círculo, o no", () => {
  // Dos casos opuestos y reales: un logo con el nombre del negocio sobre
  // transparente pierde el nombre si se recorta al círculo; uno cuadrado con
  // su propio fondo queda como una estampilla si no lo llena. No se puede
  // adivinar mirando la imagen —vive en otro dominio y el navegador no deja
  // leer sus píxeles—, así que lo decide el negocio con una casilla.
  test("por defecto NO llena: perder el nombre es peor que verse feo", () => {
    esperar(leerConfig({}).logo_llena).igual(false);
    esperar(CONFIG_POR_DEFECTO.logo_llena ?? false).igual(false);
  });

  test("solo el true de verdad la enciende", () => {
    esperar(leerConfig({ logo_llena: true }).logo_llena).igual(true);
    // Nada de `Boolean(...)`: una casilla que llega como "false" o como "0"
    // desde un formulario mal armado encendería el recorte, y el cliente vería
    // su logo cortado sin haber tocado nada.
    esperar(leerConfig({ logo_llena: "false" }).logo_llena).igual(false);
    esperar(leerConfig({ logo_llena: "on" }).logo_llena).igual(false);
    esperar(leerConfig({ logo_llena: 1 }).logo_llena).igual(false);
    esperar(leerConfig({ logo_llena: null }).logo_llena).igual(false);
  });

  test("la instrucción al cliente explica los dos casos", () => {
    const t = instruccionesDeImagenes();
    esperar(/propio fondo/i.test(t)).verdadero("la ayuda no dice cuándo marcar la casilla");
  });
});


describe("La tienda dentro del chat", () => {
  const viva = { id: "t1", slug: "paws-at-home", nombre: "Paws at Home", activa: true };
  const apagada = { id: "t2", slug: "de-vacaciones", nombre: "Cerrada", activa: false };

  test("una tienda APAGADA no se manda nunca", () => {
    // `activa` existe porque el negocio la apaga en vacaciones, mientras la
    // monta, o cuando se le acabó el inventario. Mandar ese enlace es peor que
    // no mandar nada: el cliente hace el viaje y encuentra una pantalla muerta.
    esperar(tiendaDelBot([apagada])).igual(null);
    esperar(tiendaDelBot([apagada, viva])?.slug).igual("paws-at-home");
    esperar(mensajeDeTienda(tiendaDelBot([apagada]))).igual(null);
  });

  test("sin tienda no hay enlace, y se dice que no lo hay", () => {
    esperar(tiendaDelBot([])).igual(null);
    esperar(tiendaDelBot(null)).igual(null);
    esperar(enlaceDelBot(null)).igual(null);
  });

  test("con varias tiendas siempre la misma, nunca al azar", () => {
    const a = { ...viva, slug: "aaa", nombre: "Aaa" };
    const b = { ...viva, slug: "bbb", nombre: "Bbb" };
    esperar(tiendaDelBot([a, b])?.slug).igual("aaa");
    esperar(tiendaDelBot([b, a])?.slug).igual("aaa");
  });

  test("el botón se recorta a 20, que es el tope de WhatsApp", () => {
    // Meta no avisa: manda el mensaje con el texto cortado a media palabra.
    const m = mensajeDeTienda(viva, "Pide aquí", "Ver todo nuestro catálogo completo");
    esperar(m?.boton.length <= 20).verdadero(`el botón mide ${m?.boton.length}`);
  });

  test("un bloque sin configurar no manda un mensaje en blanco", () => {
    const m = mensajeDeTienda(viva, "   ", "  ");
    esperar(Boolean(m?.texto)).verdadero("mandó texto vacío");
    esperar(Boolean(m?.boton)).verdadero("mandó un botón sin etiqueta");
  });

  /* ── Qué se puede ofrecer ─────────────────────────────────────────────── */

  const p = (id, extra = {}) => ({ id, nombre: `P${id}`, precio: 1000, ...extra });

  test("lo oculto no se ofrece", () => {
    esperar(productosQueSePuedenOfrecer([p("1"), p("2", { oculto: true })]).length).igual(1);
  });

  test("lo agotado no se ofrece, pero el stock NULO sí", () => {
    // `stock: null` es «no llevo control de existencias», NO es cero. Es el
    // valor de la mayoría de los productos: tratarlo como agotado vaciaría el
    // catálogo entero de casi todas las tiendas.
    const r = productosQueSePuedenOfrecer([
      p("1", { stock: null }), p("2", { stock: 0 }), p("3", { stock: 5 }), p("4"),
    ]);
    esperar(r.map((x) => x.id)).igual(["1", "3", "4"]);
  });

  test("el orden manda sobre el nombre", () => {
    const r = productosQueSePuedenOfrecer([
      { id: "a", nombre: "Zeta", precio: 1, orden: 1 },
      { id: "b", nombre: "Alfa", precio: 1, orden: 2 },
    ]);
    esperar(r.map((x) => x.nombre)).igual(["Zeta", "Alfa"]);
  });

  test("los precios se leen en dinero, no en centavos", () => {
    esperar(precioDelBot(750)).igual("$7.50");
    esperar(precioDelBot(1534, "B/.")).igual("B/.15.34");
    esperar(precioDelBot(NaN)).igual("$0.00");
  });

  test("sin ninguna categoría no se inventa una sola llamada «Otros»", () => {
    esperar(categoriasDelBot([p("1"), p("2")])).igual([]);
    const con = categoriasDelBot([p("1", { categoria: "Perros" }), p("2")]);
    esperar(con.map((c) => c.nombre)).igual(["Perros", "Otros"]);
  });

  /* ── La lista de WhatsApp ─────────────────────────────────────────────── */

  test("NUNCA más de 10 filas: Meta rechaza el mensaje entero", () => {
    // EL DIEZ VA ESCRITO A MANO Y NO COMO `MAX_FILAS_LISTA`. La primera versión
    // de esta prueba comparaba contra la propia constante: subir la constante a
    // 25 la dejaba pasar tan campante, que es exactamente el cambio del que
    // tiene que protegernos. El diez es de Meta, no nuestro.
    esperar(MAX_FILAS_LISTA <= 10).verdadero(`el tope está en ${MAX_FILAS_LISTA} y Meta acepta 10`);
    const muchos = Array.from({ length: 48 }, (_, i) => p(String(i)));
    const pag = paginaDeCatalogo(muchos, 0);
    esperar(pag.filas.length <= 10).verdadero(`mandó ${pag.filas.length} filas`);
  });

  test("cuando hay más, la última fila lo dice", () => {
    const muchos = Array.from({ length: 48 }, (_, i) => p(String(i)));
    const pag = paginaDeCatalogo(muchos, 0);
    esperar(pag.hayMas).verdadero();
    esperar(pag.filas[pag.filas.length - 1].id.startsWith("mas-")).verdadero();
    // Una lista que se corta en el décimo sin decirlo hace creer que la tienda
    // tiene diez cosas.
    esperar(pag.filas.filter((f) => f.id.startsWith("prod-")).length).igual(9);
  });

  test("si caben justos, no se desperdicia una fila en «ver más»", () => {
    const diez = Array.from({ length: 10 }, (_, i) => p(String(i)));
    const pag = paginaDeCatalogo(diez, 0);
    esperar(pag.hayMas).falso();
    esperar(pag.filas.length).igual(10);
  });

  test("los títulos y descripciones se recortan a lo que acepta Meta", () => {
    const largo = [{ id: "x", nombre: "Comida premium para perro adulto de raza grande", precio: 1000,
      categoria: "Una categoría con un nombre larguísimo que no cabe de ninguna manera aquí" }];
    const f = paginaDeCatalogo(largo, 0).filas[0];
    esperar(f.titulo.length <= 24).verdadero(`título de ${f.titulo.length}`);
    esperar(f.descripcion.length <= 72).verdadero(`descripción de ${f.descripcion.length}`);
  });

  test("se entiende qué tocó la persona", () => {
    esperar(productoElegido("prod-abc-123")).igual("abc-123");
    esperar(desdeDondeSigue("mas-9")).igual(9);
    esperar(productoElegido("mas-9")).igual(null);
    esperar(desdeDondeSigue("prod-abc")).igual(null);
    // Escribió en vez de tocar: ni una cosa ni la otra.
    esperar(productoElegido("hola")).igual(null);
    esperar(desdeDondeSigue("hola")).igual(null);
  });

  /* ── El estado del pedido ─────────────────────────────────────────────── */

  const ped = (extra) => ({ numero: 7, estado: "preparando", pago: "pagado", total: 1950, ...extra });

  test("EL IMPAGO MANDA SOBRE EL ESTADO", () => {
    // Aquí se cobra antes de preparar: decirle «lo estamos preparando» a quien
    // no ha pagado sería mentirle, y lo que necesita saber es que falta pagar.
    const t = comoVaElPedido(ped({ pago: null }));
    esperar(/esperando el pago/.test(t)).verdadero(t);
    esperar(/preparando/.test(t)).falso(t);
  });

  test("no se dice «recibido», se dice qué significa", () => {
    const t = comoVaElPedido(ped({ estado: "recibido" }));
    esperar(/recibido/i.test(t)).falso("le está diciendo la palabra del panel");
  });

  test("cada estado dice dónde está el pedido", () => {
    esperar(/camino/.test(comoVaElPedido(ped({ estado: "en_camino" })))).verdadero();
    esperar(/entregado/.test(comoVaElPedido(ped({ estado: "entregado" })))).verdadero();
    esperar(/cancelado/.test(comoVaElPedido(ped({ estado: "cancelado" })))).verdadero();
    // Un estado que no conocemos no deja al cliente sin respuesta.
    esperar(comoVaElPedido(ped({ estado: "inventado" })).length > 10).verdadero();
  });

  test("un cancelado no dice que falta pagar", () => {
    // El cancelado se comprueba ANTES que el impago: casi todos los cancelados
    // lo están justamente porque no se pagaron, y decirle «espera el pago» de
    // un pedido muerto es la respuesta más confusa posible.
    const t = comoVaElPedido(ped({ estado: "cancelado", pago: null }));
    esperar(/esperando el pago/.test(t)).falso(t);
  });

  test("se habla del ÚLTIMO pedido, y los cancelados no cuentan", () => {
    const viejo = { numero: 1, estado: "entregado", total: 100, created_at: "2026-01-01T00:00:00Z" };
    const nuevo = { numero: 9, estado: "preparando", total: 200, created_at: "2026-09-01T00:00:00Z" };
    const cancelado = { numero: 12, estado: "cancelado", total: 300, created_at: "2026-09-03T00:00:00Z" };
    esperar(pedidoDelQueHablar([viejo, nuevo, cancelado])?.numero).igual(9);
    esperar(pedidoDelQueHablar([cancelado, nuevo, viejo])?.numero).igual(9);
  });

  test("si TODO está cancelado, se habla del cancelado y no de nada", () => {
    const c = { numero: 3, estado: "cancelado", total: 100, created_at: "2026-09-03T00:00:00Z" };
    esperar(pedidoDelQueHablar([c])?.numero).igual(3);
    esperar(pedidoDelQueHablar([])).igual(null);
    esperar(pedidoDelQueHablar(null)).igual(null);
  });

  test("sin fecha legible manda el número, que en una tienda siempre sube", () => {
    const a = { numero: 4, estado: "preparando", total: 1, created_at: "vaya fecha" };
    const b = { numero: 8, estado: "preparando", total: 1, created_at: null };
    esperar(pedidoDelQueHablar([a, b])?.numero).igual(8);
  });
});


describe("El complemento de la Tienda", () => {
  test("NUNCA se enseña un ahorro negativo", () => {
    // A quien vende poco no se le dice «te ahorras -$34». Prometer con un
    // número que insulta es peor que no poner la calculadora.
    esperar(loQueTeAhorras(100)).igual(0);
    esperar(loQueTeAhorras(0)).igual(0);
    esperar(loQueTeAhorras(-500)).igual(0);
    esperar(loQueTeAhorras("no es un número")).igual(0);
  });

  test("la cuenta del ahorro es la comisión menos lo que cuesta", () => {
    // 3.000 × 25% = 750 de comisión; menos 59 = 691.
    esperar(loQueTeAhorras(3000)).igual(691);
    esperar(loQueTeAhorras(10000)).igual(2441);
  });

  test("el punto en el que se paga sola sale de la misma cuenta", () => {
    // Si el precio o la comisión cambian, este número tiene que moverse solo.
    // Escrito a mano, un día diría 236 con el precio ya en otro sitio.
    const punto = desdeCuantoSePagaSola();
    esperar(punto * COMISION_APPS >= PRECIO_TIENDA).verdadero(
      `con ${punto} de ventas todavía no se paga`,
    );
    // Y ES EL MÁS BAJO QUE CUMPLE: un peso menos y ya no se paga.
    esperar((punto - 1) * COMISION_APPS < PRECIO_TIENDA).verdadero(
      `${punto} no es el punto justo, sobra margen`,
    );
    // LO QUE DE VERDAD IMPORTA: QUE SE MUEVA CON EL PRECIO. La primera versión
    // de esta prueba calculaba lo esperado con la misma fórmula, así que un
    // número escrito a mano —que hoy da la misma cifra— la pasaba igual. El
    // día que el precio cambie, ese número mentiría en la pantalla.
    esperar(desdeCuantoSePagaSola(80)).igual(320);
    esperar(desdeCuantoSePagaSola(120)).igual(480);
  });

  test("se dice que es por tienda y que apagarla deja de cobrarse", () => {
    // Una cadena tiene que poder calcular su factura sola, y quien cierra un
    // local tiene que poder dejar de pagarlo sin llamar a nadie. Enterarse
    // DESPUÉS es de las cosas que más rápido rompen la confianza.
    esperar(/por cada tienda|por tienda/i.test(LETRA_CHICA)).verdadero(LETRA_CHICA);
    esperar(/apagada no se cobra/i.test(LETRA_CHICA)).verdadero(LETRA_CHICA);
    esperar(/por tienda/i.test(precioEscrito())).verdadero(precioEscrito());
  });

  test("el argumento no es una lista de funciones", () => {
    // El primero tiene que ser el dinero que YA está perdiendo, no una
    // característica. Contra quien se compite es contra las apps de delivery.
    esperar(BENEFICIOS.length >= 5).verdadero("el argumento se quedó corto");
    esperar(/%|comisión|regalar/i.test(BENEFICIOS[0].titulo + BENEFICIOS[0].texto)).verdadero(
      "el primer beneficio ya no habla de la comisión que paga hoy",
    );
    esperar(/comisión/i.test(GANCHO)).verdadero(GANCHO);
    esperar(INCLUYE.length >= 6).verdadero("la lista de lo que incluye se quedó corta");
  });

  test("no se promete nada que no esté construido", () => {
    // Cada promesa que no se cumpla es una baja el mes siguiente, y cuesta
    // mucho más que la venta que trajo.
    const todo = [GANCHO, LETRA_CHICA, ...INCLUYE, ...BENEFICIOS.map((b) => b.titulo + b.texto)].join(" ");
    esperar(/próximamente|muy pronto|estamos trabajando|en desarrollo/i.test(todo)).falso(
      "el texto de venta promete algo que no está hecho",
    );
  });
});


describe("Plantillas de pedido y la ventana de 24 horas", () => {
  const hace = (horas) => new Date(Date.now() - horas * 3600_000).toISOString();

  test("recién escrito: texto libre", () => {
    esperar(dentroDeLaVentana(hace(0.5))).verdadero();
    esperar(dentroDeLaVentana(hace(6))).verdadero();
    esperar(dentroDeLaVentana(hace(20))).verdadero();
  });

  test("pasadas las 24 horas: plantilla", () => {
    // Es el caso que hoy se pierde entero: quien pidió anoche y recibe hoy a
    // mediodía lleva catorce horas sin escribir… y el «entregado» llega a las
    // treinta y tantas.
    esperar(dentroDeLaVentana(hace(25))).falso();
    esperar(dentroDeLaVentana(hace(37))).falso();
    esperar(dentroDeLaVentana(hace(470))).falso();
  });

  test("EL MARGEN VA HACIA LA PLANTILLA, no hacia el texto", () => {
    // Equivocarse por cada lado cuesta distinto. Plantilla de más = unos
    // centavos. Texto libre de más = el aviso NO LLEGA y el cliente no se
    // entera de que su pedido va en camino.
    const justoAntes = VENTANA_HORAS - MARGEN_MINUTOS / 60 - 0.05;
    const justoDespues = VENTANA_HORAS - MARGEN_MINUTOS / 60 + 0.05;
    esperar(dentroDeLaVentana(hace(justoAntes))).verdadero();
    esperar(dentroDeLaVentana(hace(justoDespues))).falso(
      "cerró la ventana sin margen: un reloj desfasado se come el aviso",
    );
    // Y el margen existe de verdad: a las 23:50 ya se manda plantilla.
    esperar(dentroDeLaVentana(hace(23.9))).falso();
  });

  test("quien nunca escribió NO tiene ventana", () => {
    // Es el caso del que pidió desde la tienda sin escribir por WhatsApp.
    // Tratarlo como recién escrito sería mandar algo que Meta va a rechazar.
    esperar(dentroDeLaVentana(null)).falso();
    esperar(dentroDeLaVentana(undefined)).falso();
    esperar(dentroDeLaVentana("")).falso();
    esperar(dentroDeLaVentana("cualquier cosa")).falso();
  });

  test("una fecha en el futuro es un reloj roto, no una ventana", () => {
    esperar(dentroDeLaVentana(hace(-3))).falso();
  });

  /* ── Las plantillas ───────────────────────────────────────────────────── */

  test("los momentos que de verdad esperan tienen plantilla", () => {
    // Sin estas cuatro, el aviso que más importa se pierde fuera de la ventana.
    for (const m of ["pagado", "confirmado", "en_camino", "entregado"]) {
      esperar(Boolean(plantillaDe(m))).verdadero(`falta la plantilla de "${m}"`);
    }
    // «preparando» NO tiene, a propósito: viene apagado de fábrica.
    esperar(plantillaDe("preparando")).igual(null);
  });

  test("NINGUNA variable va al principio ni al final", () => {
    // Meta rechaza la plantilla entera por esto, y ya nos pasó con
    // `pedido_entregado`, que terminaba en «…{{2}}!».
    for (const p of Object.values(PLANTILLAS)) {
      const c = p.cuerpo.trim();
      esperar(c.startsWith("{{")).falso(`${p.nombre} empieza con una variable`);
      esperar(/\{\{\d+\}\}[\s!.?]*$/.test(c)).falso(`${p.nombre} termina con una variable`);
    }
  });

  test("los huecos del cuerpo y las variables declaradas cuadran", () => {
    // Mandar de menos o de más hace que Meta rechace el envío entero con
    // «number of parameters does not match».
    for (const p of Object.values(PLANTILLAS)) {
      const huecos = new Set([...p.cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
      esperar(huecos.size).igual(p.variables.length, `${p.nombre}: huecos ≠ variables`);
      // Y van numerados del 1 en adelante, sin saltos.
      esperar([...huecos].sort((a, b) => a - b)).igual(
        p.variables.map((_, i) => i + 1),
        `${p.nombre}: los huecos no van 1, 2, 3…`,
      );
    }
  });

  test("los nombres son los que acepta Meta", () => {
    for (const p of Object.values(PLANTILLAS)) {
      esperar(/^[a-z0-9_]+$/.test(p.nombre)).verdadero(`${p.nombre} no vale como nombre en Meta`);
    }
    esperar(new Set(NOMBRES_DE_PEDIDO).size).igual(
      NOMBRES_DE_PEDIDO.length,
      "hay dos momentos apuntando a la misma plantilla",
    );
  });

  test("un hueco vacío NO se manda", () => {
    // Meta acepta el envío con una variable en blanco, y lo que llega es
    // «Tu pedido # en …», que se lee como un error de la plataforma.
    const p = plantillaDe("pagado");
    const buenos = valoresDe(p, { numero: 7, tienda: "Paws at Home", total: "$19.50" });
    esperar(buenos).igual(["7", "Paws at Home", "$19.50"]);
    esperar(faltaAlgunDato(p, buenos)).falso();

    esperar(faltaAlgunDato(p, valoresDe(p, { numero: 7, tienda: "", total: "$1" }))).verdadero();
    esperar(faltaAlgunDato(p, ["7", "Paws at Home"])).verdadero("dejó pasar una variable de menos");
    esperar(faltaAlgunDato(p, ["7", "a", "b", "c"])).verdadero("dejó pasar una de más");
  });

  test("los dos avisos que recuperan dinero llevan botón", () => {
    // La diferencia entre poner el enlace y no ponerlo es la diferencia entre
    // recuperar esa venta y perderla.
    esperar(plantillaDe("enlace_vencido").boton?.a).igual("tienda");
    esperar(plantillaDe("pago_no_completado").boton?.a).igual("pago");
    // Y «en camino» no lleva: no hay nada que pulsar.
    esperar(plantillaDe("en_camino").boton).igual(undefined);
  });

  test("se reconoce cuando Meta dice que se cerró la ventana", () => {
    esperar(esFueraDeVentana(FUERA_DE_VENTANA)).verdadero();
    esperar(esFueraDeVentana(131047)).verdadero();
    esperar(esFueraDeVentana(null, "Message failed to send because more than 24 hours have passed"))
      .verdadero();
    esperar(esFueraDeVentana(131026, "Message undeliverable")).falso(
      "confundió otro error con la ventana: reintentaría con plantilla sin motivo",
    );
    esperar(esFueraDeVentana(null, "")).falso();
  });
});


describe("Planes por capacidad", () => {
  test("ANTE LA DUDA, NO LA TIENE", () => {
    // Una lista que no se pudo leer no puede leerse como «lo tiene todo»: eso
    // convertiría un fallo de la base en barra libre. Al revés el cliente ve la
    // función apagada, que es molesto pero se arregla escribiendo.
    esperar(tiene(null, "ia")).falso();
    esperar(tiene(undefined, "ia")).falso();
    esperar(tiene("ia", "ia")).falso("una cadena no es una lista de capacidades");
    esperar(tiene({}, "ia")).falso();
    esperar(tiene([], "ia")).falso();
  });

  test("con la capacidad en la lista, sí", () => {
    esperar(tiene(["ia"], "ia")).verdadero();
    esperar(tiene(["tienda", "ia"], "tienda")).verdadero();
    esperar(tiene(["tienda"], "ia")).falso();
  });

  test("cada función dice QUÉ SE PIERDE sin ella, no solo qué es", () => {
    // «Respuestas con IA» no mueve a nadie. «La pregunta que no está en tu flujo
    // se queda sin respuesta» sí, porque eso le pasa hoy.
    for (const f of Object.values(FEATURES)) {
      esperar(f.sinElla.length > 40).verdadero(`${f.clave} no explica qué se pierde`);
      esperar(Boolean(f.desdeElPlan)).verdadero(`${f.clave} no dice desde qué plan viene`);
      esperar(Boolean(f.complemento)).verdadero(`${f.clave} no dice cómo comprarla suelta`);
    }
  });

  test("una clave que no existe no rompe la pantalla", () => {
    esperar(feature("inventada")).igual(null);
    esperar(feature("")).igual(null);
  });
});


describe("Descuentos y meses gratis", () => {
  test("un descuento imposible se para ANTES de hablar con Stripe", () => {
    // Stripe rechaza esto con un error en inglés para programadores, y quien
    // está dándole un trato a un cliente no tiene por qué leer eso.
    esperar(Boolean(revisar({ tipo: "porcentaje", porcentaje: 0, meses: 1 }))).verdadero();
    esperar(Boolean(revisar({ tipo: "porcentaje", porcentaje: 150, meses: 1 }))).verdadero();
    esperar(Boolean(revisar({ tipo: "porcentaje", porcentaje: -10, meses: 1 }))).verdadero();
    esperar(Boolean(revisar({ tipo: "mes_gratis", meses: 0 }))).verdadero();
    esperar(Boolean(revisar({ tipo: "mes_gratis", meses: 999 }))).verdadero(
      "un dedazo de 999 meses es regalar el producto para siempre",
    );
  });

  test("los descuentos razonables pasan", () => {
    esperar(revisar({ tipo: "mes_gratis", meses: 1 })).igual(null);
    esperar(revisar({ tipo: "porcentaje", porcentaje: 30, meses: 3 })).igual(null);
    esperar(revisar({ tipo: "porcentaje", porcentaje: 100, meses: null })).igual(null);
  });

  test("se dice en cristiano lo que se acaba de aplicar", () => {
    // Quien lo da tiene que poder leer lo que hizo y darse cuenta si se
    // equivocó, ANTES de que le llegue la factura al cliente.
    esperar(explicar({ tipo: "mes_gratis", meses: 1 })).contiene("no se le cobra");
    esperar(explicar({ tipo: "mes_gratis", meses: 3 })).contiene("3 meses gratis");
    esperar(explicar({ tipo: "porcentaje", porcentaje: 30, meses: null }))
      .contiene("mientras siga suscrito");
    esperar(explicar({ tipo: "porcentaje", porcentaje: 20, meses: 6 })).contiene("6 cobros");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * PEDIR POR EL CHAT
 *
 * Lo que se prueba aquí es la CONVERSACIÓN, no el dinero: el dinero lo calcula
 * `recalcularPedido`, que ya tiene sus propias pruebas y es el mismo que usa la
 * tienda. Aquí se comprueba que el bot pregunta lo que falta, en el orden que
 * toca, y que no se atasca — que es donde se pierde un pedido.
 * ──────────────────────────────────────────────────────────────────────────── */

const grupoUna = { nombre: "Tamaño", modo: "una", opciones: [
  { texto: "Pequeña", recargo: 0 }, { texto: "Mediana", recargo: 250 },
] };
const grupoVarias = { nombre: "Extras", modo: "varias", opciones: [
  { texto: "Queso", recargo: 100 }, { texto: "Piña", recargo: 50 },
] };
const grupoTres = { nombre: "Sabores", modo: "hasta_completar", cantidad: 2, opciones: [
  { texto: "Fresa", recargo: 0 }, { texto: "Mango", recargo: 0 }, { texto: "Coco", recargo: 0 },
] };

const pizza = { id: "p1", nombre: "Pizza", precio: 700, variedades: [grupoUna] };
const agua = { id: "p2", nombre: "Agua", precio: 100, variedades: [] };
const preguntasEntrega = [
  { id: "nombre", etiqueta: "Nombre completo", tipo: "texto", obligatoria: true },
  { id: "telefono", etiqueta: "Teléfono", tipo: "telefono", obligatoria: true },
  { id: "direccion", etiqueta: "Dirección", tipo: "parrafo", obligatoria: true },
];

describe("Pedir por el chat — qué cabe hablando", () => {
  test("un producto sin opciones siempre cabe", () => {
    esperar(cabeEnElChat([]).cabe).verdadero();
    esperar(cabeEnElChat(null).cabe).verdadero();
  });

  test("demasiados grupos NO caben: son ocho mensajes para meter una cosa", () => {
    const muchos = Array.from({ length: MAX_GRUPOS_EN_CHAT + 1 }, (_, i) => ({
      ...grupoUna, nombre: `G${i}`,
    }));
    esperar(cabeEnElChat(muchos).cabe).falso();
    esperar(cabeEnElChat(muchos.slice(0, MAX_GRUPOS_EN_CHAT)).cabe).verdadero(
      "justo en el tope todavía cabe",
    );
  });

  test("un grupo con más opciones de las que aguanta una lista NO cabe", () => {
    const once = { nombre: "Sabor", modo: "una", opciones:
      Array.from({ length: MAX_FILAS + 1 }, (_, i) => ({ texto: `S${i}`, recargo: 0 })) };
    esperar(cabeEnElChat([once]).cabe).falso();
    esperar(cabeEnElChat([{ ...once, opciones: once.opciones.slice(0, MAX_FILAS) }]).cabe).verdadero();
  });

  test("«elige varias» necesita una fila menos, para el botón de Listo", () => {
    // Sin ella el cliente elige y no tiene forma de decir que ya terminó: se
    // queda encerrado en el mismo grupo para siempre.
    const alTope = Array.from({ length: MAX_FILAS }, (_, i) => ({ texto: `E${i}`, recargo: 0 }));
    esperar(cabeEnElChat([{ nombre: "Extras", modo: "varias", opciones: alTope }]).cabe).falso();
    esperar(cabeEnElChat([{ nombre: "Tam", modo: "una", opciones: alTope }]).cabe).verdadero(
      "con «elige una» ese mismo grupo sí cabe: no hace falta el Listo",
    );
  });

  test("«elige N de muchas» con N grande NO cabe: es un formulario", () => {
    const cinco = { ...grupoTres, cantidad: MAX_ELECCIONES_POR_GRUPO + 1 };
    esperar(cabeEnElChat([cinco]).cabe).falso();
    esperar(cabeEnElChat([{ ...grupoTres, cantidad: MAX_ELECCIONES_POR_GRUPO }]).cabe).verdadero();
  });

  test("un grupo sin opciones no cabe: es una pregunta que no se puede contestar", () => {
    esperar(cabeEnElChat([{ nombre: "Vacío", modo: "una", opciones: [] }]).cabe).falso();
  });
});

describe("Pedir por el chat — el orden de las preguntas", () => {
  test("sin nada en el carrito, lo primero es enseñar el catálogo", () => {
    const c = carritoVacio("t1");
    esperar(siguientePaso(c, [pizza, agua], preguntasEntrega).que).igual("producto");
  });

  test("al elegir un producto con opciones, se pregunta el grupo", () => {
    const { carrito } = empezarProducto(carritoVacio("t1"), pizza);
    const paso = siguientePaso(carrito, [pizza], preguntasEntrega);
    esperar(paso.que).igual("variedad");
    esperar(paso.grupo.nombre).igual("Tamaño");
  });

  test("un producto SIN opciones salta directo a la cantidad", () => {
    const { carrito } = empezarProducto(carritoVacio("t1"), agua);
    esperar(siguientePaso(carrito, [agua], preguntasEntrega).que).igual("cantidad");
  });

  test("contestar «elige una» AVANZA SOLO al grupo siguiente", () => {
    // El fallo que esto caza: mirando solo el grupo de turno, un producto de
    // tres preguntas preguntaba la primera y se saltaba las otras dos.
    const tres = { id: "p3", nombre: "Combo", precio: 900,
      variedades: [grupoUna, grupoVarias, grupoTres] };
    let { carrito } = empezarProducto(carritoVacio("t1"), tres);
    carrito = elegirOpcion(carrito, grupoUna, "Mediana");
    const paso = siguientePaso(carrito, [tres], preguntasEntrega);
    esperar(paso.que).igual("variedad");
    esperar(paso.grupo.nombre).igual("Extras", "tenía que pasar al segundo grupo, no a la cantidad");
  });

  test("«elige varias» NO avanza solo: lo cierra el cliente con Listo", () => {
    const conExtras = { id: "p4", nombre: "Hamburguesa", precio: 800, variedades: [grupoVarias] };
    let { carrito } = empezarProducto(carritoVacio("t1"), conExtras);
    carrito = elegirOpcion(carrito, grupoVarias, "Queso");
    esperar(siguientePaso(carrito, [conExtras], preguntasEntrega).que).igual("variedad",
      "sigue en el mismo grupo: puede querer otro extra");
    carrito = avanzarGrupo(carrito);
    esperar(siguientePaso(carrito, [conExtras], preguntasEntrega).que).igual("cantidad");
  });

  test("«elige 2 de 3» pregunta hasta juntar las dos", () => {
    const helado = { id: "p5", nombre: "Helado", precio: 400, variedades: [grupoTres] };
    let { carrito } = empezarProducto(carritoVacio("t1"), helado);
    let paso = siguientePaso(carrito, [helado], preguntasEntrega);
    esperar(paso.faltan).igual(2);
    carrito = elegirOpcion(carrito, grupoTres, "Fresa");
    paso = siguientePaso(carrito, [helado], preguntasEntrega);
    esperar(paso.que).igual("variedad");
    esperar(paso.faltan).igual(1, "le falta una y hay que decírselo");
    carrito = elegirOpcion(carrito, grupoTres, "Mango");
    esperar(siguientePaso(carrito, [helado], preguntasEntrega).que).igual("cantidad");
  });

  test("con algo en el carrito se pregunta si quiere más, no se cobra de una", () => {
    let { carrito } = empezarProducto(carritoVacio("t1"), agua);
    carrito = meterAlCarrito(carrito, 2);
    esperar(siguientePaso(carrito, [agua], preguntasEntrega).que).igual("mas");
  });

  test("al cerrar el carrito empieza el formulario, saltando lo ya sabido", () => {
    let { carrito } = empezarProducto(carritoVacio("t1"), agua);
    carrito = meterAlCarrito(carrito, 1);
    carrito = { ...carrito, respuestas: { telefono: "50761112222" } };
    carrito = cerrarCarrito(carrito);
    const paso = siguientePaso(carrito, [agua], preguntasEntrega);
    esperar(paso.que).igual("pregunta");
    esperar(paso.pregunta.id).igual("nombre", "el teléfono ya se sabe: no se vuelve a preguntar");
  });

  test("cuando no falta nada por preguntar, toca confirmar", () => {
    let { carrito } = empezarProducto(carritoVacio("t1"), agua);
    carrito = meterAlCarrito(carrito, 1);
    carrito = cerrarCarrito(carrito);
    carrito = { ...carrito, respuestas: { nombre: "Ana", telefono: "507611", direccion: "Calle 50" } };
    esperar(siguientePaso(carrito, [agua], preguntasEntrega).que).igual("confirmar");
  });

  test("si el producto desaparece a mitad, se vuelve al catálogo y no se rompe", () => {
    // Lo ocultaron o se agotó mientras conversaban. Quedarse pidiendo opciones
    // de algo que ya no existe es un pedido que nunca se va a poder crear.
    const { carrito } = empezarProducto(carritoVacio("t1"), pizza);
    esperar(siguientePaso(carrito, [agua], preguntasEntrega).que).igual("producto");
  });
});

describe("Pedir por el chat — lo que se guarda en el carrito", () => {
  test("EL CARRITO NO GUARDA NI UN PRECIO", () => {
    // Es la regla que impide que haya dos calculadoras de dinero. Si algún día
    // alguien mete `precio` aquí, esta prueba tiene que cantarlo.
    let { carrito } = empezarProducto(carritoVacio("t1"), pizza);
    carrito = elegirOpcion(carrito, grupoUna, "Mediana");
    carrito = meterAlCarrito(carrito, 2);
    const texto = JSON.stringify(carrito);
    esperar(texto).noContiene('"precio"', "el precio se relee del catálogo, no se guarda");
    esperar(texto).noContiene('"recargo"', "el recargo lo pone el servidor al recalcular");
    esperar(texto).noContiene('"total"');
    esperar(carrito.lineas[0].elegidas).igual([{ grupo: "Tamaño", texto: "Mediana" }]);
  });

  test("una opción que el grupo no tiene NO entra al carrito", () => {
    // Sin esta puerta, escribir cualquier cosa metería una opción inventada y
    // el servidor tiraría la línea entera después, sin que el cliente entienda.
    const { carrito } = empezarProducto(carritoVacio("t1"), pizza);
    esperar(elegirOpcion(carrito, grupoUna, "Gigante")).igual(carrito);
  });

  test("en «elige una», la segunda pisa a la primera", () => {
    let { carrito } = empezarProducto(carritoVacio("t1"), pizza);
    carrito = elegirOpcion(carrito, grupoUna, "Pequeña");
    carrito = elegirOpcion(carrito, grupoUna, "Mediana");
    esperar(carrito.armando.elegidas).igual([{ grupo: "Tamaño", texto: "Mediana" }],
      "sumar las dos cobraría los dos recargos");
  });

  test("en «elige varias», tocar dos veces lo mismo no lo cobra dos veces", () => {
    const conExtras = { id: "p4", nombre: "Hamburguesa", precio: 800, variedades: [grupoVarias] };
    let { carrito } = empezarProducto(carritoVacio("t1"), conExtras);
    carrito = elegirOpcion(carrito, grupoVarias, "Queso");
    carrito = elegirOpcion(carrito, grupoVarias, "Queso");
    esperar(carrito.armando.elegidas.length).igual(1);
  });

  test("dos veces lo mismo se junta en una línea; con otras opciones no", () => {
    let c = carritoVacio("t1");
    c = empezarProducto(c, agua).carrito;
    c = meterAlCarrito(c, 1);
    c = empezarProducto(c, agua).carrito;
    c = meterAlCarrito(c, 2);
    esperar(c.lineas.length).igual(1, "en la cocina, dos renglones iguales se preparan por separado");
    esperar(c.lineas[0].cantidad).igual(3);

    let d = carritoVacio("t1");
    d = empezarProducto(d, pizza).carrito;
    d = elegirOpcion(d, grupoUna, "Pequeña");
    d = meterAlCarrito(d, 1);
    d = empezarProducto(d, pizza).carrito;
    d = elegirOpcion(d, grupoUna, "Mediana");
    d = meterAlCarrito(d, 1);
    esperar(d.lineas.length).igual(2, "con piña y sin piña son dos cosas distintas");
  });

  test("el orden en que eligió no cambia si dos líneas son la misma", () => {
    const a = huella("p1", [{ grupo: "A", texto: "x" }, { grupo: "B", texto: "y" }], "");
    const b = huella("p1", [{ grupo: "B", texto: "y" }, { grupo: "A", texto: "x" }], "");
    esperar(a).igual(b);
  });

  test("un producto que no cabe en el chat NO se empieza a armar", () => {
    const imposible = { id: "p9", nombre: "Torta", precio: 3000,
      variedades: [{ ...grupoTres, cantidad: 9 }] };
    const antes = carritoVacio("t1");
    const { carrito, veredicto } = empezarProducto(antes, imposible);
    esperar(veredicto.cabe).falso();
    esperar(carrito).igual(antes, "empezar y atascarse a la tercera pregunta es peor que no empezar");
  });

  test("nunca más de 99 de lo mismo", () => {
    let { carrito } = empezarProducto(carritoVacio("t1"), agua);
    carrito = meterAlCarrito(carrito, 5000);
    esperar(carrito.lineas[0].cantidad).igual(MAX_POR_LINEA);
  });
});

describe("Pedir por el chat — entender lo que contesta", () => {
  test("las cantidades se entienden escritas como habla la gente", () => {
    esperar(leerCantidad("2")).igual(2);
    esperar(leerCantidad("quiero 3 por favor")).igual(3);
    esperar(leerCantidad("dos")).igual(2);
    esperar(leerCantidad("una docena")).igual(12,
      "«una docena» empezó devolviendo UNO: lo largo tiene que ganar a lo corto");
    esperar(leerCantidad("media docena")).igual(6);
    esperar(leerCantidad("100")).igual(MAX_POR_LINEA);
  });

  test("lo que no se entiende devuelve nulo, no cero ni uno", () => {
    // Tratarlo como 0 borraría el producto sin decir nada; como 1 le cobraría
    // uno que quizá no quería. Las dos son peores que volver a preguntar.
    esperar(leerCantidad("")).igual(null);
    esperar(leerCantidad("no sé")).igual(null);
    esperar(leerCantidad("0")).igual(null);
    esperar(leerCantidad("unos cuantos")).igual(null, "«unos» no es «uno»");
  });

  test("el teléfono no se pregunta: se sabe desde donde escriben", () => {
    const puestas = loQueYaSabemos(preguntasEntrega, { telefono: "+507 6217-1875", nombre: "Alex" });
    esperar(puestas.telefono).igual("50762171875", "se guarda solo con dígitos, como el CRM");
    esperar(puestas.nombre).igual("Alex");
    esperar(puestas.direccion).igual(undefined, "la dirección sí hay que preguntarla");
  });

  test("el teléfono se reconoce por su TIPO, se llame como se llame", () => {
    // Mucha hoja trae la pregunta con nombre propio —«A qué WhatsApp te
    // escribo», «Celular de contacto»— y el negocio la marca como teléfono.
    // Fiarse solo del texto de la etiqueta dejaría esa casilla sin rellenar y
    // el bot preguntaría un número que ya tiene delante.
    const raras = [{ id: "wa", etiqueta: "A qué número te escribo", tipo: "telefono", obligatoria: true }];
    esperar(loQueYaSabemos(raras, { telefono: "50762171875" })).igual({ wa: "50762171875" });
  });

  test("sin teléfono conocido no se inventa nada", () => {
    esperar(loQueYaSabemos(preguntasEntrega, {})).igual({});
  });

  test("una respuesta vacía a algo obligatorio NO avanza", () => {
    const c = cerrarCarrito(carritoVacio("t1"));
    esperar(contestar(c, preguntasEntrega[0], "   ")).igual(c, "hay que volver a preguntar");
  });

  test("una respuesta buena avanza a la siguiente pregunta", () => {
    const c = cerrarCarrito(carritoVacio("t1"));
    const d = contestar(c, preguntasEntrega[0], "Ana Pérez");
    esperar(d.respuestas.nombre).igual("Ana Pérez");
    esperar(d.pregunta).igual(1);
  });

  test("las filas de una variedad enseñan el recargo y respetan los topes de Meta", () => {
    const filas = filasDeVariedad(grupoUna, [], "$", false);
    esperar(filas.length).igual(2);
    esperar(filas[1].descripcion).igual("+$2.50", "enterarse del recargo al final tumba el pedido");
    esperar(filas[0].descripcion).igual(undefined, "sin recargo no se pinta nada");
    for (const f of filas) esperar(f.titulo.length <= 24).verdadero("Meta corta a 24 y rechaza el mensaje");
  });

  test("«elige varias» siempre trae su salida, y no reofrece lo ya puesto", () => {
    const filas = filasDeVariedad(grupoVarias, ["Queso"], "$", true);
    esperar(filas.some((f) => f.id === "op-listo")).verdadero();
    esperar(filas.some((f) => f.titulo === "Queso")).falso("volver a tocarlo no haría nada");
  });

  test("se distingue una opción de «ya terminé»", () => {
    esperar(opcionElegida("op-listo")).igual({ listo: true, texto: null });
    esperar(opcionElegida("op-Salmón a la plancha")).igual({ listo: false, texto: "Salmón a la plancha" });
    esperar(opcionElegida("cualquier cosa")).igual({ listo: false, texto: null });
  });

  test("cuántas cosas lleva, para poder decírselo", () => {
    let c = carritoVacio("t1");
    c = empezarProducto(c, agua).carrito;
    c = meterAlCarrito(c, 3);
    esperar(cuantasCosas(c)).igual(3);
    esperar(cuantasCosas(carritoVacio("t1"))).igual(0);
  });
});

/* ── CALENDLY ────────────────────────────────────────────────────────────── */

describe("Calendly", () => {
  test("PKCE: el reto es el sha256 del verificador, en base64url y SIN RELLENO", () => {
    // Calendly rechaza el intercambio si el reto trae `+`, `/` o `=`, y el
    // error que devuelve no dice qué pasó. Es de esos fallos que cuestan una
    // tarde entera, así que se fija aquí.
    const v = nuevoVerificador();
    const r = retoDe(v);
    esperar(/^[A-Za-z0-9_-]+$/.test(r)).verdadero("base64url sin relleno o Calendly lo rechaza");
    esperar(r.includes("=")).falso();
    esperar(retoDe("abc")).igual(
      crypto.createHash("sha256").update("abc").digest("base64url"),
      "tiene que ser sha256, no el verificador tal cual",
    );
    esperar(retoDe(v)).igual(retoDe(v), "el mismo verificador da el mismo reto");
    esperar(retoDe(v) === retoDe(nuevoVerificador())).falso("dos verificadores no pueden colisionar");
  });

  test("el enlace de autorización lleva S256, y no manda el secreto al navegador", () => {
    const u = new URL(urlDeAutorizacion({
      clientId: "abc", redirect: "https://x.test/cb", state: "s1", reto: "R",
    }));
    esperar(u.searchParams.get("code_challenge_method")).igual("S256", "Calendly exige PKCE a TODAS las apps");
    esperar(u.searchParams.get("code_challenge")).igual("R");
    esperar(u.searchParams.get("response_type")).igual("code");
    esperar(u.searchParams.get("state")).igual("s1", "sin state, cualquiera engancha SU cuenta a TU organización");
    esperar(u.toString().includes("client_secret")).falso("el secreto NUNCA viaja al navegador");
  });

  test("la ventana de búsqueda no pasa de 31 días", () => {
    // Calendly no recorta: rechaza la consulta entera. Pedir 60 días tiene que
    // devolver 31 de huecos, no cero.
    const dias = (v) => Math.round(
      (Date.parse(v.fin) - Date.parse(v.inicio)) / 86400000,
    );
    esperar(dias(ventanaDeBusqueda(new Date(), 60))).igual(MAX_DIAS);
    esperar(dias(ventanaDeBusqueda(new Date(), 31))).igual(31);
    esperar(dias(ventanaDeBusqueda(new Date(), 7))).igual(7);
    esperar(dias(ventanaDeBusqueda(new Date(), 0))).igual(1, "cero días no puede pedir cero huecos");
    esperar(dias(ventanaDeBusqueda(new Date(), -5))).igual(1);
    // SIN DATO USABLE, UNA SEMANA — y eso es distinto de «me dijeron cero».
    // Escribirlo con `|| 7` mezclaba los dos casos y daba 7 para el cero y 1
    // para el -5: dos caminos para el mismo disparate, con final distinto.
    esperar(dias(ventanaDeBusqueda(new Date(), undefined))).igual(7);
    esperar(dias(ventanaDeBusqueda(new Date(), NaN))).igual(7);
    esperar(dias(ventanaDeBusqueda(new Date(), "hola"))).igual(7);
    esperar(MAX_DIAS).igual(31, "es el tope de Calendly, no una preferencia nuestra");
  });

  test("la ventana nunca empieza en el pasado", () => {
    // Calendly rechaza un `start_time` pasado. Un flujo que pregunta «¿para
    // cuándo?» puede traer una fecha de ayer perfectamente.
    const v = ventanaDeBusqueda(new Date("2020-01-01T00:00:00Z"), 7);
    esperar(Date.parse(v.inicio) > Date.now()).verdadero("pedir desde el pasado rompe la consulta entera");
  });

  test("se distingue «tu plan no llega» de cualquier otro 403", () => {
    // Importa de verdad: con el plan gratis el bloque manda el enlace y la
    // cita se hace igual; con otro 403 hay algo roto que hay que arreglar.
    esperar(necesitaPlanDePago("This feature requires a paid plan")).verdadero();
    esperar(necesitaPlanDePago("Please upgrade your subscription")).verdadero();
    esperar(necesitaPlanDePago("UPGRADE REQUIRED")).verdadero("el texto llega como llegue");
    esperar(necesitaPlanDePago("Invalid event type uri")).falso();
    esperar(necesitaPlanDePago("Forbidden")).falso("un 403 pelado no es un problema de plan");
    esperar(necesitaPlanDePago("")).falso();
  });

  test("la firma de un aviso: solo pasa la de verdad", () => {
    const clave = "s3cr3to";
    const cuerpo = JSON.stringify({ event: "invitee.created" });
    const firmar = (t, c = cuerpo, k = clave) =>
      `t=${t},v1=${crypto.createHmac("sha256", k).update(`${t}.${c}`).digest("hex")}`;
    const ahora = Math.floor(Date.now() / 1000);

    esperar(firmaDeCalendlyValida(cuerpo, firmar(ahora), clave)).verdadero();
    esperar(firmaDeCalendlyValida(cuerpo, firmar(ahora - 60), clave)).verdadero("un minuto de retraso es normal");

    // ── TODO LO DEMÁS SE RECHAZA ─────────────────────────────────────────
    // Cada una de estas, si pasara, deja a cualquiera metiendo citas y
    // contactos falsos en la cuenta de cualquier cliente.
    esperar(firmaDeCalendlyValida(cuerpo, firmar(ahora), "otra")).falso("clave distinta");
    esperar(firmaDeCalendlyValida("{}", firmar(ahora), clave)).falso("el cuerpo cambió por el camino");
    esperar(firmaDeCalendlyValida(cuerpo, firmar(ahora - 400), clave)).falso("fuera de la tolerancia");
    esperar(firmaDeCalendlyValida(cuerpo, firmar(ahora + 400), clave)).falso("y también hacia el futuro");
    esperar(firmaDeCalendlyValida(cuerpo, firmar(ahora), "")).falso("SIN CLAVE SE RECHAZA, no se deja pasar");
    esperar(firmaDeCalendlyValida(cuerpo, null, clave)).falso("sin cabecera se rechaza");
    esperar(firmaDeCalendlyValida(cuerpo, `t=${ahora}`, clave)).falso("falta la firma");
    esperar(firmaDeCalendlyValida(cuerpo, "v1=abc", clave)).falso("falta la marca de tiempo");
    esperar(firmaDeCalendlyValida(cuerpo, `t=nodigits,v1=abc`, clave)).falso("marca de tiempo que no es número");
    esperar(firmaDeCalendlyValida(cuerpo, `t=${ahora},v1=abc`, clave)).falso("firma corta: no puede LANZAR, tiene que devolver false");
    esperar(firmaDeCalendlyValida(cuerpo, "", clave)).falso("cabecera vacía");
  });

  test("el aviso se firma con los BYTES QUE LLEGARON, no con el JSON reserializado", () => {
    // Es el fallo clásico de todo webhook: parsear, volver a serializar y
    // firmar eso. Un espacio de más y no cuadra nunca.
    const clave = "k";
    const crudo = '{"event":"invitee.created",  "payload":{}}';
    const ahora = Math.floor(Date.now() / 1000);
    const cab = `t=${ahora},v1=${crypto.createHmac("sha256", clave).update(`${ahora}.${crudo}`).digest("hex")}`;
    esperar(firmaDeCalendlyValida(crudo, cab, clave)).verdadero();
    esperar(firmaDeCalendlyValida(JSON.stringify(JSON.parse(crudo)), cab, clave)).falso(
      "si esto pasara, el webhook estaría leyendo el cuerpo mal",
    );
  });

  test("la tolerancia de reloj es la que pide Calendly", () => {
    esperar(TOLERANCIA_SEG).igual(180);
  });

  test("nos suscribimos a las altas Y a las cancelaciones", () => {
    // Solo con `invitee.created` la Bandeja se llena de citas que ya no
    // existen, y el equipo se presenta a reuniones canceladas.
    esperar(EVENTOS.includes("invitee.created")).verdadero();
    esperar(EVENTOS.includes("invitee.canceled")).verdadero();
  });

  test("cada clave de firma es distinta y bastante larga", () => {
    const a = nuevaClaveDeFirma();
    esperar(a.length >= 64).verdadero("32 bytes en hexadecimal");
    esperar(a === nuevaClaveDeFirma()).falso("una clave por cliente, no una para todos");
  });
});

describe("Qué agenda usa el chatbot", () => {
  const con = (google, calendly) => ({ google, calendly });

  test("con una sola agenda no se pregunta nada", () => {
    // Sacar el selector con una sola conectada es inventarle al cliente una
    // decisión que no tiene.
    esperar(hayQueElegir(con(true, false))).falso();
    esperar(hayQueElegir(con(false, true))).falso();
    esperar(hayQueElegir(con(false, false))).falso();
    esperar(hayQueElegir(con(true, true))).verdadero();
  });

  test("SIN ELEGIR, NADIE CAMBIA DE AGENDA SOLO", () => {
    // ── ESTA REGLA ERA AL REVÉS Y ROMPIÓ UNA CUENTA DE VERDAD ───────────
    // Un negocio con Google conectado y su bloque «Agendar cita» apuntando a
    // su calendario conectó Calendly para probarlo. En ese instante el bloque
    // cambió de agenda solo, dejó de encontrar horarios y empezó a pasar a la
    // gente con un humano. Ningún error a la vista.
    //
    // Google solo puede estar conectado en una cuenta que YA lo usaba —era la
    // única agenda que existía—, así que «con las dos y sin elegir, manda
    // Google» significa exactamente «nadie cambia sin pedirlo».
    esperar(agendaQueManda(null, con(true, true))).igual("google", "conectar Calendly NO puede mover la agenda del bot");
    esperar(agendaQueManda(null, con(true, false))).igual("google");
    esperar(agendaQueManda(null, con(false, true))).igual("calendly", "si es la única, es la que hay");
    esperar(agendaQueManda(null, con(false, false))).igual("ninguna");
  });

  test("un identificador de Google NUNCA viaja a Calendly como tipo de evento", () => {
    // ── EL FALLO EXACTO QUE ROMPIÓ LA CUENTA ────────────────────────────
    // El bloque guarda UN campo para las dos agendas. Con Calendly ganando,
    // ese campo —«contacto@demandu.tech»— se le mandó a Calendly como tipo de
    // evento. Calendly no da un error entendible: da CERO HORARIOS, que se lee
    // igual que «no hay huecos esta semana». Por eso el bot pasaba a un humano.
    esperar(tipoDeEventoDeCalendly("contacto@demandu.tech")).igual(null);
    esperar(tipoDeEventoDeCalendly("c_7da4ee3f@group.calendar.google.com")).igual(null);
    esperar(tipoDeEventoDeCalendly("primary")).igual(null);
    esperar(tipoDeEventoDeCalendly("")).igual(null);
    esperar(tipoDeEventoDeCalendly(null)).igual(null);
    esperar(tipoDeEventoDeCalendly(undefined)).igual(null);

    // Y el bueno sí pasa.
    const bueno = "https://api.calendly.com/event_types/AAAA-BBBB-1234";
    esperar(tipoDeEventoDeCalendly(bueno)).igual(bueno);
    esperar(tipoDeEventoDeCalendly("  " + bueno + "  ")).igual(bueno, "los espacios no pueden invalidarlo");

    // Nada que se le PAREZCA cuela: es lo que separa una comprobación de un
    // adorno.
    esperar(tipoDeEventoDeCalendly("https://calendly.com/demandu-reuniones")).igual(null, "esa es la página pública, no un tipo de evento");
    esperar(tipoDeEventoDeCalendly("http://api.calendly.com/event_types/x")).igual(null, "sin https no");
    esperar(tipoDeEventoDeCalendly("https://api.calendly.com/users/abc")).igual(null);
    esperar(tipoDeEventoDeCalendly("https://api.calendly.com/event_types/")).igual(null);
    esperar(tipoDeEventoDeCalendly("https://evil.test/api.calendly.com/event_types/x")).igual(null);
  });

  test("lo que eligió el negocio MANDA sobre el automático", () => {
    // Es la razón de existir de todo esto: quien usa Google para lo interno y
    // conecta Calendly para probarlo no puede quedarse sin poder volver.
    esperar(agendaQueManda("google", con(true, true))).igual("google");
    esperar(agendaQueManda("calendly", con(true, true))).igual("calendly");
  });

  test("una preferencia huérfana NO deja al bot sin agendar", () => {
    // Al desconectar se borra la preferencia, así que esto no debería pasar
    // nunca. Pero si pasa —una fila vieja, un arreglo a mano en la base— un
    // bot que deja de agendar del todo es peor para la persona que está
    // escribiendo que un bot que agenda en la única agenda que queda.
    esperar(agendaQueManda("calendly", con(true, false))).igual("google");
    esperar(agendaQueManda("google", con(false, true))).igual("calendly");
    esperar(agendaQueManda("calendly", con(false, false))).igual("ninguna");
    esperar(agendaQueManda("google", con(false, false))).igual("ninguna");
  });

  test("el bloque puede fijar su agenda, y manda sobre la de la cuenta", () => {
    // El caso real: Google para lo interno, Calendly para las demos. Un bloque
    // que agenda demos tiene que poder decir «yo siempre en Calendly» aunque
    // la cuenta esté en Google.
    esperar(agendaDelBloque("calendly", "google", con(true, true))).igual("calendly");
    esperar(agendaDelBloque("google", "calendly", con(true, true))).igual("google");
  });

  test("«la de la cuenta» es el valor de fábrica, y eso mantiene vivo el argumento bueno", () => {
    // La objeción sensata a elegir por bloque era el flujo olvidado: uno de
    // hace seis meses agendando donde ya nadie mira. Con «cuenta» por defecto
    // eso no pasa — un bloque que nadie tocó SIGUE a la cuenta, así que
    // cambiarla en Ajustes mueve todos los bloques que no pidieron otra cosa.
    esperar(agendaDelBloque("cuenta", "calendly", con(true, true))).igual("calendly");
    esperar(agendaDelBloque("cuenta", "google", con(true, true))).igual("google");
    esperar(agendaDelBloque(undefined, "calendly", con(true, true))).igual("calendly");
    esperar(agendaDelBloque(null, null, con(true, true))).igual("google", "sin nada elegido, lo que ya funcionaba");
  });

  test("un bloque NO puede fijar una agenda desconectada", () => {
    // Si pudiera, desconectar Calendly dejaría mudos todos los bloques que lo
    // hubieran fijado — y el dueño no tiene forma de saber cuáles son.
    esperar(agendaDelBloque("calendly", null, con(true, false))).igual("google");
    esperar(agendaDelBloque("google", null, con(false, true))).igual("calendly");
    esperar(agendaDelBloque("calendly", null, con(false, false))).igual("ninguna");
  });

  test("cualquier basura en el bloque se lee como «la de la cuenta»", () => {
    esperar(leerEleccionDelBloque("google")).igual("google");
    esperar(leerEleccionDelBloque("calendly")).igual("calendly");
    esperar(leerEleccionDelBloque("cuenta")).igual("cuenta");
    esperar(leerEleccionDelBloque(undefined)).igual("cuenta", "los bloques de antes no tienen el campo");
    esperar(leerEleccionDelBloque(null)).igual("cuenta");
    esperar(leerEleccionDelBloque("")).igual("cuenta");
    esperar(leerEleccionDelBloque("outlook")).igual("cuenta");
    esperar(leerEleccionDelBloque(7)).igual("cuenta");
  });

  test("cualquier basura guardada se lee como «que decida la plataforma»", () => {
    esperar(leerPreferida("google")).igual("google");
    esperar(leerPreferida("calendly")).igual("calendly");
    esperar(leerPreferida(null)).igual(null);
    esperar(leerPreferida("")).igual(null);
    esperar(leerPreferida("outlook")).igual(null);
    esperar(leerPreferida("GOOGLE")).igual(null, "sin normalizar: la base solo guarda minúsculas");
    esperar(leerPreferida(42)).igual(null);
    esperar(leerPreferida({})).igual(null);
    esperar(leerPreferida(undefined)).igual(null);
  });
});

describe("Agentes de IA", () => {
  // Los valores por defecto viven en el código, igual que en el motor.
  const PORDEFECTO = { enabled: true, persona: "Soy Lana", style: "Cercano", fallback: "No sé", maxWords: 80 };

  test("LO QUE NO SE PUSO NO SE MANDA, o el bot contesta VACÍO", () => {
    // ─────────────────────────────────────────────────────────────────────
    // El fallo que esto impide es de los que no lanzan y no avisan.
    //
    // Todo el motor hace `{ ...AI_DEFAULTS, ...ajustes }`, y en JavaScript una
    // clave PRESENTE con valor `undefined` PISA IGUAL que una con valor:
    //
    //     { ...{ a: 1 }, ...{ a: undefined } }   →   { a: undefined }
    //
    // Copiar el agente entero —con sus nulos— borraría los valores por
    // defecto: el bot se quedaría sin personalidad, sin tono y sin mensaje de
    // respaldo, y contestaría con cadenas vacías a clientes de verdad.
    // ─────────────────────────────────────────────────────────────────────
    const vacio = comoAjustes({ id: "a1", nombre: "Lana", prompt: null, tono: null, respaldo: null });

    esperar(Object.keys(vacio).length).igual(0, "un agente sin nada puesto no manda ni una clave");
    esperar("persona" in vacio).falso("la clave NI SIQUIERA PUEDE EXISTIR: presente con undefined pisa igual");
    esperar("fallback" in vacio).falso();

    // Y la prueba de verdad: mezclado con los valores por defecto, los conserva.
    const final = { ...PORDEFECTO, ...vacio };
    esperar(final.persona).igual("Soy Lana", "un agente vacío no puede borrar la personalidad por defecto");
    esperar(final.fallback).igual("No sé");
    esperar(final.enabled).igual(true);
  });

  test("lo que SÍ se puso viaja, con los nombres que entiende el motor", () => {
    const a = comoAjustes({
      ia_encendida: false, prompt: "Eres Ana", tono: "Formal", respaldo: "Ahora no",
      max_palabras: 40, herramientas: ["agendar_cita"], criterios: "etiqueta si pregunta precio",
      sistema_url: "https://x.test", sistema_descripcion: "mi ERP", ia_de_respaldo: false,
    });
    esperar(a).igual({
      enabled: false, fallback_flujo: false, persona: "Eres Ana", style: "Formal",
      fallback: "Ahora no", criterios: "etiqueta si pregunta precio",
      sistemaUrl: "https://x.test", sistemaDescripcion: "mi ERP",
      maxWords: 40, herramientas: ["agendar_cita"],
    });
  });

  test("un `false` no es «no lo puso»", () => {
    // Apagar la IA es una decisión, y `if (a.ia_encendida)` la habría tirado a
    // la basura: el bot seguiría contestando con IA después de apagarla.
    esperar(comoAjustes({ ia_encendida: false }).enabled).igual(false);
    esperar(comoAjustes({ ia_de_respaldo: false }).fallback_flujo).igual(false);
    // Y un texto vacío tampoco: el negocio puede querer un respaldo en blanco.
    esperar("fallback" in comoAjustes({ respaldo: "" })).verdadero();
    esperar(comoAjustes({ respaldo: "" }).fallback).igual("");
  });

  test("un tope de palabras que no es número dejaría al bot mudo", () => {
    // `maxWords` recorta la respuesta. Un cero o un texto la recortan a NADA, y
    // el cliente ve llegar un mensaje en blanco.
    esperar("maxWords" in comoAjustes({ max_palabras: 0 })).falso();
    esperar("maxWords" in comoAjustes({ max_palabras: -5 })).falso();
    esperar("maxWords" in comoAjustes({ max_palabras: "hola" })).falso();
    esperar(comoAjustes({ max_palabras: "40" }).maxWords).igual(40, "la base puede devolverlo como texto");
    esperar(comoAjustes({ max_palabras: 40 }).maxWords).igual(40);
  });

  test("sin agente se usa la configuración de siempre: NUNCA se queda mudo", () => {
    // Esta caída es lo que permite publicar todo esto sin jugarse los chatbots
    // que están vendiendo hoy. Si el agente falta —se borró, el arrastre no lo
    // alcanzó, alguien tocó la base— el bot sigue igual que ayer.
    const deSiempre = { persona: "La de toda la vida", herramientas: ["etiquetar"] };
    esperar(ajustesQueMandan(null, deSiempre)).igual(deSiempre);
    esperar(ajustesQueMandan(undefined, deSiempre)).igual(deSiempre);
    esperar(ajustesQueMandan(null, null)).igual({});
    esperar(ajustesQueMandan(null, "basura")).igual({});

    // Y con agente, MANDA EL AGENTE — si no, cambiar la personalidad no serviría.
    esperar(ajustesQueMandan({ prompt: "La nueva" }, deSiempre)).igual({ persona: "La nueva" });
  });

  test("la tienda elegida se lee, y la basura no", () => {
    esperar(tiendaQueManda({ tienda_id: "t-1" })).igual("t-1");
    esperar(tiendaQueManda({ tienda_id: null })).igual(null);
    esperar(tiendaQueManda({ tienda_id: "   " })).igual(null);
    esperar(tiendaQueManda(null)).igual(null);
    esperar(tiendaQueManda({})).igual(null);
  });
});

describe("Con qué tienda trabaja el bot", () => {
  const t = (id, nombre, activa = true) => ({ id, slug: id, nombre, activa });
  const dos = [t("t-z", "Zapatería"), t("t-b", "Boutique")];

  test("sin elegir, la primera por nombre — como siempre", () => {
    esperar(tiendaDelBot(dos)?.id).igual("t-b", "Boutique va antes que Zapatería");
    esperar(tiendaDelBot([])).igual(null);
    esperar(tiendaDelBot(null)).igual(null);
  });

  test("LA ELEGIDA MANDA sobre el alfabeto", () => {
    // El fallo que arregla: un negocio con «Boutique» y «Zapatería» servía
    // SIEMPRE el catálogo de Boutique, y el síntoma —el bot enseña productos
    // que no son— no se parece en nada a la causa.
    esperar(tiendaDelBot(dos, true, "t-z")?.id).igual("t-z");
    esperar(tiendaDelBot(dos, true, "t-b")?.id).igual("t-b");
  });

  test("una elección que ya no vale NO deja al bot sin tienda", () => {
    // Eligió una tienda y luego la apagó, o la borró. Quedarse sin tienda por
    // una elección vieja es peor que servir la otra — y en la pantalla se ve
    // cuál está apagada.
    esperar(tiendaDelBot(dos, true, "t-que-no-existe")?.id).igual("t-b");
    esperar(tiendaDelBot([t("t-z", "Zapatería"), t("t-b", "Boutique", false)], true, "t-b")?.id)
      .igual("t-z", "eligió la apagada: se sirve la que sí está viva");
    esperar(tiendaDelBot(dos, true, "")?.id).igual("t-b");
    esperar(tiendaDelBot(dos, true, null)?.id).igual("t-b");
  });

  test("una tienda apagada no se anuncia aunque sea la única", () => {
    esperar(tiendaDelBot([t("t-b", "Boutique", false)])).igual(null);
    esperar(tiendaDelBot([t("t-b", "Boutique", false)], false)?.id).igual("t-b", "salvo que se pidan todas");
  });
});

describe("Un marcador de herramienta nunca llega al cliente", () => {
  test("se quita lo que el modelo escribió en vez de ejecutar", () => {
    // ── PASÓ DE VERDAD, EN UNA DEMO ────────────────────────────────────────
    // A esa ruta no se le armaban las herramientas, así que la IA escribió las
    // llamadas como texto y se las mandó al prospecto.
    esperar(sinMarcadores("/guardar_dato nombre: Alex Molina\n/guardar_dato correo: a@b.com\n\nPerfecto, Alex."))
      .igual("Perfecto, Alex.");
    esperar(sinMarcadores("Voy a reservarte mañana a las 9.\n/agendar_cita hora: 9:00 AM fecha: mañana"))
      .igual("Voy a reservarte mañana a las 9.");
    esperar(sinMarcadores("/pasar_a_humano")).igual("");
  });

  test("NO se toca nada que no sea un marcador de verdad", () => {
    // La barra aparece en fechas, en enlaces y en horarios. Limpiar de más
    // dejaría mensajes mutilados, que es peor que el problema original.
    esperar(sinMarcadores("Te espero el 12/09 a las 9.")).igual("Te espero el 12/09 a las 9.");
    esperar(sinMarcadores("Mira https://demandu.tech/etiquetar aquí"))
      .igual("Mira https://demandu.tech/etiquetar aquí");
    esperar(sinMarcadores("Abrimos 9/5 y cerramos 6/8.")).igual("Abrimos 9/5 y cerramos 6/8.");
    // Una barra con una palabra que NO está en el catálogo tampoco se toca.
    esperar(sinMarcadores("Escribe /ayuda para el menú")).igual("Escribe /ayuda para el menú");
  });

  test("lo que queda se puede leer", () => {
    // Quitar la línea no puede dejar el mensaje empezando en blanco ni con un
    // agujero de tres saltos: eso se ve roto en el chat.
    esperar(sinMarcadores("\n\n/etiquetar lead-alto\n\n\nHola")).igual("Hola");
    esperar(sinMarcadores("Hola\n/etiquetar x\nAdiós")).igual("Hola\n\nAdiós");
    esperar(sinMarcadores("")).igual("");
    esperar(sinMarcadores(null)).igual("");
    esperar(sinMarcadores("   ")).igual("");
  });

  test("todas las acciones del catálogo se limpian, no una lista a mano", () => {
    // Una herramienta nueva tiene que quedar cubierta sola. Con una lista
    // escrita aparte, la próxima acción se le escaparía a esto en silencio.
    for (const clave of CLAVES_DE_ACCION) {
      esperar(sinMarcadores(`Texto antes.\n/${clave} lo que sea`)).igual("Texto antes.");
    }
  });
});


/* ════════════════════════════════════════════════════════════════════════════
 * EL BLOQUE «AGENDAR CITA»
 *
 * Cada prueba de aquí abajo sale de una conversación real de WhatsApp del 5 de
 * septiembre. El cliente eligió agendar una demo y recibió esto:
 *
 *   bot     → «Revisa los horarios disponibles» [09:00] [09:30] [10:00]
 *   cliente → «necesito que sea en la tarde»
 *   bot     → «Falta la fecha y hora de la cita.»
 *
 * La cita acabó creándose sin invitado, porque el bloque tenía configurado de
 * dónde sacar el correo y nadie lo preguntaba nunca.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Atajo para escribir huecos: («lun», 9, 30) → un horario de las 9:30 del lunes. */
const hueco = (dia, h, m = 0) => ({ dia, minutos: h * 60 + m, id: `${dia} ${h}:${String(m).padStart(2, "0")}` });

describe("Los horarios que se ofrecen se reparten, no son los primeros", () => {
  test("EL FALLO EXACTO: tres medias horas seguidas de la misma mañana", () => {
    // Esto es lo que se ofreció de verdad. Con el reparto, tres huecos de una
    // agenda vacía ya no pueden salir los tres antes de las once.
    const agendaVacia = [];
    for (const dia of ["lun", "mar", "mie"]) {
      for (let h = 9; h < 18; h++) { agendaVacia.push(hueco(dia, h, 0)); agendaVacia.push(hueco(dia, h, 30)); }
    }

    const tres = repartirHorarios(agendaVacia, 3);
    esperar(tres.length).igual(3);
    esperar(tres.every((x) => x.dia === "lun" && x.minutos < CORTE_DE_TURNO)).igual(false);
  });

  test("con diez se cubren varios días Y las dos mitades del día", () => {
    const agendaVacia = [];
    for (const dia of ["lun", "mar", "mie", "jue", "vie"]) {
      for (let h = 9; h < 18; h++) { agendaVacia.push(hueco(dia, h, 0)); agendaVacia.push(hueco(dia, h, 30)); }
    }

    const diez = repartirHorarios(agendaVacia, 10);
    esperar(diez.length).igual(10);
    esperar(new Set(diez.map((x) => x.dia)).size).igual(5);
    esperar(diez.some((x) => x.minutos < CORTE_DE_TURNO)).igual(true);
    esperar(diez.some((x) => x.minutos >= CORTE_DE_TURNO)).igual(true);
  });

  test("salen en orden cronológico, no en el del reparto", () => {
    // La lista se lee de la hora más próxima a la más lejana. El reparto elige
    // saltando entre mañana y tarde; si se enseñara en ESE orden, la tarde del
    // lunes saldría antes que su mañana.
    //
    // Se piden MENOS de los que hay a propósito: con todos cabiendo, la
    // función devuelve la lista entera y el orden no se llega a probar.
    const agenda = [
      hueco("lun", 9), hueco("lun", 10), hueco("lun", 15), hueco("lun", 16),
      hueco("mar", 9), hueco("mar", 10), hueco("mar", 15), hueco("mar", 16),
    ];
    const r = repartirHorarios(agenda, 4);
    esperar(r.map((x) => x.id).join(" · ")).igual("lun 9:00 · lun 15:00 · mar 9:00 · mar 15:00");
  });

  test("el orden del día es el de aparición, no el alfabético", () => {
    // «2026-9-7» y «2026-10-1» ordenados como texto pondrían octubre primero,
    // o sea el bot ofreciendo el mes que viene antes que pasado mañana.
    // El cambio de mes es donde se ve. Se meten tres huecos por turno para que
    // sobren y la función tenga que repartir de verdad.
    const agenda = [];
    for (const dia of ["2026-9-30", "2026-10-1"]) {
      for (const minutos of [540, 600, 660, 900, 960, 1020]) agenda.push({ dia, minutos });
    }
    const r = repartirHorarios(agenda, 4);
    esperar(r[0].dia).igual("2026-9-30");
    esperar(r[r.length - 1].dia).igual("2026-10-1");
    esperar(r.map((x) => `${x.dia} ${x.minutos}`).join(" · "))
      .igual("2026-9-30 540 · 2026-9-30 900 · 2026-10-1 540 · 2026-10-1 900");
  });

  test("una agenda casi llena devuelve lo poco que haya, sin colgarse", () => {
    esperar(repartirHorarios([hueco("lun", 9)], 10).length).igual(1);
    esperar(repartirHorarios([], 10).length).igual(0);
    esperar(repartirHorarios([hueco("lun", 9)], 0).length).igual(0);
    // Un solo turno con menos huecos que los pedidos: el bucle tiene que
    // terminar aunque ningún cubo pueda dar más.
    const pocos = [hueco("lun", 9), hueco("lun", 10), hueco("lun", 11)];
    esperar(repartirHorarios(pocos, 3).length).igual(3);
  });

  test("las 12:00 son tarde, no mañana", () => {
    esperar(CORTE_DE_TURNO).igual(720);
    const agenda = [hueco("lun", 11, 30), hueco("lun", 12, 0), hueco("lun", 11, 0)];
    const dos = repartirHorarios(agenda, 2);
    esperar(dos.some((x) => x.minutos === 720)).igual(true);
  });
});

describe("Lo que escribe la persona cuando se le piden horas", () => {
  test("EL FALLO EXACTO: «necesito que sea en la tarde» no es una fecha", () => {
    esperar(esHorarioElegido("necesito que sea en la tarde")).igual(null);
    esperar(esHorarioElegido("lun 07 de sep, 10:00")).igual(null); // la etiqueta tampoco
    esperar(esHorarioElegido("mañana")).igual(null);
    esperar(esHorarioElegido("")).igual(null);
    esperar(esHorarioElegido(null)).igual(null);
  });

  test("el identificador de la opción sí lo es", () => {
    esperar(esHorarioElegido("2026-09-07T16:00:00.000Z")).igual("2026-09-07T16:00:00.000Z");
    esperar(esHorarioElegido("  2026-09-07T16:00:00.000Z  ")).igual("2026-09-07T16:00:00.000Z");
  });

  test("UNA FECHA ESCRITA A MANO TAMPOCO VALE, aunque el calendario la entienda", () => {
    // Es lo que hace mucha gente: en vez de tocar la opción, teclean la fecha.
    // Sin comprobar la FORMA, «9/7/2026» se aceptaría como hora elegida y la
    // cita se crearía a las doce de la noche. Y «10» a secas también entra:
    // el calendario lo lee como el año 2001.
    esperar(esHorarioElegido("9/7/2026")).igual(null);
    esperar(esHorarioElegido("7 sep 2026")).igual(null);
    esperar(esHorarioElegido("10")).igual(null);
    esperar(esHorarioElegido("2026")).igual(null);
  });

  test("una fecha con la forma correcta pero imposible se rechaza", () => {
    // Sin la comprobación del calendario, esto llegaría al calendario como
    // «Invalid Date» y volvería convertido en un error interno.
    esperar(esHorarioElegido("2026-13-45T99:99:00.000Z")).igual(null);
  });
});

describe("El correo del invitado", () => {
  test("lo que evidentemente no es un correo no entra en la cita", () => {
    esperar(correoValido("Alex Molina")).igual(null);
    esperar(correoValido("no tengo")).igual(null);
    esperar(correoValido("alex@")).igual(null);
    esperar(correoValido("@demandu.tech")).igual(null);
    esperar(correoValido("alex@demandu")).igual(null);   // sin punto
    esperar(correoValido("a b@c.com")).igual(null);      // con espacio
    esperar(correoValido("")).igual(null);
  });

  test("los correos raros pero legítimos SÍ entran", () => {
    // Rechazar uno de estos es perder una invitación por presumir de validador.
    esperar(correoValido("Alex+Demo@Demandu.Tech")).igual("alex+demo@demandu.tech");
    esperar(correoValido("a@b.co")).igual("a@b.co");
    esperar(correoValido("nombre.apellido@sub.dominio.com.pa")).igual("nombre.apellido@sub.dominio.com.pa");
  });

  test("cuando dice que no, se respeta", () => {
    for (const t of ["no", "No", "NO", "no gracias", "paso", "omitir", "no tengo", "mejor no", "despues", "después"]) {
      esperar(quiereOmitir(t)).igual(true);
    }
  });

  test("un correo NO es un «no», ni una frase larga", () => {
    // Si esto se confundiera, se tiraría el correo que la persona acaba de dar.
    esperar(quiereOmitir("alex@demandu.tech")).igual(false);
    esperar(quiereOmitir("no, mejor te lo doy: alex@demandu.tech")).igual(false);
    esperar(quiereOmitir("")).igual(false);
    esperar(quiereOmitir(null)).igual(false);
  });
});

describe("Qué error se le enseña a la persona y cuál no", () => {
  test("EL FALLO EXACTO: «Falta la fecha y hora de la cita.» nunca sale", () => {
    // Ese texto llegó al chat de un cliente. Describe un estado interno: ni lo
    // provocó, ni lo puede arreglar, ni significa nada para él.
    const interno = { error: "Falta la fecha y hora de la cita.", motivo: "sin_datos" };
    esperar(mensajeParaElCliente(interno).includes("Falta la fecha")).igual(false);
  });

  test("lo accionable SÍ sale tal cual", () => {
    const ocupado = {
      error: "Ese horario acaba de ocuparse. Elige otro, por favor.",
      motivo: "sin_datos", paraElCliente: true,
    };
    esperar(mensajeParaElCliente(ocupado)).igual("Ese horario acaba de ocuparse. Elige otro, por favor.");
  });

  test("SE DECIDE POR LA MARCA, NO POR EL MOTIVO", () => {
    // Los dos casos de arriba comparten `motivo: "sin_datos"` y son opuestos.
    // Si esto se decidiera por el motivo, uno de los dos saldría mal a la
    // fuerza — y fue el primer intento de arreglarlo.
    const a = { error: "Falta la fecha y hora de la cita.", motivo: "sin_datos" };
    const b = { error: "Ese horario acaba de ocuparse.", motivo: "sin_datos", paraElCliente: true };
    esperar(mensajeParaElCliente(a) === mensajeParaElCliente(b)).igual(false);
  });

  test("un fallo nuevo empieza siendo interno", () => {
    // El lado seguro. Quien añada un motivo tiene que marcarlo a propósito.
    esperar(mensajeParaElCliente({ error: "quota exceeded 429", motivo: "inventado" }).includes("429")).igual(false);
    esperar(mensajeParaElCliente(null).length > 0).igual(true);
    esperar(mensajeParaElCliente({ paraElCliente: true, error: "" }).length > 0).igual(true);
  });
});


describe("El formulario nativo de WhatsApp, con horarios de verdad", () => {
  const slots = [
    { startISO: "2026-09-07T15:00:00.000Z", label: "lun 07 de sep, 09:00" },
    { startISO: "2026-09-07T20:00:00.000Z", label: "lun 07 de sep, 14:00" },
    { startISO: "2026-09-08T15:00:00.000Z", label: "mar 08 de sep, 09:00" },
  ];

  test("los huecos salen como las opciones que Meta espera", () => {
    const o = opcionesDeHorario(slots);
    esperar(o.length).igual(3);
    esperar(o[0].id).igual("2026-09-07T15:00:00.000Z");
    esperar(o[0].title).igual("lun 07 de sep, 09:00");
  });

  test("una opción a medias NO se ofrece", () => {
    // Meta acepta una opción sin título y sale en blanco en el móvil; una sin
    // id se puede elegir y después no se puede agendar. Las dos fallan al
    // final, cuando la persona ya eligió.
    const o = opcionesDeHorario([
      { startISO: "", label: "lun 07 de sep, 09:00" },
      { startISO: "2026-09-07T15:00:00.000Z", label: "" },
      ...slots,
    ]);
    esperar(o.length).igual(3);
  });

  test("el título se corta donde Meta lo corta", () => {
    esperar(TITULO_MAX).igual(30);
    const largo = opcionesDeHorario([{ startISO: "2026-09-07T15:00:00.000Z", label: "x".repeat(90) }]);
    esperar(largo[0].title.length).igual(30);
  });

  test("no se mandan más de las que caben", () => {
    const muchos = [];
    for (let i = 0; i < 40; i++) {
      muchos.push({ startISO: `2026-09-07T1${i % 10}:00:00.000Z`, label: `opción ${i}` });
    }
    esperar(opcionesDeHorario(muchos).length).igual(10);
    esperar(opcionesDeHorario(muchos, 3).length).igual(3);
    esperar(opcionesDeHorario(null).length).igual(0);
  });

  test("LA HORA SE ENCUENTRA POR SU FORMA, no por el nombre del campo", () => {
    // Quien arma el formulario en el editor visual de Meta acaba con nombres
    // como `screen_0_Dropdown_0` y NO lo sabe: el editor no se los enseña.
    // Montar esto sobre «escribe el nombre exacto del campo» es una llamada de
    // soporte por cliente.
    const deMeta = {
      flow_token: "conv:nodo",
      screen_0_TextInput_0: "Alejandro",
      screen_0_TextInput_1: "alex@demandu.tech",
      screen_0_Dropdown_2: "2026-09-07T20:00:00.000Z",
    };
    esperar(horaDelFormulario(deMeta)).igual("2026-09-07T20:00:00.000Z");
    esperar(correoDelFormulario(deMeta)).igual("alex@demandu.tech");
  });

  test("el campo configurado MANDA sobre la búsqueda", () => {
    // EL CAMPO CONFIGURADO VA EL SEGUNDO A PROPÓSITO. Si fuera el primero, la
    // búsqueda por forma daría el mismo resultado y esta prueba no distinguiría
    // entre hacer caso al campo y no mirarlo siquiera.
    const dos = {
      fecha_de_nacimiento: "2026-09-07T15:00:00.000Z",
      horario: "2026-09-08T15:00:00.000Z",
    };
    esperar(horaDelFormulario(dos, "horario")).igual("2026-09-08T15:00:00.000Z");
    // Y sin decirle cuál, gana el primero que encuentra. Por eso existe el
    // campo: para el formulario que trae dos fechas.
    esperar(horaDelFormulario(dos)).igual("2026-09-07T15:00:00.000Z");
  });

  test("un campo mal escrito NO deja la cita sin invitación", () => {
    // Se sigue buscando por forma. Que alguien se equivoque al teclear el
    // nombre del campo no puede costar el correo de invitación en silencio.
    const r = { correo_del_cliente: "alex@demandu.tech", nombre: "Alejandro" };
    esperar(correoDelFormulario(r, "email")).igual("alex@demandu.tech");
    esperar(correoDelFormulario(r, "nombre")).igual("alex@demandu.tech");
  });

  test("nuestro propio flow_token no se mira", () => {
    // Lleva dentro la conversación y el bloque. Buscar ahí sería encontrar
    // nuestros datos y agendar con ellos.
    esperar(horaDelFormulario({ flow_token: "2026-09-07T15:00:00.000Z:nodo" })).igual(null);
    esperar(correoDelFormulario({ flow_token: "a@b.co:nodo" })).igual(null);
  });

  test("sin nada que encontrar, se dice que no hay", () => {
    esperar(horaDelFormulario({ nombre: "Alejandro" })).igual(null);
    esperar(correoDelFormulario({ nombre: "Alejandro" })).igual(null);
    esperar(horaDelFormulario(null)).igual(null);
    esperar(correoDelFormulario(undefined)).igual(null);
  });

  test("EL NOMBRE SÍ NECESITA QUE LE DIGAN CUÁL ES", () => {
    // Un nombre no tiene forma: «Alejandro», «Restaurante El Puerto» y «me urge
    // para hoy» son todos texto suelto. Adivinar sería mandarle a Google una
    // cita a nombre de un comentario.
    esperar(nombreDelFormulario({ quien: "Alejandro", nota: "me urge" }, "quien")).igual("Alejandro");
    esperar(nombreDelFormulario({ quien: "Alejandro", nota: "me urge" })).igual("");
    esperar(nombreDelFormulario({ quien: "Alejandro" }, "no_existe")).igual("");
    // Vacío significa «usa el del perfil de WhatsApp», que casi siempre es el
    // bueno. Nunca significa «invéntate uno».
    esperar(nombreDelFormulario({ quien: "   " }, "quien")).igual("");
  });

  test("un nombre kilométrico no rompe el evento de Google", () => {
    esperar(nombreDelFormulario({ q: "a".repeat(500) }, "q").length).igual(80);
  });
});


/* ════════════════════════════════════════════════════════════════════════════
 * CONECTAR ES ENCENDER
 *
 * La persona para la que está hecha esta plataforma tiene una clínica, no una
 * empresa de software. Conecta su Google Calendar porque se lo pide la pantalla
 * de citas, y hasta hoy su asistente seguía sin poder agendar por una casilla
 * en OTRA pantalla que nadie le dijo que existía.
 *
 * Desde su lado eso no es un fallo que reportar. Es «la IA no sirve para eso».
 * ══════════════════════════════════════════════════════════════════════════ */

describe("Las herramientas de la IA se encienden con lo que hay conectado", () => {
  test("con agenda conectada, la IA ya sabe agendar", () => {
    const a = herramientasAutomaticas({ agenda: true });
    esperar(a.includes("ver_horarios")).igual(true);
    esperar(a.includes("agendar_cita")).igual(true);
    esperar(a.includes("reagendar_cita")).igual(true);
    esperar(a.includes("cancelar_cita")).igual(true);
    // Y NADA de la tienda: quien conecta su agenda no ha abierto una tienda.
    esperar(a.includes("ver_catalogo")).igual(false);
  });

  test("con tienda encendida, la IA ya sabe vender", () => {
    const a = herramientasAutomaticas({ tienda: true });
    esperar(a.includes("ver_catalogo")).igual(true);
    esperar(a.includes("enlace_de_tienda")).igual(true);
    esperar(a.includes("estado_de_pedido")).igual(true);
    esperar(a.includes("agendar_cita")).igual(false);
  });

  test("sin nada conectado, no se enciende nada", () => {
    // Una IA con `agendar_cita` y sin agenda es una IA que promete citas que
    // no puede crear. Peor que no tenerla.
    esperar(herramientasAutomaticas({}).length).igual(0);
    esperar(herramientasAutomaticas(null).length).igual(0);
    esperar(herramientasAutomaticas({ agenda: false, tienda: false }).length).igual(0);
  });

  test("NUNCA se enciende agendar sin poder ver horarios antes", () => {
    // Sin `ver_horarios` el modelo se inventa la disponibilidad. Es el orden de
    // la lista y por eso la lista importa.
    esperar(POR_LA_AGENDA[0]).igual("ver_horarios");
    esperar(POR_LA_AGENDA.includes("agendar_cita")).igual(true);
    for (const h of POR_LA_AGENDA) esperar(requisitoDe(h)).igual("agenda");
    for (const h of POR_LA_TIENDA) esperar(requisitoDe(h)).igual("tienda");
  });

  test("lo que no depende de nada sigue siendo una casilla", () => {
    // Etiquetar, pasar con una persona, guardar un dato: no hace falta conectar
    // nada, así que no hay nada que encender solo.
    esperar(requisitoDe("etiquetar")).igual(null);
    esperar(requisitoDe("pasar_a_humano")).igual(null);
    esperar(requisitoDe("guardar_dato")).igual(null);
    esperar(requisitoDe("consultar_sistema")).igual(null);
  });
});

describe("Apagar una herramienta que se encendió sola", () => {
  test("se puede decir que no", () => {
    // Hay negocios que conectan su agenda solo para lo interno.
    const r = herramientasQueManda({
      automaticas: [...POR_LA_AGENDA],
      apagadas: ["agendar_cita", "cancelar_cita"],
    });
    esperar(r.includes("agendar_cita")).igual(false);
    esperar(r.includes("cancelar_cita")).igual(false);
    esperar(r.includes("ver_horarios")).igual(true);
  });

  test("UN «SÍ» EXPLÍCITO GANA A UN «NO» QUE SE PUSO SOLO", () => {
    // Si apagar pudiera anular una casilla marcada, el negocio la marcaría, la
    // vería marcada, y la herramienta no estaría — sin nada en pantalla que
    // explique por qué.
    esperar(herramientasQueManda({
      automaticas: ["agendar_cita"], marcadas: ["agendar_cita"], apagadas: ["agendar_cita"],
    })).igual(["agendar_cita"]);

    // Lo mismo escribiéndola en el prompt.
    esperar(herramientasQueManda({
      automaticas: ["agendar_cita"], escritas: ["agendar_cita"], apagadas: ["agendar_cita"],
    })).igual(["agendar_cita"]);
  });

  test("las tres fuentes se juntan y no se repiten", () => {
    const r = herramientasQueManda({
      automaticas: ["ver_horarios", "agendar_cita"],
      marcadas: ["etiquetar", "ver_horarios"],
      escritas: ["pasar_a_humano", "etiquetar"],
    });
    esperar(r.length).igual(4);
    esperar(new Set(r).size).igual(4);
  });

  test("sin fuentes, lista vacía y sin reventar", () => {
    esperar(herramientasQueManda(null).length).igual(0);
    esperar(herramientasQueManda({}).length).igual(0);
    esperar(herramientasQueManda({ marcadas: null, apagadas: undefined }).length).igual(0);
  });
});

describe("La pantalla puede explicar POR QUÉ está encendida", () => {
  test("cada casilla sabe de dónde sale", () => {
    // Sin esto el usuario ve casillas marcadas que él no marcó y no entiende
    // nada. «Encendida porque conectaste tu Google Calendar» es la mitad de que
    // esto se sienta bien.
    const f = {
      automaticas: ["ver_horarios", "agendar_cita"],
      marcadas: ["etiquetar"],
      escritas: ["pasar_a_humano"],
      apagadas: ["agendar_cita"],
    };
    esperar(deDondeSale("ver_horarios", f)).igual("automatica");
    esperar(deDondeSale("agendar_cita", f)).igual("apagada");
    esperar(deDondeSale("etiquetar", f)).igual("marcada");
    esperar(deDondeSale("pasar_a_humano", f)).igual("del_prompt");
    esperar(deDondeSale("consultar_sistema", f)).igual("no");
  });
});

describe("Guardar la pantalla no puede dejar una casilla marcada y apagada", () => {
  test("VOLVER A ENCENDER LA QUITA DE LAS APAGADAS", () => {
    // El caso que importa. Si al marcarla no se quita de las apagadas, el
    // negocio la marca, guarda, y sigue apagada. Lo vería como «esta pantalla
    // no guarda», no como «hay dos listas».
    const r = apagadasDespuesDeGuardar(["agendar_cita"], [...POR_LA_AGENDA], [...POR_LA_AGENDA]);
    esperar(r.length).igual(0);
  });

  test("desmarcar una automática la apaga", () => {
    const r = apagadasDespuesDeGuardar([], [...POR_LA_AGENDA], ["ver_horarios"]);
    esperar(r.includes("agendar_cita")).igual(true);
    esperar(r.includes("reagendar_cita")).igual(true);
    esperar(r.includes("cancelar_cita")).igual(true);
    esperar(r.includes("ver_horarios")).igual(false);
  });

  test("una decisión vieja sobrevive a desconectar y volver a conectar", () => {
    // Apagó las de la tienda, cerró la tienda un mes, y la vuelve a abrir. Su
    // «no» sigue ahí: no se le reactiva nada por haberse ido y vuelto.
    const r = apagadasDespuesDeGuardar(["ver_catalogo"], [...POR_LA_AGENDA], [...POR_LA_AGENDA]);
    esperar(r).igual(["ver_catalogo"]);
  });

  test("no se apunta dos veces la misma", () => {
    const r = apagadasDespuesDeGuardar(["agendar_cita"], ["agendar_cita"], []);
    esperar(r).igual(["agendar_cita"]);
  });
});


/* ════════════════════════════════════════════════════════════════════════════
 * INSTAGRAM: QUÉ FLUJO CONTESTA A QUÉ
 *
 * La plataforma YA guardaba de dónde escucha cada flujo —`origen`,
 * `publicacion`, `respuesta_publica`, `una_por_persona`, desde la 0033— y el
 * webhook no leía ninguno de los cuatro. El negocio elegía «comentario en un
 * reel», lo veía guardado, y su flujo se activaba igual desde un DM.
 * ══════════════════════════════════════════════════════════════════════════ */

describe("De qué superficie de Instagram viene esto", () => {
  test("las cinco superficies se reconocen", () => {
    esperar(superficieDe({ tipo: "dm" })).igual("dm");
    esperar(superficieDe({ tipo: "comentario", tipoDeMedia: "FEED" })).igual("post");
    esperar(superficieDe({ tipo: "comentario", tipoDeMedia: "REELS" })).igual("reel");
    esperar(superficieDe({ tipo: "comentario_vivo" })).igual("live");
    esperar(superficieDe({ tipo: "respuesta_historia" })).igual("story_reply");
    esperar(superficieDe({ tipo: "mencion_historia" })).igual("story_mention");
  });

  test("UN ANUNCIO ES UNA PUBLICACIÓN", () => {
    // El negocio no piensa «esto es un AD», piensa «comentaron mi post».
    // Tratarlo aparte le obligaría a configurar dos veces lo mismo para que su
    // publicidad conteste igual que lo orgánico.
    esperar(superficieDe({ tipo: "comentario", tipoDeMedia: "AD" })).igual("post");
    esperar(superficieDe({ tipo: "comentario", tipoDeMedia: "" })).igual("post");
    esperar(superficieDe({ tipo: "comentario" })).igual("post");
  });

  test("lo que no se reconoce no inventa una superficie", () => {
    // Devolver «post» por defecto haría que un evento nuevo de Meta contestara
    // con el flujo de las publicaciones, que es lo último que uno querría.
    esperar(superficieDe({ tipo: "algo_nuevo_de_meta" })).igual(null);
    esperar(superficieDe({})).igual(null);
    esperar(superficieDe(null)).igual(null);
  });

  test("el catálogo y la regla hablan el MISMO idioma", () => {
    // Si `superficieDe` devolviera «historia» y el catálogo guardara
    // «story_reply», ninguna regla encajaría nunca y no habría nada que ver:
    // el bot simplemente no contestaría.
    const delCatalogo = new Set(ORIGENES.map((o) => o.valor));
    for (const s of ["dm", "post", "reel", "live", "story_reply", "story_mention"]) {
      esperar(delCatalogo.has(s)).igual(true);
    }
    // Y las que admiten respuesta pública son las que tienen comentarios.
    for (const s of TIENE_COMENTARIO_PUBLICO) {
      esperar(!!infoOrigen(s).admitePublica).igual(true);
    }
  });

  test("Instagram ofrece las cinco; WhatsApp ninguna", () => {
    esperar(origenPara("instagram").length).igual(6);
    esperar(origenPara("whatsapp").length).igual(1);
  });
});

describe("Qué flujo contesta el comentario", () => {
  const general = { id: "general", origen: "reel", priority: 1 };
  const conPalabras = { id: "promo", origen: "reel", keywords: ["promo"], priority: 2 };
  const deEsePost = { id: "ese-reel", origen: "reel", publicacion: "REEL9", priority: 3 };
  const lasDos = { id: "promo-de-ese-reel", origen: "reel", publicacion: "REEL9", keywords: ["promo"], priority: 4 };
  const todos = [general, conPalabras, deEsePost, lasDos];

  const enUnReel = (texto, media) => ({ tipo: "comentario", tipoDeMedia: "REELS", mediaId: media, texto });

  test("GANA EL MÁS ESPECÍFICO, no el primero que se guardó", () => {
    // Si ganara cualquiera, la promoción saldría o no según el orden en que se
    // guardaron los flujos — y el dueño no tendría forma de saber por qué a
    // veces sale y a veces no.
    esperar(reglaQueAplica(todos, enUnReel("quiero la promo", "REEL9")).id).igual("promo-de-ese-reel");
    esperar(reglaQueAplica(todos, enUnReel("hola", "REEL9")).id).igual("ese-reel");
    esperar(reglaQueAplica(todos, enUnReel("quiero la promo", "OTRO")).id).igual("promo");
    esperar(reglaQueAplica(todos, enUnReel("hola", "OTRO")).id).igual("general");
  });

  test("a igualdad, manda la prioridad que puso el negocio", () => {
    const a = { id: "a", origen: "reel", priority: 5 };
    const b = { id: "b", origen: "reel", priority: 2 };
    esperar(reglaQueAplica([a, b], enUnReel("hola", "X")).id).igual("b");
  });

  test("UN FLUJO DE UN REEL CONCRETO NO CONTESTA EN LOS DEMÁS", () => {
    // Sin esto, la promoción de un reel contestaría en todos los otros.
    esperar(reglaQueAplica([deEsePost], enUnReel("hola", "OTRO"))).igual(null);
  });

  test("un flujo de otra superficie NO se activa aquí", () => {
    // Es el fallo entero que esto arregla: el flujo de los DM contestando
    // comentarios porque nadie miraba `origen`.
    const soloDm = { id: "dm", origen: "dm" };
    esperar(reglaQueAplica([soloDm], enUnReel("hola", "X"))).igual(null);
    esperar(reglaQueAplica([soloDm], { tipo: "dm", texto: "hola" }).id).igual("dm");
  });

  test("UN FLUJO SIN ORIGEN ESCUCHA MENSAJES DIRECTOS", () => {
    // Es el valor por defecto de la columna y el comportamiento de todos los
    // flujos que ya existían: no pueden empezar a contestar comentarios por
    // haberse añadido esta regla.
    const viejo = { id: "de-siempre" };
    esperar(reglaQueAplica([viejo], { tipo: "dm", texto: "hola" }).id).igual("de-siempre");
    esperar(reglaQueAplica([viejo], enUnReel("hola", "X"))).igual(null);
  });

  test("un flujo apagado no contesta", () => {
    esperar(reglaQueAplica([{ ...general, enabled: false }], enUnReel("hola", "X"))).igual(null);
  });

  test("sin nada que encaje, no se inventa un flujo", () => {
    // Quien llama cae al comportamiento de siempre; devolver uno al azar sería
    // contestar un comentario de un reel con el guion de otra cosa.
    esperar(reglaQueAplica([], enUnReel("hola", "X"))).igual(null);
    esperar(reglaQueAplica(null, enUnReel("hola", "X"))).igual(null);
    esperar(reglaQueAplica(todos, { tipo: "algo_nuevo", texto: "hola" })).igual(null);
  });
});

describe("Las palabras clave de una promoción", () => {
  test("POR SUBCADENA: «PROMO!!!» y «yo quiero la promo» cuentan", () => {
    // Pedir la palabra aislada dejaría fuera a la mayoría, y una promoción que
    // no contesta a la mitad de la gente es peor que no tenerla.
    for (const t of ["PROMO", "promo!!!", "¿promo?", "yo quiero la promo", "Promoción"]) {
      esperar(coincidenLasPalabras(["promo"], t)).igual(true);
    }
  });

  test("con tildes y mayúsculas da igual cómo lo escriban", () => {
    esperar(coincidenLasPalabras(["promoción"], "PROMOCION")).igual(true);
    esperar(coincidenLasPalabras(["informacion"], "necesito INFORMACIÓN")).igual(true);
  });

  test("sin palabras, cualquier comentario vale", () => {
    esperar(coincidenLasPalabras([], "lo que sea")).igual(true);
    esperar(coincidenLasPalabras(null, "lo que sea")).igual(true);
  });

  test("con palabras y sin texto, no cuela", () => {
    esperar(coincidenLasPalabras(["promo"], "")).igual(false);
    esperar(coincidenLasPalabras(["promo"], "hola")).igual(false);
  });
});

describe("Dónde se contesta", () => {
  test("en público SOLO donde hay público Y hay qué decir", () => {
    const conTexto = { respuesta_publica: "¡Te lo mandé por privado! 💌" };
    esperar(dondeContestar(conTexto, "reel").publico).igual(true);
    esperar(dondeContestar(conTexto, "post").publico).igual(true);
    esperar(dondeContestar(conTexto, "live").publico).igual(true);
    // A un DM o a una respuesta de historia no se les puede contestar «en
    // público» porque no hay público.
    esperar(dondeContestar(conTexto, "dm").publico).igual(false);
    esperar(dondeContestar(conTexto, "story_reply").publico).igual(false);
    esperar(dondeContestar(conTexto, "story_mention").publico).igual(false);
  });

  test("SIN TEXTO NO SE PUBLICA NADA", () => {
    // Mandar algo genérico en el comentario de alguien es peor que no
    // contestar: lo ve todo el mundo.
    esperar(dondeContestar({ respuesta_publica: "" }, "reel").publico).igual(false);
    esperar(dondeContestar({ respuesta_publica: "   " }, "reel").publico).igual(false);
    esperar(dondeContestar({}, "reel").publico).igual(false);
    esperar(dondeContestar(null, "reel").publico).igual(false);
  });

  test("el privado sale siempre", () => {
    // Es lo que abre la conversación. La pública es contenido; la privada es
    // el lead.
    for (const s of ["dm", "post", "reel", "live", "story_reply", "story_mention", null]) {
      esperar(dondeContestar({}, s).privado).igual(true);
    }
  });
});

describe("Una sola vez por persona", () => {
  test("quien ya recibió el privado por esa publicación no recibe otro", () => {
    // Quien comentaba tres veces el mismo reel recibía tres mensajes privados.
    // Eso no es insistir, es lo que hace que alguien te silencie.
    esperar(puedeEscribirEnPrivado({ una_por_persona: true }, true)).igual(false);
    esperar(puedeEscribirEnPrivado({ una_por_persona: true }, false)).igual(true);
  });

  test("ENCENDIDO POR OMISIÓN, porque los flujos de antes no tienen el campo", () => {
    esperar(puedeEscribirEnPrivado({}, true)).igual(false);
    esperar(puedeEscribirEnPrivado(null, true)).igual(false);
    esperar(puedeEscribirEnPrivado(undefined, true)).igual(false);
  });

  test("quien lo apaga a propósito puede insistir", () => {
    esperar(puedeEscribirEnPrivado({ una_por_persona: false }, true)).igual(true);
  });
});


/* ════════════════════════════════════════════════════════════════════════════
 * EN QUÉ HORA ESTÁ ESTE NEGOCIO
 *
 * `timezone` era `not null default 'America/Mexico_City'`: la base no podía
 * representar «no sé dónde está», así que todos nacían en Ciudad de México.
 *
 * Un negocio de Panamá ofreció TODAS sus citas una hora corridas. El bot decía
 * «09:00» y el evento caía a las 10:00. Nadie lo vio, porque una zona plausible
 * no se parece a un error.
 * ══════════════════════════════════════════════════════════════════════════ */

describe("La zona que sugiere un teléfono", () => {
  test("EL CASO REAL: un +507 es Panamá, no Ciudad de México", () => {
    esperar(zonaDelTelefono("50762171875")).igual("America/Panama");
    esperar(zonaDelTelefono("+507 6217-1875")).igual("America/Panama");
  });

  test("GANA EL PREFIJO MÁS LARGO", () => {
    esperar(zonaDelTelefono("18095551234")).igual("America/Santo_Domingo");
    esperar(zonaDelTelefono("5215540929167")).igual("America/Mexico_City");
    esperar(zonaDelTelefono("5511999998888")).igual("America/Sao_Paulo");

    // CON UN MAPA DONDE UN PREFIJO ES PRINCIPIO DE OTRO, que es el caso que la
    // regla existe para resolver. Con los prefijos reales de hoy no se puede
    // demostrar —ninguno solapa— y quedaría una regla que nadie prueba hasta
    // el día que alguien añada el «1» de Estados Unidos al lado del «1809».
    const solapado = { "1": "America/New_York", "1809": "America/Santo_Domingo" };
    esperar(zonaDelTelefono("18095551234", solapado)).igual("America/Santo_Domingo");
    esperar(zonaDelTelefono("12125551234", solapado)).igual("America/New_York");
  });

  test("ESTADOS UNIDOS NO SE ADIVINA", () => {
    // Seis husos y ninguno mayoritario: adivinar sería tirar una moneda, y una
    // moneda con cara de certeza es lo que causó todo esto.
    esperar(zonaDelTelefono("12125551234")).igual(null);
    esperar(zonaDelTelefono("14155551234")).igual(null);
  });

  test("sin número no se inventa nada", () => {
    esperar(zonaDelTelefono("")).igual(null);
    esperar(zonaDelTelefono(null)).igual(null);
    esperar(zonaDelTelefono("999")).igual(null);
  });

  test("todas las zonas del mapa existen de verdad", () => {
    // Una zona mal escrita aquí no falla al guardarse: falla meses después, al
    // formatear la hora en el mensaje de un cliente.
    for (const z of Object.values(ZONA_POR_PREFIJO)) {
      esperar(zonaValida(z)).igual(true);
    }
  });
});

describe("Una zona horaria que no existe no se guarda", () => {
  test("lo que no es una zona se rechaza", () => {
    esperar(zonaValida("America/Panama")).igual(true);
    esperar(zonaValida("Europe/Madrid")).igual(true);
    esperar(zonaValida("America/Atlantis")).igual(false);
    esperar(zonaValida("GMT-5")).igual(false);
    esperar(zonaValida("")).igual(false);
    esperar(zonaValida(null)).igual(false);
  });
});

describe("La zona, escrita para una persona", () => {
  test("se lee la ciudad y el desfase, no el identificador", () => {
    // Nadie sabe qué es `America/Panama`. Pedirle a alguien que confirme eso es
    // pedirle que confirme una cadena de texto.
    const t = comoSeLee("America/Panama", new Date("2026-09-06T18:00:00Z"));
    esperar(t.includes("Panama")).igual(true);
    esperar(t.includes("GMT-5")).igual(true);
    esperar(t.includes("13:00")).igual(true);
    // Y NO el identificador crudo: «America/Panama» es lo que hay que quitar,
    // no lo que hay que enseñar.
    esperar(t.includes("America/")).igual(false);
    // Los guiones bajos también: «Buenos_Aires» no lo escribe nadie así.
    esperar(comoSeLee("America/Argentina/Buenos_Aires").includes("Buenos Aires")).igual(true);
    esperar(comoSeLee("America/Argentina/Buenos_Aires").includes("_")).igual(false);
  });

  test("la hora que enseña es la de ESA zona, para poder mirar el reloj", () => {
    const momento = new Date("2026-09-06T18:00:00Z");
    esperar(comoSeLee("America/Mexico_City", momento).includes("12:00")).igual(true);
    esperar(comoSeLee("America/Panama", momento).includes("13:00")).igual(true);
  });

  test("una zona rota no pinta un aviso a medias", () => {
    esperar(comoSeLee("America/Atlantis")).igual("");
    esperar(comoSeLee(null)).igual("");
  });
});

describe("Qué zona manda, y de dónde salió", () => {
  test("LO CONFIRMADO GANA SIEMPRE", () => {
    // Si no, el negocio de Panamá que configura desde un viaje a Madrid se
    // encontraría sus citas mudadas a Europa.
    const r = zonaQueManda({
      guardada: "America/Panama", confirmada: true,
      navegador: "Europe/Madrid", telefono: "50762171875",
    });
    esperar(r.zona).igual("America/Panama");
    esperar(r.de).igual("confirmada");
  });

  test("sin confirmar, manda el navegador", () => {
    const r = zonaQueManda({ guardada: "America/Mexico_City", navegador: "America/Panama" });
    esperar(r.zona).igual("America/Panama");
    esperar(r.de).igual("navegador");
  });

  test("sin navegador, lo guardado vale más que el teléfono", () => {
    // Alguien pudo ponerla a mano y no haber vuelto a pasar por el aviso.
    const r = zonaQueManda({ guardada: "America/Bogota", telefono: "50762171875" });
    esperar(r.zona).igual("America/Bogota");
    esperar(r.de).igual("guardada");
  });

  test("SE DICE DE DÓNDE SALIÓ, sin mentir", () => {
    // Un aviso que dice «detectada de tu navegador» cuando salió de la base es
    // peor que uno que no lo dice: manda a mirar donde no está el problema.
    esperar(zonaQueManda({ guardada: "America/Bogota" }).de).igual("guardada");
    esperar(zonaQueManda({ navegador: "America/Bogota" }).de).igual("navegador");
    esperar(zonaQueManda({ telefono: "50762171875" }).de).igual("telefono");
  });

  test("sin nada, se dice que no hay — no se cae a México", () => {
    // Es el fallo entero. Una respuesta por defecto que parece correcta es peor
    // que no tener respuesta: sin estado «sin configurar» no hay qué avisar.
    const r = zonaQueManda({});
    esperar(r.zona).igual(null);
    esperar(r.de).igual("ninguna");
  });

  test("una zona inventada no se usa aunque esté guardada y confirmada", () => {
    const r = zonaQueManda({ guardada: "America/Atlantis", confirmada: true, telefono: "50762171875" });
    esperar(r.zona).igual("America/Panama");
    esperar(r.de).igual("telefono");
  });
});

describe("Confirmar la zona se pide UNA vez", () => {
  test("mientras no la confirme, se pregunta aunque parezca bien", () => {
    // La de México parecía bien y estaba mal.
    esperar(hayQueConfirmar(false)).igual(true);
    esperar(hayQueConfirmar(null)).igual(true);
    esperar(hayQueConfirmar(undefined)).igual(true);
  });

  test("en cuanto dice que sí, no se le vuelve a molestar", () => {
    // Un aviso que sigue saliendo después de atenderlo pasa a ser decorado, y
    // entonces tampoco sirve para el siguiente problema.
    esperar(hayQueConfirmar(true)).igual(false);
  });
});


/* ════════════════════════════════════════════════════════════════════════════
 * «LUNES A LAS 9 AM» TIENE QUE PODER AGENDARSE
 *
 * 6 de septiembre. Lana ofreció horarios de verdad, el cliente contestó «lunes
 * a las 9 am», y la cita nunca se creó. Ella misma escribió el motivo al pasar
 * con una persona: «Error técnico al agendar cita para Alex, restaurante.
 * Quería lunes 7 de sep 9:00 am».
 *
 * La causa no fue del modelo: le pedíamos que cargara un identificador exacto
 * entre turnos después de haber reescrito la lista con sus palabras.
 * ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
 * LA HORA SE DICE EN EL RELOJ DE QUIEN LA ESCUCHA
 *
 * Demandu tiene número de Panamá y clientes en México. El bot le decía a todo
 * el mundo la hora del negocio, así que un cliente mexicano oía «las 10:00» y
 * apuntaba las 10:00 — cuando en su teléfono la cita eran las 9:00.
 *
 * La cita NO se mueve. Solo cambia cómo se cuenta.
 * ══════════════════════════════════════════════════════════════════════════ */

describe("La hora se dice en el reloj de quien la escucha", () => {
  // 2026-09-09 15:00 UTC = 09:00 en Ciudad de México = 10:00 en Panamá.
  const ISO = "2026-09-09T15:00:00.000Z";

  test("EL CASO REAL: el mismo instante, dos relojes", () => {
    esperar(comoSeLoDigo(ISO, "America/Mexico_City").hora).igual("09:00");
    esperar(comoSeLoDigo(ISO, "America/Panama").hora).igual("10:00");
  });

  test("el día también cambia cuando toca", () => {
    // 03:00 UTC del jueves es todavía el miércoles en México.
    const cruce = "2026-09-10T03:00:00.000Z";
    esperar(comoSeLoDigo(cruce, "America/Mexico_City").dia.includes("miércoles")).verdadero();
    esperar(comoSeLoDigo(cruce, "Europe/Madrid").dia.includes("jueves")).verdadero();
  });

  test("la etiqueta tiene EL MISMO formato que la de los huecos", () => {
    // Si no fuera idéntico, `horarioQuePidio` dejaría de reconocer lo que la
    // persona repite: la etiqueta es exactamente lo que se compara.
    esperar(etiquetaEnZona(ISO, "America/Panama")).igual("mié 09 de sep, 10:00");
    esperar(comoSeLoDigo(ISO, "America/Panama").etiqueta).igual("mié 09 de sep, 10:00");
  });

  test("SIN ZONA NO SE INVENTA UNA", () => {
    // Es la lección de la 0102 con otra cara: decirle a alguien una hora que no
    // es la suya es peor que no decirle ninguna. Quien llama se queda con lo
    // que ya tenía.
    esperar(comoSeLoDigo(ISO, null)).igual(null);
    esperar(comoSeLoDigo(ISO, "")).igual(null);
    esperar(comoSeLoDigo(ISO, "   ")).igual(null);
    esperar(comoSeLoDigo(ISO, "Marte/Olympus_Mons")).igual(null);
    esperar(comoSeLoDigo(null, "America/Panama")).igual(null);
    esperar(comoSeLoDigo("cuando sea", "America/Panama")).igual(null);
  });

  test("los huecos se reetiquetan y NADA MÁS cambia", () => {
    const slots = [
      { startISO: ISO, label: "mié 09 de sep, 09:00", dia: "2026-9-9", minutos: 540 },
    ];
    const [s] = enLaZonaDelCliente(slots, "America/Panama");
    esperar(s.label).igual("mié 09 de sep, 10:00");
    esperar(s.startISO).igual(ISO);
    // `dia` y `minutos` son los del NEGOCIO y siguen siéndolo: es lo que usa
    // `repartirHorarios` para agrupar por día y turno. Repartir por el turno
    // del cliente pondría «mañana y tarde» de un huso ajeno.
    esperar(s.dia).igual("2026-9-9");
    esperar(s.minutos).igual(540);
  });

  test("sin zona, la lista vuelve TAL CUAL", () => {
    // Es lo que pasa en Instagram y en el chat de la web: no hay teléfono del
    // que deducir nada, y la hora del negocio es la respuesta correcta.
    const slots = [{ startISO: ISO, label: "mié 09 de sep, 09:00" }];
    esperar(enLaZonaDelCliente(slots, null)[0].label).igual("mié 09 de sep, 09:00");
    esperar(enLaZonaDelCliente(slots, "Marte/Olympus_Mons")[0].label).igual("mié 09 de sep, 09:00");
    esperar(enLaZonaDelCliente(null, "America/Panama")).igual([]);
  });

  test("lo reetiquetado SIGUE siendo reconocible", () => {
    // La cadena entera: se ofrece en el reloj del cliente, el cliente repite lo
    // que leyó, y tiene que reconocerse. Si se guardaran las etiquetas del
    // negocio, esto devolvería null y volvería el bucle de Instagram.
    const ofrecidos = enLaZonaDelCliente(
      [{ startISO: ISO, label: "mié 09 de sep, 09:00" }],
      "America/Panama",
    ).map((s) => ({ iso: s.startISO, label: s.label }));
    esperar(horarioQuePidio("el miércoles a las 10", ofrecidos)).igual(ISO);
    // Y la del negocio, que ya no se le enseñó, NO cuadra: es la prueba de que
    // de verdad se está comparando contra lo que la persona leyó.
    esperar(horarioQuePidio("el miércoles a las 9", ofrecidos)).igual(null);
  });
});

describe("Traducir lo que dijo la persona a un horario ofrecido", () => {
  const ofrecidos = [
    { iso: "2026-09-07T14:00:00.000Z", label: "lun 07 de sep, 09:00" },
    { iso: "2026-09-07T17:00:00.000Z", label: "lun 07 de sep, 12:00" },
    { iso: "2026-09-08T14:00:00.000Z", label: "mar 08 de sep, 09:00" },
    { iso: "2026-09-08T17:30:00.000Z", label: "mar 08 de sep, 12:30" },
  ];

  test("EL CASO REAL: «lunes a las 9 am» agenda el lunes a las 9", () => {
    esperar(horarioQuePidio("lunes a las 9 am", ofrecidos)).igual("2026-09-07T14:00:00.000Z");
  });

  test("el identificador exacto sigue siendo lo primero que se mira", () => {
    // Es lo que se le pide al modelo, y cuando lo trae bien no hay nada que
    // interpretar.
    esperar(horarioQuePidio("2026-09-08T17:30:00.000Z", ofrecidos)).igual("2026-09-08T17:30:00.000Z");
  });

  test("la etiqueta tal cual también vale", () => {
    // El modelo enseña la etiqueta a la persona; es normal que la copie.
    esperar(horarioQuePidio("mar 08 de sep, 12:30", ofrecidos)).igual("2026-09-08T17:30:00.000Z");
    esperar(horarioQuePidio("MAR 08 DE SEP, 12:30", ofrecidos)).igual("2026-09-08T17:30:00.000Z");
  });

  test("como habla la gente", () => {
    esperar(horarioQuePidio("el martes a las 12:30", ofrecidos)).igual("2026-09-08T17:30:00.000Z");
    esperar(horarioQuePidio("lun 12:00", ofrecidos)).igual("2026-09-07T17:00:00.000Z");
    esperar(horarioQuePidio("martes 9", ofrecidos)).igual("2026-09-08T14:00:00.000Z");
  });

  test("ANTE LA DUDA NO SE ADIVINA", () => {
    // «a las 9» encaja con el lunes Y con el martes. Agendar el día equivocado
    // es peor que un mensaje más preguntando cuál.
    esperar(horarioQuePidio("a las 9", ofrecidos)).igual(null);
    esperar(horarioQuePidio("9 am", ofrecidos)).igual(null);
  });

  test("lo que no encaja con nada devuelve nada", () => {
    esperar(horarioQuePidio("el viernes a las 9", ofrecidos)).igual(null);
    esperar(horarioQuePidio("lunes a las 17", ofrecidos)).igual(null);
    esperar(horarioQuePidio("cuando sea", ofrecidos)).igual(null);
    esperar(horarioQuePidio("", ofrecidos)).igual(null);
    esperar(horarioQuePidio("lunes a las 9", [])).igual(null);
    esperar(horarioQuePidio("lunes a las 9", null)).igual(null);
  });

  test("una opción a medias no se puede elegir", () => {
    esperar(horarioQuePidio("lunes a las 9", [{ iso: "", label: "lun 07 de sep, 09:00" }])).igual(null);
    esperar(horarioQuePidio("lunes a las 9", [{ iso: "x", label: "" }])).igual(null);
  });

  /* ── DECIR SOLO EL DÍA ──────────────────────────────────────────────────
   *
   * «el jueves» es una respuesta normal y no lleva hora. Antes se devolvía
   * null y se le volvía a enseñar la lista entera a alguien que YA había
   * elegido — que es justo el bucle que se vio en Instagram.
   *
   * Solo cuenta si ese día tiene UN hueco. Con dos, adivinar sería reservar a
   * las 9 cuando también había a las 12, y a esa cita no va nadie. */
  test("solo el día vale cuando ese día tiene un único hueco", () => {
    const unoPorDia = [
      { iso: "2026-09-09T14:00:00.000Z", label: "mié 09 de sep, 09:00" },
      { iso: "2026-09-10T17:00:00.000Z", label: "jue 10 de sep, 12:00" },
    ];
    esperar(horarioQuePidio("el jueves", unoPorDia)).igual("2026-09-10T17:00:00.000Z");
    esperar(horarioQuePidio("miercoles", unoPorDia)).igual("2026-09-09T14:00:00.000Z");
    esperar(horarioQuePidio("el miércoles me viene bien", unoPorDia)).igual("2026-09-09T14:00:00.000Z");
  });

  test("solo el día NO vale cuando ese día tiene dos", () => {
    // `ofrecidos` tiene lunes a las 09:00 y a las 12:00.
    esperar(horarioQuePidio("el lunes", ofrecidos)).igual(null);
    esperar(horarioQuePidio("lunes", ofrecidos)).igual(null);
  });

  test("sin día y sin hora sigue sin adivinarse", () => {
    // Con un solo hueco en toda la lista la tentación es devolverlo. No: quien
    // escribe «cuando sea» no ha elegido nada, y confirmarle una cita que no
    // pidió es peor que preguntar.
    const unico = [{ iso: "2026-09-10T17:00:00.000Z", label: "jue 10 de sep, 12:00" }];
    esperar(horarioQuePidio("cuando sea", unico)).igual(null);
    esperar(horarioQuePidio("me da igual", unico)).igual(null);
    esperar(horarioQuePidio("si", unico)).igual(null);
  });

  test("un día que no se ofreció no encaja con nada", () => {
    esperar(horarioQuePidio("el domingo", ofrecidos)).igual(null);
  });
});

describe("Leer la hora y el día de un texto", () => {
  test("los días, largos y cortos", () => {
    esperar(diaQueDijo("el lunes por favor")).igual("lun");
    esperar(diaQueDijo("MIÉRCOLES")).igual("mie");
    esperar(diaQueDijo("sábado")).igual("sab");
    esperar(diaQueDijo("mar 08 de sep")).igual("mar");
    esperar(diaQueDijo("cuando sea")).igual(null);
  });

  test("«marzo» no es martes", () => {
    // Sin el borde de palabra, «mar» entraría por «marzo» y agendaría martes.
    esperar(diaQueDijo("en marzo")).igual(null);
    esperar(diaQueDijo("domingo o lunes")).igual("lun");
  });

  test("am y pm", () => {
    esperar(horasQueDijo("9 am").includes(9 * 60)).igual(true);
    esperar(horasQueDijo("9 pm").includes(21 * 60)).igual(true);
    esperar(horasQueDijo("12 am").includes(0)).igual(true);
    esperar(horasQueDijo("12 pm").includes(12 * 60)).igual(true);
    esperar(horasQueDijo("12:30").includes(12 * 60 + 30)).igual(true);
  });

  test("SIN SUFIJO SE APUNTAN LAS DOS", () => {
    // «a las 3» puede ser las 15 en una agenda de tarde. Se apuntan las dos y
    // gana la que de verdad se ofreció.
    const h = horasQueDijo("a las 3");
    esperar(h.includes(3 * 60)).igual(true);
    esperar(h.includes(15 * 60)).igual(true);
  });

  test("un número imposible no es una hora", () => {
    esperar(horasQueDijo("son 45 personas").includes(45 * 60)).igual(false);
    esperar(horasQueDijo("nada de horas").length).igual(0);
  });

  test("la hora de la etiqueta sale DESPUÉS de la coma", () => {
    // En «lun 07 de sep, 09:00» el primer número es el día del mes: cogerlo
    // agendaría a las 7 de la mañana una cita de las 9.
    esperar(horaDeLaEtiqueta("lun 07 de sep, 09:00")).igual(9 * 60);
    esperar(horaDeLaEtiqueta("mar 08 de sep, 12:30")).igual(12 * 60 + 30);
    esperar(horaDeLaEtiqueta("sin hora")).igual(null);
  });
});

describe("Cuando no se reconoce la hora, se le enseñan las que hay", () => {
  test("NO se le devuelve «falta la fecha y hora»", () => {
    // Ese error fue el que hizo que Lana se rindiera y pasara la conversación
    // con una persona. Un error que no dice qué hacer deja al modelo sin salida.
    const t = comoRecordarLosHorarios([{ iso: "2026-09-07T14:00:00.000Z", label: "lun 07 de sep, 09:00" }]);
    esperar(t.includes("2026-09-07T14:00:00.000Z")).igual(true);
    esperar(t.includes("lun 07 de sep, 09:00")).igual(true);
    esperar(t.toLowerCase().includes("falta la fecha")).igual(false);
  });

  test("y si no hay ninguno, se le dice que mire primero", () => {
    esperar(comoRecordarLosHorarios([]).includes("ver_horarios")).igual(true);
    esperar(comoRecordarLosHorarios(null).includes("ver_horarios")).igual(true);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * QUÉ SE PUBLICA DEBAJO DE UN COMENTARIO
 *
 * Antes era un texto fijo para todos. Ahora puede contestar Lana leyendo el
 * comentario — y lo que NO puede hacer nunca es publicar el mensaje de
 * respaldo, que está escrito para una conversación privada.
 * ─────────────────────────────────────────────────────────────────────────── */
describe("La respuesta pública de un comentario", () => {
  test("sin modo guardado se comporta como siempre: texto fijo", () => {
    esperar(modoDeRespuestaPublica(null)).igual("texto");
    esperar(modoDeRespuestaPublica({})).igual("texto");
    esperar(modoDeRespuestaPublica({ respuesta_publica_modo: null })).igual("texto");
  });

  test("un valor inventado no cambia el comportamiento", () => {
    esperar(modoDeRespuestaPublica({ respuesta_publica_modo: "IA" })).igual("texto");
    esperar(modoDeRespuestaPublica({ respuesta_publica_modo: "cualquier cosa" })).igual("texto");
    esperar(modoDeRespuestaPublica({ respuesta_publica_modo: "ia" })).igual("ia");
    esperar(modoDeRespuestaPublica({ respuesta_publica_modo: "no" })).igual("no");
  });

  test("los tres modos están en el catálogo de la pantalla", () => {
    esperar(MODOS_PUBLICOS.map((m) => m.valor).sort()).igual(["ia", "no", "texto"]);
  });

  test("con modo IA se contesta en público aunque no haya frase escrita", () => {
    const flujo = { id: "f", respuesta_publica_modo: "ia" };
    esperar(dondeContestar(flujo, "post").publico).verdadero(
      "con «que conteste Lana» no saldría nada nunca",
    );
  });

  test("con modo texto y sin frase no se publica nada", () => {
    esperar(dondeContestar({ id: "f" }, "post").publico).falso();
    esperar(dondeContestar({ id: "f", respuesta_publica: "   " }, "post").publico).falso();
    esperar(dondeContestar({ id: "f", respuesta_publica: "¡Te lo mandé!" }, "post").publico).verdadero();
  });

  test("con modo «no» no se publica ni habiendo frase escrita", () => {
    const flujo = { id: "f", respuesta_publica_modo: "no", respuesta_publica: "hola" };
    esperar(dondeContestar(flujo, "post").publico).falso();
    esperar(dondeContestar(flujo, "post").privado).verdadero("el privado no depende del público");
  });

  test("el texto se deja en una línea y sin markdown", () => {
    esperar(limpiarParaComentario("**Hola**\n\nte cuento")).igual("Hola te cuento");
    esperar(limpiarParaComentario("  # Precio:  120  ")).igual("Precio: 120");
    esperar(limpiarParaComentario(null)).igual("");
  });

  test("si es largo se corta por la última frase entera", () => {
    const largo = "Cuesta 120 pesos. " + "Incluye envío a todo el país y garantía de un año. ".repeat(8);
    const corto = limpiarParaComentario(largo);
    esperar(corto.length <= MAX_PUBLICO).verdadero("se pasó del máximo");
    esperar(corto.endsWith(".")).verdadero("cortó a media frase");
  });

  test("nunca se publica vacío ni el mensaje de respaldo", () => {
    const respaldo = "Esa no me la sé todavía 🙈";
    esperar(sePuedePublicar("", respaldo)).falso();
    esperar(sePuedePublicar("   ", respaldo)).falso();
    esperar(sePuedePublicar(respaldo, respaldo)).falso();
    esperar(sePuedePublicar("  esa NO me la sé   todavía 🙈 ", respaldo)).falso(
      "cambiando mayúsculas o espacios el respaldo se colaría en público",
    );
    esperar(sePuedePublicar("Cuesta 120 pesos", respaldo)).verdadero();
  });

  test("a la IA se le dice si va a haber privado, y si no, que no lo prometa", () => {
    const con = preguntaParaElComentario({ texto: "¿precio?", usuario: "ana", habraPrivado: true });
    esperar(con.includes("¿precio?")).verdadero("no le llega el comentario");
    esperar(con.includes("@ana")).verdadero("no le llega quién comentó");
    esperar(/Termina diciendo que le escribes por privado/.test(con)).verdadero();

    const sin = preguntaParaElComentario({ texto: "¿precio?", habraPrivado: false });
    esperar(/No digas que le escribes por privado/.test(sin)).verdadero(
      "a quien ya recibió su privado se le prometería otro que no va a llegar",
    );
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * LA PANTALLA SIMPLE: INTERRUPTORES Y PROMOCIONES
 * ─────────────────────────────────────────────────────────────────────────── */
describe("Respuestas automáticas sin abrir un flujo", () => {
  test("cada canal ve solo los sitios que tiene", () => {
    const ig = superficiesDe("instagram").map((s) => s.valor);
    esperar(ig.includes("post") && ig.includes("reel") && ig.includes("dm")).verdadero();
    const wa = superficiesDe("whatsapp").map((s) => s.valor);
    esperar(wa).igual(["dm"], "WhatsApp no tiene comentarios ni historias que contestar");
  });

  test("encender un sitio crea un flujo que de verdad contesta", () => {
    const g = grafoDeLana();
    esperar(g.nodes.some((n) => n.type === "ai")).verdadero(
      "sin bloque de IA el interruptor quedaría encendido y el chatbot mudo",
    );
    esperar(g.nodes.length > 0 && g.edges.length > 0).verdadero();
  });

  test("una promoción con archivo manda el texto CON el archivo", () => {
    const g = grafoDePromo({ mensaje: "Aquí lo tienes", enlace: "", archivo: "https://x/y.pdf", tipoDeArchivo: "file" });
    const nodo = g.nodes.find((n) => n.id === "promo");
    esperar(nodo.type).igual("media");
    esperar(nodo.data.mediaUrl).igual("https://x/y.pdf");
    /* El motor, en un bloque de archivo, manda `mediaUrl` y `caption`. En
     * `text` el mensaje se perdería y llegaría un enlace suelto. */
    esperar(String(nodo.data.caption ?? "")).igual("Aquí lo tienes");
  });

  test("el enlace viaja dentro del mensaje", () => {
    const g = grafoDePromo({ mensaje: "Mira esto", enlace: "https://mitienda.com" });
    const nodo = g.nodes.find((n) => n.id === "promo");
    esperar(nodo.type).igual("message");
    esperar(nodo.data.text.includes("https://mitienda.com")).verdadero(
      "el enlace se pierde: la promoción llegaría sin lo prometido",
    );
    esperar(nodo.data.text.includes("Mira esto")).verdadero();
  });

  test("la palabra clave se guarda siempre igual", () => {
    esperar(limpiarPalabra("  ENVÍO ")).igual("envío");
    esperar(limpiarPalabra(null)).igual("");
  });

  test("una promoción es una regla con palabra; sin palabra es la general", () => {
    esperar(esPromo({ keywords: ["envio"] })).verdadero();
    esperar(esPromo({ keywords: [] })).falso();
    esperar(esPromo({})).falso();
    /* Y no puede haber una palabra clave capaz de generar el nombre de una
     * respuesta general: guardar esa promoción pisaría el interruptor del
     * sitio, y apagarla borraría lo que contesta el chatbot ahí. */
    const choque = ORIGENES.some(
      (o) => nombreDePromo(o.label).toLowerCase() === nombreDeLana(o.valor).toLowerCase(),
    );
    esperar(choque).falso("una promoción puede llamarse igual que la respuesta general de un sitio");
  });

  test("todo lo que crea la pantalla simple se reconoce como suyo", () => {
    /* Si el nombre que se CREA y el que se RECONOCE se separan, la lista de
     * conversaciones se llena de reglas que el negocio nunca escribió — que es
     * justo el trabajo que esta pantalla le quitó. */
    for (const s of superficiesDe("instagram")) {
      esperar(laLlevaLaPantallaSimple(nombreDeLana(s.valor))).verdadero(
        `«${nombreDeLana(s.valor)}» aparecería en la lista de conversaciones`,
      );
    }
    esperar(laLlevaLaPantallaSimple(nombreDePromo("envío"))).verdadero();
  });

  test("y lo que escribió el negocio NO se esconde", () => {
    for (const n of ["Bienvenida", "Ventas", "Lana", "Promoción de verano", "", null]) {
      esperar(laLlevaLaPantallaSimple(n)).falso(
        `«${n}» es del negocio y desaparecería de su lista`,
      );
    }
  });

  test("«en los dos sitios» escucha en comentarios Y en privado", () => {
    const dos = origenesDePromo("ambos");
    esperar(dos.includes("dm")).verdadero();
    esperar(dos.includes("post")).verdadero();
    esperar(origenesDePromo("dm")).igual(["dm"]);
    esperar(origenesDePromo(null)).igual(["post", "reel"], "sin elegir, vale para los comentarios");
  });

  test("al volver a pintarla, se marca la misma opción con la que se guardó", () => {
    for (const d of DONDE_PROMO) {
      esperar(dondeDeLosOrigenes(d.origenes)).igual(
        d.valor,
        `una promoción guardada como «${d.label}» se enseñaría con otra opción marcada`,
      );
    }
  });
});


/**
 * ASAP: mandar el pedido al mensajero.
 *
 * LO QUE SE PRUEBA AQUÍ NO ES «QUE LA LLAMADA SALGA». Es lo que falla en
 * silencio: una coordenada que no existe y se manda igual, el teléfono del
 * negocio donde va el del cliente, un aviso de «llegó al local» leído como
 * «llegó a casa del cliente». Nada de eso da error; da una moto en otro barrio
 * y un cliente esperando en la puerta.
 */
describe("ASAP · envío del pedido", () => {
  const TIENDA = {
    activo: true,
    ambiente: "prueba",
    api_key: "K", user_token: "U", shared_secret: "S",
    telefono: "+5078000000",
    origen_direccion: "PH Pijao, Panamá",
    origen_lat: 9.0136814,
    origen_long: -79.4796534,
    origen_nombre: "Ariana Gonzales",
    origen_telefono: "62159199",
    origen_nota: "Timbre del local, no el del edificio",
    vehiculo: "bike",
  };
  const PEDIDO = {
    codigo: "ABC123XYZ789",
    entrega_direccion: "Multiplaza",
    entrega_lat: 8.9853921,
    entrega_long: -79.5131792,
    entrega_nota: "Portón verde",
    cliente_nombre: "Alí Buenaño",
    cliente_telefono: "+507 6215-9100",
  };

  test("(0,0) no es una ubicación: es el dato perdido por el camino", () => {
    /* `Number("")` y `Number(null)` son 0, y (0,0) es un punto REAL en el
     * Atlántico frente a África. Dejarlo pasar manda la moto al golfo de
     * Guinea sin que nada dé error. */
    esperar(ubicacionDe(0, 0)).igual(null, "se mandaría una moto al Atlántico");
    esperar(ubicacionDe("", "")).igual(null);
    esperar(ubicacionDe(null, undefined)).igual(null);
  });

  test("media coordenada no lleva a ninguna parte", () => {
    esperar(ubicacionDe(9.01, null)).igual(null);
    esperar(ubicacionDe(null, -79.47)).igual(null);
    esperar(ubicacionDe(9.01, -79.47)).igual({ lat: 9.01, long: -79.47 });
  });

  test("fuera del planeta se descarta, NO se recorta", () => {
    /* Recortar una latitud de 200 a 90 no arregla nada: inventa una ubicación
     * en el polo y la manda como si fuera la del cliente. */
    esperar(latitud(200)).igual(null);
    esperar(latitud(-91)).igual(null);
    esperar(latitud(90)).igual(90);
    esperar(longitud(180)).igual(180);
    esperar(longitud(181)).igual(null);
    /* Y una latitud válida NO se cuela por el rango de la longitud. */
    esperar(latitud(120)).igual(null, "120 es longitud válida pero latitud imposible");
    esperar(longitud(120)).igual(120);
  });

  test("un texto que no es número no se convierte en cero", () => {
    esperar(latitud("por la panadería")).igual(null);
    esperar(latitud("  9.0136814 ")).igual(9.0136814);
  });

  test("el teléfono se normaliza como lo enseña ASAP: ocho dígitos", () => {
    for (const t of ["+507 6215-9100", "507 62159100", "62159100", "(507) 6215 9100"]) {
      esperar(telefonoAsap(t)).igual("62159100", `«${t}» llegaría distinto al mensajero`);
    }
    esperar(telefonoAsap(null)).igual("");
    /* Uno de otro país NO se recorta a ocho: sería basura con forma de
     * teléfono, y el mensajero la marcaría. */
    esperar(telefonoAsap("+34 600 123 456")).igual("34600123456");
  });

  test("las instrucciones no llevan campos vacíos", () => {
    /* «Nombre: ; Teléfono: ;» le hace creer al mensajero que el dato existe y
     * está en blanco, que es peor que no poner nada. */
    esperar(instrucciones({ nombre: "", telefono: "", nota: "" })).igual("");
    esperar(instrucciones({ nombre: "Daniel", telefono: "", nota: "" })).igual("Nombre: Daniel");
    esperar(instrucciones({ nombre: "Daniel", telefono: "+507 6215-9100", nota: "Portón verde" }))
      .igual("Nombre: Daniel; Teléfono: 62159100; Portón verde");
  });

  test("sin ubicación del cliente no se manda, y se dice cómo se arregla", () => {
    const falta = loQueFaltaParaMandar(TIENDA, { ...PEDIDO, entrega_lat: null, entrega_long: null });
    esperar(falta.length).igual(1);
    esperar(falta[0]).contiene("WhatsApp", "el negocio no puede poner él la ubicación del cliente");
  });

  test("con todo puesto no falta nada", () => {
    esperar(loQueFaltaParaMandar(TIENDA, PEDIDO)).igual([]);
  });

  test("cada llave que falte se dice por su nombre", () => {
    for (const campo of ["api_key", "user_token", "shared_secret", "telefono", "origen_direccion"]) {
      const sin = { ...TIENDA, [campo]: "" };
      esperar(loQueFaltaParaMandar(sin, PEDIDO).length).igual(
        1, `falta «${campo}» y el negocio no se enteraría`,
      );
    }
    esperar(loQueFaltaParaMandar({ ...TIENDA, activo: false }, PEDIDO).length).igual(1);
    esperar(loQueFaltaParaMandar({ ...TIENDA, origen_lat: null }, PEDIDO).length).igual(1);
  });

  test("el pedido de ASAP lleva cada cosa en SU campo", () => {
    /* Este es el error que no avisa: origen y destino cambiados de sitio, o el
     * teléfono del local donde va el del cliente. ASAP acepta el pedido igual
     * y la entrega sale mal. */
    const b = cuerpoDeOrden(TIENDA, PEDIDO);
    esperar(b.source_lat).igual("9.0136814");
    esperar(b.source_long).igual("-79.4796534");
    esperar(b.desti_lat).igual("8.9853921");
    esperar(b.desti_long).igual("-79.5131792");
    esperar(b.source_seller_phone).igual("62159199");
    esperar(b.desti_customer_phone).igual("62159100");
    esperar(b.source_address).igual("PH Pijao, Panamá");
    esperar(b.desti_address).igual("Multiplaza");
    esperar(b.desti_customer_name).igual("Alí Buenaño");
    /* Y las coordenadas viajan como TEXTO, que es lo que espera su API. */
    esperar(typeof b.source_lat).igual("string");
    esperar(typeof b.desti_long).igual("string");
  });

  test("va el código del pedido, no su número", () => {
    /* El número va por tienda y empieza en 1 en todas: el pedido 12 existe en
     * cien tiendas a la vez, y el aviso de ASAP no dice de cuál habla. */
    esperar(cuerpoDeOrden(TIENDA, PEDIDO).external_order_id).igual("ABC123XYZ789");
  });

  test("se pide para ahora, no para más tarde", () => {
    /* El envío se pide cuando el negocio pulsa «Enviar», o sea cuando el
     * paquete ya está sobre el mostrador. */
    const b = cuerpoDeOrden(TIENDA, PEDIDO);
    esperar(b.request_later).igual(0);
    esperar(b.request_later_time).igual(undefined);
    esperar(b.type_id).igual(2);
    esperar(b.is_oneway).igual(1);
  });

  test("un vehículo inventado no se manda tal cual", () => {
    esperar(vehiculoValido("helicóptero")).igual("bike");
    esperar(vehiculoValido("CAR")).igual("car");
    for (const v of VEHICULOS) esperar(vehiculoValido(v.valor)).igual(v.valor);
  });

  test("LA RESPUESTA DE VERDAD DE ASAP, LA QUE MANDÓ EL 7 SEP 2026", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * ESTA ES LA PRUEBA QUE NO TENÍAMOS, Y COSTÓ UN PEDIDO REAL DESCUBRIRLA.
     *
     * `leerDeliveryId` miraba en `delivery_id`, `data.delivery_id` y
     * `order.delivery_id` — tres formas que deduje leyendo el resto de sus
     * rutas. La de verdad es una cuarta:
     *
     *     {"status":true,"result":{"delivery_id":2818877}}
     *
     * Sin esta línea el pedido se creaba, ASAP contestaba 200, y nosotros lo
     * dábamos por fallido: la moto pedida y nosotros sin identificador para
     * seguirla ni cancelarla. El peor de los dos errores posibles.
     *
     * SE COPIA LA RESPUESTA LITERAL, no una versión limpia. El día que alguien
     * «simplifique» esta función, esto es lo que se lo impide.
     * ───────────────────────────────────────────────────────────────────────── */
    const REAL = { status: true, result: { delivery_id: 2818877 } };
    esperar(leerDeliveryId(REAL)).igual("2818877");
    esperar(loAcepto(REAL)).verdadero("dimos por fallido un pedido que ASAP aceptó");
  });

  test("el delivery_id se encuentra lo llamen como lo llamen", () => {
    /* Lo dan UNA VEZ. Si no se guarda ahí mismo, el envío ya está en la calle
     * y no hay forma de seguirlo, cancelarlo ni rastrearlo. */
    esperar(leerDeliveryId({ result: { delivery_id: 2818877 } })).igual("2818877");
    esperar(leerDeliveryId({ delivery_id: 23949 })).igual("23949");
    esperar(leerDeliveryId({ data: { delivery_id: "23949" } })).igual("23949");
    esperar(leerDeliveryId({ order: { id: 23949 } })).igual("23949");
    esperar(leerDeliveryId({ status: true })).igual("");
    esperar(leerDeliveryId(null)).igual("");
    /* Un cero no es un identificador: es el campo vacío de su base. */
    esperar(leerDeliveryId({ delivery_id: 0 })).igual("");
    esperar(leerDeliveryId({ result: { delivery_id: 0 } })).igual("");
  });

  test("UN 200 CON «status: false» NO ES UN PEDIDO ACEPTADO", () => {
    /* Su respuesta buena trae `"status": true`. Que exista ese campo significa
     * que existe la respuesta con `false` — y nada garantiza que venga con un
     * código HTTP de error. Mirar solo el 200 sería dar por bueno un pedido que
     * ASAP rechazó, y el cliente esperando una moto que nadie pidió. */
    esperar(loAcepto({ status: false, result: { delivery_id: 2818877 } })).falso(
      "ASAP dijo que no y lo dimos por bueno",
    );
    esperar(loAcepto({ success: false, delivery_id: 99 })).falso();

    /* Y al revés: sin identificador no hay pedido que seguir, jure lo que jure. */
    esperar(loAcepto({ status: true })).falso("sin identificador no hay nada que seguir");
    esperar(loAcepto({ status: true, result: {} })).falso();
    esperar(loAcepto(null)).falso();
  });

  test("EL ESTADO REAL DE SU API, EL DEL 8 SEP 2026", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * La respuesta literal de `GET /order/status` para el envío 2818877:
     *
     *   {"status":true,"delivery_status":1,"provider_status":1,
     *    "status_message":"Order Cancelled",...}
     *
     * Sirve para dos cosas. Confirma que nuestra tabla de códigos ACIERTA —el 1
     * es «cancelado» y su propio mensaje dice «Order Cancelled»—, y fija la
     * forma de la respuesta antes de que a alguien se le ocurra deducirla.
     * ───────────────────────────────────────────────────────────────────────── */
    const REAL = {
      status: true,
      delivery_status: 1,
      provider_status: 1,
      status_message: "Order Cancelled",
      updated_at: "2026-09-08T00:25:04.000Z",
    };
    esperar(leerEstado(REAL)?.clave).igual("cancelado");
    esperar(envioTerminado(leerEstado(REAL)?.clave)).verdadero("un envío cancelado seguiría preguntándose para siempre");
  });

  test("HAY DOS CAMPOS «STATUS» Y NO SIGNIFICAN LO MISMO", () => {
    /* `status` es si la CONSULTA funcionó. `delivery_status` es en qué punto va
     * el ENVÍO. Leer el primero creyendo que es el segundo es el error que
     * `leerEstado` existe para impedir.
     *
     * ── EL CASO QUE DE VERDAD MUERDE ────────────────────────────────────
     *
     * Con `status: true` no pasa nada: «true» no es un número y `estadoDeCodigo`
     * lo rechaza. Lo comprobé, y por eso este caso NO es la prueba — un caso que
     * no puede fallar no prueba nada.
     *
     * El que muerde es `status: 1`. Un montón de APIs devuelven 1 por «bien», y
     * la suya podría hacerlo mañana sin avisar. Ahí sí: 1 es un código válido, y
     * significa CANCELADO. Un envío entregado se anunciaría como cancelado.
     *
     * Por eso `status` no está entre los candidatos ni como último respaldo. Un
     * respaldo que puede acertar por accidente es peor que no tenerlo. */
    esperar(leerEstado({ status: 1, delivery_status: 2 })?.clave).igual(
      "entregado",
      "se leyó «status» como si fuera el estado del envío",
    );
    esperar(leerEstado({ status: true, delivery_status: 2 })?.clave).igual("entregado");
    esperar(leerEstado({ status: true, delivery_status: 7 })?.clave).igual("en_camino");

    /* Sin el campo del envío NO se inventa un estado, aunque la consulta fuera
     * bien. Devolver «pedido» (el 0) pisaría un «entregado» que ya estaba. */
    esperar(leerEstado({ status: true })).igual(null);
    esperar(leerEstado({ status: true, delivery_status: null })).igual(null);
    esperar(leerEstado({ status: true, delivery_status: "" })).igual(null);

    /* Y si la consulta falló, no hay nada que leer. */
    esperar(leerEstado({ status: false, delivery_status: 2 })).igual(null);
    esperar(leerEstado(null)).igual(null);
  });

  test("el motivo del fallo se enseña tal cual, no se traduce a «hubo un error»", () => {
    esperar(motivoDelFallo({ message: "Invalid user_token" })).igual("Invalid user_token");
    esperar(motivoDelFallo({})).contiene("no dijo por qué");
  });

  test("el número del estado NO es un progreso", () => {
    /* Van 0,1,2…7 y saltan a 100 y 101; y el 100 («llegó») pasa ANTES que el 7
     * («despachado») porque el mensajero llega primero al local. Tratar el
     * número como avance haría retroceder un pedido entregado a «en camino». */
    esperar(estadoDeCodigo(2).clave).igual("entregado");
    esperar(estadoDeCodigo(7).clave).igual("en_camino");
    esperar(estadoDeCodigo(100).clave).igual("recogiendo");
    esperar(estadoDeCodigo(101).clave).igual("en_camino");
    esperar(estadoDeCodigo(1).clave).igual("cancelado");
    esperar(estadoDeCodigo(6).clave).igual("confirmado");
    esperar(estadoDeCodigo(0).clave).igual("pedido");
    /* Un código que no conocemos no se inventa. */
    esperar(estadoDeCodigo(42)).igual(null);
    esperar(estadoDeCodigo("dos")).igual(null);
    esperar(estadoDeCodigo(null)).igual(null);
  });

  test("todos los códigos documentados están traducidos", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 100, 101]) {
      esperar(!!ESTADOS_ASAP[n]).verdadero(`el código ${n} de ASAP llegaría sin traducir`);
      esperar(String(ESTADOS_ASAP[n].label).trim().length > 0).verdadero();
    }
  });

  test("un envío terminado ya no se toca", () => {
    for (const c of ["entregado", "cancelado", "devuelto", "fallido"]) {
      esperar(envioTerminado(c)).verdadero(`se seguiría preguntando por un envío ${c}`);
    }
    for (const c of ["pedido", "confirmado", "recogiendo", "en_camino", "", null]) {
      esperar(envioTerminado(c)).falso();
    }
  });

  test("un envío cancelado NO cancela el pedido", () => {
    /* El negocio lo puede volver a mandar o llevarlo él. Mezclar las dos cosas
     * llenaría el embudo de pedidos cancelados porque se averió una moto. */
    esperar(estadoDelPedido("cancelado")).igual(null);
    esperar(estadoDelPedido("fallido")).igual(null);
    esperar(estadoDelPedido("devuelto")).igual(null);
    esperar(estadoDelPedido("confirmado")).igual(null);
    /* Y lo que sí mueve el pedido, lo mueve. */
    esperar(estadoDelPedido("en_camino")).igual("en_camino");
    esperar(estadoDelPedido("entregado")).igual("entregado");
  });

  test("«llegó al local» no es «llegó a casa del cliente»", () => {
    /* Las dos palabras son casi iguales y confundirlas le diría al cliente que
     * su pedido llegó cuando el mensajero está todavía en la panadería. */
    esperar(estadoDeAviso("pickupAgentArrived")).igual("recogiendo");
    esperar(estadoDeAviso("deliveryAgentArrived")).igual("en_camino");
    esperar(estadoDeAviso("deliverySuccessful")).igual("entregado");
    esperar(estadoDeAviso("pickupSuccessful")).igual("en_camino");
    /* Y el aviso desconocido no mueve nada. */
    esperar(estadoDeAviso("algoQueNoConocemos")).igual(null);
    esperar(estadoDeAviso(null)).igual(null);
  });

  test("«Cancel» manda sobre la acción", () => {
    /* `deliveryTaskUpdate` con state «Cancel» no es una actualización más: es
     * que nadie va a ir. */
    esperar(estadoDeAvisoConEstado("deliveryTaskUpdate", "Cancel")).igual("cancelado");
    esperar(estadoDeAvisoConEstado("pickupTaskUpdate", "Declined")).igual("fallido");
    esperar(estadoDeAvisoConEstado("deliveryTaskUpdate", "Assigned")).igual("confirmado");
    esperar(estadoDeAvisoConEstado("deliverySuccessful", null)).igual("entregado");
  });

  test("pruebas y producción no comparten dirección", () => {
    esperar(API_ASAP.prueba).contiene("goasap.dev");
    esperar(API_ASAP.produccion).contiene("goasap.app");
    esperar(API_ASAP.prueba === API_ASAP.produccion).falso();
    /* Y ante la duda, PRUEBAS: equivocarse hacia producción saca motos reales
     * a la calle y se las cobra al negocio. */
    esperar(esAmbienteEnvio(null)).igual("prueba");
    esperar(esAmbienteEnvio("Producción")).igual("prueba");
    esperar(esAmbienteEnvio("produccion")).igual("produccion");
  });
});


/**
 * La ubicación del cliente.
 *
 * TODO LO QUE SE PRUEBA AQUÍ ACABA EN UNA MOTO YENDO A UN SITIO. Un enlace que
 * se lee mal, un zoom confundido con una coordenada, una precisión de dos
 * kilómetros aceptada sin decir nada: ninguna de esas cosas da error en
 * pantalla, todas dan un pedido que no llega.
 */
describe("La ubicación del cliente", () => {
  const PIJAO = { lat: 9.0136814, long: -79.4796534 };

  test("se guarda y se vuelve a leer igual", () => {
    const texto = comoRespuesta(PIJAO);
    esperar(texto).igual("9.0136814,-79.4796534");
    esperar(leerUbicacion(texto)).igual(PIJAO);
  });

  test("el chorro de decimales del GPS se recorta a once centímetros", () => {
    /* Un teléfono da quince decimales y los últimos ocho son ruido. Guardar el
     * chorro entero hace que el panel del negocio parezca roto. */
    esperar(comoRespuesta({ lat: 9.013681412345678, long: -79.47965341234567 }))
      .igual("9.0136814,-79.4796534");
  });

  test("un enlace de Google Maps con ?q= se entiende", () => {
    /* Es el que manda WhatsApp al compartir una ubicación: el caso más común
     * de todos en Panamá. */
    esperar(leerUbicacion("https://maps.google.com/maps?q=9.0136814,-79.4796534")).igual(PIJAO);
    /* Y EL NUESTRO TAMBIÉN, que usa `query=`. Es el enlace que le mandamos al
     * negocio por WhatsApp: sin leerlo, el cliente que copia el enlace que le
     * enseñamos y lo vuelve a pegar recibe «no pude leer esa ubicación» con
     * nuestro propio enlace delante. */
    esperar(leerUbicacion(enlaceDeMapa(PIJAO))).igual(PIJAO, "no sabemos leer nuestro propio enlace");
  });

  test("EL ZOOM NO ES UNA COORDENADA", () => {
    /* `@9.0136,-79.4796,17z` trae TRES números y el tercero es el nivel de
     * acercamiento del mapa. Tomar los tres primeros números de la cadena es
     * exactamente cómo el zoom acaba metido dentro de una coordenada. */
    esperar(leerUbicacion("https://www.google.com/maps/@9.0136814,-79.4796534,17z")).igual(PIJAO);
    esperar(leerUbicacion("https://www.google.com/maps/place/PH+Pijao/@9.0136814,-79.4796534,17z/data=!3m1"))
      .igual(PIJAO);
  });

  test("dos números escritos a mano", () => {
    esperar(leerUbicacion("9.0136814, -79.4796534")).igual(PIJAO);
    esperar(leerUbicacion("9.0136814;-79.4796534")).igual(PIJAO);
  });

  test("una frase con números NO es una ubicación", () => {
    /* «Llego en 15,20 minutos» tiene dos números separados por coma y no es
     * una coordenada. Si se colara, la moto saldría hacia el golfo de Guinea. */
    esperar(leerUbicacion("llego en 15,20 minutos")).igual(null);
    esperar(leerUbicacion("apto 3, casa azul")).igual(null);
    esperar(leerUbicacion("")).igual(null);
    esperar(leerUbicacion(null)).igual(null);
  });

  test("el enlace corto se reconoce y se explica, no se traga", () => {
    /* `maps.app.goo.gl/AbC123` no lleva las coordenadas dentro. Aceptarlo en
     * silencio deja al cliente creyendo que mandó su ubicación y al negocio con
     * un pedido que no se puede despachar. */
    esperar(esEnlaceAcortado("https://maps.app.goo.gl/AbC123")).verdadero();
    esperar(leerUbicacion("https://maps.app.goo.gl/AbC123")).igual(null);
    esperar(porQueNoSirve("https://maps.app.goo.gl/AbC123")).contiene("cópiame el enlace");
    /* Y su mensaje NO es el mismo que el de un texto cualquiera: cada motivo
     * tiene su frase, o el cliente no sabe qué hacer. */
    esperar(porQueNoSirve("https://maps.app.goo.gl/AbC123") === porQueNoSirve("hola")).falso();
  });

  test("(0,0) tampoco se cuela por aquí", () => {
    esperar(leerUbicacion("0,0")).igual(null);
    esperar(leerUbicacion("https://maps.google.com/maps?q=0,0")).igual(null);
  });

  test("el enlace del mapa se puede volver a leer", () => {
    /* Es el enlace que se le manda al negocio por WhatsApp. Si un día dejara de
     * poder leerse, el pedido llegaría con una dirección que nadie puede
     * convertir de vuelta en dos números. */
    const enlace = enlaceDeMapa(PIJAO);
    esperar(enlace).contiene("9.0136814,-79.4796534");
    esperar(enlace.startsWith("https://")).verdadero();
  });

  test("una precisión mala se acepta, pero se dice", () => {
    /* Rechazarla dejaría sin poder pedir a quien está en un sótano. Callarla
     * manda la moto a dos cuadras sin que nadie lo sepa. */
    esperar(precisionDudosa(2000)).verdadero();
    esperar(precisionDudosa(12)).falso();
    esperar(precisionDudosa(null)).falso("no la dijo: no se opina");
    esperar(precisionDudosa(0)).falso();
    esperar(comoSeLeeLaPrecision(2000)).contiene("ventana");
    esperar(comoSeLeeLaPrecision(12)).contiene("±12");
    esperar(comoSeLeeLaPrecision(null)).igual("");
  });

  test("un formulario tiene UNA pregunta de mapa, no dos", () => {
    /* Con dos, el cliente rellena una u otra y la moto sale a un sitio o a otro
     * según cuál. La segunda se degrada a texto largo: su respuesta sigue
     * llegando como referencia en vez de perderse. */
    const ps = sanearPreguntas([
      { etiqueta: "Ubicación", tipo: "ubicacion", obligatoria: true },
      { etiqueta: "Otra ubicación", tipo: "ubicacion", obligatoria: false },
    ]);
    esperar(ps.map((p) => p.tipo)).igual(["ubicacion", "parrafo"]);
  });

  test("el tipo «ubicacion» sobrevive al saneo", () => {
    /* Si `sanearPreguntas` no lo conociera lo guardaría como «texto», y el
     * negocio configuraría el mapa y vería una casilla de escribir. */
    const ps = sanearPreguntas([{ etiqueta: "Ubicación", tipo: "ubicacion", obligatoria: true }]);
    esperar(ps[0].tipo).igual("ubicacion");
    /* Y un tipo inventado sigue cayendo a texto. */
    esperar(sanearPreguntas([{ etiqueta: "X", tipo: "holograma" }])[0].tipo).igual("texto");
  });

  test("todos los tipos del catálogo se guardan tal cual", () => {
    /* La lista de tipos que acepta el saneo sale del catálogo. Esta prueba es
     * la que lo obliga: con una copia escrita a mano, el tipo nuevo se guardaría
     * como «texto» sin que nada avisara. */
    for (const t of TIPOS_PREGUNTA) {
      const ps = sanearPreguntas([
        t.valor === "lista"
          ? { etiqueta: `P ${t.valor}`, tipo: t.valor, opciones: ["a", "b"] }
          : { etiqueta: `P ${t.valor}`, tipo: t.valor },
      ]);
      esperar(ps[0].tipo).igual(t.valor, `el tipo «${t.label}» se guardaría como otra cosa`);
    }
  });

  test("del pedido guardado se sacan los dos números y la dirección escrita", () => {
    const preguntas = [
      { id: "nombre", etiqueta: "Nombre completo", tipo: "texto" },
      { id: "direccion", etiqueta: "Dirección de entrega", tipo: "parrafo" },
      { id: "mapa", etiqueta: "Ubicación en el mapa", tipo: "ubicacion" },
    ];
    const respuestas = [
      { id: "nombre", valor: "Alí" },
      { id: "direccion", valor: "Casa azul frente al parque, PH Pijao" },
      { id: "mapa", valor: "9.0136814,-79.4796534" },
    ];
    esperar(ubicacionDeLasRespuestas(preguntas, respuestas)).igual(PIJAO);
    esperar(direccionDeLasRespuestas(preguntas, respuestas))
      .igual("Casa azul frente al parque, PH Pijao");
  });

  test("sin pregunta de mapa no se inventa una ubicación", () => {
    const preguntas = [{ id: "direccion", etiqueta: "Dirección", tipo: "parrafo" }];
    esperar(ubicacionDeLasRespuestas(preguntas, [{ id: "direccion", valor: "9.01,-79.47" }]))
      .igual(null, "una dirección escrita NO es una ubicación aunque parezca dos números");
  });

  test("la dirección se encuentra aunque la tienda la llame de otra forma", () => {
    /* Una tienda real la llama «Nombre PH» y otra «A dónde lo llevamos». Buscar
     * solo «Dirección de entrega» habría funcionado en la tienda que miré y en
     * ninguna otra. */
    const ps = [{ id: "adonde", etiqueta: "A dónde lo llevamos", tipo: "parrafo" }];
    esperar(direccionDeLasRespuestas(ps, [{ id: "adonde", valor: "Multiplaza, local 3" }]))
      .igual("Multiplaza, local 3");
    /* Y si no hay ninguna, se devuelve vacío en vez de inventarse un campo. */
    esperar(direccionDeLasRespuestas([{ id: "n", etiqueta: "Nombre", tipo: "texto" }],
      [{ id: "n", valor: "Alí" }])).igual("");
  });

  test("por chat, «casa azul» NO se guarda como ubicación", () => {
    /* Si se guardara, el pedido se crearía perfecto y sin una sola coordenada.
     * Nadie se enteraría hasta el momento de mandarlo —con el cliente
     * esperando y el paquete armado— y para entonces la conversación terminó
     * hace rato y no hay a quién preguntarle. */
    const q = { id: "mapa", etiqueta: "Ubicación", tipo: "ubicacion", obligatoria: true };
    const antes = { tienda_id: "t", lineas: [], pregunta: 0, respuestas: {} };
    esperar(contestar(antes, q, "casa azul frente al parque")).igual(
      antes, "se guardó una dirección escrita como si fuera una ubicación",
    );
  });

  test("por chat, la ubicación se guarda normalizada venga como venga", () => {
    /* El enlace que pegó uno y los dos números que dictó otro tienen que acabar
     * siendo la misma cosa: quien la lea después no puede tener que saber de
     * cuál de las dos formas viene. */
    const q = { id: "mapa", etiqueta: "Ubicación", tipo: "ubicacion", obligatoria: true };
    const antes = { tienda_id: "t", lineas: [], pregunta: 0, respuestas: {} };
    const conEnlace = contestar(antes, q, "https://maps.google.com/maps?q=9.0136814,-79.4796534");
    const conNumeros = contestar(antes, q, "9.0136814, -79.4796534");
    esperar(conEnlace.respuestas.mapa).igual("9.0136814,-79.4796534");
    esperar(conEnlace.respuestas.mapa).igual(conNumeros.respuestas.mapa);
    esperar(conEnlace.pregunta).igual(1, "no avanzó a la siguiente pregunta");
  });

  test("«pedir la ubicación» es un aviso más, editable por el negocio", () => {
    /* NO SE ESCRIBIÓ UN ENVÍO APARTE a propósito. `avisarDelPedido` ya resuelve
     * lo que no se ve hasta que falla: encontrar la conversación, la ventana de
     * 24 h de WhatsApp, dejarlo escrito en la Bandeja, no repetirlo, y apuntar
     * por qué no salió. Duplicar eso era duplicar los cinco fallos. */
    const m = MOMENTOS.find((x) => x.clave === "pedir_ubicacion");
    esperar(!!m).verdadero("el momento no está en el catálogo: no habría dónde editarlo");
    esperar(m.esEstado).falso("no se alcanza arrastrando la tarjeta: lo dispara el pago");
    esperar(m.activo).verdadero("nacería apagado y el boquete seguiría igual");
    /* Y el texto tiene que decir CÓMO se hace: «mándame tu ubicación» a secas
     * deja a la persona buscando dónde. */
    esperar(m.texto).contiene("📎");
    /* Sin botón: no hay nada que pulsar, la acción está en el clip de WhatsApp. */
    esperar(botonDelAviso("pedir_ubicacion")).igual(null);
    /* Y viene con texto de fábrica, como todos. */
    const a = sanearAvisos({});
    esperar(a.momentos.pedir_ubicacion.texto.length > 0).verdadero();
  });

  test("LA DIRECCIÓN REPARTIDA EN TRES CAMPOS SE ARMA IGUAL", () => {
    /* Este es el formulario de la tienda que de VERDAD está vendiendo. La
     * dirección existe entera y no hay ni un campo llamado «dirección» ni uno
     * de texto largo: buscar el campo de dirección devolvía vacío, y con
     * `desti_address` vacío ASAP rechaza el pedido aunque las coordenadas estén
     * perfectas. Un fallo mudo, en la única tienda real que hay. */
    const preguntas = [
      { id: "nombre_completo", etiqueta: "Nombre completo", tipo: "texto" },
      { id: "telefono", etiqueta: "Teléfono", tipo: "telefono" },
      { id: "nombre_de_ph", etiqueta: "Nombre de PH", tipo: "texto" },
      { id: "numero_interior", etiqueta: "Número Interior:", tipo: "texto" },
      { id: "calle", etiqueta: "Calle:", tipo: "texto" },
    ];
    const respuestas = [
      { id: "nombre_completo", valor: "Alí Buenaño" },
      { id: "telefono", valor: "62159100" },
      { id: "nombre_de_ph", valor: "Torre Mar" },
      { id: "numero_interior", valor: "12B" },
      { id: "calle", valor: "Av. Balboa" },
    ];
    const d = direccionDeLasRespuestas(preguntas, respuestas);
    esperar(d).igual("Nombre de PH: Torre Mar, Número Interior: 12B, Calle: Av. Balboa");
    /* CON SUS ETIQUETAS: «Torre Mar, 12B, Av. Balboa» no le dice al mensajero
     * si el 12B es el piso o la casa. */
    esperar(d).contiene("Nombre de PH:");
    /* Y SIN EL NOMBRE NI EL TELÉFONO: los dos ya viajan en su propio campo de
     * ASAP, y el nombre del cliente en la dirección es ruido. */
    esperar(d.includes("Alí")).falso("el nombre del cliente acabó dentro de la dirección");
    esperar(d.includes("62159100")).falso("el teléfono acabó dentro de la dirección");
  });

  test("«Nombre de PH» SÍ entra: no es la pregunta del nombre", () => {
    /* La regla es la misma que ya usa el pedido para sacar el nombre del
     * cliente: la PRIMERA pregunta que lleva «nombre». Excluir todas las que lo
     * lleven se comería media dirección en Panamá, donde el edificio se llama
     * «Nombre de PH». */
    const ps = [
      { id: "nombre_de_ph", etiqueta: "Nombre de PH", tipo: "texto" },
      { id: "calle", etiqueta: "Calle", tipo: "texto" },
    ];
    /* Aquí «Nombre de PH» ES la primera con «nombre», así que sale — y es
     * correcto: sin otra pregunta de nombre, ésa es la que el pedido usaría. */
    esperar(direccionDeLasRespuestas(ps, [
      { id: "nombre_de_ph", valor: "Torre Mar" }, { id: "calle", valor: "Av. Balboa" },
    ])).igual("Calle: Av. Balboa");
  });

  test("si hay un campo de dirección de verdad, manda ése y no se arma nada", () => {
    const ps = [
      { id: "nombre", etiqueta: "Nombre completo", tipo: "texto" },
      { id: "direccion", etiqueta: "Dirección de entrega", tipo: "parrafo" },
      { id: "apto", etiqueta: "Apto", tipo: "texto" },
    ];
    esperar(direccionDeLasRespuestas(ps, [
      { id: "nombre", valor: "Alí" },
      { id: "direccion", valor: "Casa azul frente al parque" },
      { id: "apto", valor: "3" },
    ])).igual("Casa azul frente al parque");
  });

  test("la ubicación NO se pide a quien ya la dio ni a quien no lleva a domicilio", () => {
    /* Pedírsela a una barbería o a una panadería de mostrador es un mensaje que
     * no sirve para nada — y en WhatsApp cada mensaje cuesta y cada mensaje de
     * más es un chat silenciado. */
    const conMapa = [{ id: "mapa", etiqueta: "Ubicación", tipo: "ubicacion" }];
    const sinMapa = [{ id: "dir", etiqueta: "Dirección", tipo: "parrafo" }];

    esperar(hayQuePedirLaUbicacion({ lat: null, long: null, preguntas: sinMapa }))
      .falso("se le pide la ubicación a una tienda que no lleva a domicilio");
    esperar(hayQuePedirLaUbicacion({ lat: 9.01, long: -79.47, preguntas: conMapa }))
      .falso("se le vuelve a pedir a quien ya la marcó en la tienda");

    /* Y SÍ se pide con cualquiera de las dos señales del negocio. */
    esperar(hayQuePedirLaUbicacion({ lat: null, long: null, preguntas: conMapa })).verdadero();
    esperar(hayQuePedirLaUbicacion({ lat: null, long: null, preguntas: sinMapa, enviosActivos: true }))
      .verdadero();
    /* El cero no es una ubicación puesta: con la columna vacía SÍ hay que pedirla. */
    esperar(hayQuePedirLaUbicacion({ lat: 0, long: 0, preguntas: conMapa })).verdadero();
  });

  test("el negocio recibe un enlace que puede pulsar, no dos números", () => {
    /* «Ubicación: 9.0136814,-79.4796534» en su WhatsApp no le sirve a nadie:
     * ni al que prepara ni al que sale a llevarlo. */
    const texto = textoDelPedido({
      lineas: [{ nombre: "Torta", precio: 1500, cantidad: 1, elegidas: [] }],
      moneda: "$",
      preguntas: [{ id: "mapa", etiqueta: "Ubicación", tipo: "ubicacion", obligatoria: true }],
      respuestas: { mapa: "9.0136814,-79.4796534" },
    });
    esperar(texto).contiene("https://");
    esperar(texto).contiene("9.0136814,-79.4796534");
    esperar(/Ubicaci[oó]n: 9\.0136814/.test(texto)).falso("le llegarían los números pelados");
  });
});


/**
 * Llega una ubicación por WhatsApp: ¿a qué pedido va?
 *
 * CUATRO RESPUESTAS Y TRES SON FÁCILES DE EQUIVOCAR. Metida dentro del motor no
 * se podría probar ninguna: el motor corre en Deno, contra WhatsApp de verdad.
 */
describe("La ubicación que llega por el chat", () => {
  const ahora = new Date("2026-09-07T18:00:00Z");
  const hace = (h) => new Date(ahora.getTime() - h * 3600_000).toISOString();

  const abierto = (extra = {}) => ({
    id: "p1", numero: 1042, estado: "recibido", created_at: hace(2),
    entrega_lat: null, entrega_long: null, envio_id: null, ...extra,
  });

  test("va al pedido abierto que la está esperando", () => {
    const r = aQuePedidoVa([abierto()], ahora);
    esperar(r.que).igual("guardar");
    esperar(r.pedido.numero).igual(1042);
    esperar(r.corrige).falso();
    esperar(r.mensaje).contiene("1042", "el cliente no sabría a qué pedido se guardó");
  });

  test("SE ELIGE EL QUE LA NECESITA, NO EL MÁS NUEVO", () => {
    /* Parece lo mismo y no lo es. Con un pedido de ayer sin ubicación y uno de
     * hoy que ya la trae, quedarse con el más nuevo la pisaría encima de una
     * que estaba bien y dejaría el de ayer igual de parado. */
    const r = aQuePedidoVa([
      { ...abierto(), id: "hoy", numero: 99, created_at: hace(1), entrega_lat: 9.01, entrega_long: -79.47 },
      { ...abierto(), id: "ayer", numero: 98, created_at: hace(20) },
    ], ahora);
    esperar(r.que).igual("guardar");
    esperar(r.pedido.id).igual("ayer", "se pisó una ubicación buena y el pedido parado siguió parado");
  });

  test("entre los que la necesitan, manda el más nuevo", () => {
    const r = aQuePedidoVa([
      { ...abierto(), id: "viejo", created_at: hace(30) },
      { ...abierto(), id: "nuevo", created_at: hace(1) },
    ], ahora);
    esperar(r.pedido.id).igual("nuevo");
  });

  test("si ninguno la necesita, es una corrección y SE DICE", () => {
    /* «Me equivoqué, esta es mi casa» es un caso real. Pisar una ubicación en
     * silencio es cómo un pedido acaba en la dirección de otro día. */
    const r = aQuePedidoVa([abierto({ entrega_lat: 9.01, entrega_long: -79.47 })], ahora);
    esperar(r.que).igual("guardar");
    esperar(r.corrige).verdadero();
    esperar(r.mensaje).contiene("cambié");
  });

  test("UNA UBICACIÓN NUEVA NO CAMBIA UN ENVÍO QUE YA SALIÓ", () => {
    /* El mensajero va en la calle con la dirección de antes. Guardarla y callar
     * dejaría al negocio viendo en pantalla una ubicación que no es a la que va
     * la moto. */
    const r = aQuePedidoVa([abierto({ envio_id: "23949" })], ahora);
    esperar(r.que).igual("nada");
    esperar(r.mensaje).contiene("camino");
  });

  test("un pedido entregado o cancelado ya no espera nada", () => {
    for (const estado of ["entregado", "cancelado"]) {
      esperar(aQuePedidoVa([abierto({ estado })], ahora).que).igual(
        "nada", `un pedido ${estado} se quedó con la ubicación nueva`,
      );
    }
  });

  test("no se le cambia el destino a un pedido de hace tres semanas", () => {
    /* Quien manda su ubicación por costumbre —o le da al botón sin querer— no
     * puede acabar moviendo un pedido que quedó a medias hace un mes. */
    esperar(aQuePedidoVa([abierto({ created_at: hace(24 * 21) })], ahora).que).igual("nada");
    /* Justo dentro de la ventana sí entra. */
    esperar(aQuePedidoVa([abierto({ created_at: hace(VENTANA_UBICACION_HORAS - 1) })], ahora).que).igual("guardar");
    esperar(aQuePedidoVa([abierto({ created_at: hace(VENTANA_UBICACION_HORAS + 1) })], ahora).que).igual("nada");
  });

  test("una fecha ilegible no entra", () => {
    /* `Date.parse` devuelve NaN y toda comparación con NaN es falsa: un filtro
     * escrito al revés la dejaría pasar sin que nada avisara. */
    esperar(aQuePedidoVa([abierto({ created_at: "el martes" })], ahora).que).igual("nada");
    esperar(aQuePedidoVa([abierto({ created_at: null })], ahora).que).igual("nada");
  });

  test("sin pedidos, se contesta igual y sin mentir", () => {
    const r = aQuePedidoVa([], ahora);
    esperar(r.que).igual("nada");
    esperar(r.mensaje.trim().length > 0).verdadero("el cliente mandó su ubicación y no recibió nada");
  });

  test("lo que manda WhatsApp se lee, y (0,0) no", () => {
    const u = ubicacionDelMensaje({ latitude: 9.0136814, longitude: -79.4796534 });
    esperar(u.punto).igual({ lat: 9.0136814, long: -79.4796534 });
    esperar(u.nombre).igual("", "«mi ubicación actual» no trae nombre y eso es lo normal");

    const conNombre = ubicacionDelMensaje({
      latitude: 8.9853921, longitude: -79.5131792, name: "Multiplaza", address: "Panamá",
    });
    esperar(conNombre.nombre).contiene("Multiplaza");

    esperar(ubicacionDelMensaje({ latitude: 0, longitude: 0 })).igual(null);
    esperar(ubicacionDelMensaje({})).igual(null);
    esperar(ubicacionDelMensaje(null)).igual(null);
    esperar(ubicacionDelMensaje({ latitude: 200, longitude: -79 })).igual(null);
  });
});


/**
 * Los correos que escribe la plataforma.
 *
 * UN CORREO ES LO ÚNICO DEL PRODUCTO QUE NO SE PUEDE CORREGIR. Una pantalla mal
 * escrita se arregla y nadie se entera; un correo con el nombre mal o un hueco
 * sin rellenar ya está en la bandeja de un cliente para siempre.
 */
describe("Correos de la plataforma", () => {
  const PANEL = "https://platform.demandu.tech/dashboard";

  test("nunca sale un hueco vacío en el saludo", () => {
    /* «Hola, ,» es el error clásico de las plantillas con variables, y se ve en
     * la bandeja del cliente antes que en ninguna otra parte. */
    esperar(saludo(null)).igual("Hola");
    esperar(saludo("")).igual("Hola");
    esperar(saludo("   ")).igual("Hola");
    esperar(saludo("Darwin Bracho")).igual("Hola, Darwin");
  });

  test("solo el primer nombre", () => {
    /* «Hola, María José Rodríguez de la Guardia» no lo escribe nadie que
     * conozca a María. */
    esperar(primerNombre("María José Rodríguez de la Guardia")).igual("María");
    esperar(primerNombre("Elsie Y Molina A")).igual("Elsie");
  });

  test("un teléfono NO es un nombre", () => {
    /* Un contacto sin nombre se guarda con su número. «Hola, 50761234567» es
     * peor que no saludar. */
    esperar(primerNombre("50761234567")).igual("");
    esperar(primerNombre("+507 6123-4567")).igual("");
    esperar(saludo("+507 6123-4567")).igual("Hola");
  });

  test("un nombre con HTML no rompe el correo", () => {
    /* El nombre viene de Facebook o de un formulario: no se puede confiar en
     * que sea texto. */
    const c = correoDeBienvenida({ nombre: "<script>x</script>", negocio: "Pastelería & Co", panel: PANEL });
    esperar(c.html.includes("<script>")).falso("se coló una etiqueta dentro del correo");
    esperar(c.html).contiene("Pastelería &amp; Co");
  });

  test("sin negocio, el asunto sigue siendo una frase", () => {
    /* «Bienvenido a Demandu, » o « ya está en Demandu» son de las cosas que se
     * notan en la bandeja de entrada y en ninguna otra parte.
     *
     * NO SE COMPRUEBA EL TEXTO EXACTO A PROPÓSITO: ese texto ahora se edita
     * desde el superadmin, así que fijarlo aquí sería una prueba que rompe cada
     * vez que alguien corrige una coma. Lo que no puede cambiar es que la frase
     * esté entera. */
    const sin = correoDeBienvenida({ nombre: "Darwin", negocio: null, panel: PANEL });
    esperar(/,\s*$/.test(sin.asunto)).falso("el asunto acaba en coma");
    esperar(sin.asunto.trim().length > 10).verdadero("el asunto se quedó en nada");
    esperar(/^\s|\s{2}/.test(sin.asunto)).falso("quedó un agujero donde iba el negocio");
    /* Y la mayúscula inicial: «tu negocio ya está…» delata la plantilla. */
    esperar(/^[A-ZÁÉÍÓÚÑ]/.test(sin.asunto)).verdadero("el asunto empieza en minúscula");

    const con = correoDeBienvenida({ nombre: "Darwin", negocio: "Ventas de zapatos", panel: PANEL });
    esperar(con.asunto).contiene("Ventas de zapatos");
  });

  test("la bienvenida dice QUÉ HACER y lleva a hacerlo", () => {
    /* Un correo de bienvenida que solo saluda es un correo que nadie abre dos
     * veces. El momento del alta es el único en que alguien va a hacer lo que
     * le digas, y lo que hace falta es UNA cosa: conectar su WhatsApp. */
    const c = correoDeBienvenida({ nombre: "Darwin", negocio: "Ventas de zapatos", panel: PANEL });
    esperar(c.html).contiene("WhatsApp");
    esperar(c.html).contiene(PANEL);
    esperar(c.texto).contiene(PANEL);
  });

  test("siempre va la versión de texto plano, y no vacía", () => {
    /* Hay clientes de correo que solo leen esa parte, y los filtros de spam
     * desconfían de un correo que solo trae HTML. */
    const c = correoDeBienvenida({ nombre: null, negocio: null, panel: PANEL });
    esperar(c.texto.trim().length > 50).verdadero("el texto plano se quedó vacío o casi");
    esperar(c.texto.includes("<")).falso("el texto plano lleva HTML dentro");
  });

  test("no queda ni un hueco de plantilla sin rellenar", () => {
    /* La forma más rápida de mandar un correo que diga «Hola {nombre}» es
     * dejarse un marcador. Se comprueba con los datos más pobres posibles. */
    for (const c of [
      correoDeBienvenida({ nombre: null, negocio: null, panel: PANEL }),
      correoDeBienvenida({ nombre: "", negocio: "", panel: PANEL }),
      correoDelEquipo({ asunto: "Hola", mensaje: "Un mensaje" }),
    ]) {
      for (const trozo of [c.asunto, c.html, c.texto]) {
        esperar(/\{\{|\}\}|\{nombre\}|\{negocio\}|undefined|null/.test(trozo)).falso(
          `quedó un hueco sin rellenar: ${trozo.slice(0, 80)}`,
        );
      }
    }
  });

  test("lo que escribe el equipo se respeta, pero no puede meter HTML", () => {
    const c = correoDelEquipo({
      asunto: "Sobre tu cuenta",
      mensaje: "Hola,\n\nTe escribo por <esto>.",
    });
    esperar(c.html).contiene("&lt;esto&gt;");
    /* Los saltos de línea SÍ se respetan: sin eso, un mensaje de tres párrafos
     * llega como un muro de texto. */
    esperar(c.html).contiene("<br />");
    esperar(c.asunto).igual("Sobre tu cuenta");
  });

  test("no se manda un correo sin asunto o sin cuerpo", () => {
    /* Sin asunto llega como «(sin asunto)» y se lee como spam. Sin cuerpo es
     * peor: el cliente lo abre, no hay nada, y escribe preguntando qué era.
     * Los dos son irreversibles. */
    esperar(loQueFaltaParaEscribir({ para: "a@b.com", asunto: "Hola", mensaje: "Qué tal" })).igual([]);
    esperar(loQueFaltaParaEscribir({ para: "a@b.com", asunto: "", mensaje: "Qué tal" }).length).igual(1);
    esperar(loQueFaltaParaEscribir({ para: "a@b.com", asunto: "Hola", mensaje: "  " }).length).igual(1);
    esperar(loQueFaltaParaEscribir({ para: "", asunto: "Hola", mensaje: "Qué tal" }).length).igual(1);
    esperar(loQueFaltaParaEscribir({ para: "no-es-correo", asunto: "Hola", mensaje: "Qué tal" }).length).igual(1);
  });

  test("el logo se ve con imágenes Y sin imágenes", () => {
    /* Outlook bloquea las imágenes por defecto y Gmail lo hace con remitentes
     * desconocidos. Una cabecera que es SOLO una imagen le llega a mucha gente
     * como un recuadro roto — y un correo sin marca que habla de tu cuenta se
     * lee como phishing. El `alt` es lo que salva ese caso. */
    const c = correoDeBienvenida({ nombre: "Darwin", negocio: "Ventas de zapatos", panel: "https://x/y" });
    esperar(c.html).contiene(LOGO);
    esperar(c.html).contiene('alt="Demandu"');

    /* Y el `alt` lleva los estilos del texto encima, para que cuando la imagen
     * no cargue el cliente pinte la palabra con la tipografía del logotipo en
     * vez de con la de por defecto. */
    const etiqueta = c.html.slice(c.html.indexOf("<img"), c.html.indexOf("/>", c.html.indexOf("<img")));
    esperar(etiqueta).contiene("font-weight:800");
    esperar(etiqueta).contiene("color:#ffffff");
  });

  test("la dirección del logo es ABSOLUTA", () => {
    /* Un correo no tiene página desde la que colgar una ruta relativa: `/logo.png`
     * en una bandeja de entrada no apunta a ninguna parte. */
    esperar(LOGO.startsWith("https://")).verdadero("el logo del correo no se vería en ninguna bandeja");
    esperar(LOGO).contiene("demandu-logo-white");
  });

  test("el logo es el BLANCO, porque el sobre es oscuro", () => {
    /* El fondo del correo es #0b0d1a. El logo negro sobre eso es un rectángulo
     * invisible, y no se nota hasta que llega a un cliente de verdad. */
    esperar(LOGO.includes("white")).verdadero();
    esperar(/black|color\.png/.test(LOGO)).falso("el logo no contrasta con el fondo del correo");
  });

  test("el remitente sale del subdominio, no del dominio raíz", () => {
    /* Si un cliente marca como spam un correo de la plataforma, el golpe se lo
     * lleva `envios.demandu.tech`. La reputación del dominio raíz es la que
     * hace que lleguen los correos que escribe una persona desde Google
     * Workspace, y esas dos no deben tocarse. */
    esperar(REMITENTE).contiene("envios.demandu.tech");
    esperar(/@demandu\.tech>/.test(REMITENTE)).falso(
      "el remitente sale del dominio raíz: un spam de la plataforma dañaría el correo de la empresa",
    );
  });
});

describe("El texto del correo se edita sin publicar", () => {
  const PANEL = "https://platform.demandu.tech/dashboard";
  const CLIENTE = { nombre: "Darwin Bracho", negocio: "Ventas de zapatos" };

  test("lo que alguien escriba en la pantalla es lo que recibe el cliente", () => {
    /* Si no fuera así, la pantalla sería un formulario decorativo — y peor:
     * alguien creería haber cambiado el correo y seguiría saliendo el viejo. */
    const c = correoDeBienvenida({
      ...CLIENTE,
      panel: PANEL,
      plantilla: {
        asunto: "Bienvenido a bordo, {nombre}",
        titulo: "{negocio} ya puede vender por WhatsApp",
        cuerpo: "{saludo}. Esto lo escribió una persona.",
        boton: "Empezar",
      },
    });
    esperar(c.asunto).igual("Bienvenido a bordo, Darwin");
    esperar(c.html).contiene("Ventas de zapatos ya puede vender por WhatsApp");
    esperar(c.html).contiene("Hola, Darwin. Esto lo escribió una persona.");
    esperar(c.html).contiene("Empezar");
    /* Y el texto plano también, que es el que leen algunos clientes de correo. */
    esperar(c.texto).contiene("Esto lo escribió una persona.");
  });

  test("UN CAMPO VACÍO NO MANDA EL CORREO EN BLANCO", () => {
    /* Es el fallo que convierte una pantalla de edición en un incidente:
     * alguien borra el asunto para reescribirlo, guarda sin querer, y a partir
     * de ese momento cada cliente nuevo recibe un correo «(sin asunto)» con el
     * cuerpo vacío. Vacío significa «usa el del código», no «manda nada». */
    const vacia = correoDeBienvenida({
      ...CLIENTE,
      panel: PANEL,
      plantilla: { asunto: "", titulo: "   ", cuerpo: "", boton: null },
    });
    const sinPlantilla = correoDeBienvenida({ ...CLIENTE, panel: PANEL });
    esperar(vacia.asunto).igual(sinPlantilla.asunto);
    esperar(vacia.html).igual(sinPlantilla.html);
    esperar(vacia.asunto.trim().length > 5).verdadero("se quedó sin asunto");
    esperar(vacia.html).contiene("WhatsApp");

    /* Y campo a campo: uno vacío no arrastra a los otros. */
    const media = laPlantilla({ asunto: "Solo cambio esto", cuerpo: "" });
    esperar(media.asunto).igual("Solo cambio esto");
    esperar(media.cuerpo).igual(BIENVENIDA_POR_DEFECTO.cuerpo);
  });

  test("la base que no contesta no deja al cliente sin correo", () => {
    /* `leerPlantilla` devuelve `null` cuando la tabla no está, la fila no
     * existe o la base no responde. Eso NO puede parar la bienvenida: el
     * cliente prefiere el correo de siempre a ninguno. */
    const c = correoDeBienvenida({ ...CLIENTE, panel: PANEL, plantilla: null });
    esperar(c.asunto.trim().length > 5).verdadero();
    esperar(c.html).contiene("WhatsApp");
  });

  test("NINGÚN HUECO QUEDA ABIERTO NI DEJA UN AGUJERO", () => {
    /* «Hola, {nombre}» —el hueco sin rellenar— y «Hola, .» —el hueco relleno
     * con nada— son los dos errores clásicos de las plantillas, y los dos se
     * ven en la bandeja del cliente antes que en ninguna otra parte.
     *
     * Se prueban TODOS los huecos del catálogo contra los datos más pobres
     * posibles: así, el día que alguien añada uno nuevo a `HUECOS` sin
     * enseñarle a `rellenar` qué hacer con él, esta prueba lo cuenta. */
    const pobres = [
      { nombre: null, negocio: null },
      { nombre: "", negocio: "" },
      { nombre: "   ", negocio: "  " },
      { nombre: "50761234567", negocio: "Tienda" },
    ];
    for (const h of HUECOS) {
      for (const datos of pobres) {
        const salida = rellenarHuecos(`Antes ${h.clave}, después.`, datos);
        esperar(salida.includes(h.clave)).falso(`el hueco ${h.clave} no se rellenó: ${salida}`);
        esperar(salida).contiene("después.");
        esperar(/,\s*[.,]/.test(salida)).falso(`quedó una coma colgando: ${salida}`);
        esperar(/\s{2,}/.test(salida)).falso(`quedó un agujero de espacios: ${salida}`);
        esperar(salida.includes("undefined") || salida.includes("null")).falso(salida);
      }
    }
  });

  test("sin nombre no queda «Hola, .»", () => {
    esperar(rellenarHuecos("{saludo}. Tu cuenta ya está.", { nombre: null, negocio: "X" })).igual(
      "Hola. Tu cuenta ya está.",
    );
    esperar(rellenarHuecos("Hola, {nombre}. Qué tal.", { nombre: "", negocio: "X" })).igual("Hola. Qué tal.");
  });

  test("sin negocio se dice «tu negocio», y no un hueco", () => {
    /* Vacío dejaría « ya está en Demandu». Se elige una palabra que funcione en
     * la frase, y con la mayúscula puesta si el hueco iba al principio. */
    esperar(rellenarHuecos("{negocio} ya está en Demandu", { negocio: null })).igual("Tu negocio ya está en Demandu");
    esperar(rellenarHuecos("Creada para {negocio}.", { negocio: "  " })).igual("Creada para tu negocio.");
  });

  test("EL CUERPO ESCRITO A MANO NO PUEDE METER HTML", () => {
    /* Es la razón de que el cuerpo se guarde como texto llano. Quien edita el
     * correo no escribe HTML: escribe palabras. Si pudiera colar una etiqueta,
     * podría colar un enlace a otro sitio en un correo que sale con nuestro
     * nombre y nuestro dominio verificado — que es exactamente lo que hace un
     * phishing bien hecho. */
    const c = correoDeBienvenida({
      ...CLIENTE,
      panel: PANEL,
      plantilla: { cuerpo: 'Pulsa <a href="http://malo.com">aquí</a> <script>robar()</script>' },
    });
    esperar(c.html.includes("<script>")).falso("se coló una etiqueta en el cuerpo del correo");
    esperar(c.html.includes("<a href=\"http://malo.com\"")).falso("se coló un enlace ajeno");
    esperar(c.html).contiene("&lt;a href=");

    /* Y por el título y el asunto tampoco. */
    const d = correoDeBienvenida({
      ...CLIENTE,
      panel: PANEL,
      plantilla: { titulo: "<img src=x onerror=alert(1)>" },
    });
    esperar(d.html.includes("onerror=alert(1)>")).falso("se coló una etiqueta en el título");
  });

  test("los párrafos y la negrita SÍ se respetan", () => {
    /* Sin esto, un mensaje de tres párrafos llega como un muro de texto. Son
     * las dos únicas cosas que se interpretan, y se interpretan DESPUÉS de
     * escapar: por eso no abren la puerta a nada más. */
    const html = cuerpoEnHtml("Primero.\n\nSegundo con *negrita*.");
    esperar(html).contiene("<br /><br />");
    esperar(html).contiene("<b style=");
    esperar(html).contiene("negrita</b>");
    esperar(html.includes("*")).falso("los asteriscos se quedaron a la vista");

    /* Un asterisco suelto no puede romper el correo ni abrir una etiqueta. */
    const suelto = cuerpoEnHtml("Cuesta 5*3 pesos");
    esperar(suelto).contiene("5*3");
    esperar(suelto.includes("<b")).falso();
  });

  test("el texto plano dice lo mismo que el HTML, sin los asteriscos", () => {
    /* Si el texto plano se escribiera aparte, el día que alguien cambie el
     * correo desde la pantalla cambiaría uno y no el otro — y quien lea la
     * versión de texto recibiría el mensaje de antes sin que nadie se entere. */
    const c = correoDeBienvenida({
      ...CLIENTE,
      panel: PANEL,
      plantilla: { cuerpo: "Hola. Tienes *14 días* de prueba." },
    });
    esperar(c.texto).contiene("Tienes 14 días de prueba.");
    esperar(c.texto.includes("*")).falso("los asteriscos llegaron al texto plano");
    esperar(c.texto.includes("<")).falso("el texto plano lleva HTML dentro");
    esperar(c.texto).contiene(PANEL);
  });

  test("el armazón NO se puede editar desde la pantalla", () => {
    /* Solo hay cuatro campos de texto. El logo, los colores, la caja y el pie
     * se quedan en el código a propósito: un editor con el que se puede romper
     * el HTML del correo de todos los clientes desde el navegador, sin pruebas
     * y sin revisión, es un editor que un día rompe el correo de todos los
     * clientes. */
    const c = correoDeBienvenida({
      ...CLIENTE,
      panel: PANEL,
      plantilla: { asunto: "x", titulo: "y", cuerpo: "z", boton: "w" },
    });
    esperar(c.html).contiene(LOGO);
    esperar(c.html).contiene('alt="Demandu"');
    esperar(c.html).contiene("demandu.tech");
    /* Y el botón sigue llevando al panel, diga lo que diga por fuera. */
    esperar(c.html).contiene(`href="${PANEL}"`);
  });
});

describe("ASAP: su documentación oficial, ya no mis deducciones", () => {
  /* ───────────────────────────────────────────────────────────────────────────
   * Estas pruebas fijan lo que dicen SUS PDF: «Fetch Order Status / Log» y
   * «ASAP Webhooks». Hasta ahora la tabla de estados y la de avisos salían de
   * lo que pude deducir. Coincidían — pero coincidir y estar comprobado no es
   * lo mismo, y el `delivery_id` ya demostró lo que cuesta la diferencia.
   * ─────────────────────────────────────────────────────────────────────────── */

  test("los cinco estados que documentan, con su mensaje literal", () => {
    /* Copiados de su PDF. Cada uno trae el `status_message` que ELLOS mandan,
     * así que si mañana cambiamos una etiqueta y deja de significar lo mismo
     * que su mensaje, esto lo canta. */
    const SUYOS = [
      { delivery_status: 0, status_message: "Order Placed", clave: "pedido" },
      { delivery_status: 6, status_message: "Order Confirmed", clave: "confirmado" },
      { delivery_status: 7, status_message: "Order Dispatched", clave: "en_camino" },
      { delivery_status: 2, status_message: "Order Completed", clave: "entregado" },
      { delivery_status: 1, status_message: "Order Cancelled", clave: "cancelado" },
    ];
    for (const e of SUYOS) {
      esperar(leerEstado({ status: true, ...e })?.clave).igual(
        e.clave,
        `su «${e.status_message}» (${e.delivery_status}) no es lo que creemos`,
      );
    }
  });

  test("EL 100 NO ES «LLEGÓ A CASA DEL CLIENTE», Y ESO CAMBIA EL DISEÑO", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * Su propio `delivery_log` de una orden completada, en orden real:
     *
     *     0   CONFIRMING_ORDER   20:19:24
     *     6   CONFIRMED          20:20:57
     *     100 Driver has ARRIVED 20:22:34   ← llegó AL LOCAL
     *     100 Driver has ARRIVED 20:23:07   ← el MISMO código otra vez
     *     7   DISPATCHED         20:23:13
     *     101 Driver has STARTED 20:23:13
     *     2   COMPLETED          20:24:16
     *
     * Dos cosas que no se ven leyendo la tabla de códigos:
     *
     * 1. NO ES UNA PROGRESIÓN. El 100 ocurre ANTES que el 7. Ordenar por el
     *    número para saber «cuál es más avanzado» daría un embudo al revés.
     * 2. EL 100 SALE DOS VECES Y SIGNIFICA COSAS DISTINTAS: llegó al local y
     *    llegó a casa del cliente. Preguntando el estado NO se pueden
     *    distinguir. El webhook SÍ: `pickupAgentArrived` y
     *    `deliveryAgentArrived` son avisos distintos.
     *
     * Por eso avisar al cliente «tu pedido está llegando» NO se puede hacer
     * consultando el estado: le llegaría cuando el mensajero está todavía en la
     * panadería. Es el argumento de peso para usar el webhook y no un bucle.
     * ───────────────────────────────────────────────────────────────────────── */
    const LOG = [0, 6, 100, 100, 7, 101, 2];
    const claves = LOG.map((c) => estadoDeCodigo(c)?.clave);
    esperar(claves).igual(["pedido", "confirmado", "recogiendo", "recogiendo", "en_camino", "en_camino", "entregado"]);

    /* El 100 llega antes que el 7: el número NO ordena. */
    esperar(LOG.indexOf(100) < LOG.indexOf(7)).verdadero(
      "si el 100 viniera después del 7, ordenar por el número sería válido y esta regla sobra",
    );

    /* Y la prueba de que consultando el estado no se distinguen: el mismo
     * código da la misma respuesta las dos veces, mientras que los dos avisos
     * del webhook sí se distinguen. */
    esperar(estadoDeAviso("pickupAgentArrived")).igual("recogiendo");
    esperar(estadoDeAviso("deliveryAgentArrived")).igual("en_camino");
    esperar(estadoDeAviso("pickupAgentArrived") !== estadoDeAviso("deliveryAgentArrived")).verdadero(
      "los dos «llegó» se confundieron: le diríamos al cliente que su pedido llegó estando el mensajero en el local",
    );
  });

  test("las diez acciones del webhook son las diez suyas, ni una más ni una menos", () => {
    /* De su PDF «ASAP Webhooks». Si ellos añaden una y nosotros no, ese aviso
     * llega y no mueve nada — en silencio, que es como se pierden los estados. */
    const SUYAS = [
      "pickupRequestReceived", "deliveryRequestReceived",
      "pickupTaskUpdate", "deliveryTaskUpdate",
      "pickupStarted", "pickupAgentArrived", "pickupSuccessful",
      "deliveryAgentStarted", "deliveryAgentArrived", "deliverySuccessful",
    ];
    for (const a of SUYAS) {
      esperar(estadoDeAviso(a) !== null).verdadero(`no conocemos el aviso «${a}»`);
    }
    esperar(Object.keys(AVISOS_ASAP).length).igual(
      SUYAS.length,
      "nuestra tabla tiene acciones que ASAP no manda, o le faltan de las que sí",
    );
  });

  test("«Cancel» y «Declined» mandan sobre la acción", () => {
    /* Un `deliveryTaskUpdate` con `state: "Cancel"` no es una actualización
     * cualquiera: es que nadie va a ir. Leer solo la acción lo dejaría en
     * «confirmado» y el pedido esperaría a un mensajero que ya dijo que no. */
    esperar(estadoDeAvisoConEstado("deliveryTaskUpdate", "Assigned")).igual("confirmado");
    esperar(estadoDeAvisoConEstado("deliveryTaskUpdate", "Cancel")).igual("cancelado");
    esperar(estadoDeAvisoConEstado("deliveryTaskUpdate", "Declined")).igual("fallido");
    /* Incluso sobre una acción que hablaba de éxito. */
    esperar(estadoDeAvisoConEstado("deliverySuccessful", "Cancel")).igual("cancelado");
  });

  test("un aviso desconocido NO inventa un estado", () => {
    /* Si mañana mandan `driverTookANap`, lo que no puede pasar es que el pedido
     * se mueva a cualquier sitio. Se queda donde estaba. */
    esperar(estadoDeAviso("driverTookANap")).igual(null);
    esperar(estadoDeAviso("")).igual(null);
    esperar(estadoDeAviso(null)).igual(null);
  });

  test("el aviso trae NUESTRO código de pedido, y por eso se puede casar", () => {
    /* Su cuerpo de webhook:
     *
     *   {"commerce":"5fc17…","order_id":18002,"external_order_id":"1614611272",
     *    "source":"asap-webhooks","action":"deliveryRequestReceived",
     *    "date":"2021-03-03T01:51:59.683Z","payload":{}}
     *
     * `external_order_id` es lo que NOSOTROS mandamos como `codigo` del pedido.
     * Es la forma de saber de qué pedido habla un aviso sin depender de haber
     * guardado bien su `order_id` — el mismo dato que casi perdemos. */
    const b = cuerpoDeOrden(
      { user_token: "t", shared_secret: "s", telefono: "50760000000",
        origen_direccion: "Local", origen_lat: 9.01, origen_long: -79.5, vehiculo: "bike" },
      { codigo: "1614611272", entrega_direccion: "Casa", entrega_lat: 9.02, entrega_long: -79.46,
        cliente_nombre: "Ana", cliente_telefono: "50761111111" },
    );
    esperar(b.external_order_id).igual("1614611272");
  });
});

describe("Buscar una dirección sin que la factura se dispare", () => {
  test("NO SE PREGUNTA POR UNA O DOS LETRAS", () => {
    /* Cada intento se paga aunque no sirva de nada, y con dos letras Google
     * devuelve las calles más famosas del país. La cuarta letra es donde una
     * sugerencia empieza a valer algo. */
    esperar(valeLaPenaBuscar("")).falso();
    esperar(valeLaPenaBuscar("v")).falso();
    esperar(valeLaPenaBuscar("vía")).falso();
    esperar(valeLaPenaBuscar("vía ")).falso("los espacios no cuentan como letras");
    esperar(valeLaPenaBuscar("vía e")).verdadero();
    esperar(LETRAS_MINIMAS >= 3).verdadero("el mínimo se bajó tanto que ya no ahorra nada");
  });

  test("y se para a las doce", () => {
    /* Una dirección se encuentra en tres o cuatro intentos. En la doce, o el
     * sitio no está en Google o alguien está jugando con el campo — y en los
     * dos casos seguir preguntando solo suma factura. */
    esperar(valeLaPenaBuscar("Vía España 100", MAX_POR_BUSQUEDA - 1)).verdadero();
    esperar(valeLaPenaBuscar("Vía España 100", MAX_POR_BUSQUEDA)).falso();
    esperar(valeLaPenaBuscar("Vía España 100", 999)).falso();
  });

  test("se espera a que deje de escribir", () => {
    /* Sin espera, una dirección de treinta letras son treinta llamadas de pago
     * —y la mayoría por respuestas que la tecla siguiente borra antes de que
     * nadie las lea. */
    esperar(ESPERA_MS >= 250).verdadero("la espera es tan corta que vuelve a preguntar por cada tecla");
    esperar(ESPERA_MS <= 600).verdadero("tanta espera se nota como lentitud");
  });

  test("EL IDENTIFICADOR DE BÚSQUEDA ES LA MITAD DE LA FACTURA", () => {
    /* Google agrupa las llamadas con el mismo identificador y las cobra como
     * UNA búsqueda. Sin él, cada tecla se cobra suelta. Y dos búsquedas no
     * pueden compartirlo: dejaría de agrupar lo que toca. */
    const a = nuevaBusqueda();
    const b = nuevaBusqueda();
    esperar(a.length > 8).verdadero("el identificador se quedó en nada");
    esperar(a === b).falso("dos búsquedas comparten identificador");
    esperar(cuerpoDeSugerencias({ texto: "Vía España", busqueda: a }).sessionToken).igual(a);
  });

  test("se sesga a Panamá pero no se prohíbe el resto", () => {
    /* Prohibir daría un «no encuentro tu dirección» sin explicación a quien
     * pide desde fuera, que es raro pero pasa. */
    const c = cuerpoDeSugerencias({ texto: "Vía España", busqueda: "x" });
    esperar(c.includedRegionCodes).igual(["pa"]);
    esperar(c.languageCode).igual("es");
  });

  test("solo se piden tres campos, y eso es dinero", () => {
    /* Google cobra por familias: la dirección y el punto entran en la tarifa
     * barata; añadir horarios, fotos o reseñas —que no usamos— salta a una
     * tarifa tres veces mayor por la MISMA llamada. */
    esperar(CAMPOS_DEL_PUNTO).contiene("location");
    esperar(CAMPOS_DEL_PUNTO).contiene("formattedAddress");
    for (const caro of ["photos", "reviews", "regularOpeningHours", "rating", "priceLevel", "*"]) {
      esperar(CAMPOS_DEL_PUNTO.includes(caro)).falso(`se pide «${caro}», que salta a la tarifa cara`);
    }
  });

  test("las sugerencias se leen, y las rotas se tiran", () => {
    const r = leerSugerencias({
      suggestions: [
        { placePrediction: { placeId: "a1", structuredFormat: { mainText: { text: "Súper 99" }, secondaryText: { text: "Vía España" } } } },
        { placePrediction: { placeId: "", text: { text: "Sin id" } } },
        { queryPrediction: { text: { text: "no es un sitio" } } },
        { placePrediction: { placeId: "a2", text: { text: "PH Pijao" } } },
      ],
    });
    esperar(r.map((x) => x.id)).igual(["a1", "a2"]);
    esperar(r[0].texto).igual("Súper 99");
    esperar(r[0].detalle).igual("Vía España");
    esperar(leerSugerencias(null)).igual([]);
    esperar(leerSugerencias({})).igual([]);
  });

  test("EL CERO OTRA VEZ: (0,0) ES UN PUNTO REAL", () => {
    /* `Number(null)` y `Number("")` son 0, y (0,0) está en el Atlántico frente
     * a Ghana. Una respuesta a la que le falte la latitud diría tenerla, el
     * pedido saldría con coordenadas «válidas» y la moto se pediría para el
     * golfo de Guinea. Es el mismo cero que ya mordió tres veces en ASAP. */
    esperar(leerPunto({ formattedAddress: "X", location: { latitude: null, longitude: -79.5 } })).igual(null);
    esperar(leerPunto({ formattedAddress: "X", location: { latitude: "", longitude: -79.5 } })).igual(null);
    esperar(leerPunto({ formattedAddress: "X", location: {} })).igual(null);
    esperar(leerPunto({ formattedAddress: "X" })).igual(null);
    esperar(leerPunto(null)).igual(null);

    /* Un (0,0) EXPLÍCITO sí se lee: es un punto legítimo, aunque improbable.
     * Lo que no puede es aparecer por un campo que falta. */
    const cero = leerPunto({ formattedAddress: "En medio del mar", location: { latitude: 0, longitude: 0 } });
    esperar(cero?.lat).igual(0);
  });

  test("una coordenada imposible no pasa", () => {
    esperar(leerPunto({ formattedAddress: "X", location: { latitude: 91, longitude: 0 } })).igual(null);
    esperar(leerPunto({ formattedAddress: "X", location: { latitude: 0, longitude: 181 } })).igual(null);
    const bien = leerPunto({ formattedAddress: "Vía España, Panamá", location: { latitude: 8.98, longitude: -79.51 } });
    esperar(bien?.lat).igual(8.98);
    esperar(bien?.direccion).igual("Vía España, Panamá");
  });

  test("sin dirección no hay punto que valga", () => {
    /* El punto va a ASAP junto con `desti_address`, y ASAP rechaza una
     * dirección vacía. Guardar las coordenadas sin la dirección daría un pedido
     * que parece completo y que se cae al mandarlo. */
    esperar(leerPunto({ location: { latitude: 8.98, longitude: -79.51 } })).igual(null);
  });
});

describe("El bot no opina sobre nuestro propio recibo", () => {
  /* El mensaje REAL del pedido #17, tal y como llegó el 8 sep 2026 a las
   * 02:15:20. Cuatro segundos después el bot contestó «Veo que el pedido #17
   * aparece duplicado…». No había duplicado: solo existía un #17. */
  const RECIBO_17 = [
    "*Pedido #17*",
    "*Pedido — Paws at Home*",
    "",
    "• 1 × NutriSource Perro adulto - Henry — $1.00",
    "   Variedades: 5 lbs.",
    "   Variedades 2: Pollo",
    "",
    "*Total: $1.00*",
    "",
    "Nombre completo: Victoria Molina",
    "Teléfono: 62171875",
    "Nombre de PH: PH Bayfront",
    "Número Interior:: 102",
    "Calle:: Av Baloba",
    "Ubicación: https://www.google.com/maps/search/?api=1&query=8.9761502,-79.5212692",
    "",
    "Dale clic para pagar con Yappy: https://store.demandu.tech/paws-at-home/pagar/V66YW3EUD5A8",
    "",
    "Código: V66YW3EUD5A8",
  ].join("\n");

  test("EL MENSAJE QUE HIZO HABLAR AL BOT SE RECONOCE", () => {
    esperar(esElReciboDeUnPedido(RECIBO_17)).verdadero(
      "el recibo del pedido #17 volvería a llegarle a la IA",
    );
    esperar(codigoDelRecibo(RECIBO_17)).igual("V66YW3EUD5A8");
  });

  test("UN CLIENTE DE VERDAD NO SE QUEDA SIN RESPUESTA", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * LOS DOS ERRORES NO CUESTAN LO MISMO, Y POR ESO SE EXIGEN DOS MARCAS.
     *
     * Equivocarse hacia el «sí» CALLA a alguien de verdad: escribe, no recibe
     * nada, y no sabe por qué. Una venta perdida en silencio.
     *
     * Equivocarse hacia el «no» deja las cosas como estaban: el bot contesta al
     * recibo. Malo, pero visible.
     * ───────────────────────────────────────────────────────────────────────── */
    const personas = [
      "Hola, quiero hacer un pedido",
      "mi código es 12345",
      "Código: ABC123",                       // la marca del código, sin cabecera
      "*Pedido #17*",                          // la cabecera, sin código
      "Me llegó el pedido #17 y falta algo",
      "codigo",
      "",
      "Oye, ¿me cambias el sabor del pedido?",
    ];
    for (const p of personas) {
      esperar(esElReciboDeUnPedido(p)).falso(`se callaría ante un cliente que escribe: «${p}»`);
    }
  });

  test("si el cliente edita el mensaje, se vuelve al comportamiento de hoy", () => {
    /* WhatsApp deja editar el texto antes de mandarlo. Si rompe una de las dos
     * marcas, contestamos como hasta ahora — nunca nos callamos por si acaso. */
    esperar(esElReciboDeUnPedido(RECIBO_17.replace("*Pedido #17*", "Pedido 17"))).falso();
    esperar(esElReciboDeUnPedido(RECIBO_17.replace("Código: V66YW3EUD5A8", ""))).falso();
  });

  test("el código tiene que ir SOLO en su renglón", () => {
    /* Un código en medio de una frase lo escribe una persona, no nuestro
     * formato: «te paso el Código: ABC123 por si acaso». */
    const enMedio = "*Pedido #1*\nTe paso el Código: ABC123 por si acaso, gracias";
    esperar(esElReciboDeUnPedido(enMedio)).falso("un código dentro de una frase pasó por recibo");
  });

  test("vale con o sin tilde, y en cualquier pedido", () => {
    const base = "*Pedido #204*\n*Pedido — Panadería*\n\nCodigo: ZZ99AA11BB22";
    esperar(codigoDelRecibo(base)).igual("ZZ99AA11BB22");
    esperar(codigoDelRecibo("*Pedido #1*\n\nCódigo: abc123def456")).igual("ABC123DEF456");
  });
});

describe("Quién recibe el pedido, sacado del formulario", () => {
  /* El formulario REAL de paws-at-home, que es el que rompió la suposición de
   * que existiría un campo llamado «dirección». */
  const PREGUNTAS = [
    { id: "nombre_completo", etiqueta: "Nombre completo", tipo: "texto" },
    { id: "telefono", etiqueta: "Teléfono", tipo: "telefono" },
    { id: "nombre_de_ph", etiqueta: "Nombre de PH", tipo: "texto" },
    { id: "numero_interior", etiqueta: "Número Interior:", tipo: "texto" },
    { id: "calle", etiqueta: "Calle:", tipo: "texto" },
    { id: "ubicacion", etiqueta: "Ubicación", tipo: "ubicacion" },
  ];
  const RESPUESTAS = [
    { id: "nombre_completo", valor: "Victoria Molina", etiqueta: "Nombre completo" },
    { id: "telefono", valor: "62171875", etiqueta: "Teléfono" },
    { id: "nombre_de_ph", valor: "PH Bayfront", etiqueta: "Nombre de PH" },
    { id: "numero_interior", valor: "102", etiqueta: "Número Interior:" },
    { id: "calle", valor: "Av Baloba", etiqueta: "Calle:" },
    { id: "ubicacion", valor: "8.9761502,-79.5212692", etiqueta: "Ubicación" },
  ];

  test("EL NOMBRE Y EL TELÉFONO NO SON COLUMNAS, SON RESPUESTAS", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * El 8 sep 2026 escribí la acción de mandar al mensajero pidiéndole a
     * `pedidos` dos columnas que me inventé: `cliente_nombre` y
     * `cliente_telefono`. La consulta fallaba entera y el negocio leía «Ese
     * pedido no es de esta tienda» — buscando un problema de permisos que no
     * existía. Escribí la acción mirando el TIPO en vez de la tabla.
     * ───────────────────────────────────────────────────────────────────────── */
    esperar(nombreDeLasRespuestas(PREGUNTAS, RESPUESTAS)).igual("Victoria Molina");
    esperar(telefonoDeLasRespuestas(PREGUNTAS, RESPUESTAS)).igual("62171875");
  });

  test("«Nombre de PH» NO es el nombre de quien recibe", () => {
    /* Es la MISMA regla que usa la dirección para excluir el nombre: la
     * PRIMERA pregunta con «nombre» que no sea lista. Si las dos discreparan,
     * el nombre acabaría dentro de la dirección y fuera de su propio campo. */
    esperar(nombreDeLasRespuestas(PREGUNTAS, RESPUESTAS)).noContiene?.("PH");
    esperar(nombreDeLasRespuestas(PREGUNTAS, RESPUESTAS).includes("PH")).falso(
      "se coló «Nombre de PH» como nombre del cliente",
    );
    /* Y la dirección sigue llevándoselo, que es su sitio. */
    esperar(direccionDeLasRespuestas(PREGUNTAS, RESPUESTAS)).contiene("PH Bayfront");
    esperar(direccionDeLasRespuestas(PREGUNTAS, RESPUESTAS).includes("Victoria")).falso(
      "el nombre del cliente se coló dentro de la dirección",
    );
  });

  test("el teléfono se encuentra aunque se llame de otra forma", () => {
    /* «Celular», «WhatsApp» y «Móvil» son como lo llama medio mundo. Sin
     * teléfono no se manda el pedido —lo exige `loQueFaltaParaMandar`— y eso
     * está bien: el mensajero que no encuentra el portal tiene que poder
     * llamar. Lo que no vale es no encontrarlo estando puesto. */
    for (const etiqueta of ["Celular", "WhatsApp", "Móvil", "Numero de telefono"]) {
      const p = [{ id: "n", etiqueta: "Nombre", tipo: "texto" }, { id: "t", etiqueta, tipo: "texto" }];
      const r = [{ id: "n", valor: "Ana" }, { id: "t", valor: "62170000" }];
      esperar(telefonoDeLasRespuestas(p, r)).igual("62170000", `no encontró el teléfono en «${etiqueta}»`);
    }
  });

  test("el tipo manda sobre la etiqueta", () => {
    /* Un formulario con un campo de tipo «telefono» mal etiquetado sigue siendo
     * el teléfono. Y uno etiquetado «Teléfono de contacto de la oficina» que no
     * es de tipo teléfono, también — pero el marcado gana. */
    const p = [
      { id: "a", etiqueta: "Teléfono de la oficina", tipo: "texto" },
      { id: "b", etiqueta: "Cómo te contactamos", tipo: "telefono" },
    ];
    const r = [{ id: "a", valor: "3000000" }, { id: "b", valor: "62171875" }];
    esperar(telefonoDeLasRespuestas(p, r)).igual("62171875");
  });

  test("sin nada, cadena vacía y no un «undefined»", () => {
    esperar(nombreDeLasRespuestas(null, null)).igual("");
    esperar(telefonoDeLasRespuestas(null, null)).igual("");
    esperar(nombreDeLasRespuestas([], [])).igual("");
    esperar(telefonoDeLasRespuestas(PREGUNTAS, [])).igual("");
  });
});

describe("La IA no habla con la voz del sistema", () => {
  /* Los SEIS mensajes reales que la IA tenía delante el 8 sep 2026 a las
   * 02:46, justo antes de escribirle a Morelva que su pago estaba confirmado. */
  const LO_QUE_VIO = [
    { direction: "outbound", sender: "system", body: "Tu pedido #16 ya se está preparando." },
    { direction: "inbound", sender: "contact", body: "*Pedido #17* ... Código: V66YW3EUD5A8" },
    { direction: "outbound", sender: "bot", body: "Veo que el pedido #17 aparece duplicado..." },
    { direction: "outbound", sender: "system", body: "¡Pago recibido! ✅ Tu pedido #17 quedó confirmado por $1.00." },
    { direction: "outbound", sender: "system", body: "Tu pedido #17 ya se está preparando." },
    { direction: "inbound", sender: "contact", body: "*Pedido #18* ... Morelva Bracho" },
  ];

  test("LOS AVISOS DEL SISTEMA NO SON PALABRAS DE LA IA", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * ES LA CAUSA EXACTA DE «¡PAGO RECIBIDO!».
     *
     * El motor pasaba TODO lo saliente como `assistant`, mirando solo
     * `direction`. Para el modelo, la conversación decía «llega un pedido, yo
     * digo pago recibido, yo digo ya se está preparando». Llegó el #18 y
     * continuó el patrón.
     * ───────────────────────────────────────────────────────────────────────── */
    const turnos = historialParaLaIA(LO_QUE_VIO);
    const suyas = turnos.filter((t) => t.role === "assistant").map((t) => t.content).join(" ");
    esperar(suyas.includes("Pago recibido")).falso(
      "los avisos del sistema vuelven a entrar como palabras de la IA: volverá a inventarse un pago",
    );
    esperar(suyas.includes("se está preparando")).falso(
      "los estados del pedido vuelven a entrar como palabras de la IA",
    );
    /* Lo que SÍ dijo la IA sigue siendo suyo. */
    esperar(suyas).contiene("duplicado");
  });

  test("lo que escribe una PERSONA del equipo tampoco es su voz", () => {
    /* Si Darwin contesta por la Bandeja, el modelo lo leería como propio e
     * imitaría sus palabras — incluidos los compromisos que Darwin puede
     * cumplir y el modelo no. Pero no se tira: sin ello el bot repreguntaría
     * lo que un compañero ya preguntó. */
    const t = historialParaLaIA([
      { direction: "inbound", sender: "contact", body: "hola" },
      { direction: "outbound", sender: "agent", body: "Te lo mando mañana sin costo" },
      { direction: "inbound", sender: "contact", body: "gracias" },
    ]);
    const suyas = t.filter((x) => x.role === "assistant").map((x) => x.content).join(" ");
    esperar(suyas.includes("sin costo")).falso("la IA se apropió de lo que dijo una persona");
    esperar(t.map((x) => x.content).join(" ")).contiene(MARCA_AGENTE);
  });

  test("un remitente desconocido NO se convierte en la IA por descarte", () => {
    const t = historialParaLaIA([
      { direction: "inbound", sender: "contact", body: "hola" },
      { direction: "outbound", sender: "loquesea", body: "algo raro" },
    ]);
    esperar(t.some((x) => x.role === "assistant")).falso(
      "un remitente que no conocemos acabó hablando por la IA",
    );
  });

  test("EL HISTORIAL SIGUE SIENDO VÁLIDO DESPUÉS DE TIRAR AVISOS", () => {
    /* Al quitar los avisos, un historial puede quedar empezando por el modelo,
     * y la API exige que empiece el cliente. Sin esto, el arreglo rompería la
     * llamada justo en las conversaciones con MÁS avisos — las de los clientes
     * que más compran. Un arreglo que revienta donde más duele no es un arreglo. */
    const t = historialParaLaIA([
      { direction: "outbound", sender: "system", body: "Tu pedido #1 va en camino" },
      { direction: "outbound", sender: "bot", body: "¡Hola!" },
      { direction: "inbound", sender: "contact", body: "hola" },
      { direction: "inbound", sender: "contact", body: "¿me llegó?" },
    ]);
    esperar(t[0]?.role).igual("user", "el historial empieza por el modelo: la API lo rechaza");
    /* Y dos seguidos del mismo lado se juntan. */
    esperar(t.length).igual(1);
    esperar(t[0].content).contiene("¿me llegó?");
  });

  test("sin nada, historial vacío y no una llamada rota", () => {
    esperar(historialParaLaIA(null)).igual([]);
    esperar(historialParaLaIA([{ direction: "outbound", sender: "system", body: "x" }])).igual([]);
    esperar(historialParaLaIA([{ direction: "inbound", sender: "contact", body: "   " }])).igual([]);
  });
});

describe("La IA no puede afirmar que hay dinero", () => {
  test("EL MENSAJE QUE LEYÓ MORELVA NO PUEDE VOLVER A SALIR", () => {
    const loQueSalio =
      "¡Pago recibido! ✅ Tu pedido #18 en Paws at Home quedó confirmado por $1.00. Te vamos avisando por aquí.\n\n" +
      "Tu pedido #18 ya se está preparando.\n\n" +
      "Nota: Veo que el pedido #18 aparece duplicado con los mismos datos para Morelva Bracho.";
    const limpio = sinLoQueNoPuedeDecir(loQueSalio);
    esperar(limpio.includes("Pago recibido")).falso("volvería a salir la confirmación de pago");
    esperar(limpio.includes("confirmado por $1.00")).falso("volvería a salir el importe confirmado");
    esperar(limpio.includes("ya se está preparando")).falso("volvería a salir el estado del pedido");
  });

  test("PERO EL BOT SIGUE PUDIENDO HABLAR DE CÓMO PAGAR", () => {
    /* ─────────────────────────────────────────────────────────────────────────
     * Es la mitad que hace útil esta regla. Prohibir la palabra «pago» dejaría
     * mudo al bot ante «¿cómo pago?», que es de las preguntas más frecuentes de
     * una tienda. Lo que no puede es decir que el pago YA ocurrió.
     * ───────────────────────────────────────────────────────────────────────── */
    const legitimas = [
      "Puedes pagar con Yappy en el enlace de arriba.",
      "Aceptamos pago con Yappy y transferencia.",
      "¿Ya intentaste pagar? Si el enlace no abre, te mando otro.",
      "El pago se hace antes de preparar el pedido.",
      "Tu pedido lo preparamos apenas entre el pago.",
      "Para pagar, toca el enlace que te mandamos.",
      "El envío lo cobra el mensajero aparte.",
    ];
    for (const f of legitimas) {
      esperar(afirmaAlgoQueNoSabe(f)).falso(`se está bloqueando una frase legítima: «${f}»`);
      esperar(sinLoQueNoPuedeDecir(f)).igual(f);
    }
  });

  test("las formas de decir que ya se pagó, todas", () => {
    const prohibidas = [
      "Pago recibido, gracias.",
      "Tu pago fue confirmado.",
      "Ya recibimos tu pago.",
      "Confirmamos tu pago.",
      "Tu pedido ya está pagado.",
      "Ya pagaste, así que lo preparamos.",
      "Quedó pagado.",
      "Tu pedido #4 quedó confirmado por $12.50",
      "Tu pedido #7 ya se está preparando.",
      "Tu pedido va en camino.",
      "El mensajero ya salió.",
    ];
    for (const f of prohibidas) {
      esperar(afirmaAlgoQueNoSabe(f)).verdadero(`se le escapa una afirmación de dinero: «${f}»`);
    }
  });

  test("se corta la FRASE, no el mensaje entero", () => {
    /* Tirar la respuesta completa dejaría mudo al bot ante una conversación
     * legítima que solo roza el tema. */
    const mezclado = "Ya pagaste. ¿Te lo mandamos a la misma dirección de siempre?";
    const limpio = sinLoQueNoPuedeDecir(mezclado);
    esperar(limpio.includes("Ya pagaste")).falso();
    esperar(limpio).contiene("misma dirección");
  });

  test("si solo quedaba eso, se calla — y eso está bien", () => {
    /* Callarse es correcto: lo único que iba a decir era algo que no le consta.
     * El sistema de avisos ya le contará al cliente lo que de verdad pase. */
    esperar(quedaAlgoQueDecir("¡Pago recibido! Tu pedido ya se está preparando.")).falso();
    esperar(quedaAlgoQueDecir("Claro, te ayudo con eso.")).verdadero();
    esperar(sinLoQueNoPuedeDecir("")).igual("");
    esperar(sinLoQueNoPuedeDecir(null)).igual("");
  });
});

// ─── Sin correo no se agenda ─────────────────────────────────────────────────
describe("Una cita sin correo no se agenda", () => {
  test("si lo dijo ahora, ese manda", () => {
    const r = correoParaLaCita({ loDijoAhora: "Henma@Gmail.com", enSuFicha: "viejo@x.com" });
    esperar(r.ok).verdadero("no aceptó un correo válido");
    esperar(r.correo).igual("henma@gmail.com", "no lo normalizó a minúsculas");
    esperar(r.de).igual("lo dijo ahora");
  });

  test("si no dijo nada, se usa el de su ficha", () => {
    const r = correoParaLaCita({ enSuFicha: "ya@estaba.com" });
    esperar(r.ok).verdadero("no usó el correo que ya estaba guardado");
    esperar(r.de).igual("ya estaba en su ficha");
  });

  test("SIN NINGUNO NO SE AGENDA, y se dice qué pedir", () => {
    // Es el fallo del 9 sep 2026: la cita se creó sin invitado y nadie recibió
    // ni la invitación ni la cancelación.
    const r = correoParaLaCita({});
    esperar(r.ok).falso("agendó sin correo: la invitación no le llega a nadie");
    esperar(r.motivo.includes("NO agendes")).verdadero("no le dice al modelo que se pare");
  });

  test("un correo con mala pinta NO cuela, y no se cae al de la ficha", () => {
    // El modelo puede pasar «no tiene» o el nombre de la persona. Google acepta
    // basura sin quejarse y la invitación se pierde.
    for (const malo of ["no tiene", "el mismo de antes", "henma", "henma@", "@gmail.com", "a b@c.com", "henma@gmail"]) {
      const r = correoParaLaCita({ loDijoAhora: malo, enSuFicha: "buena@x.com" });
      esperar(r.ok).falso(`coló «${malo}» como correo`);
    }
  });

  test("los correos normales sí pasan", () => {
    for (const bueno of ["a@b.co", "nombre.apellido@empresa.com.pa", "x+etiqueta@gmail.com"]) {
      esperar(pareceUnCorreo(bueno)).verdadero(`rechazó «${bueno}», que es válido`);
    }
  });
});


// ─── La agenda del negocio ───────────────────────────────────────────────────
describe("La agenda enseña TODO y dice quién agendó cada cita", () => {
  const ev = (id, inicio, extra = {}) => ({
    id, titulo: "Cita", inicio, fin: null, todoElDia: false, enlace: "", cancelado: false, ...extra,
  });
  const cita = (evento_id, extra = {}) => ({
    evento_id, contact_id: "c1", conversation_id: "v1", nombre: "Henma",
    correo: "henma@x.com", estado: "agendada", ...extra,
  });

  test("lo que agendó Lana se distingue de lo que puso el dueño", () => {
    const v = agendaDelNegocio(
      [ev("g1", "2026-09-10T15:00:00Z"), ev("g2", "2026-09-10T17:00:00Z")],
      [cita("g1")],
    );
    esperar(v.length).igual(2, "se perdió un evento del calendario");
    esperar(v[0].quien).igual("lana");
    esperar(v[1].quien).igual("el negocio", "una cita que la plataforma no agendó se atribuyó a la IA");
    esperar(cuantasAgendoLana(v)).igual(1);
  });

  test("SE PARTE DE GOOGLE: una cita borrada del calendario ya no existe", () => {
    // `citas` no se sincroniza. Partiendo de ella, la pantalla enseñaría
    // reuniones canceladas desde Google y el equipo se presentaría a ellas.
    const v = agendaDelNegocio([], [cita("g1")]);
    esperar(v.length).igual(0, "enseñó una cita que ya no está en el calendario");
  });

  test("un evento cancelado no es una cita", () => {
    const v = agendaDelNegocio([ev("g1", "2026-09-10T15:00:00Z", { cancelado: true })], []);
    esperar(v.length).igual(0, "dejó pasar un evento cancelado");
  });

  test("se cruza por identificador, NO por hora", () => {
    // Mover una cita le cambia la hora y no el id. Cruzando por hora, moverla
    // la convertiría en dos: la de la IA y una del negocio.
    const v = agendaDelNegocio([ev("g1", "2026-09-11T20:00:00Z")], [cita("g1")]);
    esperar(v.length).igual(1);
    esperar(v[0].quien).igual("lana", "al mover la cita dejó de reconocerse como suya");
  });

  test("se avisa de la cita que se agendó sin correo", () => {
    // Es el fallo del 9 sep: la cita existe y nadie recibió invitación.
    const v = agendaDelNegocio([ev("g1", "2026-09-10T15:00:00Z")], [cita("g1", { correo: null })]);
    esperar(v[0].sinInvitacion).verdadero("no señaló la cita sin invitación");
  });

  test("una cita cancelada por chat deja de ser suya, no desaparece", () => {
    const v = agendaDelNegocio([ev("g1", "2026-09-10T15:00:00Z")], [cita("g1", { estado: "cancelada" })]);
    esperar(v.length).igual(1, "borró un evento que Google todavía tiene");
    esperar(v[0].quien).igual("el negocio");
  });

  test("salen ordenadas por hora, y sin hora no se pintan", () => {
    const v = agendaDelNegocio(
      [ev("b", "2026-09-12T10:00:00Z"), ev("sin", null), ev("a", "2026-09-10T10:00:00Z")],
      [],
    );
    esperar(v.map((x) => x.id).join(",")).igual("a,b", "no ordenó por hora o coló uno sin hora");
  });

  test("sin nada, lista vacía y no una llamada rota", () => {
    esperar(agendaDelNegocio(null, null).length).igual(0);
  });
});


// ─── El mes en cuadrícula ────────────────────────────────────────────────────
describe("El mes en cuadrícula", () => {
  const c = (inicio) => ({ inicio });

  test("empieza en LUNES y salen semanas completas", () => {
    // Septiembre de 2026 empieza en martes: la primera celda debe ser el lunes 31.
    const g = mesEnCuadricula(2026, 9, [], "America/Panama");
    esperar(g[0].dia).igual("2026-08-31", "la cuadrícula no empieza en lunes");
    esperar(g.length % 7).igual(0, "hay semanas incompletas: la pantalla saltaría");
    esperar(g[0].delMes).falso("el relleno del mes anterior se marcó como del mes");
  });

  test("un mes que empieza en domingo también cuadra", () => {
    // Febrero de 2026 empieza en domingo: el caso que rompe las cuadrículas.
    const g = mesEnCuadricula(2026, 2, [], "America/Panama");
    esperar(g[0].dia).igual("2026-01-26");
    esperar(g.length % 7).igual(0);
    esperar(g.some((x) => x.dia === "2026-02-28" && x.delMes)).verdadero("se perdió el último día del mes");
  });

  test("EL DÍA SE SACA EN LA ZONA DEL NEGOCIO", () => {
    // 20:00 en Panamá son las 01:00 UTC del día siguiente. Con `toISOString()`
    // media agenda de la tarde saldría un día corrida.
    const g = mesEnCuadricula(2026, 9, [c("2026-09-15T01:00:00Z")], "America/Panama");
    const dia14 = g.find((x) => x.dia === "2026-09-14");
    esperar(dia14.citas.length).igual(1, "la cita de la tarde se fue al día siguiente");
  });

  test("cada cita cae en su día y salen ordenadas por hora", () => {
    const g = mesEnCuadricula(2026, 9, [
      c("2026-09-10T20:00:00Z"), c("2026-09-10T14:00:00Z"), c("2026-09-11T14:00:00Z"),
    ], "UTC");
    const d10 = g.find((x) => x.dia === "2026-09-10");
    esperar(d10.citas.map((x) => x.inicio).join("|")).igual(
      "2026-09-10T14:00:00Z|2026-09-10T20:00:00Z", "no ordenó las citas del día",
    );
    esperar(g.find((x) => x.dia === "2026-09-11").citas.length).igual(1);
  });

  test("una cita de otro mes NO se cuela en la primera celda", () => {
    const g = mesEnCuadricula(2026, 9, [c("2026-12-01T14:00:00Z")], "UTC");
    esperar(g.reduce((n, x) => n + x.citas.length, 0)).igual(0, "coló una cita que no es de este mes");
  });

  test("una zona inválida no revienta la pantalla", () => {
    esperar(diaEnZona("2026-09-10T14:00:00Z", "No/Existe")).igual("2026-09-10");
  });

  test("sin fecha o con basura, no hay día", () => {
    esperar(diaEnZona(null, "UTC")).igual(null);
    esperar(diaEnZona("mañana", "UTC")).igual(null);
  });

  test("las flechas cruzan bien el año", () => {
    esperar(JSON.stringify(mesVecino(2026, 1, -1))).igual('{"anio":2025,"mes":12}');
    esperar(JSON.stringify(mesVecino(2026, 12, 1))).igual('{"anio":2027,"mes":1}');
  });
});


// ─── La respuesta al recordatorio ────────────────────────────────────────────
describe("Qué contestó al recordatorio de su cita", () => {
  test("los botones de la plantilla, exactos", () => {
    esperar(queQuisoDecir(BOTON_CONFIRMA)).igual("confirma");
    esperar(queQuisoDecir(BOTON_CAMBIA)).igual("cambia");
  });

  test("CAMBIAR GANA SIEMPRE, aunque lleve un «sí» dentro", () => {
    // «Sí, pero necesito cambiarla» tiene las dos señales. Si ganara el «sí»,
    // la cita quedaría en pie y alguien esperaría en la puerta.
    esperar(queQuisoDecir("Si, pero necesito cambiarla")).igual("cambia");
    esperar(queQuisoDecir("si pero no puedo")).igual("cambia");
  });

  test("la gente escribe en vez de tocar el botón", () => {
    for (const t of ["si", "Sí", "claro", "dale", "listo", "ahí estaré", "confirmado", "ok"]) {
      esperar(queQuisoDecir(t)).igual("confirma", `no entendió «${t}» como confirmación`);
    }
    for (const t of ["no puedo", "necesito cambiarla", "cancelar", "otro día", "quiero mover la cita"]) {
      esperar(queQuisoDecir(t)).igual("cambia", `no entendió «${t}» como cambio`);
    }
  });

  test("UN PÁRRAFO NO ES UNA RESPUESTA A UN BOTÓN", () => {
    // Quien escribe largo está contando algo y merece el bot entero, no esta regla.
    esperar(queQuisoDecir(
      "hola buenas tardes queria preguntar si el precio incluye el traslado o va aparte",
    )).igual(null);
  });

  test("lo que no es respuesta devuelve null y sigue su camino", () => {
    for (const t of ["", null, undefined, "cuanto cuesta", "hola", "gracias"]) {
      esperar(queQuisoDecir(t)).igual(null, `se tragó «${t}» como respuesta al recordatorio`);
    }
  });

  test("la fecha se dice en la zona del negocio", () => {
    // 15:00 UTC son las 10:00 en Panamá. Decirle otra hora a quien tiene la cita
    // es peor que no mandar recordatorio.
    const t = cuandoEnPalabras("2026-09-10T15:00:00Z", "America/Panama");
    esperar(t.includes("10:00")).verdadero(`dijo «${t}», que no está en la zona del negocio`);
    esperar(t.includes("jueves")).verdadero(`no dijo el día: «${t}»`);
  });

  test("una fecha rota no revienta el envío", () => {
    esperar(cuandoEnPalabras("mañana", "UTC")).igual("");
  });
});


// ─── La plantilla del recordatorio ───────────────────────────────────────────
describe("La plantilla del recordatorio la aceptaría Meta", () => {
  test("PASA EL MISMO VALIDADOR QUE LAS DEL CLIENTE", () => {
    // Un rechazo de Meta cuesta hasta 24 horas y casi nunca dice por qué. Esta
    // prueba lo dice ahora: si alguien edita el texto y lo deja mal, se ve aquí.
    const avisos = revisarPlantilla(RECORDATORIO_CITA);
    esperar(plantillaGrave(avisos)).falso(
      "Meta rechazaría la plantilla del recordatorio: " +
      avisos.filter((a) => a.grave).map((a) => `${a.campo}: ${a.texto}`).join(" · "),
    );
  });

  test("es de UTILIDAD, no de promoción", () => {
    // Promoción cuesta unas seis veces más y se la pueden desactivar al negocio.
    esperar(RECORDATORIO_CITA.categoria).igual("UTILITY");
  });

  test("hay un ejemplo por variable, y en orden", () => {
    // Meta exige un ejemplo por hueco. Si faltan, rechaza sin decir cuál.
    esperar(RECORDATORIO_CITA.ejemplos.length).igual(
      cuantasVariables(RECORDATORIO_CITA.cuerpo),
      "el número de ejemplos no cuadra con el de variables: rechazo seguro",
    );
  });

  test("LOS BOTONES DICEN EXACTAMENTE LO QUE LA PLATAFORMA ESPERA", () => {
    // Meta devuelve el texto del botón tal cual y `recordatorio.ts` lo compara.
    // Una tilde de más aquí y la confirmación no se apunta nunca.
    const textos = RECORDATORIO_CITA.botones.map((b) => b.texto);
    esperar(textos.join("|")).igual(`${BOTON_CONFIRMA}|${BOTON_CAMBIA}`);
    esperar(RECORDATORIO_CITA.botones.every((b) => b.tipo === "QUICK_REPLY")).verdadero(
      "un botón dejó de ser de respuesta rápida: no devolvería texto al tocarlo",
    );
  });

  test("y lo que se toca vuelve entendido", () => {
    // El círculo completo: lo que Meta manda de vuelta al tocar el botón es lo
    // que `queQuisoDecir` tiene que reconocer.
    for (const b of RECORDATORIO_CITA.botones) {
      esperar(queQuisoDecir(b.texto) !== null).verdadero(
        `si alguien toca «${b.texto}», la plataforma no entiende la respuesta`,
      );
    }
  });

  test("se traduce al JSON de Meta sin reventar", () => {
    const c = aComponentesDeMeta(RECORDATORIO_CITA);
    esperar(Array.isArray(c)).verdadero();
    esperar(JSON.stringify(c).includes(BOTON_CONFIRMA)).verdadero("los botones no llegaron al JSON");
  });

  test("la agenda declara qué plantillas necesita", () => {
    esperar(PARA_LA_AGENDA.length > 0).verdadero("conectar la agenda no pediría ninguna plantilla");
  });
});

process.exit(await correrPruebas());
