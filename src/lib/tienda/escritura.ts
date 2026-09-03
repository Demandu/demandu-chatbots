/**
 * Las variedades, escritas igual que en la hoja de cálculo.
 *
 * QUEDA UNA SOLA GRAMÁTICA ESCRITA, y solo porque es la del sistema que ya
 * usan: sirve para LEER lo que se pega desde su hoja. Configurar a mano ya no
 * se hace escribiendo —ni las opciones ni las preguntas— porque quien monta una
 * tienda no habla ese idioma.
 *
 * Vive fuera de las acciones de servidor porque un archivo `"use server"` solo
 * puede exportar funciones asíncronas — y porque así se puede probar sin base
 * de datos, que es lo que de verdad importa: aquí se decide cuánto se le cobra
 * de más a alguien.
 */

import { leerOpciones, leerModo, type GrupoVariedad } from "./variedades";

/**
 * Los grupos de variedades, escritos igual que en la hoja:
 *
 *     Tamaño | una | 5 lbs., 15 lbs. {3}
 *     Sabor | hasta completar 3 | Pollo, Salmón {2.50}
 */
export function leerGruposEscritos(texto: string | null | undefined): GrupoVariedad[] {
  return String(texto ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const partes = linea.split("|");
      const nombre = (partes[0] ?? "").trim();
      const modoCrudo = (partes[1] ?? "").trim();
      const opcionesCrudas = partes.slice(2).join("|").trim();
      const modo = leerModo(modoCrudo);
      const cantidad = Number((modoCrudo.match(/\d+/) ?? [])[0] ?? 0);
      return {
        nombre,
        modo,
        ...(modo === "hasta_completar" && cantidad > 0 ? { cantidad } : {}),
        opciones: leerOpciones(opcionesCrudas),
      };
    })
    // UN GRUPO SIN OPCIONES NO SE GUARDA: sería una pregunta que el cliente no
    // puede contestar, y si el producto la necesita, no se puede ni pedir.
    .filter((g) => g.nombre && g.opciones.length);
}

/** Los grupos guardados, de vuelta al texto que se edita. */
export function escribirGrupos(grupos: GrupoVariedad[] | null | undefined): string {
  return (grupos ?? [])
    .map((g) => {
      const modo =
        g.modo === "hasta_completar"
          ? `hasta completar ${g.cantidad ?? ""}`.trim()
          : g.modo === "varias"
            ? "varias"
            : "una";
      const ops = (g.opciones ?? [])
        .map((o) => (o.recargo ? `${o.texto} {${(o.recargo / 100).toFixed(2)}}` : o.texto))
        .join(", ");
      return `${g.nombre} | ${modo} | ${ops}`;
    })
    .join("\n");
}
