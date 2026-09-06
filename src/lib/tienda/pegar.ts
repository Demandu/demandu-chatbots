/**
 * Pegar el catálogo desde una hoja de cálculo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA ES LA PIEZA QUE HACE QUE MIGRAR SEA POSIBLE. Cargar cincuenta productos
 * a mano, uno por uno, en una ventanita, no lo hace nadie: se abandona a la
 * mitad y la tienda se queda en la hoja vieja para siempre.
 *
 * Al copiar celdas de Google Sheets o Excel, el portapapeles trae TEXTO
 * SEPARADO POR TABULACIONES. Así que «pegar la tabla» no necesita ninguna
 * integración, ni permisos, ni que la hoja sea pública: seleccionar, copiar,
 * pegar.
 *
 * SE ENTIENDEN LOS NOMBRES DE COLUMNA QUE YA USAN —`Variedades2 Modo`,
 * `Precio Anterior`, `Ocultar`— para que no haya que reordenar nada antes de
 * copiar. Si no hay fila de encabezados, se asume el orden de la tabla de la
 * plataforma.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { aCentavos, leerOpciones, leerModo, type GrupoVariedad } from "./variedades";

export type FilaPegada = {
  nombre: string;
  descripcion: string;
  categoria: string;
  /** En centavos. */
  precio: number;
  /** En centavos, o null si no hay oferta. */
  precio_anterior: number | null;
  oculto: boolean;
  stock: number | null;
  imagen_url: string;
  variedades: GrupoVariedad[];
};

