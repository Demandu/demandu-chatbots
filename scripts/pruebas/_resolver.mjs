/**
 * Permite a Node importar el código del proyecto tal cual está escrito:
 * sin extensión ("./engine") y con el alias "@/..." que usa Next.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");

export async function resolve(especificador, contexto, siguiente) {
  let spec = especificador;

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
