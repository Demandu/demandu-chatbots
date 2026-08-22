"use client";

import { useState } from "react";
import { Languages, Loader2, Pencil } from "lucide-react";
import { IDIOMAS, idiomaPorCodigo } from "@/lib/idiomas";

/**
 * "Responder en el idioma del lead".
 *
 * ES UN INTERRUPTOR, NO UN AUTOMATISMO. Que un mensaje salga traducido sin que
 * el agente lo haya pedido es exactamente el tipo de sorpresa que no se puede
 * permitir en algo que se manda en nombre del negocio.
 *
 * Y ENSEÑA LO QUE VA A SALIR ANTES DE ENVIARLO. El agente es responsable de sus
 * palabras: una traducción automática puede cambiar el tono o estropear un
 * modismo, y quien firma el mensaje tiene derecho a leerlo primero.
 *
 * El idioma se puede corregir porque la detección se equivoca: con mensajes
 * cortos —"ok", "gracias"— Google acierta menos de lo que parece, y sin forma
 * de corregirlo el agente acabaría mandando un idioma que nadie pidió.
 */
export function ResponderEnIdioma({
  idioma,
  activo,
  previa,
  cargando,
  hayTexto,
  onCambiar,
  onCorregir,
}: {
  idioma: string;
  activo: boolean;
  previa: string;
  cargando: boolean;
  hayTexto: boolean;
  onCambiar: (v: boolean) => void;
  onCorregir: (code: string) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const info = idiomaPorCodigo(idioma);

  return (
    <div className="flex-none border-t border-surface-border bg-surface/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => onCambiar(e.target.checked)}
            className="h-3.5 w-3.5 accent-violet"
          />
          <Languages className="h-4 w-4" />
          Responder en {info?.bandera} {info?.nombre ?? idioma}
        </label>

        <button
          type="button"
          onClick={() => setEligiendo((v) => !v)}
          title="No es ese idioma"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-2 transition hover:text-white"
        >
          <Pencil className="h-3 w-3" /> cambiar
        </button>

        {activo && cargando && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-2">
            <Loader2 className="h-3 w-3 animate-spin" /> traduciendo…
          </span>
        )}
      </div>

      {eligiendo && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-surface-border bg-surface">
          {IDIOMAS.map((i) => (
            <button
              key={i.code}
              type="button"
              onClick={() => { onCorregir(i.code); setEligiendo(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-surface-raised ${
                i.code === idioma ? "text-white" : "text-muted hover:text-white"
              }`}
            >
              <span className="text-base leading-none">{i.bandera}</span> {i.nombre}
            </button>
          ))}
        </div>
      )}

      {/* La previa: esto es EXACTAMENTE lo que va a recibir el lead. */}
      {activo && hayTexto && previa && (
        <div className="mt-2 rounded-lg border border-violet/40 bg-violet/10 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-violet">
            Se enviará esto
          </p>
          <p className="whitespace-pre-wrap text-sm text-white">{previa}</p>
        </div>
      )}
    </div>
  );
}
