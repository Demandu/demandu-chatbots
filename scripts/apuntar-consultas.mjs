/**
 * Vuelve a apuntar la línea base de consultas que no miran su error.
 *
 *     node scripts/apuntar-consultas.mjs
 *
 * SE CORRE CUANDO BAJA, NO CUANDO SUBE. Si la regla te falló por un archivo que
 * acabas de tocar, lo que toca es capturar el error en la consulta nueva — no
 * apuntar el número más alto. Apuntar hacia arriba es apagar la regla.
 *
 * Usa EL MISMO detector que la prueba (`consultasSinMirar.mjs`). Si cada uno
 * tuviera el suyo, se separarían y la línea base dejaría de significar nada.
 */
import fs from "node:fs";
import path from "node:path";
import { escanear, comoLineaBase, leerLineaBase } from "./pruebas/consultasSinMirar.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const ARCHIVO = path.join(RAIZ, "scripts/pruebas/consultas-sin-mirar-el-error.txt");

const { porArchivo, miran, noMiran } = escanear(RAIZ);

if (noMiran === 0 || miran === 0) {
  console.error("❌ El detector está roto: encontró", miran, "que miran y", noMiran, "que no.");
  console.error("   Con cualquiera de los dos en cero, la línea base no vale nada.");
  process.exit(3);
}

const antes = leerLineaBase(ARCHIVO);
const total = antes ? [...antes.values()].reduce((a, b) => a + b, 0) : null;

fs.writeFileSync(ARCHIVO, comoLineaBase(porArchivo) + "\n");

console.log(`📌 Apuntadas ${noMiran} consultas sin mirar el error, en ${porArchivo.size} archivos.`);
console.log(`   (${miran} sí lo miran)`);
if (total !== null) {
  const d = noMiran - total;
  console.log(d < 0 ? `   ✅ Bajaste ${-d} desde la última vez.`
    : d > 0 ? `   ⚠️  SUBIÓ en ${d}. ¿Seguro que querías apuntar esto?`
    : "   Sin cambios.");
}
