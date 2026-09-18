/**
 * CUÁNTO ESPAÑOL ESCRITO A MANO QUEDA EN EL PANEL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Vive aquí, y no dentro de la regla ni del medidor, porque lo usan LOS DOS: la
 * regla del trinquete (`estatico.mjs`) y el informe que se corre a mano
 * (`scripts/medir-idiomas.mjs`). Con dos cuentas distintas, el informe diría
 * una cosa y la regla otra, y la que mandara sería la que nadie mira.
 *
 * ── LA CUENTA ES UNA HEURÍSTICA, Y ESO ESTÁ BIEN ──────────────────────────
 *
 * No hay forma exacta de saber si una cadena la lee un humano. Lo que importa
 * no es que el número sea la verdad absoluta, sino que sea EL MISMO cada vez:
 * el trinquete compara el número de hoy con el de ayer, así que solo necesita
 * ser estable y moverse en la dirección correcta cuando se traduce algo.
 *
 * Por eso no se afina para que dé «el número bonito». Si se cambia esta
 * función, la línea base entera deja de valer y hay que rehacerla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from "node:fs";
import path from "node:path";

export const sinComentarios = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function listar(dir, filtro = /\.(ts|tsx)$/) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listar(p, filtro) : filtro.test(e.name) ? [p] : [];
  });
}

const ACENTOS = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
const PALABRAS_ES =
  /\b(el|la|los|las|de|del|que|para|con|una|un|por|tu|tus|su|sus|más|cuando|desde|hasta|sin|sobre|entre|cada|todo|toda|esto|esta|ese|esa|aquí|ahora|nuevo|nueva|guardar|cancelar|crear|borrar|enviar|agregar|elegir|buscar|nombre|correo|teléfono|cliente|clientes|mensaje|mensajes|chatbot|negocio|cuenta|plan|pedido|pedidos|cita|citas)\b/i;

/** ¿Esta cadena la lee una persona, y está en español? */
export function pareceEspanol(s) {
  const t = String(s ?? "").trim();
  if (t.length < 3) return false;
  if (/^[\d\s\W]+$/.test(t)) return false;
  return ACENTOS.test(t) || PALABRAS_ES.test(t);
}

/** ¿Este archivo ya pide traducciones? */
export const usaTraduccion = (t) =>
  /useTranslations\(|getTranslations\(|from "next-intl"/.test(t);

/** Los textos visibles en español de un archivo. */
export function textosVisibles(txt) {
  const t = sinComentarios(txt);
  const fuera = new Set();

  // Entre etiquetas: >Texto<
  for (const m of t.matchAll(/>\s*([^<>{}\n][^<>{}]{2,})\s*</g)) {
    const s = m[1].trim();
    if (s.includes("=>") || s.includes("&&") || s.includes("?.")) continue;
    if (pareceEspanol(s)) fuera.add(s);
  }
  // Atributos que el usuario lee.
  for (const m of t.matchAll(
    /\b(placeholder|title|alt|label|aria-label|legend)\s*=\s*"([^"]{3,})"/g,
  )) {
    if (pareceEspanol(m[2])) fuera.add(m[2].trim());
  }
  // Cadenas sueltas largas: títulos, descripciones, errores.
  for (const m of t.matchAll(/["'`]([^"'`\n]{12,})["'`]/g)) {
    const s = m[1].trim();
    if (s.startsWith("@/") || s.startsWith("http") || s.startsWith("/")) continue;
    if (/^[a-z_]+$/.test(s)) continue; // claves, no frases
    if (s.includes("${")) continue;
    if (pareceEspanol(s)) fuera.add(s);
  }
  return [...fuera];
}

/**
 * Las zonas de la aplicación.
 *
 * Se cuenta POR ZONA y no un total, a propósito: un solo número deja esconder
 * que alguien tradujo veinte textos de la tienda mientras metía veinte nuevos
 * en el constructor. El trinquete tiene que apretar en cada sitio.
 */
export function zonaDe(r) {
  if (r.includes("/settings/")) return "Configuración";
  if (r.includes("/builder") || r.includes("/nodos") || r.includes("/flow")) return "Constructor de flujos";
  if (r.includes("/bots/")) return "Chatbots";
  if (r.includes("/inbox")) return "Bandeja";
  if (r.includes("/tienda") || r.includes("/pedidos") || r.includes("/catalog")) return "Tienda";
  if (r.includes("/reservas")) return "Reservas";
  if (r.includes("/crm") || r.includes("/embudo") || r.includes("/campaigns")) return "CRM y campañas";
  if (r.includes("/calendario") || r.includes("/agenda")) return "Agenda";
  if (r.includes("/superadmin")) return "Superadmin (interno)";
  if (r.startsWith("src/components/")) return "Componentes sueltos";
  if (r.startsWith("src/lib/")) return "Textos dentro de la lógica";
  return "Resto del panel";
}

/**
 * Cuántos textos en español quedan en cada zona.
 *
 * Solo cuenta los de archivos que NO piden traducciones: un archivo ya
 * traducido puede conservar cadenas en español legítimas —el idioma de fábrica,
 * un ejemplo— y contarlas obligaría a inventar excepciones.
 */
export function medirPorZona(raiz) {
  const SRC = path.join(raiz, "src");
  const porZona = new Map();
  for (const f of listar(SRC)) {
    const ruta = path.relative(raiz, f).split(path.sep).join("/");
    const texto = fs.readFileSync(f, "utf8");
    if (usaTraduccion(texto)) continue;
    const cuantos = textosVisibles(texto).length;
    if (!cuantos) continue;
    const z = zonaDe(ruta);
    porZona.set(z, (porZona.get(z) ?? 0) + cuantos);
  }
  return porZona;
}

/** La línea base, tal como se guarda y se lee. Una zona por renglón. */
export function leerLineaBase(archivo) {
  const base = new Map();
  if (!fs.existsSync(archivo)) return base;
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue; // la cabecera explica el archivo
    const m = /^(.+?):\s*(\d+)\s*$/.exec(l);
    if (m) base.set(m[1].trim(), Number(m[2]));
  }
  return base;
}

export function escribirLineaBase(archivo, porZona, cabecera) {
  const cuerpo = [...porZona.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([z, n]) => `${z}: ${n}`)
    .join("\n");
  fs.writeFileSync(archivo, `${cabecera}\n${cuerpo}\n`, "utf8");
}
