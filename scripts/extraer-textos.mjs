/**
 * SACAR EL ESPAÑOL DE UNA PANTALLA Y DEJARLO PIDIENDO TRADUCCIÓN.
 *
 *   node scripts/extraer-textos.mjs <archivo> <espacio> [--escribir]
 *
 * Sin `--escribir` solo enseña lo que haría. Es a propósito: reescribe JSX, y
 * JSX tiene mil formas. Se mira antes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE HACE, Y LO QUE DELIBERADAMENTE NO HACE.
 *
 * SÍ: el texto entre etiquetas (`>Guardar<`), los atributos que lee una persona
 * (`placeholder`, `title`, `alt`, `aria-label`), y añade el `import` y el
 * `const t` que correspondan — `getTranslations` si el archivo es de servidor,
 * `useTranslations` si lleva "use client".
 *
 * NO: nada con `${...}` dentro, ni cadenas partidas en varias líneas, ni las
 * que están dentro de `console.error`. Esas las deja marcadas y las arregla una
 * persona. Una frase interpolada mal convertida no falla al compilar: sale en
 * pantalla con un hueco vacío y nadie se entera hasta que lo ve un cliente.
 *
 * ── LAS CLAVES SE DERIVAN DEL TEXTO, NO DEL ORDEN ─────────────────────────
 *
 * `guardarCambios`, no `texto17`. Con claves por orden, insertar un botón
 * arriba renumera todo lo de abajo: el diccionario deja de cuadrar y nadie
 * puede revisar una traducción sin abrir el código al lado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from "node:fs";
import path from "node:path";

const [, , archivo, espacio, ...resto] = process.argv;
const escribir = resto.includes("--escribir");

if (!archivo || !espacio) {
  console.error("Uso: node scripts/extraer-textos.mjs <archivo> <espacio> [--escribir]");
  process.exit(2);
}

const RAIZ = path.resolve(import.meta.dirname, "..");
const P = path.resolve(RAIZ, archivo);
if (!fs.existsSync(P)) {
  console.error(`No existe: ${archivo}`);
  process.exit(2);
}

let src = fs.readFileSync(P, "utf8");
const esCliente = /^\s*["']use client["']/m.test(src);

const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const PALABRAS =
  /\b(el|la|los|las|de|del|que|para|con|una|un|por|tu|tus|su|sus|más|cuando|desde|hasta|sin|sobre|entre|cada|todo|toda|esto|esta|aquí|ahora|nuevo|nueva|guardar|cancelar|crear|borrar|enviar|agregar|elegir|buscar|nombre|correo|teléfono|cliente|clientes|mensaje|mensajes|chatbot|negocio|cuenta|plan|pedido|pedidos|cita|citas)\b/i;

const esFrase = (s) => {
  const t = s.trim();
  if (t.length < 3) return false;
  if (/^[\d\s\W]+$/.test(t)) return false;
  return ACENTOS.test(t) || PALABRAS.test(t);
};

/** Una clave legible, sacada del propio texto. */
function claveDe(texto, usadas) {
  const palabras = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["el","la","los","las","de","del","que","para","con","una","un","por","y","o","a","en","tu","su"].includes(w))
    .slice(0, 4);
  let base = palabras
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
  if (!base) base = "texto";
  let k = base;
  let n = 2;
  while (usadas.has(k)) k = `${base}${n++}`;
  usadas.add(k);
  return k;
}

const usadas = new Set();
const dicc = {};
const saltados = [];
let cambios = 0;

/**
 * LO QUE PARECE TEXTO Y ES CÓDIGO.
 *
 * PASÓ EN LA PRIMERA PASADA, y escribió la basura en el archivo: TypeScript usa
 * `<` y `>` para los genéricos, así que `useRef<Mesa[]>(null); ... useRef<` da
 * un «texto entre etiquetas» que en realidad son tres líneas de código con un
 * comentario dentro. Salió una clave llamada `nullEstadoMesasLegible`.
 *
 * Por eso no basta con mirar si parece español: hay que descartar lo que lleva
 * señales de código. Un texto de pantalla no tiene `;`, ni `=`, ni un
 * comentario dentro.
 */
