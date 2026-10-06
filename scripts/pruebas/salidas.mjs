/**
 * Pruebas de LAS SALIDAS A OTROS SISTEMAS: lo que no puede volver a pasar.
 *
 *  · Un lead de una cuenta acabó en el CRM de otra porque las dos salidas
 *    apuntaban a la misma URL (19 sep → 5 oct 2026). La regla vive en la base
 *    (índice único sobre las salidas activas) y se prueba contra la base real
 *    con `un-destino-una-cuenta-base-de-datos.sql`. Aquí se vigila que la
 *    pantalla traduzca ese rechazo y que el aviso diga de qué cuenta sale.
 *  · `lead.nuevo` salía dos veces si la persona escribía dos mensajes en diez
 *    segundos. La regla vive en `emitir_evento` y se prueba contra la base real
 *    con `lead-nuevo-una-vez-base-de-datos.sql`.
 *
 *   node --experimental-strip-types scripts/pruebas/correr.mjs scripts/pruebas/salidas.mjs
 */
import { readFileSync } from "node:fs";
import { describe, test, esperar, correrPruebas } from "./_runner.mjs";
import { sinComentarios } from "./medirEspanol.mjs";

const acciones = sinComentarios(readFileSync("src/app/(dashboard)/settings/integrations/salidas.ts", "utf8"));
const enviar = sinComentarios(readFileSync("src/app/api/salidas/enviar/route.ts", "utf8"));
const probar = readFileSync("scripts/probar.sh", "utf8");
const sqlDestino = readFileSync("scripts/pruebas/un-destino-una-cuenta-base-de-datos.sql", "utf8");
const sqlLeadNuevo = readFileSync("scripts/pruebas/lead-nuevo-una-vez-base-de-datos.sql", "utf8");
const migracionDestino = readFileSync("supabase/migrations/20260101022900_un_destino_una_sola_cuenta.sql", "utf8");
const migracionLeadNuevo = readFileSync("supabase/migrations/20260101022800_un_lead_nuevo_avisa_una_vez.sql", "utf8");

describe("Salidas: un destino recibe los avisos de una sola cuenta", () => {
  test("la regla es un índice único en la base, solo sobre las activas", () => {
    esperar(/create unique index[\s\S]*on public\.salidas \(url\)[\s\S]*where activa/.test(migracionDestino)).verdadero(
      "la regla no está en la base: una pantalla se salta, un índice no",
    );
  });
  test("la pantalla traduce el rechazo en vez de enseñar «duplicate key»", () => {
    esperar(acciones.includes('"23505"')).verdadero("no reconoce el rechazo del índice único");
    esperar(acciones.includes("mensajeDestinoRepetido")).verdadero("no tiene un mensaje que una persona entienda");
    for (const idioma of ["es", "en", "pt-BR"]) {
      const m = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8"));
      esperar(typeof m?.salidas?.destinoRepetido === "string" && m.salidas.destinoRepetido.length > 20).verdadero(
        `el mensaje no está traducido a ${idioma}`,
      );
    }
    // Las DOS puertas: crear una salida nueva y volver a encender una editada.
    const veces = acciones.split("esDestinoRepetido(error)").length - 1;
    esperar(veces >= 2).verdadero(`solo ${veces} de las 2 acciones traducen el rechazo`);
  });
  test("cada aviso dice de qué cuenta sale", () => {
    esperar(enviar.includes("cuenta_id: e.org_id")).verdadero("el aviso no dice de qué cuenta es; quien recibe de varias no puede separarlas");
    esperar(/select\("id, org_id,/.test(enviar)).verdadero("manda cuenta_id pero no lo lee de la cola");
  });
  test("la prueba contra la base existe, cubre las dos cuentas y se deshace sola", () => {
    esperar(probar.includes("un-destino-una-cuenta-base-de-datos.sql")).verdadero("nadie sabe que hay que correrla");
    esperar(sqlDestino.includes("dos cuentas distintas")).verdadero("no comprueba el caso entre cuentas, que es el que pasó");
    esperar(sqlDestino.includes("por duplicado")).verdadero("no comprueba el caso dentro de la misma cuenta");
    esperar(sqlDestino.includes("encender")).verdadero("no comprueba que volver a encender una apagada también choca");
    esperar(/raise exception 'LOS \d+ PUNTOS EN OK/.test(sqlDestino)).verdadero("no se deshace sola");
  });
});

describe("Salidas: un lead es nuevo una sola vez", () => {
  test("la regla vive en emitir_evento, en la base, y marca la ficha", () => {
    esperar(migracionLeadNuevo.includes("lead_nuevo_avisado_at")).verdadero("no hay marca en la ficha");
    esperar(/update public\.contacts[\s\S]*lead_nuevo_avisado_at is null/.test(migracionLeadNuevo)).verdadero(
      "la marca no se reclama con un UPDATE condicional: dos llamadas a la vez ganarían las dos",
    );
    esperar(/set lead_nuevo_avisado_at = created_at/.test(migracionLeadNuevo)).verdadero(
      "las fichas viejas no se marcan: cualquiera podría volver a presentarse como nueva",
    );
  });
  test("la prueba contra la base existe, cubre el segundo mensaje y se deshace sola", () => {
    esperar(probar.includes("lead-nuevo-una-vez-base-de-datos.sql")).verdadero("nadie sabe que hay que correrla");
    esperar(sqlLeadNuevo.includes("segundo mensaje")).verdadero("no comprueba el segundo mensaje, que es el caso que pasó");
    esperar(sqlLeadNuevo.includes("lead.datos")).verdadero("no comprueba que los demás eventos sigan saliendo");
    esperar(/raise exception 'LOS \d+ PUNTOS EN OK/.test(sqlLeadNuevo)).verdadero("no se deshace sola");
  });
});

process.exit(await correrPruebas());
