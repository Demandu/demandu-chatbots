"use client";

/**
 * «Seleccionar varias» y «Marcar las N», para la lista de la Bandeja.
 *
 * Vive aparte, y no dentro de `InboxClient`, A PROPÓSITO: el trinquete del
 * idioma (`medirEspanol.mjs`) deja de contar un archivo en cuanto pide
 * traducciones. Meter un `useTranslations` en `InboxClient` por cuatro textos
 * habría escondido de la cuenta los otros cuarenta que siguen en español.
 */

import { useTranslations } from "next-intl";
import { ListChecks } from "lucide-react";

export function ControlesSeleccion({
  activo,
  total,
  todasMarcadas,
  onAlternarModo,
  onAlternarTodas,
}: {
  activo: boolean;
  /** Cuántas filas se ven ahora mismo (después de filtros y búsqueda). */
  total: number;
  todasMarcadas: boolean;
  onAlternarModo: () => void;
  onAlternarTodas: () => void;
}) {
  const t = useTranslations("enBloque");
  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        onClick={onAlternarModo}
        aria-pressed={activo}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition ${
          activo ? "bg-pink/15 text-pink" : "text-muted hover:text-white"
        }`}
      >
        <ListChecks className="h-3.5 w-3.5" />
        {activo ? t("terminarSeleccion") : t("seleccionarVarias")}
      </button>
      {activo && total > 0 && (
        <button type="button" onClick={onAlternarTodas} className="text-xs text-muted hover:text-white">
          {todasMarcadas ? t("desmarcarTodas") : t("marcarTodas", { n: total })}
        </button>
      )}
    </div>
  );
}
