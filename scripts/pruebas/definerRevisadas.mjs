/**
 * LAS FUNCIONES `security definer` Y SI COMPRUEBAN QUIÉN LLAMA.
 *
 * Una función `security definer` se salta el RLS por diseño: corre con los
 * permisos de quien la escribió, no de quien la llama. Es correcto y necesario
 * —es la única forma de dejar hacer una cosa concreta que de otro modo estaría
 * prohibida— pero al saltarse el RLS la función se queda como ÚNICO guardia.
 *
 * Si además recibe un identificador por parámetro (`p_org_id`, `p_contact_id`,
 * `p_bot_id`…) y está concedida a `authenticated`, cualquiera con una cuenta
 * gratuita la llama desde la consola del navegador con el identificador de otro
 * negocio. Pasó ocho veces (0114 y 0130).
 *
 * Este módulo lee las migraciones y saca, para cada función `definer`, su
 * ÚLTIMA definición (la que manda) y si comprueba algo. Lo usa el trinquete de
 * `estatico.mjs`. La cuenta la hace un solo sitio a propósito: con dos cuentas
 * distintas, una diría una cosa y la regla otra, y mandaría la que nadie mira.
 */
import fs from "node:fs";
import path from "node:path";

/** Lo que cuenta como "comprueba quién llama". Son las tres formas de la casa:
 *  `auth_org_ids()` (¿es tuya esta organización?), `auth.uid()` (¿eres tú?) y
 *  `auth_puede(...)` (¿tienes ese permiso aquí?). */
const COMPRUEBA = /auth_org_ids|auth\.uid\s*\(|auth_puede\s*\(/i;

/** Saca los `create function` y los `drop function` de un SQL, EN ORDEN.
 *  El orden importa: la 0040 tira `estado_de_cobro` y la vuelve a crear tres
 *  líneas más abajo. Si se miraran todos los `drop` antes que los `create`, esa
 *  función desaparecería del trinquete y nadie la vigilaría nunca más. */
function sucesos(sql) {
  const salida = [];

  const cabecera = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  for (const m of sql.matchAll(cabecera)) {
    const desde = m.index;
    // El cuerpo va entre comillas de dólar ($$ ... $$ o $function$ ... $function$).
    const abre = /\$([a-z_]*)\$/i.exec(sql.slice(desde));
    if (!abre) continue;
    const iAbre = desde + abre.index;
    const cierre = sql.indexOf(abre[0], iAbre + abre[0].length);
    if (cierre === -1) continue;
    salida.push({ en: desde, tipo: "crear", nombre: m[1].toLowerCase(), texto: sql.slice(desde, cierre + abre[0].length) });
  }

  const borrado = /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi;
  for (const m of sql.matchAll(borrado)) {
    salida.push({ en: m.index, tipo: "borrar", nombre: m[1].toLowerCase() });
  }

  return salida.sort((a, b) => a.en - b.en);
}

/**
 * Recorre las migraciones en orden y devuelve un Map nombre → { comprueba,
 * disparador, migracion }. Gana la ÚLTIMA definición: es la que está viva.
 */
export function escanearDefiner(raiz) {
  const dir = path.join(raiz, "supabase/migrations");
  if (!fs.existsSync(dir)) return new Map();
  const vivas = new Map();
  for (const archivo of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dir, archivo), "utf8");
    for (const b of sucesos(sql)) {
      if (b.tipo === "borrar") { vivas.delete(b.nombre); continue; }
      if (!/security\s+definer/i.test(b.texto)) {
        // Dejó de ser definer: ya no es asunto de este trinquete.
        vivas.delete(b.nombre);
        continue;
      }
      vivas.set(b.nombre, {
        nombre: b.nombre,
        comprueba: COMPRUEBA.test(b.texto),
        disparador: /returns\s+trigger/i.test(b.texto),
        migracion: archivo,
      });
    }
  }
  return vivas;
}

/**
 * Lee la línea base: una función por renglón, `nombre | veredicto`.
 * Veredictos permitidos:
 *   candado        — comprueba quién llama, y tiene que seguir haciéndolo
 *   solo-servicio  — no concedida a anon ni a authenticated (solo service_role)
 *   disparador     — función de disparador; Postgres se niega a llamarla por RPC
 *   deriva         — no recibe identificador: lo saca de la sesión
 */
export function leerBaseDefiner(ruta) {
  if (!fs.existsSync(ruta)) return new Map();
  const base = new Map();
  for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
    const limpia = linea.replace(/#.*$/, "").trim();
    if (!limpia) continue;
    const [nombre, veredicto] = limpia.split("|").map((x) => x.trim());
    if (nombre) base.set(nombre.toLowerCase(), veredicto || "");
  }
  return base;
}

export const VEREDICTOS = ["candado", "solo-servicio", "disparador", "deriva"];
