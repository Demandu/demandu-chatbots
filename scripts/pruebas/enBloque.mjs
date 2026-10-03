/**
 * Pruebas de las ACCIONES EN BLOQUE (asignar, etiquetar, etapa, cerrar varias).
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/enBloque.mjs
 */
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import {
  mezclarEtiquetas, enTrozos, idsLimpios, ordenarEtapas,
  partesAsignar, partesEtiquetas, partesEtapa, partesCerrar, MAX_EN_BLOQUE,
  soloLasQueCambian, sortAlFinal, comoSeMarcaLaColumna, avisoDeCierre, cierraLaVenta,
} from "../../src/lib/enBloque.ts";

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("En bloque: mezclar etiquetas", () => {
  test("pone al final y respeta el orden que ya tenía", () => {
    esperar(JSON.stringify(mezclarEtiquetas(["a", "b"], ["c"], []))).igual('["a","b","c"]');
  });
  test("si ya la tenía, NO hay nada que escribir (null)", () => {
    // Escribir de balde recalifica al lead y lo manda a Sheets/Zoho otra vez.
    esperar(mezclarEtiquetas(["a", "b"], ["b"], [])).igual(null);
    esperar(mezclarEtiquetas(["a"], [], ["z"])).igual(null);
    esperar(mezclarEtiquetas(null, [], [])).igual(null);
  });
  test("quitar quita, y si está en las dos listas gana quitar", () => {
    esperar(JSON.stringify(mezclarEtiquetas(["a", "b"], [], ["a"]))).igual('["b"]');
    esperar(mezclarEtiquetas(["a"], ["b"], ["b"])).igual(null);
  });
  test("sin etiquetas previas (null) funciona", () => {
    esperar(JSON.stringify(mezclarEtiquetas(null, ["x"], []))).igual('["x"]');
  });
  test("limpia repetidos que ya venían en la ficha", () => {
    esperar(JSON.stringify(mezclarEtiquetas(["a", "a"], ["b"], []))).igual('["a","b"]');
  });
});

describe("En bloque: listas largas", () => {
  test("parte en trozos sin perder ni repetir", () => {
    const l = Array.from({ length: 250 }, (_, i) => i);
    const t = enTrozos(l, 100);
    esperar(t.length).igual(3);
    esperar(t.flat().length).igual(250);
    esperar(t[2].length).igual(50);
  });
  test("una lista vacía no da trozos", () => {
    esperar(enTrozos([], 100).length).igual(0);
  });
  test("ids: solo uuids, sin repetidos, y basura fuera", () => {
    const r = idsLimpios([U(1), U(1), "1; drop table", null, 5, U(2)]);
    esperar(r.length).igual(2);
    esperar(idsLimpios("no es lista").length).igual(0);
  });
  test("el tope existe y es razonable", () => {
    esperar(MAX_EN_BLOQUE >= 100 && MAX_EN_BLOQUE <= 1000).verdadero();
  });
});

describe("En bloque: etapas en el orden del Embudo", () => {
  test("primero por embudo, luego por posición", () => {
    const r = ordenarEtapas([
      { id: "b2", sort: 2, pipeline: { name: "B", sort: 2 } },
      { id: "a2", sort: 2, pipeline: { name: "A", sort: 1 } },
      { id: "b1", sort: 1, pipeline: { name: "B", sort: 2 } },
      { id: "a1", sort: 1, pipeline: { name: "A", sort: 1 } },
    ]);
    esperar(r.map((e) => e.id).join(",")).igual("a1,a2,b1,b2");
  });
});

