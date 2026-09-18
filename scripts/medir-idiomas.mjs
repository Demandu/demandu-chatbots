/**
 * ¿CUÁNTO FALTA PARA QUE LA PLATAFORMA HABLE TRES IDIOMAS?
 *
 *   node scripts/medir-idiomas.mjs            → el informe
 *   node scripts/medir-idiomas.mjs --guardar  → además baja la línea base
 *
 * La cuenta la hace `scripts/pruebas/medirEspanol.mjs`, la MISMA que usa la
 * regla del trinquete. Con dos cuentas distintas, el informe diría una cosa y
 * la regla otra.
 */
import fs from "node:fs";
import path from "node:path";
import {
  medirPorZona, leerLineaBase, escribirLineaBase,
  listar, textosVisibles, usaTraduccion, sinComentarios, pareceEspanol,
} from "./pruebas/medirEspanol.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const BASE = path.join(RAIZ, "scripts/pruebas/espanol-sin-traducir.txt");
const CABECERA = `# CUÁNTO ESPAÑOL ESCRITO A MANO QUEDA, POR ZONA.
#
# Esto es un TRINQUETE: la regla de estatico.mjs se pone roja si algún número
# SUBE. Se puede bajar todo lo que se quiera —eso es traducir— pero no subir.
#
# Si un número sube porque de verdad hacía falta texto nuevo, se baja otro tanto
# traduciendo algo, o se sube este archivo a mano Y se explica en el commit.
#
# Se regenera con:  node scripts/medir-idiomas.mjs --guardar`;

const porZona = medirPorZona(RAIZ);
const base = leerLineaBase(BASE);

// ── Los diccionarios ────────────────────────────────────────────────────────
const DIR = path.join(RAIZ, "messages");
const contar = (o) =>
  Object.values(o ?? {}).reduce(
    (n, v) => n + (v && typeof v === "object" ? contar(v) : 1),
    0,
  );

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  CUÁNTO FALTA PARA QUE LA PLATAFORMA HABLE 3 IDIOMAS     ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

if (fs.existsSync(DIR)) {
  console.log("── Traducido ────────────────────────────────────────────");
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    console.log(`   ${f.padEnd(12)} ${String(contar(j)).padStart(5)} textos`);
  }
  console.log("");
}

console.log("── Sin traducir, por zona ───────────────────────────────");
const filas = [...porZona.entries()].sort((a, b) => b[1] - a[1]);
let total = 0;
let subio = false;
for (const [z, n] of filas) {
  total += n;
  const antes = base.get(z);
  let marca = "";
  if (antes === undefined) marca = "  (nuevo)";
  else if (n > antes) { marca = `  ⬆ SUBIÓ (era ${antes})`; subio = true; }
  else if (n < antes) marca = `  ⬇ bajó ${antes - n}`;
  console.log(`   ${z.padEnd(26)} ${String(n).padStart(5)}${marca}`);
}
console.log(`   ${"".padEnd(26)} ${"─".repeat(5)}`);
console.log(`   ${"TOTAL".padEnd(26)} ${String(total).padStart(5)}`);

// ── Lo que no es el panel ───────────────────────────────────────────────────
const motor = path.join(RAIZ, "supabase/functions/whatsapp/index.ts");
if (fs.existsSync(motor)) {
  const t = sinComentarios(fs.readFileSync(motor, "utf8"));
  const frases = new Set();
  for (const m of t.matchAll(/["'`]([^"'`\n]{12,})["'`]/g)) {
    const s = m[1].trim();
    if (s.startsWith("http") || s.includes("${") || /^[a-z_.]+$/.test(s)) continue;
    if (pareceEspanol(s)) frases.add(s);
  }
  console.log(`\n── Aparte del panel ─────────────────────────────────────`);
  console.log(`   Motor de WhatsApp: ${frases.size} frases`);
  console.log(`   (le habla a TU CLIENTE, no a tu usuario: el idioma sale de la`);
  console.log(`    conversación, no del panel. Es otra función.)`);
}

// ── Los archivos que más pesan ──────────────────────────────────────────────
console.log("\n── Los 15 archivos con más texto sin traducir ───────────");
const pesados = [];
for (const f of listar(path.join(RAIZ, "src"))) {
  const ruta = path.relative(RAIZ, f).split(path.sep).join("/");
  const texto = fs.readFileSync(f, "utf8");
  if (usaTraduccion(texto)) continue;
  const n = textosVisibles(texto).length;
  if (n) pesados.push({ ruta, n });
}
for (const p of pesados.sort((a, b) => b.n - a.n).slice(0, 15)) {
  console.log(`   ${String(p.n).padStart(4)}  ${p.ruta}`);
}

if (process.argv.includes("--guardar")) {
  escribirLineaBase(BASE, porZona, CABECERA);
  console.log(`\n✅ Línea base guardada en ${path.relative(RAIZ, BASE)}`);
} else if (subio) {
  console.log("\n⚠️  Alguna zona SUBIÓ. La regla de estatico.mjs va a ponerse roja.");
  console.log("   Tradúcelo, o —si el texto nuevo hacía falta— corre con --guardar y explícalo en el commit.");
}
console.log("");
