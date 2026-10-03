/**
 * Pruebas de las ACCIONES EN BLOQUE (asignar, etiquetar, etapa, cerrar varias).
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/enBloque.mjs
 */
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import {
  mezclarEtiquetas, enTrozos, idsLimpios, ordenarEtapas,
  partesAsignar, partesEtiquetas, partesEtapa, partesCerrar, MAX_EN_BLOQUE,
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
});

process.exit(await correrPruebas());
