/** Registra el resolver y ejecuta el archivo de pruebas indicado. */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./_resolver.mjs", import.meta.url);
await import(pathToFileURL(process.argv[2]).href);
