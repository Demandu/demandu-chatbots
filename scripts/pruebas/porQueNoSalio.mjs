/**
 * Pruebas de POR QUÉ NO SALIÓ UN MENSAJE y del botón de quitarlo.
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/porQueNoSalio.mjs
 */
import { readFileSync } from "node:fs";
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import { codigoDeFallo, explicacionDeFallo } from "../../src/lib/porQueNoSalio.ts";

const es = JSON.parse(readFileSync("messages/es.json", "utf8")).noSalio;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")).noSalio;
const pt = JSON.parse(readFileSync("messages/pt-BR.json", "utf8")).noSalio;
const lib = readFileSync("src/lib/porQueNoSalio.ts", "utf8");
const vista = readFileSync("src/components/inbox/PorQueNoSalio.tsx", "utf8");
const bandeja = readFileSync("src/components/inbox/InboxClient.tsx", "utf8");

describe("Por qué no salió: el código", () => {
  test("sin código es SIN CÓDIGO, no el código 0", () => {
    // `Number(null)` es 0 y 0 es finito. La misma trampa que dejaba tarjetas
    // al principio de la columna en `sortAlFinal`. Aquí colgaría una
    // explicación inventada de un código que nadie mandó.
    esperar(codigoDeFallo(null)).igual(null);
    esperar(codigoDeFallo(undefined)).igual(null);
    esperar(codigoDeFallo("")).igual(null);
    esperar(codigoDeFallo("   ")).igual(null);
  });
  test("lo que no es número tampoco es código", () => {
    esperar(codigoDeFallo("no es un numero")).igual(null);
    esperar(codigoDeFallo(NaN)).igual(null);
    esperar(codigoDeFallo(Infinity)).igual(null);
  });
  test("texto o número, el código es el mismo", () => {
    esperar(codigoDeFallo(132012)).igual(132012);
    esperar(codigoDeFallo("132012")).igual(132012);
    esperar(codigoDeFallo("132012.0")).igual(132012);
  });
});

describe("Por qué no salió: la causa", () => {
  test("sin fallo no hay aviso", () => {
    esperar(explicacionDeFallo(null)).igual(null);
    esperar(explicacionDeFallo(undefined)).igual(null);
  });
  test("132012 es la plantilla sin su archivo, y tiene arreglo", () => {
    const e = explicacionDeFallo(
      { code: 132012, motivo: "(#132012) Parameter format does not match format in the created template" },
      "capac",
    );
    esperar(e.clave).igual("plantillaSinArchivo");
    esperar(e.hayArreglo).igual(true);
    esperar(e.plantilla).igual("capac");
    esperar(e.codigo).igual(132012);
  });
  test("la ventana de 24 h llega por dos códigos distintos", () => {
    esperar(explicacionDeFallo({ code: 131047 }).clave).igual("ventanaCerrada");
    esperar(explicacionDeFallo({ code: 470 }).clave).igual("ventanaCerrada");
  });
  test("el 100 de Meta se decide por el texto, que es donde está la pista", () => {
    esperar(explicacionDeFallo({ code: 100, motivo: "(#100) Param video.link is not a valid URI." }).clave)
      .igual("archivoNoValido");
    esperar(explicacionDeFallo({ code: 100, motivo: "(#100) Something else entirely" }).clave)
      .igual("desconocido");
  });
  test("un código que no conocemos NO se adivina", () => {
    // Inventar una causa es peor que no dar ninguna: manda a alguien a
    // arreglar lo que no estaba roto.
    const e = explicacionDeFallo({ code: 999999, motivo: "Vaya usted a saber" });
    esperar(e.clave).igual("desconocido");
    esperar(e.hayArreglo).igual(false);
  });
  test("lo que contestó Meta se conserva SIEMPRE, también cuando no lo entendemos", () => {
    esperar(explicacionDeFallo({ code: 999999, motivo: "Vaya usted a saber" }).textoDeMeta)
      .igual("Vaya usted a saber");
    esperar(explicacionDeFallo({ code: 132012, motivo: "  con espacios  " }, "capac").textoDeMeta)
      .igual("con espacios");
    esperar(explicacionDeFallo({ code: 132012 }).textoDeMeta).igual("");
  });
  test("un nombre de plantilla vacío es NINGÚN nombre, no una plantilla llamada «»", () => {
    esperar(explicacionDeFallo({ code: 132012 }, "").plantilla).igual(null);
    esperar(explicacionDeFallo({ code: 132012 }, "   ").plantilla).igual(null);
    esperar(explicacionDeFallo({ code: 132012 }, null).plantilla).igual(null);
    esperar(explicacionDeFallo({ code: 132012 }, " capac ").plantilla).igual("capac");
  });
});

