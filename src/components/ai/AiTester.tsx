"use client";

import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { LanaAvatar } from "@/components/Lana";

type Turno = { yo: string; lana: string | null };

/**
 * Caja para probar la IA del chatbot sin salir del panel.
 * Pensada para clientes no técnicos: escribes una pregunta como si fueras
 * tu cliente y ves exactamente lo que contestaría.
 */
export function AiTester({ botId }: { botId: string }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const preguntar = async (texto?: string) => {
    const pregunta = (texto ?? q).trim();
    if (!pregunta || cargando) return;
    setQ("");
    setTurnos((t) => [...t, { yo: pregunta, lana: null }]);
    setCargando(true);
    try {
      const r = await fetch("/api/ai/probar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId, pregunta }),
      });
      const j = await r.json();
      const respuesta = j?.respuesta ?? j?.error ?? "No se pudo responder.";
      setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, lana: respuesta } : x)));
    } catch {
      setTurnos((t) =>
        t.map((x, i) => (i === t.length - 1 ? { ...x, lana: "No se pudo conectar. Intenta de nuevo." } : x)),
      );
    } finally {
      setCargando(false);
      setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  };

  const EJEMPLOS = ["¿Cuánto cuesta?", "¿Qué horario tienen?", "¿Dónde están ubicados?"];

  return (
    <div className="card-l p-5">
      <h3 className="font-display text-base font-semibold text-ink">Pruébala aquí</h3>
      <p className="mt-0.5 text-xs text-ink-3">
        Escribe como si fueras tu cliente. Responde con lo que cargaste en Entrenamiento — nada más.
      </p>

      <div className="mt-3 max-h-[260px] space-y-2.5 overflow-y-auto rounded-xl bg-suave p-3">
        {turnos.length === 0 && (
          <div className="space-y-2 py-2">
            <p className="text-center text-[11px] text-ink-3">Prueba con una de estas:</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {EJEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => preguntar(e)}
                  className="rounded-full border border-linea-2 bg-tarjeta px-3 py-1.5 text-xs text-ink-2 transition hover:border-pink hover:text-ink"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {turnos.map((t, i) => (
          <div key={i} className="space-y-2.5">
            <div className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-demandu-gradient px-3 py-2 text-[12.5px] text-white">
              {t.yo}
            </div>
            <div className="flex items-end gap-2">
              <LanaAvatar size={26} />
              <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-tarjeta px-3 py-2 text-[12.5px] text-ink shadow-sm">
                {t.lana === null ? (
                  <span className="flex items-center gap-1.5 text-ink-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap">{t.lana}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={finRef} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              preguntar();
            }
          }}
          placeholder="Escribe una pregunta…"
          className="input-l flex-1"
        />
        <button
          type="button"
          onClick={() => preguntar()}
          disabled={cargando || !q.trim()}
          className="btn-primary flex-none px-3 disabled:opacity-50"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 text-[11px] text-ink-3">
        Esta prueba no consume mensajes de tu plan ni le escribe a nadie.
      </p>
    </div>
  );
}