describe("En bloque: lo que se le dice a la persona", () => {
  const claves = (partes) => partes.map((p) => p.k).join(",");
  test("asignar: conversaciones y tarjetas, o solo una de las dos", () => {
    esperar(claves(partesAsignar({ agente: "Ana", conversaciones: 1, tarjetas: 3, sinNada: 0, noQuedaron: 0 }))).igual("asignadoAmbas");
    esperar(claves(partesAsignar({ agente: "Ana", conversaciones: 2, tarjetas: 0, sinNada: 0, noQuedaron: 0 }))).igual("asignadoConv");
    esperar(claves(partesAsignar({ agente: "Ana", conversaciones: 0, tarjetas: 2, sinNada: 0, noQuedaron: 0 }))).igual("asignadoTarjetas");
  });
  test("asignar: si nada quedó, NO dice «listo», y dice por qué", () => {
    const p = partesAsignar({ agente: "Ana", conversaciones: 0, tarjetas: 0, sinNada: 3, noQuedaron: 0 });
    esperar(claves(p)).igual("asignadoNada,sinNada");
    esperar(p[1].v.n).igual(3);
  });
  test("asignar: avisa si la base no dejó cambiar alguna", () => {
    esperar(claves(partesAsignar({ agente: "Ana", conversaciones: 2, tarjetas: 0, sinNada: 0, noQuedaron: 1 }))).contiene("noQuedaron");
  });
  test("etiquetas: poner, quitar o las dos; y lo que ya estaba", () => {
    const p = partesEtiquetas({ cambiados: 5, yaEstaban: 2, fallaron: 0, poner: ["VIP"], quitar: ["Frío"] });
    esperar(claves(p)).igual("etiquetasPusoQuito,yaEstaban");
    esperar(p[0].v.poner).igual("VIP");
    esperar(claves(partesEtiquetas({ cambiados: 1, yaEstaban: 0, fallaron: 0, poner: [], quitar: ["x"] }))).igual("etiquetasQuito");
  });
  test("etiquetas: los fallos se dicen y no hay «listo»", () => {
    esperar(claves(partesEtiquetas({ cambiados: 0, yaEstaban: 0, fallaron: 3, poner: ["VIP"], quitar: [] }))).igual("etiquetasFallaron");
  });
  test("etapa", () => {
    esperar(claves(partesEtapa({ etapa: "Cotizando", conversaciones: 2, tarjetas: 2, sinNada: 1 }))).igual("etapaAmbas,sinNada");
    esperar(claves(partesEtapa({ etapa: "Cotizando", conversaciones: 0, tarjetas: 0, sinNada: 0 }))).igual("etapaNada");
  });
  test("cerrar SIEMPRE recuerda que la tarjeta no se mueve", () => {
    esperar(claves(partesCerrar({ cerradas: 3, yaCerradas: 1, sinNada: 0 }))).igual("cerradas,yaCerradas,tarjetasSiguen");
    esperar(claves(partesCerrar({ cerradas: 0, yaCerradas: 0, sinNada: 2 }))).igual("nadaQueCerrar,sinAbiertas,tarjetasSiguen");
  });
});

