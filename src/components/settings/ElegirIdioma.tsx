"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Languages } from "lucide-react";
import { guardarIdioma } from "@/app/(dashboard)/settings/idioma/acciones";
import { COMO_SE_LLAMA, IDIOMAS, type Idioma } from "@/i18n/idiomas";

/**
 * Elegir idioma.
 *
 * ── CADA IDIOMA SE LLAMA EN SU PROPIO IDIOMA ──────────────────────────────
 *
 * «Português (Brasil)», no «Portugués (Brasil)». Quien busca su idioma en una
 * lista lo busca escrito como él lo escribe: alguien que no lee español no
 * reconoce «Inglés», reconoce «English». Es la razón por la que todos los
 * selectores de idioma del mundo lo hacen así.
 */
export function ElegirIdioma({ actual }: { actual: Idioma }) {
  const t = useTranslations("idioma");
  const [elegido, setElegido] = useState<Idioma>(actual);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, empezar] = useTransition();

  const guardar = (nuevo: Idioma) => {
    setElegido(nuevo);
    setAviso(null);
    empezar(async () => {
      const r = await guardarIdioma(nuevo);
      if (r.ok) {
        setAviso({ ok: true, texto: t("guardado", { idioma: COMO_SE_LLAMA[nuevo] }) });
      } else {
        // Se devuelve la selección a lo que de verdad está guardado: dejar
        // marcado un idioma que no se guardó es la pantalla mintiendo.
        setElegido(actual);
        setAviso({ ok: false, texto: r.error === "sin_sesion" ? t("sinPermiso") : t("noSePudo") });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Languages className="mt-0.5 h-5 w-5 text-ink-3" />
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{t("titulo")}</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-2">{t("explicacion")}</p>
        </div>
      </div>

      <div className="grid max-w-md gap-2">
        {IDIOMAS.map((i) => (
          <button
            key={i}
            onClick={() => guardar(i)}
            disabled={guardando}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition disabled:opacity-60 ${
              elegido === i ? "border-[#6E42FF] bg-[#efe9ff] text-ink" : "border-linea bg-tarjeta text-ink-2 hover:bg-suave"
            }`}
          >
            <span className="font-medium">{COMO_SE_LLAMA[i]}</span>
            {elegido === i && <Check className="h-4 w-4 text-[#6E42FF]" />}
          </button>
        ))}
      </div>

      {aviso && (
        <p className={`text-sm ${aviso.ok ? "text-[#1e8e3e]" : "text-[#c0392b]"}`}>{aviso.texto}</p>
      )}
    </div>
  );
}
