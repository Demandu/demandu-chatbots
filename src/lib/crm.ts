/**
 * Lógica pura del embudo. Sin React y sin base de datos, para poder probarla
 * entera con `./scripts/probar.sh`.
 */

export type TipoEtapa = "abierto" | "ganado" | "perdido";

export interface Tarjeta {
  id: string;
  titulo: string;
  importe: number | null;
  moneda: string;
  sort: number;
  status: "abierta" | "ganada" | "perdida";
  canal: string | null;
  created_at: string;
  updated_at: string;
  contacto: string | null;
  wa_name: string | null;
  telefono: string | null;
  email: string | null;
  pais: string | null;
  responsable: string | null;
  assignee_member_id: string | null;
  tarea: string | null;
  tarea_para: string | null;
  tarea_id: string | null;
  sin_proximo_paso: boolean;
  tarea_vencida: boolean;
  dias_quieta: number;
  conversation_id: string | null;
  unread: number | null;
  contact_id: string | null;
}

export interface Columna {
  id: string;
  nombre: string;
  color: string;
  tipo: TipoEtapa;
  orden: number;
  total: number;
  importe: number;
  tarjetas: Tarjeta[];
}

export interface Tablero {
  pipeline_id: string | null;
  embudos: { id: string; nombre: string; por_defecto: boolean; auto: boolean }[];
  columnas: Columna[];
  resumen: {
    abiertas: number; importe_abierto: number;
    ganadas: number; importe_ganado: number; perdidas: number;
    sin_proximo_paso: number; vencidas: number;
  };
  responsables: { id: string; nombre: string }[];
}

export function tableroVacio(): Tablero {
  return {
    pipeline_id: null, embudos: [], columnas: [],
    resumen: { abiertas: 0, importe_abierto: 0, ganadas: 0, importe_ganado: 0, perdidas: 0, sin_proximo_paso: 0, vencidas: 0 },
    responsables: [],
  };
}

// ─── Cómo se lee una tarjeta ────────────────────────────────────────────────

/**
 * Un importe del embudo. Sin valor devuelve cadena vacía: no se pinta un «$0»
 * falso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS CENTAVOS APARECEN CUANDO IMPORTAN. Redondear siempre venía de pensar el
 * embudo como ventas grandes: en «$1.250.000» los centavos son ruido. Pero
 * ahora el importe sale de los pedidos de la tienda, y ahí un pedido de $17,63
 * se mostraba como «$18». Un número que no cuadra con el que el dueño ve en su
 * tablero de pedidos le hace desconfiar de los dos.
 *
 * El corte en mil es arbitrario y da igual que lo sea: por debajo estamos
 * hablando de un pedido concreto y por encima de una suma.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function dinero(v: number | null | undefined, moneda = "MXN"): string {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "";
  const n = Number(v);
  const decimales = Math.abs(n) < 1000 && !Number.isInteger(n) ? 2 : 0;
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency", currency: moneda || "MXN",
      minimumFractionDigits: decimales, maximumFractionDigits: decimales,
    }).format(n);
  } catch {
    return `$${(decimales ? n.toFixed(2) : String(Math.round(n))).toLocaleString?.() ?? n}`;
  }
}

/** "hoy", "ayer", "hace 5 días", "hace 2 meses". */
export function hace(dias: number | null | undefined): string {
  const d = Math.max(0, Math.round(Number(dias ?? 0)));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  return m === 1 ? "hace 1 mes" : `hace ${m} meses`;
}

/**
 * Cómo se lee la fecha de una tarea: lo importante es si ya se pasó.
 * Se compara por DÍA, no por instante: una tarea para "hoy a las 9" no debe
 * decir "vencida" a las 9:01 — sigue siendo de hoy.
 */
export function vencimiento(iso: string | null | undefined, ahora: Date = new Date()): {
  texto: string;
  estado: "vencida" | "hoy" | "proxima" | "sin_fecha";
} {
  if (!iso) return { texto: "sin fecha", estado: "sin_fecha" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { texto: "sin fecha", estado: "sin_fecha" };

  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(d) - dia(ahora)) / 86_400_000);

  if (diff < 0) return { texto: diff === -1 ? "venció ayer" : `venció hace ${-diff} días`, estado: "vencida" };
  if (diff === 0) return { texto: "para hoy", estado: "hoy" };
  if (diff === 1) return { texto: "mañana", estado: "proxima" };
  if (diff < 7) return { texto: `en ${diff} días`, estado: "proxima" };
  return {
    texto: d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
    estado: "proxima",
  };
}

/**
 * Por qué una tarjeta pide atención. Devuelve null si está bien.
 *
 * El orden importa: una tarea vencida es más urgente que no tener ninguna, y
 * ninguna de las dos aplica a una venta ya cerrada.
 */
export function alerta(t: Tarjeta): { texto: string; tono: "rojo" | "ambar" } | null {
  if (t.status !== "abierta") return null;
  if (t.tarea_vencida) return { texto: "Tarea vencida", tono: "rojo" };
  if (t.sin_proximo_paso) return { texto: "Sin próximo paso", tono: "ambar" };
  return null;
}