describe("En bloque: cada clave existe en los tres idiomas", () => {
  test("ninguna clave del servidor se queda sin traducir", async () => {
    const fs = await import("node:fs");
    const fuente = fs.readFileSync("src/lib/enBloque.ts", "utf8") + fs.readFileSync("src/app/(dashboard)/enBloque.ts", "utf8");
    const usadas = new Set([
      ...[...fuente.matchAll(/\bk: "([a-zA-Z]+)"/g)].map((m) => m[1]),
      ...[...fuente.matchAll(/\bno\("([a-zA-Z]+)"/g)].map((m) => m[1]),
      ...[...fuente.matchAll(/\? "(etapa[A-Z][a-zA-Z]+)"/g)].map((m) => m[1]),
      ...[...fuente.matchAll(/: "(etapa[A-Z][a-zA-Z]+)"/g)].map((m) => m[1]),
    ]);
    esperar(usadas.size > 20).verdadero(`solo encontré ${usadas.size} claves: el buscador se rompió`);
    for (const idioma of ["es", "en", "pt-BR"]) {
      const res = JSON.parse(fs.readFileSync(`messages/${idioma}.json`, "utf8")).enBloque.res;
      const faltan = [...usadas].filter((k) => !(k in res));
      esperar(faltan.join(",")).igual("", `faltan en ${idioma}`);
    }
  });

  /* Los textos de los BOTONES de selección no son resultados del servidor:
     viven en el primer nivel de `enBloque`, no bajo `res`. La prueba de arriba
     no los veía, así que un botón podía salir en español en el panel en inglés
     —o peor, pintar la clave cruda— sin que nada se pusiera rojo. */
  test("y tampoco los botones de seleccionar", async () => {
    const fs = await import("node:fs");
    const fuente =
      fs.readFileSync("src/components/enbloque/ControlesSeleccion.tsx", "utf8") +
      fs.readFileSync("src/components/enbloque/ControlesDeTablero.tsx", "utf8") +
      fs.readFileSync("src/components/enbloque/BarraEnBloque.tsx", "utf8");
    const usadas = new Set(
      [...fuente.matchAll(/\bt\("([a-zA-Z]+)"/g)].map((m) => m[1]),
    );
    esperar(usadas.size > 8).verdadero(`solo encontré ${usadas.size} claves: el buscador se rompió`);
    for (const idioma of ["es", "en", "pt-BR"]) {
      const eb = JSON.parse(fs.readFileSync(`messages/${idioma}.json`, "utf8")).enBloque;
      const faltan = [...usadas].filter((k) => !(k in eb));
      esperar(faltan.join(",")).igual("", `faltan en ${idioma}`);
    }
  });
});

/* ═══ SELECCIÓN MÚLTIPLE EN EL TABLERO DEL EMBUDO ══════════════════════════
 *
 * 3 oct 2026. Marcar varias tarjetas y moverlas de etapa de un clic. Lo que se
 * prueba aquí es lo que decide si se ESCRIBE o no, porque cada escritura de
 * etapa arrastra una cadena: estado y fecha de cierre, la conversación, una
 * fila de historial y la etiqueta de etapa en el contacto —que lo recalifica y
 * lo encola para Google Sheets—.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe("Embudo en bloque: a quién se le escribe", () => {
  const t = (id, etapa) => ({ id, stage_id: etapa });

  /* ESTA ES LA REGLA CARA. Mover 40 tarjetas a «Cotizando» de las que 30 ya
     estaban ahí dejaría 30 filas de historial diciendo que algo cambió cuando
     no cambió nada — y ese historial es lo que después mide cuánto tarda una
     venta en cada etapa. */
  test("A LA QUE YA ESTÁ EN ESA ETAPA NO SE LE ESCRIBE", () => {
    const r = soloLasQueCambian(
      [t("a", "E1"), t("b", "E2"), t("c", "E2"), t("d", null)],
      (x) => x.stage_id,
      "E2",
    );
    esperar(r.cambian.map((x) => x.id).join(",")).igual("a,d");
    esperar(r.yaEstaban).igual(2);
  });

  test("y una tarjeta sin etapa SÍ se mueve", () => {
    const r = soloLasQueCambian([t("a", null), t("b", undefined)], (x) => x.stage_id, "E2");
    esperar(r.cambian.length).igual(2, "deja fuera a las que no tienen etapa: no saldrían de la nada");
    esperar(r.yaEstaban).igual(0);
  });

  /* Un destino vacío no puede hacer que «todas ya estaban ahí» y no se escriba
     nada en silencio. */
  test("sin etapa destino no se da por hecho que ya estaban", () => {
    const r = soloLasQueCambian([t("a", null)], (x) => x.stage_id, "");
    esperar(r.yaEstaban).igual(0);
    esperar(r.cambian.length).igual(1);
  });

  test("EL AVISO DICE CUÁNTAS YA ESTABAN, NO SE LAS CALLA", () => {
    const partes = partesEtapa({ etapa: "Cotizando", conversaciones: 10, tarjetas: 10, sinNada: 0, yaEstaban: 30 });
    esperar(partes.some((p) => p.k === "etapaYaEstaban" && p.v.n === 30)).verdadero(
      "se come las 30 que ya estaban: el usuario cree que movió 40 y movió 10",
    );
  });

  /* Si TODAS ya estaban donde se pedía, la selección acabó donde se quería.
     Decir «no se pudo mover ninguna» sería pintar en rojo un acierto. */
  test("si todas ya estaban, no se dice que no se pudo", () => {
    const partes = partesEtapa({ etapa: "Cotizando", conversaciones: 0, tarjetas: 0, sinNada: 0, yaEstaban: 5 });
    esperar(partes.some((p) => p.k === "etapaNada")).falso(
      "dice «no se movió nada» cuando ya estaban todas en su sitio",
    );
    esperar(partes.some((p) => p.k === "etapaYaEstaban")).verdadero();
  });
});

describe("Embudo en bloque: dónde cae la tarjeta", () => {
  /* Sin esto la tarjeta conserva el `sort` de su columna anterior y aparece
     intercalada en medio del destino, donde nadie la puso. */
  test("VA AL FINAL DE LA COLUMNA DESTINO", () => {
    esperar(sortAlFinal(100)).igual(101);
    esperar(sortAlFinal(0)).igual(1);
  });

  test("y en una columna vacía no se inventa un número raro", () => {
    const ahora = new Date("2026-10-03T20:00:00Z");
    esperar(sortAlFinal(null, ahora)).igual(Math.floor(ahora.getTime() / 1000));
    esperar(sortAlFinal(undefined, ahora)).igual(Math.floor(ahora.getTime() / 1000));
    esperar(sortAlFinal(NaN, ahora)).igual(Math.floor(ahora.getTime() / 1000));
  });
});