/** Sin acentos, sin mayúsculas, sin espacios de más: para comparar encabezados. */
function llave(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Los nombres que puede tener cada columna.
 *
 * Se aceptan varios a propósito: la misma columna se llama «Precio Anterior» en
 * una hoja y «antes» en otra, y quien copia no tiene por qué saber cuál
 * esperamos. Rechazar por el nombre sería devolver el trabajo por una tilde.
 */
const COLUMNAS: Record<string, string[]> = {
  nombre: ["nombre", "producto", "articulo", "item", "name"],
  descripcion: ["descripcion", "detalle", "description"],
  categoria: ["categoria", "marca", "grupo", "category"],
  precio: ["precio", "price", "valor"],
  precio_anterior: ["precio anterior", "antes", "precio antes", "precio regular"],
  oculto: ["ocultar", "oculto", "escondido", "hidden"],
  stock: ["stock", "existencia", "existencias", "cantidad", "inventario"],
  imagen_url: ["imagen", "foto", "imagen url", "image", "url imagen"],
  variedades: ["variedades", "variedad", "opciones"],
  variedades2: ["variedades2", "variedades 2", "variedad2"],
  variedades2_modo: ["variedades2 modo", "variedades 2 modo", "modo", "modo2"],
  variedades2_cantidad: ["variedades2 cantidad", "variedades 2 cantidad", "cantidad2"],
  variedades3: ["variedades3", "variedades 3", "variedad3"],
};

/** El orden de la tabla de la plataforma, para cuando se pega sin encabezados. */
const ORDEN_SIN_ENCABEZADO = [
  "nombre",
  "descripcion",
  "categoria",
  "precio",
  "precio_anterior",
  "stock",
  "oculto",
  "imagen_url",
  "variedades",
];

function queColumnaEs(encabezado: string): string | null {
  const k = llave(encabezado);
  if (!k) return null;
  for (const [campo, nombres] of Object.entries(COLUMNAS)) {
    if (nombres.includes(k)) return campo;
  }
  return null;
}

/**
 * Corta el texto pegado en filas y celdas.
 *
 * RESPETA LAS COMILLAS porque una descripción con un salto de línea dentro
 * —cosa normalísima— viene entrecomillada y con su salto tal cual. Cortando por
 * `\n` a secas, ese producto se partiría en dos filas rotas y arrastraría el
 * resto de la tabla.
 */
export function cortarTabla(texto: string | null | undefined): string[][] {
  const t = String(texto ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        // Dos comillas seguidas dentro de una celda son UNA comilla literal.
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else entreComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"' && celda === "") entreComillas = true;
    else if (c === "\t") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }

  // Una fila totalmente vacía no es un producto: es el renglón en blanco que
  // casi siempre se cuela al seleccionar de más en la hoja.
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/** ¿Es «sí»? La hoja lo escribe de seis maneras distintas. */
export function esSi(v: string | null | undefined): boolean {
  const k = llave(v ?? "");
  return ["si", "s", "x", "true", "verdadero", "1", "yes", "y"].includes(k);
}

/**
 * Convierte lo pegado en productos.
 *
 * NO SE INVENTA NADA QUE NO ESTÉ. Una celda vacía queda vacía; un precio que no
 * se entiende queda en cero y se ve en la tabla antes de guardar. Es preferible
 * que el negocio corrija dos casillas a que el importador «adivine» un precio.
 */
export function leerPegado(texto: string | null | undefined): FilaPegada[] {
  const filas = cortarTabla(texto);
  if (!filas.length) return [];

  // ¿La primera fila son encabezados? Lo es si al menos dos celdas coinciden
  // con nombres conocidos. Con una sola podría ser un producto que se llama
  // «Precio» — improbable, pero el coste de equivocarse es perder una fila.
  const posibles = filas[0].map(queColumnaEs);
  const hayEncabezado = posibles.filter(Boolean).length >= 2;

  const mapa = hayEncabezado
    ? posibles
    : ORDEN_SIN_ENCABEZADO.slice(0, filas[0].length).concat(
        Array(Math.max(0, filas[0].length - ORDEN_SIN_ENCABEZADO.length)).fill(null),
      );

  const cuerpo = hayEncabezado ? filas.slice(1) : filas;

  return cuerpo
    .map((f) => {
      const v = (campo: string): string => {
        const i = mapa.indexOf(campo);
        return i >= 0 ? String(f[i] ?? "").trim() : "";
      };

      const nombre = v("nombre");
      if (!nombre) return null;

      const precio = aCentavos(v("precio"));
      const antesCrudo = v("precio_anterior");
      const antes = antesCrudo ? aCentavos(antesCrudo) : 0;

      const stockCrudo = v("stock");
      const stockNum = Number(stockCrudo.replace(/[^\d-]/g, ""));

      // LOS TRES EJES DE VARIEDAD DE LA HOJA. No tienen nombre allí —son
      // columnas— así que se les pone uno editable en vez de dejarlos sin
      // título, que en el escaparate sería una pregunta sin enunciado.
      const grupos: GrupoVariedad[] = [];
      const uno = leerOpciones(v("variedades"));
      if (uno.length) grupos.push({ nombre: "Variedades", modo: "una", opciones: uno });

      const dos = leerOpciones(v("variedades2"));
      if (dos.length) {
        const modo = leerModo(v("variedades2_modo"));
        const cant = Number(v("variedades2_cantidad").replace(/[^\d]/g, ""));
        grupos.push({
          nombre: "Variedades 2",
          modo,
          ...(modo === "hasta_completar" && cant > 0 ? { cantidad: cant } : {}),
          opciones: dos,
        });
      }

      const tres = leerOpciones(v("variedades3"));
      if (tres.length) grupos.push({ nombre: "Variedades 3", modo: "una", opciones: tres });

      return {
        nombre,
        descripcion: v("descripcion"),
        categoria: v("categoria"),
        precio,
        // Un «antes» que no supera al precio no es una oferta: es un tachón que
        // hace desconfiar. Se descarta.
        precio_anterior: antes > precio ? antes : null,
        oculto: esSi(v("oculto")),
        stock: stockCrudo === "" || !Number.isFinite(stockNum) ? null : Math.max(0, Math.round(stockNum)),
        imagen_url: v("imagen_url"),
        variedades: grupos,
      } as FilaPegada;
    })
    .filter((x): x is FilaPegada => x !== null);
}
