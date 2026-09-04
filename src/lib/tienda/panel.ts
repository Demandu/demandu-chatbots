/**
 * El panel de arriba de los pedidos: qué pasó, y con quién.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AQUÍ SOLO VIVEN LAS FECHAS Y LOS TEXTOS. Las cifras las calcula la base
 * (`tienda_resumen`), porque sumar diez mil pedidos en el navegador funciona
 * con diez y revienta con diez mil — y revienta el día del cliente que más
 * vende. Lo que sí tiene que estar aquí es cuándo empieza «este mes», porque de
 * eso depende que el número sea el correcto y es lo único que se puede probar
 * sin base de datos.
 *
 * LAS FECHAS SON EL ERROR CLÁSICO DE ESTAS PANTALLAS. «Este mes» que empieza el
 * día 1 a mediodía porque alguien usó la hora actual; «hasta hoy» que se come
 * los pedidos de esta tarde porque el fin es hoy a las 00:00. Se ven mal y no
 * se notan: el número sale, es plausible, y está mal.
 *
 * EL RANGO ES [DESDE, HASTA), abierto por arriba. Con «<= hasta» un pedido de
 * las 23:59 del día 30 cae en septiembre y en octubre a la vez, y la suma del
 * año no cuadra con la de los meses.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ClaveRango = "hoy" | "semana" | "mes" | "mes_pasado" | "año" | "personalizado";

export type Rango = { desde: Date; hasta: Date };

export const RANGOS: { clave: ClaveRango; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "semana", etiqueta: "Últimos 7 días" },
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "mes_pasado", etiqueta: "Mes pasado" },
  { clave: "año", etiqueta: "Este año" },
  { clave: "personalizado", etiqueta: "Entre dos fechas" },
];

const diaCero = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * De qué a qué mira cada opción.
 *
 * EL FINAL ES MAÑANA A LAS 00:00, no hoy: si fuera hoy, los pedidos de esta
 * tarde —los que el negocio acaba de ver entrar— no aparecerían en «Hoy», y esa
 * es exactamente la pantalla donde los va a buscar.
 */
export function rangoDeFechas(clave: ClaveRango, ahora: Date = new Date()): Rango {
  const hoy = diaCero(ahora);
  const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);

  switch (clave) {
    case "hoy":
      return { desde: hoy, hasta: manana };
    case "semana":
      // Siete días CONTANDO HOY, que es lo que la gente entiende por «los
      // últimos 7 días»: hoy y los seis de atrás.
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 6), hasta: manana };
    case "mes":
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: manana };
    case "mes_pasado":
      return {
        desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1),
        hasta: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
      };
    case "año":
      return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: manana };
    default:
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: manana };
  }
}

/**
 * Un rango escrito a mano en dos casillas.
 *
 * LAS CASILLAS DE FECHA DAN «2026-09-01» Y NADA MÁS. Interpretarlo con `new
 * Date("2026-09-01")` lo lee como UTC y en Panamá se convierte en el 31 de
 * agosto a las 19:00 — el negocio pide septiembre y le falta el primer día.
 * Por eso se parte a mano.
 *
 * EL «HASTA» INCLUYE SU DÍA ENTERO: quien escribe «al 30» quiere el 30, no
 * hasta el 30 a las cero horas.
 */
export function rangoEscrito(desde: string, hasta: string): Rango | null {
  const partir = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = partir(desde);
  const b = partir(hasta);
  if (!a || !b) return null;

  const fin = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1);
  if (fin <= a) return null;
  return { desde: a, hasta: fin };
}

/** Cómo se lee un rango: «1 – 30 de septiembre». */
export function comoRango(r: Rango): string {
  // El final se enseña como el ÚLTIMO DÍA INCLUIDO. Decir «al 1 de octubre»
  // cuando octubre no entra es la forma más rápida de que alguien crea que la
  // cifra está mal.
  const ultimo = new Date(r.hasta.getTime() - 1);
  const dia = (d: Date) => d.getDate();
  const mes = (d: Date) => d.toLocaleDateString("es", { month: "long" });
  const año = (d: Date) => d.getFullYear();

  if (dia(r.desde) === dia(ultimo) && mes(r.desde) === mes(ultimo) && año(r.desde) === año(ultimo)) {
    return `${dia(r.desde)} de ${mes(r.desde)}`;
  }
  if (mes(r.desde) === mes(ultimo) && año(r.desde) === año(ultimo)) {
    return `${dia(r.desde)} – ${dia(ultimo)} de ${mes(ultimo)}`;
  }
  return `${dia(r.desde)} ${mes(r.desde)} – ${dia(ultimo)} ${mes(ultimo)}`;
}

