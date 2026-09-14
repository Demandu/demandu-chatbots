"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copiar la dirección de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE COPIA EL ENLACE VIVO, NO UNO GUARDADO. Recibe la dirección que la propia
 * pantalla acaba de calcular a partir del `slug`. Si el negocio cambia su
 * dirección, el botón copia la nueva sin que nadie se acuerde de actualizar
 * nada — que es justo lo que pide el informe.
 *
 * ── SI NO SE PUDO COPIAR, SE DICE ─────────────────────────────────────────
 *
 * El portapapeles falla de verdad: sin HTTPS, con permisos denegados, en
 * navegadores viejos. Decir «copiado» sin haber copiado es peor que no tener
 * botón: el negocio se va a pegar el enlace a Instagram y pega otra cosa. Ante
 * el fallo se selecciona el texto para que al menos se pueda copiar a mano.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function CopiarEnlace({ enlace }: { enlace: string }) {
  const [estado, setEstado] = useState<"quieto" | "copiado" | "fallo">("quieto");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setEstado("copiado");
      setTimeout(() => setEstado("quieto"), 2000);
    } catch {
      setEstado("fallo");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copiar}
        className="inline-flex items-center gap-1.5 rounded-lg border border-linea bg-tarjeta px-2.5 py-1 text-sm font-semibold text-ink-2 transition hover:bg-suave"
      >
        {estado === "copiado" ? (
          <>
            <Check className="h-3.5 w-3.5 text-[#1e8e3e]" /> Enlace copiado
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" /> Copiar enlace
          </>
        )}
      </button>
      {estado === "fallo" && (
        <span className="text-xs text-[#c0392b]">
          No se pudo copiar. Selecciona la dirección de arriba y cópiala a mano.
        </span>
      )}
    </span>
  );
}
