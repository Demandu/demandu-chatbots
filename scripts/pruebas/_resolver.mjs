/**
 * Permite a Node importar el código del proyecto tal cual está escrito:
 * sin extensión ("./engine") y con el alias "@/..." que usa Next.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/**
 * `server-only` es un paquete que NO HACE NADA en tiempo de ejecución: existe
 * para que el compilador de Next reviente si un componente de navegador
 * importa código de servidor. Aquí no hay compilador de Next, y exigir el
 * paquete instalado convertiría «correr las pruebas» en «tener node_modules
 * al día» — que es justo lo que hace que las pruebas dejen de correrse.
 *
 * Se resuelve a un archivo vacío. La barrera de verdad la comprueba la prueba
 * estática «ningún componente de cliente importa un módulo de solo-servidor»,
 * que no necesita ejecutar nada.
 */
const VACIO = pathToFileURL(path.join(import.meta.dirname, "_vacio.mjs")).href;

export async function resolve(especificador, contexto, siguiente) {
  let spec = especificador;

  if (spec === "server-only" || spec === "client-only") return siguiente(VACIO, contexto);

  // Alias "@/algo" → "<raíz>/src/algo"
  if (spec.startsWith("@/")) spec = pathToFileURL(path.join(RAIZ, "src", spec.slice(2))).href;

  // Sin extensión: probamos .ts, .tsx y /index.ts
  const esRelativo = spec.startsWith(".") || spec.startsWith("file:");
  if ((esRelativo || spec.startsWith("/")) && !/\.[a-z]+$/i.test(spec)) {
    const base = spec.startsWith("file:")
      ? new URL(spec).pathname
      : path.resolve(path.dirname(new URL(contexto.parentURL).pathname), spec);
    for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (existsSync(cand)) return siguiente(pathToFileURL(cand).href, contexto);
    }
  }
  return siguiente(spec, contexto);
}
