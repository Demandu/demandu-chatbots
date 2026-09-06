/**
 * Lógica pura de la pantalla de Resultados: rangos de fechas, agrupación y
 * cómo se leen los números. Sin React y sin base de datos a propósito, para
 * poder probarlo entero con `./scripts/probar.sh`.
 */

export type Agrupacion = "day" | "week" | "month" | "quarter" | "year";

export type Preset = "hoy" | "7d" | "30d" | "mes" | "trimestre" | "anio" | "personalizado";

export const PRESETS: { key: Preset; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "mes", label: "Este mes" },
  { key: "trimestre", label: "Trimestre" },
  { key: "anio", label: "Este año" },
  { key: "personalizado", label: "Personalizado" },
];

export const AGRUPACIONES: { key: Agrupacion; label: string }[] = [
  { key: "day", label: "Por día" },
  { key: "week", label: "Por semana" },
  { key: "month", label: "Por mes" },
  { key: "quarter", label: "Por trimestre" },
  { key: "year", label: "Por año" },
];

/**
 * Rango de fechas de un atajo, calculado en la hora LOCAL de quien mira.
 * `hasta` es exclusivo (el instante en que empieza el día siguiente), así el
 * día de hoy entra completo sin contar nada de mañana.
 */
export function rangoDePreset(preset: Preset, ahora: Date = new Date()): { desde: Date; hasta: Date } {
  const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hoy = inicioDelDia(ahora);
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);

  switch (preset) {
    case "hoy":
      return { desde: hoy, hasta: manana };
    case "7d":
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6), hasta: manana };
    case "mes":
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: manana };
    case "trimestre":
      return { desde: new Date(hoy.getFullYear(), Math.floor(hoy.getMonth() / 3) * 3, 1), hasta: manana };
    case "anio":
      return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: manana };
    case "30d":
    default:
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29), hasta: manana };
  }
}

/**
 * Agrupación sensata según lo largo que sea el rango. Un año agrupado por día
 * son 365 barras: ilegible. Se puede cambiar a mano en la pantalla.
 */
export function agrupacionSugerida(desde: Date, hasta: Date): Agrupacion {
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86_400_000));
  if (dias <= 62) return "day";
  if (dias <= 366) return "week";
  if (dias <= 366 * 3) return "month";
  return "quarter";
}

/** Zona horaria de quien mira. En el servidor no se sabe: cae a UTC. */
export function zonaHoraria(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// ─── Cómo se leen los números ────────────────────────────────────────────────

/** Duración en palabras: "45 s", "3 min", "1 h 20 min", "2 d". */
export function duracion(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(Number(segundos))) return "—";
  const s = Math.max(0, Math.round(Number(segundos)));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  if (h < 24) return restoMin ? `${h} h ${restoMin} min` : `${h} h`;
  const d = Math.floor(h / 24);
  const restoH = h % 24;
  return restoH ? `${d} d ${restoH} h` : `${d} d`;
}

/** Número con separador de miles. */
export function numero(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("es-MX");
}

