/**
 * Lo que se escribe a mano en las pantallas de la tienda.
 *
 * SE ESCRIBE, NO SE ARRASTRA. Un constructor de formularios con cajitas que se
 * arrastran es bonito y es media semana de trabajo; estas dos gramáticas se
 * entienden en diez segundos y ya dejan al negocio preguntar y vender lo que
 * necesita. Además son EXACTAMENTE las que ya usan en su hoja de cálculo, así
 * que migrar es copiar y pegar.
 *
 * Vive fuera de las acciones de servidor porque un archivo `"use server"` solo
 * puede exportar funciones asíncronas — y porque así se puede probar sin base
 * de datos, que es lo que de verdad importa: aquí se decide qué se le pregunta
 * a un cliente y cuánto se le cobra de más.
 */

import { leerOpciones, leerModo, type GrupoVariedad } from "./variedades";
import type { PreguntaPedido } from "./config";

/**
 * Las preguntas del pedido, una por línea:
 *
 *     Nombre Completo*
 *     Forma de Pago* | Yappy, Efectivo, Tarjeta
 *     Comentarios | parrafo
 *
 * El asterisco marca lo obligatorio, igual que en el sistema que ya usan.
 */
export function leerPreguntasEscritas(texto: string | null | undefined): PreguntaPedido[] {
  const fuera: PreguntaPedido[] = [];
  const vistos = new Set<string>();

  for (const linea of String(texto ?? "").split("\n")) {
    const cruda = linea.trim();
    if (!cruda) continue;

    const [izq, ...resto] = cruda.split("|");
    let etiqueta = izq.trim();
    const obligatoria = etiqueta.endsWith("*");
    if (obligatoria) etiqueta = etiqueta.slice(0, -1).trim();
    if (!etiqueta) continue;

    const cola = resto.join("|").trim();
    let tipo: PreguntaPedido["tipo"] = "texto";
    let opciones: string[] | undefined;

    if (cola) {
      const bajo = cola.toLowerCase();
      if (bajo === "parrafo" || bajo === "párrafo") tipo = "parrafo";
      else if (bajo === "telefono" || bajo === "teléfono") tipo = "telefono";
      else {
        const partes = cola.split(",").map((o) => o.trim()).filter(Boolean);
        // UNA SOLA OPCIÓN NO ES UNA LISTA: es un dato fijo. Pintarlo como
        // desplegable de un elemento solo confunde a quien está pidiendo.
        if (partes.length > 1) {
          tipo = "lista";
          opciones = partes;
        }
      }
    }

    // EL ID SALE DE LA ETIQUETA, no de la posición, para que sobreviva a
    // reordenar las líneas: el id es lo que se guarda con cada pedido, y si
    // cambiara al mover una pregunta, los pedidos viejos dejarían de cuadrar
    // con los nuevos y el histórico se volvería ilegible.
    let id =
      etiqueta
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || `pregunta_${fuera.length + 1}`;

    // Dos preguntas con el mismo texto pisarían la misma respuesta.
    if (vistos.has(id)) {
      let n = 2;
      while (vistos.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    vistos.add(id);

    fuera.push({ id, etiqueta, tipo, obligatoria, ...(opciones ? { opciones } : {}) });
  }

  return fuera;
}

/** Las preguntas guardadas, de vuelta al texto que se edita. */
export function escribirPreguntas(preguntas: PreguntaPedido[] | null | undefined): string {
  return (preguntas ?? [])
    .map((p) => {
      const cola =
        p.tipo === "lista" && p.opciones?.length
          ? ` | ${p.opciones.join(", ")}`
          : p.tipo === "parrafo"
            ? " | parrafo"
            : p.tipo === "telefono"
              ? " | telefono"
              : "";
      return `${p.etiqueta}${p.obligatoria ? "*" : ""}${cola}`;
    })
    .join("\n");
}

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
