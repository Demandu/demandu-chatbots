"use client";

import { useEffect, useRef, useState } from "react";
import { etiquetaPeriodo, numero, type Agrupacion } from "@/lib/analytics";

/**
 * Gráficas dibujadas a mano en SVG y CSS.
 *
 * POR QUÉ SIN LIBRERÍA: meter una librería de gráficas serían ~150 KB que el
 * cliente descarga en cada carga, más una dependencia que actualizar. Aquí solo
 * hacen falta cuatro formas y ninguna es complicada. Además así el estilo
 * coincide exactamente con el resto de la plataforma.
 *
 * Todas se adaptan al ancho real del contenedor (no a un viewBox estirado), así
 * los textos se leen igual en un monitor grande que en un teléfono.
 */

/** Ancho real del contenedor, en píxeles. */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

export interface Serie {
  clave: string;
  nombre: string;
  color: string;
  /** Rellena el área bajo la línea. Solo para la serie principal. */
  area?: boolean;
}

/** Gráfica de líneas en el tiempo, con una línea por serie. */
export function GraficaTiempo({
  datos,
  series,
  agrupacion,
  alto = 240,
}: {
  datos: Record<string, any>[];
  series: Serie[];
  agrupacion: Agrupacion;
  alto?: number;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>();
  const [encima, setEncima] = useState<number | null>(null);

  if (!datos.length) return <SinDatos texto="Todavía no hay conversaciones en este periodo." />;

  const W = Math.max(280, ancho || 320);
  const H = alto;
  const M = { arriba: 14, derecha: 10, abajo: 26, izquierda: 38 };
  const anchoUtil = Math.max(1, W - M.izquierda - M.derecha);
  const altoUtil = Math.max(1, H - M.arriba - M.abajo);

  const maximo = Math.max(1, ...datos.flatMap((d) => series.map((s) => Number(d[s.clave] ?? 0))));
  // Techo redondeado hacia arriba, para que la línea no toque el borde.
  const techo = redondearArriba(maximo);
  const x = (i: number) => M.izquierda + (datos.length === 1 ? anchoUtil / 2 : (i * anchoUtil) / (datos.length - 1));
  const y = (v: number) => M.arriba + altoUtil - (Number(v ?? 0) / techo) * altoUtil;

  const lineas = [0, 0.5, 1].map((f) => M.arriba + altoUtil * f);
  // Máximo 7 etiquetas en el eje: más se encabalgan en pantallas chicas.
  const saltoX = Math.max(1, Math.ceil(datos.length / Math.max(2, Math.floor(W / 70))));

  return (
    <div ref={ref} className="relative w-full">
      <svg width={W} height={H} role="img" aria-label="Evolución en el tiempo">
        {/* Rejilla y escala */}
        {lineas.map((ly, i) => (
          <g key={i}>
            <line x1={M.izquierda} x2={W - M.derecha} y1={ly} y2={ly} stroke="#e9ebf4" strokeWidth={1} />
            <text x={M.izquierda - 8} y={ly + 4} textAnchor="end" fontSize={11} fill="#9498b8">
              {numero(Math.round(techo * (1 - i * 0.5)))}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const puntos = datos.map((d, i) => `${x(i)},${y(d[s.clave])}`).join(" ");
          return (
            <g key={s.clave}>
              {s.area && datos.length > 1 && (
                <polygon
                  points={`${M.izquierda},${M.arriba + altoUtil} ${puntos} ${x(datos.length - 1)},${M.arriba + altoUtil}`}
                  fill={s.color}
                  opacity={0.12}
                />
              )}
              <polyline
                points={puntos}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {datos.map((d, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(d[s.clave])}
                  r={encima === i ? 4.5 : datos.length > 40 ? 0 : 2.5}
                  fill="#fff"
                  stroke={s.color}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}

        {/* Eje de fechas */}
        {datos.map((d, i) => {
          if (!(i % saltoX === 0 || i === datos.length - 1)) return null;
          // La última etiqueta cae justo en el borde derecho del SVG: centrada,
          // la mitad se sale y se ve recortada ("19 ag" en vez de "19 ago").
          // Se ancla al borde en los extremos y se centra en el resto.
          const ultima = i === datos.length - 1;
          const primera = i === 0;
          const anclaje = datos.length === 1 ? "middle" : ultima ? "end" : primera ? "start" : "middle";
          return (
            <text key={i} x={x(i)} y={H - 8} textAnchor={anclaje} fontSize={11} fill="#9498b8">
              {etiquetaPeriodo(d.periodo, agrupacion)}
            </text>
          );
        })}

        {/* Zonas invisibles para el globito de datos */}
        {datos.map((d, i) => (
          <rect
            key={`z${i}`}
            x={x(i) - anchoUtil / Math.max(1, datos.length) / 2}
            y={M.arriba}
            width={Math.max(6, anchoUtil / Math.max(1, datos.length))}
            height={altoUtil}
            fill="transparent"
            onMouseEnter={() => setEncima(i)}
            onMouseLeave={() => setEncima(null)}
          />
        ))}
        {encima !== null && (
          <line
            x1={x(encima)} x2={x(encima)} y1={M.arriba} y2={M.arriba + altoUtil}
            stroke="#c9cce0" strokeWidth={1} strokeDasharray="3 3"
          />
        )}
      </svg>

      {encima !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-[#e6e8f2] bg-white px-3 py-2 text-xs shadow-[0_10px_30px_-10px_rgba(20,20,60,.3)]"
          style={{
            left: Math.min(Math.max(0, x(encima) - 70), Math.max(0, W - 150)),
            top: 4,
          }}
        >
          <div className="mb-1 font-semibold text-ink">
            {etiquetaPeriodo(datos[encima].periodo, agrupacion)}
          </div>
          {series.map((s) => (
            <div key={s.clave} className="flex items-center gap-2 text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.nombre}: <b className="text-ink">{numero(datos[encima][s.clave])}</b>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.clave} className="flex items-center gap-1.5 text-xs text-ink-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            {s.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales. Puro CSS: se adapta solo y no necesita medir nada. */
export function BarrasHorizontales({
  filas,
  sufijo,
}: {
  filas: { etiqueta: string; valor: number; color?: string; nota?: string }[];
  sufijo?: string;
}) {
  if (!filas.length) return <SinDatos texto="Sin datos en este periodo." />;
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div className="flex flex-col gap-3">
      {filas.map((f, i) => (
        <div key={`${f.etiqueta}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink">{f.etiqueta}</span>
            <span className="flex-none text-sm font-semibold text-ink">
              {numero(f.valor)}
              {sufijo ? <span className="ml-1 text-xs font-normal text-ink-3">{sufijo}</span> : null}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#eef0f7]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              // Cero se dibuja como cero. El mínimo del 2 % existe para que un
              // valor chico no desaparezca, pero aplicado a un 0 pintaba una
              // barrita que hacía pensar que el chatbot sí había atendido algo.
              style={{
                width: f.valor > 0 ? `${Math.max(2, (f.valor / max) * 100)}%` : "0%",
                background: f.color ?? "#6E42FF",
              }}
            />
          </div>
          {f.nota ? <div className="mt-1 text-xs text-ink-3">{f.nota}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Dona. Se usa para repartos de dos o tres partes (ganado/perdido, nuevo/recurrente). */
export function Dona({
  partes,
  centro,
  subcentro,
  tamano = 168,
}: {
  partes: { nombre: string; valor: number; color: string }[];
  centro?: string;
  subcentro?: string;
  tamano?: number;
}) {
  const total = partes.reduce((s, p) => s + Math.max(0, p.valor), 0);
  const R = tamano / 2;
  const grosor = Math.max(14, tamano * 0.16);
  const r = R - grosor / 2;
  const circunferencia = 2 * Math.PI * r;

  let acumulado = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={tamano} height={tamano} role="img" aria-label="Reparto">
        <circle cx={R} cy={R} r={r} fill="none" stroke="#eef0f7" strokeWidth={grosor} />
        {total > 0 &&
          partes.map((p) => {
            const fraccion = Math.max(0, p.valor) / total;
            const dash = `${fraccion * circunferencia} ${circunferencia}`;
            const desfase = -acumulado * circunferencia;
            acumulado += fraccion;
            return (
              <circle
                key={p.nombre}
                cx={R} cy={R} r={r} fill="none"
                stroke={p.color} strokeWidth={grosor}
                strokeDasharray={dash} strokeDashoffset={desfase}
                transform={`rotate(-90 ${R} ${R})`}
              />
            );
          })}
        {centro && (
          <text x={R} y={R - 2} textAnchor="middle" fontSize={tamano * 0.19} fontWeight={700} fill="#1b1c39">
            {centro}
          </text>
        )}
        {subcentro && (
          <text x={R} y={R + tamano * 0.13} textAnchor="middle" fontSize={11} fill="#9498b8">
            {subcentro}
          </text>
        )}
      </svg>
      <div className="flex min-w-0 flex-col gap-2">
        {partes.map((p) => (
          <div key={p.nombre} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 truncate text-ink-2">{p.nombre}</span>
            <b className="ml-auto pl-3 text-ink">{numero(p.valor)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Columnas por hora del día: a qué horas escriben los clientes. */
export function ColumnasHora({ datos }: { datos: { hora: number; entrantes: number }[] }) {
  const porHora = new Map(datos.map((d) => [d.hora, d.entrantes]));
  const max = Math.max(1, ...datos.map((d) => d.entrantes));
  if (!datos.length) return <SinDatos texto="Sin mensajes en este periodo." />;
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]">
        {Array.from({ length: 24 }, (_, h) => {
          const v = porHora.get(h) ?? 0;
          return (
            <div key={h} className="group relative flex-1" title={`${h}:00 — ${numero(v)} mensajes`}>
              <div
                className="w-full rounded-t-[3px] bg-violet transition-all"
                style={{ height: `${Math.max(2, (v / max) * 128)}px`, opacity: v ? 0.35 + 0.65 * (v / max) : 0.15 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
        <span>12 am</span><span>6 am</span><span>12 pm</span><span>6 pm</span><span>11 pm</span>
      </div>
    </div>
  );
}

export function SinDatos({ texto }: { texto: string }) {
  return (
    <div className="grid min-h-[120px] place-items-center rounded-xl border border-dashed border-[#e2e4f0] p-6 text-center text-sm text-ink-3">
      {texto}
    </div>
  );
}

/** Techo bonito para el eje: 7 → 10, 43 → 50, 1 240 → 1 500. */
function redondearArriba(n: number): number {
  if (n <= 5) return 5;
  const magnitud = Math.pow(10, Math.floor(Math.log10(n)));
  for (const paso of [1, 1.5, 2, 2.5, 5, 10]) {
    if (n <= paso * magnitud) return paso * magnitud;
  }
  return 10 * magnitud;
}