const HUELE_A_CODIGO = /[;={}`]|\/\*|\*\/|\bconst\b|\bfunction\b|\breturn\b|\buse[A-Z]/;

const seSalta = (s) =>
  s.includes("${") || s.includes("=>") || s.includes("&&") || s.includes("?.") ||
  HUELE_A_CODIGO.test(s);

/**
 * JSX PARTE LAS FRASES EN VARIAS LÍNEAS, Y ESO NO ES UNA FRASE DISTINTA.
 *
 * El formateador corta una frase larga donde le cabe, así que casi todo el
 * texto de verdad de esta plataforma ocupa dos o tres renglones. La primera
 * versión de esto saltaba todo lo que llevara un salto de línea y sacaba dos
 * textos de una pantalla que tiene veinte: parecía que funcionaba.
 *
 * Los espacios se juntan en uno solo, que es lo que el navegador hace de todas
 * formas al pintar JSX. Lo que NO se toca es lo que lleva `{`: ahí dentro hay
 * código, y un texto con un hueco de código no se puede mandar a traducir de
 * una pieza.
 */
const unaLinea = (s) => s.replace(/\s+/g, " ").trim();

// ── 1) Texto entre etiquetas, aunque ocupe varios renglones ─────────────────
src = src.replace(/>([^<>{}]+)</g, (todo, crudo) => {
  const s = unaLinea(crudo);
  if (!esFrase(s)) return todo;
  if (seSalta(s)) { saltados.push(s); return todo; }
  const k = claveDe(s, usadas);
  dicc[k] = s;
  cambios++;
  // Se conserva el sangrado de alrededor para no despeinar el archivo.
  const antes = /^\s*\n\s*/.test(crudo) ? crudo.match(/^\s*/)[0] : "";
  const despues = /\n\s*$/.test(crudo) ? crudo.match(/\s*$/)[0] : "";
  return `>${antes}{t("${k}")}${despues}<`;
});

// ── 2) Atributos que lee una persona ────────────────────────────────────────
src = src.replace(
  /\b(placeholder|title|alt|aria-label)\s*=\s*"([^"]+)"/g,
  (todo, attr, texto) => {
    const s = texto.trim();
    if (!esFrase(s)) return todo;
    if (seSalta(s)) { saltados.push(s); return todo; }
    const k = claveDe(s, usadas);
    dicc[k] = s;
    cambios++;
    return `${attr}={t("${k}")}`;
  },
);

// ── 3) El import y el `const t` ─────────────────────────────────────────────
if (cambios && !/useTranslations\(|getTranslations\(/.test(src)) {
  const imp = esCliente
    ? 'import { useTranslations } from "next-intl";'
    : 'import { getTranslations } from "next-intl/server";';
  /* SE BUSCA DÓNDE TERMINA UN IMPORT, NO DÓNDE EMPIEZA.
   *
   * PASÓ, y rompió dos archivos: la primera versión buscaba la última línea que
   * empezara por `import` y metía la suya justo después. Con un import de
   * varias líneas —`import {` … `} from "..."`— eso es METERSE DENTRO, y el
   * archivo deja de compilar.
   *
   * Lo que cierra un import es la línea con `from "..."`, o un import de solo
   * efecto (`import "x";`). Ésa es la que hay que buscar. */
  const lineas = src.split("\n");
  let ultimo = -1;
  for (let i = 0; i < lineas.length; i++) {
    if (/from\s+["'][^"']+["'];?\s*$/.test(lineas[i])) ultimo = i;
    else if (/^import\s+["'][^"']+["'];?\s*$/.test(lineas[i])) ultimo = i;
  }
  if (ultimo < 0) {
    saltados.push("(!) no encontré dónde poner el import — hazlo a mano");
  } else {
    lineas.splice(ultimo + 1, 0, imp);
    src = lineas.join("\n");
  }

  // El `const t` va justo después de abrir el componente exportado.
  const re = esCliente
    ? /export (?:default )?function\s+\w+\([^)]*\)\s*\{/
    : /export default async function\s+\w+\([^)]*\)\s*\{/;
  const m = re.exec(src);
  if (m) {
    const decl = esCliente
      ? `\n  const t = useTranslations("${espacio}");`
      : `\n  const t = await getTranslations("${espacio}");`;
    src = src.slice(0, m.index + m[0].length) + decl + src.slice(m.index + m[0].length);
  } else {
    saltados.push("(!) no encontré dónde poner el `const t` — hazlo a mano");
  }
}

// ── Informe ─────────────────────────────────────────────────────────────────
console.log(`\n${archivo}  →  espacio «${espacio}»  ${esCliente ? "[cliente]" : "[servidor]"}`);
console.log(`   ${cambios} textos extraídos, ${saltados.length} saltados\n`);

if (Object.keys(dicc).length) {
  console.log("── Para messages/es.json ────────────────────────────────");
  console.log(JSON.stringify({ [espacio]: dicc }, null, 2));
}
if (saltados.length) {
  console.log("\n── SALTADOS (los arregla una persona) ───────────────────");
  for (const s of saltados) console.log(`   · ${s.slice(0, 90)}`);
}

if (escribir && cambios) {
  fs.writeFileSync(P, src, "utf8");
  console.log(`\n✅ Escrito. Revisa el archivo antes de dar nada por bueno.`);
} else if (!escribir) {
  console.log(`\n(prueba en seco — añade --escribir cuando lo hayas mirado)`);
}