describe("Embudo en bloque: marcar una columna sin mentir", () => {
  /* EL TABLERO SOLO TRAE 50 POR COLUMNA. Un «marcar todas» marcaría 50 y quien
     lo pulsa creería haber marcado las 320 — y movería 50 pensando que movió
     todo, sin forma de enterarse de lo que quedó atrás. */
  test("SI HAY MÁS DE LAS QUE SE VEN, LO DICE CON LOS DOS NÚMEROS", () => {
    esperar(comoSeMarcaLaColumna(50, 320)).igual({ clave: "marcarVisiblesDeTotal", n: 50, total: 320 });
  });

  test("y si se ven todas, no asusta con un número de más", () => {
    esperar(comoSeMarcaLaColumna(7, 7)).igual({ clave: "marcarTodas", n: 7 });
    esperar(comoSeMarcaLaColumna(7, null)).igual({ clave: "marcarTodas", n: 7 });
    // Un total más chico que lo visible es un dato inconsistente del servidor:
    // se cree lo que se ve, no se pinta «de 3» habiendo 7 delante.
    esperar(comoSeMarcaLaColumna(7, 3)).igual({ clave: "marcarTodas", n: 7 });
  });
});

describe("Embudo en bloque: mover a Ganada o Perdida CIERRA la venta", () => {
  /* Los valores reales de `conversation_states.outcome` son `ganado`,
     `perdido` y `abierto` — comprobado en la base. Con «ganada»/«perdida» en
     plural el aviso no habría salido nunca y se habrían cerrado ventas sin
     preguntar. */
  test("RECONOCE LAS ETAPAS DE CIERRE POR SU VALOR REAL", () => {
    esperar(cierraLaVenta("ganado")).verdadero();
    esperar(cierraLaVenta("perdido")).verdadero();
    esperar(cierraLaVenta("abierto")).falso();
    esperar(cierraLaVenta(null)).falso();
    esperar(cierraLaVenta("ganada")).falso("acepta un valor que la base no usa");
  });

  test("EL AVISO LLEVA EL NÚMERO EXACTO", () => {
    const a = avisoDeCierre({ cuantas: 40, etapa: "Perdida", outcome: "perdido" });
    esperar(a.k).igual("confirmarPerdidas");
    esperar(a.v).igual({ n: 40, etapa: "Perdida" });

    const g = avisoDeCierre({ cuantas: 1, etapa: "Ganada", outcome: "ganado" });
    esperar(g.k).igual("confirmarGanadas");
  });

  test("y una etapa normal no pregunta nada", () => {
    esperar(avisoDeCierre({ cuantas: 40, etapa: "Cotizando", outcome: "abierto" })).igual(null);
    esperar(avisoDeCierre({ cuantas: 40, etapa: "Cotizando", outcome: null })).igual(null);
  });
});

describe("Embudo en bloque: el tablero se vuelve a pedir, no se parchea", () => {
  /* LA TRAMPA DE LOS CONTADORES. Arrastrar UNA tarjeta se pinta en memoria con
     `moverEnMemoria`, que respeta `columna.total` (el servidor manda 50 de 320
     y recalcular el contador con el largo de la lista visible perdía 270).
     En bloque NO se parchea nada: se vuelve a pedir el tablero entero. Es la
     única forma de que los totales, los importes y el resumen queden bien
     después de mover cuarenta de golpe. */
  test("AL TERMINAR EN BLOQUE SE RECARGA EL TABLERO", async () => {
    const fs = await import("node:fs");
    const t = fs.readFileSync("src/components/crm/Tablero.tsx", "utf8");
    const onListo = t.slice(t.indexOf("onListo={(r) =>"), t.indexOf("onListo={(r) =>") + 320);
    esperar(onListo.includes("recargar()")).verdadero(
      "ya no recarga tras mover en bloque: los contadores de columna se quedan con lo viejo",
    );
    esperar(onListo.includes("moverEnMemoria")).falso(
      "parchea el tablero en memoria tras mover en bloque: ahí es donde se perdían 270 tarjetas de una columna de 320",
    );
  });

  test("y en modo selección no se arrastra", async () => {
    const fs = await import("node:fs");
    const t = fs.readFileSync("src/components/crm/Tablero.tsx", "utf8");
    esperar(/draggable=\{!onMarcar\}/.test(t)).verdadero(
      "el arrastre sigue vivo mientras se selecciona: el primer gesto movería una tarjeta y desharía la selección",
    );
    esperar(/onMarcar \? onMarcar\(t\.id\) : onAbrir\(t\)/.test(t)).verdadero(
      "tocar una tarjeta en modo selección vuelve a abrir su ficha en vez de marcarla",
    );
  });
});


process.exit(await correrPruebas());