/** `2026-09-01`, que es lo que entienden las casillas de fecha. */
export function comoCasilla(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Cuánto cambió respecto al periodo anterior.
 *
 * DE CERO A ALGO NO ES «+∞%», es «nuevo». Y de algo a cero es −100%. Los dos
 * casos salen en cuanto una tienda tiene su primer mes, y una pantalla que
 * enseña «Infinity%» el primer día no la vuelve a abrir nadie.
 */
export function cambio(actual: number, anterior: number): { texto: string; sube: boolean } | null {
  const a = Number(actual) || 0;
  const b = Number(anterior) || 0;
  if (a === b) return null;
  if (b === 0) return { texto: "nuevo", sube: true };
  const pct = Math.round(((a - b) / Math.abs(b)) * 100);
  if (pct === 0) return null;
  return { texto: `${pct > 0 ? "+" : ""}${pct}%`, sube: pct > 0 };
}

/* ── La lista descargable ──────────────────────────────────────────────────── */

export type PersonaDeLista = {
  id?: string | null;
  name?: string | null;
  wa_name?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  pedidos?: number | null;
  gastado?: number | null;
  ultima?: string | null;
  numero?: number | null;
  codigo?: string | null;
  total?: number | null;
  pago?: string | null;
  created_at?: string | null;
};

/** El nombre que se enseña. El que escribió el agente manda sobre el de WhatsApp. */
export function comoNombre(p: PersonaDeLista): string {
  return (
    [p.name, p.wa_name, p.phone].map((x) => String(x ?? "").trim()).find(Boolean) || "Sin nombre"
  );
}

/**
 * La lista, en un archivo que se abre en Excel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PUNTO Y COMA, NO COMA. El Excel en español separa por punto y coma; con comas
 * abre el archivo con todo metido en la primera columna, y quien lo recibe cree
 * que el archivo está roto.
 *
 * CADA CELDA ENTRE COMILLAS Y CON LAS SUYAS DOBLADAS: un nombre con un punto y
 * coma dentro —o un salto de línea en una nota— desplaza todas las columnas de
 * esa fila y el archivo deja de cuadrar sin que nadie sepa por qué.
 *
 * EL TELÉFONO SE ESCAPA CON UN APÓSTROFO: si no, Excel convierte 50762381138 en
 * 5,07624E+10 y la lista de contactos se vuelve inservible. Es el fallo más
 * clásico de exportar teléfonos y no se recupera después.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function comoCsv(
  filas: PersonaDeLista[],
  columnas: { clave: keyof PersonaDeLista; titulo: string }[],
  moneda = "$",
): string {
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const valor = (p: PersonaDeLista, clave: keyof PersonaDeLista): string => {
    const v = p[clave];
    if (v === null || v === undefined) return "";
    if (clave === "phone") return `'${String(v)}`;
    if (clave === "gastado" || clave === "total") return `${moneda}${(Number(v) / 100).toFixed(2)}`;
    if (clave === "tags") return Array.isArray(v) ? v.join(", ") : String(v);
    if (clave === "ultima" || clave === "created_at") {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es");
    }
    return String(v);
  };

  return [
    columnas.map((c) => celda(c.titulo)).join(";"),
    ...filas.map((p) => columnas.map((c) => celda(valor(p, c.clave))).join(";")),
  ].join("\r\n");
}

/**
 * A quién de esta lista se le puede escribir.
 *
 * SE FILTRA ANTES DE ENSEÑAR EL BOTÓN, no después de pulsarlo. Alguien sin
 * teléfono no recibe nada, y quien se dio de baja NO PUEDE recibir nada — es la
 * regla de Meta y también la decencia mínima. Decir «se mandó a 40» cuando
 * salieron 31 es peor que decir 31.
 */
export function aQuienSePuedeEscribir(filas: PersonaDeLista[]): string[] {
  const vistos = new Set<string>();
  for (const p of filas) {
    const tel = String(p.phone ?? "").replace(/\D+/g, "");
    // El MISMO contacto puede salir dos veces en la lista de impagos: dos
    // pedidos suyos sin cobrar son dos filas y una sola persona.
    if (tel && p.id) vistos.add(String(p.id));
  }
  return [...vistos];
}
