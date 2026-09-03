"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, Loader2, X } from "lucide-react";
import { IDIOMAS, idiomaPorCodigo } from "@/lib/idiomas";

/**
 * "Responder en el idioma del lead".
 *
 * SIEMPRE ESTÁ A LA VISTA, aunque no se haya detectado nada. La primera versión
 * solo aparecía cuando el sistema detectaba otro idioma, y eso dejaba al agente
 * sin manera de encenderlo cuando la detección no acertaba o cuando quiere
 * contestar en otro idioma por su cuenta. Una función que solo existe si un
 * detector automático lo permite no es una función: es una lotería.
 *
 * ES UN INTERRUPTOR, NO UN AUTOMATISMO. Que un mensaje salga traducido sin que
 * el agente lo haya pedido es exactamente el tipo de sorpresa que no se puede
 * permitir en algo que se manda en nombre del negocio.
 *
 * Y ENSEÑA LO QUE VA A SALIR ANTES DE ENVIARLO. El agente responde de sus
 * palabras: una traducción automática puede cambiar el tono o estropear un
 * modismo, y quien firma el mensaje tiene derecho a leerlo primero.
 */
export function ResponderEnIdioma({
  idioma,
  activo,
  previa,
  cargando,
  hayTexto,
  detectado,
  onCambiar,
  onElegirIdioma,
}: {
  /** Idioma en el que se va a responder. `null` = todavía ninguno. */
  idioma: string | null;
  activo: boolean;
  previa: string;
  cargando: boolean;
  hayTexto: boolean;
  /** true si lo puso el detector y no el agente: cambia lo que se le dice. */
  detectado: boolean;
  onCambiar: (v: boolean) => void;
  onElegirIdioma: (code: string) => void;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [busca, setBusca] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!eligiendo) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setEligiendo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setEligiendo(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [eligiendo]);

  const info = idioma ? idiomaPorCodigo(idioma) : null;
  const filtrados = IDIOMAS.filter((i) =>
    !busca ? true : i.nombre.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    // EL FONDO ES EL MISMO DEL COMPOSITOR, no `bg-surface/60`.
    //
    // Con aquel semitransparente esta franja salía más oscura que la de arriba
    // y la de abajo, y encima los textos en gris apagado quedaban casi
    // ilegibles: se veía una banda sucia con letras que había que adivinar.
    // Compartiendo `--tarjeta` con el compositor, las tres franjas son una
    // sola superficie y los grises recuperan su contraste.
    <div
      ref={caja}
      className="relative flex-none border-t border-surface-border px-3 py-2"
      style={{ backgroundColor: "var(--tarjeta)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Sin idioma todavía: un solo botón que abre la lista. Con idioma:
            interruptor + el idioma, que se puede cambiar de un clic. */}
        {idioma ? (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-white">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => onCambiar(e.target.checked)}
                className="h-3.5 w-3.5"
                style={{ accentColor: "#6E42FF" }}
              />
              <Languages className="h-4 w-4" />
              Responder en
            </label>

            {/* El morado de la plataforma, no un violeta suelto: encendido
                tiene que verse encendido de un vistazo. */}
            <button
              type="button"
              onClick={() => setEligiendo((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold text-white transition"
              style={
                activo
                  ? { borderColor: "#6E42FF", backgroundColor: "rgba(110,66,255,.22)" }
                  : { borderColor: "var(--surface-border, rgba(255,255,255,.14))", backgroundColor: "rgba(255,255,255,.06)" }
              }
            >
              {info?.bandera} {info?.nombre ?? idioma}
              <span className="text-[10px] opacity-70">▾</span>
            </button>

            {detectado && !activo && (
              <span className="text-[11px] text-muted">detectado por sus mensajes</span>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEligiendo((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-2 py-1 text-xs font-semibold text-muted transition hover:text-white"
          >
            <Languages className="h-4 w-4" /> Responder en otro idioma
          </button>
        )}

        {activo && cargando && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> traduciendo…
          </span>
        )}

        {activo && (
          <button
            type="button"
            onClick={() => onCambiar(false)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted transition hover:text-danger"
          >
            <X className="h-3 w-3" /> escribir sin traducir
          </button>
        )}
      </div>

      {eligiendo && (
        <div className="absolute bottom-full left-3 z-40 mb-1 w-60 overflow-hidden rounded-xl border border-surface-border bg-surface shadow-2xl">
          <div className="border-b border-surface-border p-2">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar idioma…"
              className="w-full rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-sm text-white placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtrados.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-muted-2">Sin resultados.</p>
            )}
            {filtrados.map((i) => (
              <button
                key={i.code}
                type="button"
                onClick={() => {
                  // Elegir un idioma mientras escribes SIGNIFICA que quieres
                  // responder en él. Obligar a marcar además la casilla sería
                  // pedir dos clics para una sola intención.
                  onElegirIdioma(i.code);
                  setEligiendo(false);
                  setBusca("");
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-surface-raised ${
                  i.code === idioma ? "text-white" : "text-muted hover:text-white"
                }`}
              >
                <span className="text-base leading-none">{i.bandera}</span> {i.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* La previa: esto es EXACTAMENTE lo que va a recibir el lead. */}
      {activo && hayTexto && previa && (
        <div
          className="mt-2 rounded-lg border px-3 py-2"
          style={{ borderColor: "rgba(110,66,255,.5)", backgroundColor: "rgba(110,66,255,.14)" }}
        >
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#b9a3ff" }}>
            Se enviará esto
          </p>
          <p className="whitespace-pre-wrap text-sm text-white">{previa}</p>
        </div>
      )}
    </div>
  );
}
