/**
 * A partir del color de burbuja que eligió el cliente, calcula el resto de
 * la paleta del chat para que SIEMPRE se lea bien: el fondo, la burbuja del
 * cliente y el color del texto de cada una.
 *
 * La idea: el fondo toma el mismo tono que la burbuja pero más apagado y
 * un poco más oscuro, así la burbuja "flota" encima en vez de desaparecer.
 */

export type PaletaChat = {
  /** Fondo del hilo de conversación */
  canvas: string;
  /** Burbuja de lo que enviamos nosotros */
  out: string;
  /** Burbuja de lo que escribe el cliente */
  in: string;
  /** Texto sobre la burbuja saliente */
  textOut: string;
  /** Texto sobre la burbuja entrante */
  textIn: string;
  /** Color tenue de la hora / palomitas sobre la burbuja saliente */
  metaOut: string;
  /** Patrón de puntitos del fondo, ya en color */
  doodle: string;
};

function limpiarHex(hex: string): string {
  const h = String(hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) return h.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(h) ? h : "e7ddff";
}

function aRgb(hex: string): [number, number, number] {
  const h = limpiarHex(hex);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function aHsl(hex: string): [number, number, number] {
  const [r, g, b] = aRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function aHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Qué tan clara se ve (0 = negro, 1 = blanco). Fórmula de luminancia percibida. */
export function claridad(hex: string): number {
  const [r, g, b] = aRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Paleta completa del chat a partir del color de la burbuja saliente.
 * Funciona con cualquier color: claro, oscuro, saturado o gris.
 */
export function paletaChat(bubbleOut?: string | null): PaletaChat {
  const out = `#${limpiarHex(bubbleOut ?? "#e7ddff")}`;
  const [h, s, l] = aHsl(out);
  const claro = claridad(out);

  // Texto de la burbuja saliente: blanco sobre colores oscuros, tinta sobre claros.
  const textOut = claro < 0.55 ? "#ffffff" : aHex(h, Math.min(s, 0.45), 0.18);
  const metaOut = claro < 0.55 ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.42)";

  // Fondo: mismo tono, apagado. Si la burbuja es clara el fondo baja un poco
  // para que se note; si la burbuja es oscura, el fondo se va muy claro.
  const satFondo = Math.min(s, 0.22);
  const luzFondo = claro < 0.55 ? 0.95 : Math.max(0.86, Math.min(l - 0.07, 0.93));
  const canvas = aHex(h, satFondo, luzFondo);

  // Burbuja entrante: blanca casi siempre. Solo se aclara del todo cuando el
  // fondo ya quedó muy claro, para que no se confundan entre sí.
  let inBubble = luzFondo > 0.94 ? aHex(h, Math.min(s, 0.1), 0.995) : "#ffffff";
  // Si el cliente eligió un color casi blanco, las dos burbujas quedarían
  // iguales. En ese caso la entrante se tiñe un poco para distinguirlas.
  if (Math.abs(claro - claridad(inBubble)) < 0.05) {
    inBubble = aHex(h, Math.min(Math.max(s, 0.1), 0.25), Math.max(0.6, l - 0.11));
  }
  const textIn = "#1b1c39";

  // Puntitos del fondo, en el mismo tono
  const [dr, dg, db] = aRgb(aHex(h, Math.max(s, 0.35), 0.45));
  const rgb = `rgb(${dr},${dg},${db})`;
  const doodle =
    "url(\"data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='70' height='70'><g fill='${rgb}' fill-opacity='0.05'><circle cx='12' cy='12' r='2'/><circle cx='48' cy='34' r='2'/><circle cx='24' cy='58' r='2'/><path d='M56 8h6v6h-6z'/></g></svg>`,
    ) +
    "\")";

  return { canvas, out, in: inBubble, textOut, textIn, metaOut, doodle };
}