/** Porcentaje; "—" cuando no hay nada que dividir (no 0 %, que engaña). */
export function porcentaje(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(decimales)} %`;
}

/**
 * Etiqueta corta del eje: "18 ago", "sem. 18 ago", "ago 2026"…
 * Recibe la fecha tal cual la devuelve la base (YYYY-MM-DD, ya en hora local).
 */
export function etiquetaPeriodo(iso: string, agrupacion: Agrupacion): string {
  const [a, m, d] = String(iso ?? "").split("-").map(Number);
  if (!a || !m || !d) return String(iso ?? "");
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const mes = MESES[m - 1] ?? "";
  switch (agrupacion) {
    case "year": return String(a);
    case "quarter": return `T${Math.floor((m - 1) / 3) + 1} ${a}`;
    case "month": return `${mes} ${a}`;
    case "week": return `${d} ${mes}`;
    default: return `${d} ${mes}`;
  }
}

/** Fecha ISO corta (YYYY-MM-DD) en hora LOCAL, para los campos de fecha. */
export function aFechaCorta(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-08-18" → medianoche local de ese día. Devuelve null si no se entiende. */
export function deFechaCorta(s: string, finDelDia = false): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const [, a, mes, d] = m.map(Number) as unknown as [string, number, number, number];
  const fecha = new Date(a, mes - 1, d + (finDelDia ? 1 : 0));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// ─── Nombres para el cliente ─────────────────────────────────────────────────

export const NOMBRE_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  webchat: "Sitio web",
};

export const COLOR_CANAL: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E1306C",
  messenger: "#0084FF",
  telegram: "#2AABEE",
  webchat: "#6E42FF",
};

/** Cómo terminó un recorrido, en palabras del cliente. */
export const NOMBRE_FIN: Record<string, string> = {
  completado: "Lo terminaron",
  agente: "Pasó a una persona",
  reiniciado: "Volvieron a empezar",
  cambio: "Se fueron a otro flujo",
};

// ─── Forma de la respuesta de la base ────────────────────────────────────────

export interface Resultados {
  totales: {
    conversaciones: number; nuevos: number; recurrentes: number;
    contactos: number; a_humano: number; a_humano_pct: number;
  };
  mensajes: {
    total: number; entrantes: number; salientes: number; del_bot: number;
    de_persona: number; por_conversacion: number; por_dia: number;
  };
  respuesta: { mediana_seg: number | null; promedio_seg: number | null; respuestas: number };
  serie: { periodo: string; conversaciones: number; nuevos: number; recurrentes: number; a_humano: number }[];
  serie_mensajes: { periodo: string; entrantes: number; salientes: number }[];
  por_canal: { canal: string; conversaciones: number; a_humano: number; mensajes: number }[];
  por_bot: { id: string; nombre: string; canal: string; conversaciones: number; a_humano: number; mensajes: number }[];
  por_flujo: {
    id: string; nombre: string; entradas: number; completadas: number; a_humano: number;
    reiniciadas: number; abandonadas: number; pasos_promedio: number; efectividad: number | null;
  }[];
  por_agente: {
    id: string; nombre: string; conversaciones: number; mensajes: number;
    respuesta_mediana_seg: number | null; ganadas: number; perdidas: number;
    importe_ganado: number;
  }[];
  /** Sale del EMBUDO (oportunidades), no del estado de la conversación. */
  cierre: {
    ganadas: number; perdidas: number; abiertas: number;
    importe_ganado: number; importe_abierto: number; efectividad: number | null;
  };
  /** Tarjetas abiertas sin ningún próximo paso agendado. */
  seguimiento: { abiertas: number; sin_proximo_paso: number; con_vencida: number };
  por_estado: {
    nombre: string; color: string; outcome: string; orden: number;
    conversaciones: number; importe: number;
  }[];
  por_hora: { hora: number; entrantes: number }[];
  meta: {
    desde: string; hasta: string; agrupacion: Agrupacion; tz: string;
    hay_flujos: boolean; hay_cierre: boolean; hay_embudo: boolean;
  };
}

/** Efectividad de cierre de un agente, o null si todavía no cerró nada. */
export function efectividadAgente(a: { ganadas: number; perdidas: number }): number | null {
  const total = (a.ganadas ?? 0) + (a.perdidas ?? 0);
  return total ? Math.round((100 * (a.ganadas ?? 0)) / total) : null;
}

/** Resultados vacíos: para pintar la pantalla cuando la consulta falla. */
export function resultadosVacios(): Resultados {
  return {
    totales: { conversaciones: 0, nuevos: 0, recurrentes: 0, contactos: 0, a_humano: 0, a_humano_pct: 0 },
    mensajes: { total: 0, entrantes: 0, salientes: 0, del_bot: 0, de_persona: 0, por_conversacion: 0, por_dia: 0 },
    respuesta: { mediana_seg: null, promedio_seg: null, respuestas: 0 },
    serie: [], serie_mensajes: [], por_canal: [], por_bot: [], por_flujo: [], por_agente: [],
    cierre: { ganadas: 0, perdidas: 0, abiertas: 0, importe_ganado: 0, importe_abierto: 0, efectividad: null },
    seguimiento: { abiertas: 0, sin_proximo_paso: 0, con_vencida: 0 },
    por_estado: [], por_hora: [],
    meta: { desde: "", hasta: "", agrupacion: "day", tz: "UTC", hay_flujos: false, hay_cierre: false, hay_embudo: false },
  };
}