/** Nombre a mostrar: el que escribió el agente manda sobre el de WhatsApp. */
export function nombreTarjeta(t: Partial<Tarjeta>): string {
  const c = [t.titulo, t.contacto, t.wa_name, t.telefono]
    .map((x) => (x ?? "").trim())
    .find(Boolean);
  return c || "Sin nombre";
}

/** Iniciales para el avatar, sin depender de imágenes. */
export function iniciales(nombre: string): string {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

// ─── Reordenar al arrastrar ─────────────────────────────────────────────────

/**
 * Vecinos de la posición donde se soltó una tarjeta.
 *
 * La columna se pinta de mayor a menor `sort`, así que "antes" es la de arriba
 * (sort mayor) y "despues" la de abajo. La base calcula el punto medio entre
 * las dos; por eso `sort` es decimal y no entero.
 *
 * `indice` es la posición final deseada dentro de la columna DESTINO, ya sin
 * contar la tarjeta que se está moviendo.
 */
export function vecinos(
  tarjetasDestino: { id: string }[],
  indice: number,
  idMovida: string,
): { antes: string | null; despues: string | null } {
  const lista = tarjetasDestino.filter((t) => t.id !== idMovida);
  const i = Math.max(0, Math.min(indice, lista.length));
  return {
    antes: i > 0 ? lista[i - 1].id : null,
    despues: i < lista.length ? lista[i].id : null,
  };
}

/**
 * Mueve la tarjeta en el tablero que ya está en pantalla, para que el arrastre
 * se vea instantáneo sin esperar a la base. Devuelve un tablero nuevo: no toca
 * el que recibe.
 */
export function moverEnMemoria(
  tablero: Tablero,
  idTarjeta: string,
  idColumnaDestino: string,
  indice: number,
): Tablero {
  let movida: Tarjeta | null = null;
  const sinLaTarjeta = tablero.columnas.map((c) => {
    const encontrada = c.tarjetas.find((t) => t.id === idTarjeta);
    if (encontrada) movida = encontrada;
    return { ...c, tarjetas: c.tarjetas.filter((t) => t.id !== idTarjeta) };
  });
  if (!movida) return tablero;

  const destino = tablero.columnas.find((c) => c.id === idColumnaDestino);
  const nuevoStatus: Tarjeta["status"] =
    destino?.tipo === "ganado" ? "ganada" : destino?.tipo === "perdido" ? "perdida" : "abierta";
  const actualizada: Tarjeta = { ...(movida as Tarjeta), status: nuevoStatus };

  const columnas = sinLaTarjeta.map((c) => {
    if (c.id !== idColumnaDestino) return c;
    const tarjetas = [...c.tarjetas];
    tarjetas.splice(Math.max(0, Math.min(indice, tarjetas.length)), 0, actualizada);
    return { ...c, tarjetas };
  });

  // Los contadores se recalculan sobre lo que hay a la vista. Si la columna
  // tenía más tarjetas de las que caben (el límite del servidor), el total se
  // ajusta con la diferencia en vez de tomar el largo de la lista visible.
  const conTotales = columnas.map((c) => {
    const original = tablero.columnas.find((o) => o.id === c.id);
    const delta = c.tarjetas.length - (original?.tarjetas.length ?? 0);
    return {
      ...c,
      total: Math.max(0, (original?.total ?? 0) + delta),
      importe: c.tarjetas.reduce((s, t) => s + Number(t.importe ?? 0), 0),
    };
  });

  return { ...tablero, columnas: conTotales, resumen: recalcularResumen(conTotales, tablero.resumen) };
}

function recalcularResumen(columnas: Columna[], previo: Tablero["resumen"]): Tablero["resumen"] {
  const todas = columnas.flatMap((c) => c.tarjetas);
  return {
    ...previo,
    abiertas: todas.filter((t) => t.status === "abierta").length,
    importe_abierto: todas.filter((t) => t.status === "abierta").reduce((s, t) => s + Number(t.importe ?? 0), 0),
    ganadas: todas.filter((t) => t.status === "ganada").length,
    importe_ganado: todas.filter((t) => t.status === "ganada").reduce((s, t) => s + Number(t.importe ?? 0), 0),
    perdidas: todas.filter((t) => t.status === "perdida").length,
    sin_proximo_paso: todas.filter((t) => t.status === "abierta" && t.sin_proximo_paso).length,
    vencidas: todas.filter((t) => t.status === "abierta" && t.tarea_vencida).length,
  };
}

/** Atajos para agendar sin abrir un calendario. */
export const CUANDO = [
  { key: "hoy", label: "Hoy" },
  { key: "manana", label: "Mañana" },
  { key: "3d", label: "En 3 días" },
  { key: "semana", label: "En una semana" },
] as const;

export function fechaDeAtajo(key: string, ahora: Date = new Date()): Date {
  const base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 9, 0, 0, 0);
  switch (key) {
    case "hoy":    return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 18, 0, 0, 0);
    case "3d":     base.setDate(base.getDate() + 3); return base;
    case "semana": base.setDate(base.getDate() + 7); return base;
    case "manana":
    default:       base.setDate(base.getDate() + 1); return base;
  }
}