describe("Por qué no salió: los textos, en los tres idiomas", () => {
  // Las claves salen del propio archivo: si mañana se añade una causa y nadie
  // la traduce, esta prueba la caza sola.
  // El bloque del tipo, y solo ese bloque: así no se cuelan comillas de otra
  // parte del archivo y la cuenta sigue siendo la de las causas de verdad.
  const bloque = lib.slice(
    lib.indexOf("export type ClaveDeFallo ="),
    lib.indexOf(";", lib.indexOf("export type ClaveDeFallo =")),
  );
  const claves = [...bloque.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  const deEspanol = Object.keys(es.que);

  test("el tipo `ClaveDeFallo` y los textos en español dicen lo mismo", () => {
    esperar(claves.length).mayorQue(10);
    esperar([...claves].sort()).igual([...deEspanol].sort());
  });
  test("cada causa tiene su texto en es, en y pt-BR", () => {
    for (const c of deEspanol) {
      esperar(typeof en.que[c]).igual("string", `falta la causa «${c}» en inglés`);
      esperar(typeof pt.que[c]).igual("string", `falta la causa «${c}» en portugués`);
    }
  });
  test("cada causa con arreglo lo tiene en los tres, y «desconocido» NO lo tiene", () => {
    for (const c of deEspanol) {
      if (c === "desconocido") continue;
      for (const [nombre, j] of [["es", es], ["en", en], ["pt-BR", pt]]) {
        esperar(typeof j.arreglo[c]).igual("string", `falta el arreglo de «${c}» en ${nombre}`);
      }
    }
    esperar(es.arreglo.desconocido).igual(undefined);
    esperar(en.arreglo.desconocido).igual(undefined);
    esperar(pt.arreglo.desconocido).igual(undefined);
  });
  test("los textos de la pantalla están en los tres idiomas", () => {
    const uiClaves = [
      "titulo", "esaPlantilla", "quitar", "noSePudoQuitar",
      "confirmarTitulo", "confirmarDetalle", "confirmarSi", "cancelar",
      "metaDijo", "metaDijoConCodigo", "banda",
    ];
    for (const k of uiClaves) {
      for (const [nombre, j] of [["es", es], ["en", en], ["pt-BR", pt]]) {
        esperar(typeof j[k]).igual("string", `falta «${k}» en ${nombre}`);
      }
    }
  });
  test("el arreglo de la plantilla sin archivo dice DÓNDE se sube la imagen", () => {
    // Sin la pantalla, el aviso vuelve a ser «algo no cuadra» y el agente
    // reintenta el mismo envío.
    // Nombrar la pantalla no basta: hay que decir QUÉ se sube. «Habla con
    // soporte y mira en Plantillas» pasaría una prueba que solo busque el
    // nombre de la pantalla, y deja al agente igual de perdido.
    esperar(es.arreglo.plantillaSinArchivo).contiene("Plantillas");
    esperar(es.arreglo.plantillaSinArchivo).contiene("Sube");
    esperar(es.arreglo.plantillaSinArchivo).contiene("imagen");
    esperar(en.arreglo.plantillaSinArchivo).contiene("Templates");
    esperar(en.arreglo.plantillaSinArchivo).contiene("Upload");
    esperar(en.arreglo.plantillaSinArchivo).contiene("image");
    esperar(pt.arreglo.plantillaSinArchivo).contiene("Modelos");
    esperar(pt.arreglo.plantillaSinArchivo).contiene("Envie");
    esperar(pt.arreglo.plantillaSinArchivo).contiene("imagem");
  });
  test("la banda y las causas con nombre llevan su hueco", () => {
    esperar(es.banda).contiene("{canal}");
    esperar(en.banda).contiene("{canal}");
    esperar(pt.banda).contiene("{canal}");
    for (const [nombre, j] of [["es", es], ["en", en], ["pt-BR", pt]]) {
      esperar(j.que.plantillaSinArchivo).contiene("{plantilla}", `sin hueco de plantilla en ${nombre}`);
      esperar(j.metaDijoConCodigo).contiene("{codigo}", `sin hueco de código en ${nombre}`);
      esperar(j.metaDijoConCodigo).contiene("{texto}", `sin hueco de texto en ${nombre}`);
    }
  });
});

describe("Por qué no salió: la pantalla", () => {
  // Son DOS componentes —la burbuja y la banda de arriba— y cada uno se mira
  // aparte. Buscando en el archivo entero, borrar el texto de Meta de uno de
  // los dos no se habría notado: lo encontraba en el otro.
  const corte = vista.indexOf("export function BandaNoSalio");
  const burbuja = vista.slice(0, corte);
  const banda = vista.slice(corte);

  test("el texto de Meta se pinta en la burbuja, no se esconde", () => {
    esperar(burbuja.includes("textoDeMeta")).verdadero(
      "la burbuja no pinta lo que contestó Meta: un fallo que no reconocemos se queda sin ninguna pista",
    );
    esperar(burbuja.includes("metaDijoConCodigo")).verdadero("la burbuja no dice el código cuando hay código");
  });
  test("y también en la banda de arriba del hilo", () => {
    esperar(banda.includes("textoDeMeta")).verdadero("la banda no pinta lo que contestó Meta");
    esperar(banda.includes("metaDijoConCodigo")).verdadero("la banda no dice el código cuando hay código");
  });
  test("las dos dicen la causa y el arreglo", () => {
    for (const [nombre, c] of [["la burbuja", burbuja], ["la banda", banda]]) {
      esperar(c.includes("que.$" + "{e.clave}")).verdadero(nombre + " no pinta la causa");
      esperar(c.includes("arreglo.$" + "{e.clave}")).verdadero(nombre + " no pinta el arreglo");
    }
  });
  test("«Quitar» pregunta antes, porque borra la fila para siempre", () => {
    esperar(vista.includes("<Confirm")).verdadero("quita sin preguntar y no hay papelera");
    esperar(vista.includes("confirmarDetalle")).verdadero("pregunta sin decir qué se va a perder");
  });
  test("si el borrado falla, la pantalla lo dice", () => {
    esperar(vista.includes("noSePudoQuitar")).verdadero(
      "un borrado fallido se quedaría en silencio y el mensaje reaparecería al recargar",
    );
  });
  test("el arreglo solo sale cuando lo hay", () => {
    esperar(vista.includes("hayArreglo")).verdadero(
      "pinta el arreglo siempre: en «desconocido» no existe y saldría la clave en crudo",
    );
  });
});

describe("Por qué no salió: la Bandeja", () => {
  test("quitar un mensaje mira su error y NO toca la pantalla si falló", () => {
    const i = bandeja.indexOf("const quitarMensaje");
    esperar(i).mayorQue(0);
    const cuerpo = bandeja.slice(i, i + 520);
    esperar(cuerpo.includes("{ error }")).verdadero("la consulta no mira su error");
    esperar(cuerpo.indexOf("return false") < cuerpo.indexOf("setMessages")).verdadero(
      "se va de la pantalla antes de saber si la fila se borró: al recargar vuelve",
    );
    esperar(cuerpo.includes("loadConvos()")).verdadero(
      "no vuelve a pedir la lista: la vista previa de la conversación se queda con un mensaje que ya no existe",
    );
  });
  test("la Bandeja NO pide traducciones, o el trinquete deja de contar sus cien textos", () => {
    esperar(bandeja.includes("useTranslations")).igual(
      false,
      "un useTranslations aquí esconde de la cuenta el español del resto del archivo",
    );
  });
  test("el aviso de la burbuja y la banda de arriba usan el mismo cerebro", () => {
    esperar(bandeja.includes("<PorQueNoSalio")).verdadero("la burbuja no usa el componente");
    esperar(bandeja.includes("<BandaNoSalio")).verdadero("la banda de arriba no usa el componente");
    esperar(bandeja.includes("{fallo.motivo}")).igual(
      false,
      "la banda sigue pintando el texto de Meta en crudo, que es el aviso que nadie entendía",
    );
  });
  test("el canal de la banda sale de la conversación, no escrito a mano", () => {
    const i = bandeja.indexOf("<BandaNoSalio");
    esperar(bandeja.slice(i, i + 260).includes("CH[sel.channel]")).verdadero(
      "volvería a decir «WhatsApp» en una conversación de Instagram",
    );
  });
});

process.exit(await correrPruebas());
