/**
 * LAS CONSULTAS QUE NO MIRAN SU ERROR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORMA EXACTA DEL FALLO QUE MÁS VECES NOS HA MORDIDO:
 *
 *     const { data: x } = await sb.from("tienda_cobros").select(...)   ← el error no se mira
 *     if (!x) return { ok: false, mensaje: "no está configurado" }     ← se afirma algo falso
 *
 * Cuando la consulta falla —permisos, una columna que no existe, la red—
 * PostgREST devuelve `data: null`. Y `data: null` también es lo que devuelve una
 * consulta perfecta que no encontró nada. El código no puede distinguirlas, así
 * que **convierte un error en una mentira**:
 *
 *   · `paws-at-home` dijo «esta tienda todavía no puede recibir pedidos» durante
 *     días. Yappy estaba configurado. Era un `.neq()` que Postgres denegaba por
 *     permisos de columna.
 *   · «Ese pedido no es de esta tienda» — eran dos columnas inventadas que hacían
 *     que PostgREST rechazara la consulta entera.
 *   · «No tienes ningún pedido a tu nombre. No inventes uno» a quien acababa de
 *     pagar.
 *
 * Ninguno de los tres dejó un error en ningún sitio. Los tres le dijeron al
 * cliente algo que no era verdad, con total seguridad.
 *
 * ── POR QUÉ LÍNEA BASE Y NO «ARRÉGLALOS TODOS» ────────────────────────────
 *
 * Hoy hay 241 sitios así. Una regla que falle por los 241 no la arregla nadie:
 * se desactiva el primer día y se queda desactivada. Se apunta lo que hay y
 * esto falla solo si aparece uno NUEVO — es como se adopta una regla sobre
 * código que ya existe sin parar todo.
 *
 * ESA LISTA ES UNA DEUDA, NO UN PERMISO. Cada número que baja es una pantalla
 * que dejará de mentirle a un cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Se busca el destructuring de un `await ... .from("tabla")`.
 *
 * El hueco de 400 caracteres entre `await` y `.from(` es a propósito: entre
 * medias caben `createAdminClient()`, `ctx.admin`, un `(await x())`… Lo que no
 * cabe es otra sentencia entera, así que no se enganchan dos consultas
 * distintas.
 */
const CONSULTA = /const\s*\{([^}]*)\}\s*=\s*await\s+([\s\S]{0,400}?)\.from\(\s*["`]([a-zA-Z_0-9]+)["`]/g;

const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function listar(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/**
 * Cuenta, por archivo, cuántas consultas NO capturan su error.
 *
 * Devuelve también cuántas SÍ lo capturan: si ese número fuera cero, el que
 * está roto es este detector y no el código. Ver el guardián en la regla.
 */
export function escanear(raiz) {
  const src = path.join(raiz, "src");
  const porArchivo = new Map();
  let miran = 0;
  let noMiran = 0;

  for (const abs of listar(src)) {
    const rel = path.relative(raiz, abs).split(path.sep).join("/");
    const texto = sinComentarios(fs.readFileSync(abs, "utf8"));
    let m;
    CONSULTA.lastIndex = 0;
    while ((m = CONSULTA.exec(texto))) {
      if (/\berror\b/.test(m[1])) miran++;
      else {
        noMiran++;
        porArchivo.set(rel, (porArchivo.get(rel) ?? 0) + 1);
      }
    }
  }
  return { porArchivo, miran, noMiran };
}

/** El formato de la línea base: «<cuántas>  <archivo>», ordenado por archivo. */
export function comoLineaBase(porArchivo) {
  return [...porArchivo.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ruta, n]) => `${n}  ${ruta}`)
    .join("\n");
}

export function leerLineaBase(archivo) {
  if (!fs.existsSync(archivo)) return null;
  const m = new Map();
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    const t = linea.trim();
    if (!t) continue;
    const [n, ...resto] = t.split(/\s+/);
    m.set(resto.join(" "), Number(n));
  }
  return m;
}
