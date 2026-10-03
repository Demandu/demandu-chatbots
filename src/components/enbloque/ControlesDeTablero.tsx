"use client";

/**
 * «Seleccionar varias» y «Marcar las N visibles · de T», para el tablero.
 *
 * VIVE APARTE DE `Tablero.tsx` POR LA MISMA RAZÓN QUE `ControlesSeleccion`
 * vive aparte de `InboxClient`: el trinquete del idioma (`medirEspanol.mjs`)
 * deja de contar un archivo en cuanto ese archivo pide traducciones. Meter un
 * `useTranslations` en `Tablero.tsx` por cuatro textos habría escondido de la
 * cuenta sus otros cuarenta, y el número total habría bajado sin que nadie
 * tradujera nada. Ya pasó con la Bandeja (114 → 73).
 */

import { useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";
import { comoSeMarcaLaColumna } from "@/lib/enBloque";

export function BotonSeleccionarTarjetas({
  activo,
  onAlternar,
}: {
  activo: boolean;
  onAlternar: () => void;
}) {
  const t = useTranslations("enBloque");
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={activo}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        activo ? "border-pink/40 bg-pink/10 text-pink" : "border-linea text-ink-2 hover:text-ink"
      }`}
    >
      <ListChecks className="h-3.5 w-3.5" />
      {activo ? t("terminarSeleccion") : t("seleccionarTarjetas")}
    </button>
  );
}

/**
 * El botón de marcar una columna entera.
 *
 * DICE LOS DOS NÚMEROS CUANDO NO COINCIDEN. El tablero solo trae 50 tarjetas
 * por columna: un «marcar todas» marcaría 50 y quien lo pulsa creería haber
 * marcado las 320 — y después movería 50 pensando que movió todo, sin forma de
 * enterarse de lo que quedó atrás. Qué frase sale lo decide
 * `comoSeMarcaLaColumna`, que está probado.
 */
export function MarcarColumna({
  visibles,
  total,
  todasMarcadas,
  onAlternar,
}: {
  visibles: number;
  total: number | null | undefined;
  todasMarcadas: boolean;
  onAlternar: () => void;
}) {
  const t = useTranslations("enBloque");
  if (visibles === 0) return null;
  const e = comoSeMarcaLaColumna(visibles, total);
  const ocultas = Math.max(0, Math.floor(Number(total) || 0) - visibles);
  return (
    <button
      type="button"
      onClick={onAlternar}
      title={ocultas > 0 ? t("columnaOcultas", { n: visibles, ocultas }) : undefined}
      className="w-full rounded-lg border border-linea px-2 py-1 text-left text-[11px] font-semibold text-ink-2 transition hover:text-ink"
    >
      {todasMarcadas
        ? t("desmarcarTodas")
        : e.clave === "marcarVisiblesDeTotal"
          ? t("marcarVisiblesDeTotal", { n: e.n, total: e.total })
          : t("marcarTodas", { n: e.n })}
    </button>
  );
}
