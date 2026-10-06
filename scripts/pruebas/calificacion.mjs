/**
 * Pruebas de LO QUE VIAJA AL CRM CUANDO EL LEAD QUEDA CALIFICADO.
 *
 * La regla de verdad —qué es una calificación, qué atributos van, qué NO sale—
 * vive en la base (`avisar_lead_calificado`, migración 0147) y se prueba contra
 * la base real con `scripts/pruebas/calificacion-base-de-datos.sql`.
 *
 * Aquí se vigila lo que desde JavaScript sí se puede vigilar: que los DOS
 * motores llamen a esa función y que ninguno se ponga a decidir por su cuenta.
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/calificacion.mjs
 */
import { readFileSync } from "node:fs";
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import { sinComentarios } from "./medirEspanol.mjs";

const catalogo = readFileSync("src/lib/salidas-eventos.ts", "utf8");
const motor = readFileSync("supabase/functions/whatsapp/index.ts", "utf8");
const web = readFileSync("src/lib/ai/herramientas.ts", "utf8");
const sql = readFileSync("scripts/pruebas/calificacion-base-de-datos.sql", "utf8");

describe("Lead calificado: el catálogo de salidas", () => {
  test("«lead.calificado» se puede elegir en Integraciones", () => {
    esperar(catalogo.includes('"lead.calificado"')).verdadero(
      "el evento no está en el catálogo: nadie puede conectar su CRM a él",
    );
  });
  test("y `lead.datos` sigue existiendo", () => {
    // Esa lista es un contrato ya publicado: quitar un evento rompe las
    // integraciones que ya lo usan, sin avisar.
    esperar(catalogo.includes('"lead.datos"')).verdadero("se cayó un evento del contrato");
  });
});

describe("Lead calificado: los dos motores avisan igual", () => {
  for (const [nombre, codigo] of [["el motor de WhatsApp", motor], ["el motor de la web", web]]) {
    test(`${nombre} llama a avisar_lead_calificado al etiquetar`, () => {
      esperar(codigo.includes('"avisar_lead_calificado"')).verdadero(
        `${nombre} etiqueta y no avisa: el CRM se queda sin la calificación`,
      );
    });
    test(`${nombre} manda el porqué y en qué se basó`, () => {
      // Es lo que permite auditar una calificación después, en vez de
      // discutirla de memoria.
      const i = codigo.indexOf('"avisar_lead_calificado"');
      const llamada = codigo.slice(i, i + 420);
      esperar(llamada.includes("p_por_que")).verdadero(`${nombre} no manda el porqué`);
      esperar(llamada.includes("p_en_que_me_baso")).verdadero(`${nombre} no manda en qué se basó`);
    });
    test(`${nombre} NO decide por su cuenta qué es una calificación`, () => {
      // Si un motor escribe «Lead Alto» o el nombre del grupo, la regla vive en
      // dos sitios y un día divergen: el cliente recibiría una cosa por
      // WhatsApp y otra por la web, con el mismo contrato. Por eso la decide la
      // base, que es una sola.
      // SIN COMENTARIOS. El comentario que explica este mismo arreglo cita el
      // payload real, que lleva «Lead Alto» dentro. Anclarse en el texto crudo
      // encuentra la prosa en vez del código — es la quinta vez que este
      // proyecto tropieza con lo mismo.
      const limpio = sinComentarios(codigo);
      const i = limpio.indexOf('"avisar_lead_calificado"');
      const alrededor = limpio.slice(Math.max(0, i - 1200), i + 600);
      esperar(alrededor.includes("Lead Alto")).igual(
        false, `${nombre} tiene el nombre de una calificación escrito a mano`,
      );
      esperar(/grupo\s*===?\s*["']Calificaci/.test(alrededor)).igual(
        false, `${nombre} compara el grupo por su cuenta`,
      );
    });
    test(`si el aviso falla, ${nombre} lo dice y no se rompe la respuesta`, () => {
      const i = codigo.indexOf('"avisar_lead_calificado"');
      const llamada = codigo.slice(i, i + 700);
      esperar(llamada.includes("console.error")).verdadero(
        `${nombre} se traga el fallo: nadie se enteraría de que el CRM no recibió nada`,
      );
    });
  }
});

describe("Lead calificado: la prueba contra la base existe y cubre lo que importa", () => {
  // Una prueba que no se puede correr no protege nada. Esta vive en un archivo
  // que `./scripts/probar.sh` nombra para pegar en el editor SQL.
  test("está en la lista de los que se pegan en el editor SQL", () => {
    const probar = readFileSync("scripts/probar.sh", "utf8");
    esperar(probar.includes("calificacion-base-de-datos.sql")).verdadero(
      "la prueba existe pero nadie sabe que hay que correrla",
    );
  });
  test("comprueba que NO viajan las etiquetas internas", () => {
    esperar(sql.includes("Abierta")).verdadero("no comprueba la etiqueta de Etapa");
    esperar(sql.includes("Torres de España")).verdadero("no comprueba la etiqueta de Proyecto");
    esperar(sql.includes("'etiquetas'")).verdadero("no comprueba que se fue la lista entera");
  });
  test("comprueba que viajan TODOS los atributos definidos", () => {
    esperar(sql.includes("custom_attributes")).verdadero("no cuenta los atributos definidos");
    esperar(sql.includes("jsonb_object_keys")).verdadero("no cuenta los que viajaron");
  });
  test("comprueba los dos casos en que NO hay que mandar nada", () => {
    esperar(sql.includes("sin calificar")).verdadero("no comprueba el lead sin calificación");
    esperar(sql.includes("dos puestas")).verdadero("no comprueba las dos calificaciones a la vez");
  });
  test("se deshace sola: nada queda guardado en producción", () => {
    // SE MIRA EL FINAL, NO EL ARCHIVO. Buscar «raise exception» a secas pasaba
    // aunque el último dejara de serlo: lo encontraba en los FALLA de arriba, y
    // entonces el contacto de mentira se queda en producción. Se vio mutando.
    esperar(/raise exception 'LOS \d+ PUNTOS EN OK/.test(sql)).verdadero(
      "la prueba crea un contacto y una salida de mentira y no los deshace",
    );
  });
});

process.exit(await correrPruebas());
