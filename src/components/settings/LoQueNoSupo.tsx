"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, GraduationCap, MessageSquareText } from "lucide-react";
import { ensenarle } from "@/app/(dashboard)/settings/ai/actions";

export type Pregunta = {
  pregunta: string;
  veces: number;
  bot_id: string;
  bot_nombre: string | null;
  ultima_vez: string;
  conversacion_id: string;
  ya_lo_sabe: boolean;
};

/**
 * Lo que Lana no supo responder.
 *
 * POR QUÉ ESTA PANTALLA ES LA QUE MERECE EL SITIO EN EL MENÚ: hasta ahora estas
 * preguntas se perdían. El cliente preguntaba algo, el bot decía que no sabía,
 * y nadie se enteraba nunca de qué era. Cada fila de aquí es a la vez una venta
 * que se escapó y la instrucción exacta de qué hay que enseñarle.
 *
 * ORDENADAS POR CUÁNTAS VECES SE LA PREGUNTARON, no por fecha: lo que urge
 * arreglar es lo que más se repite, no lo más reciente.
 */
export function LoQueNoSupo({ preguntas }: { preguntas: Pregunta[] }) {
  if (preguntas.length === 0) {
    return (
      <div className="rounded-2xl border border-linea bg-tarjeta p-8 text-center">
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-success/10 text-success">
          <Check className="h-5 w-5" />
        </span>
        <p className="font-semibold text-ink">Lana contestó todo lo que le preguntaron</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-3">
          Cuando algún cliente pregunte algo que tu chatbot no sepa, aparecerá aquí con la pregunta
          textual, para que se lo enseñes en un clic.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {preguntas.map((p) => (
        <Ficha key={`${p.bot_id}-${p.pregunta}`} p={p} />
      ))}
    </div>
  );
}

function Ficha({ p }: { p: Pregunta }) {
  const [abierto, setAbierto] = useState(false);
  const [respuesta, setRespuesta] = useState("");
  const [guardando, empezar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [aprendido, setAprendido] = useState(p.ya_lo_sabe);

  const guardar = () =>
    empezar(async () => {
      const r = await ensenarle({ botId: p.bot_id, pregunta: p.pregunta, respuesta });
      setAviso({ ok: r.ok, texto: r.mensaje ?? (r.ok ? "Guardado." : "No se pudo guardar.") });
      if (r.ok) {
        setAprendido(true);
        setAbierto(false);
      }
    });

  const cuando = new Date(p.ultima_vez).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="rounded-2xl border border-linea bg-tarjeta p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 rounded-xl bg-warning/10 p-2 text-warning">
          <MessageSquareText className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          {/* La pregunta va tal cual la escribió el cliente, con sus faltas y
              todo: así es como la van a volver a escribir otros. */}
          <p className="font-medium leading-snug text-ink">“{p.pregunta}”</p>
          <p className="mt-1 text-xs text-ink-3">
            {p.veces === 1 ? "1 vez" : `${p.veces} veces`}
            {p.bot_nombre && <> · {p.bot_nombre}</>} · último {cuando}
            {" · "}
            <Link href={`/inbox?c=${p.conversacion_id}`} className="font-semibold text-pink hover:underline">
              ver la conversación
            </Link>
          </p>
        </div>

        {aprendido ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <Check className="h-3.5 w-3.5" /> Ya se lo enseñaste
          </span>
        ) : (
          <button
            onClick={() => setAbierto((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-pink/35 bg-gradient-to-r from-pink/20 to-violet/20 px-3 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
          >
            <GraduationCap className="h-4 w-4" /> {abierto ? "Cerrar" : "Enséñale"}
          </button>
        )}
      </div>

      {abierto && !aprendido && (
        <div className="mt-4 border-t border-linea pt-4">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">
            ¿Qué debería haber contestado?
          </label>
          <textarea
            rows={3}
            autoFocus
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            className="input-l"
            placeholder="Sí, enviamos a todo el país. El envío tarda de 2 a 4 días y cuesta $99."
          />
          <p className="mt-1.5 text-[11px] text-ink-3">
            Escríbelo como se lo dirías a un cliente. Se guarda en el entrenamiento de{" "}
            <b>{p.bot_nombre ?? "este chatbot"}</b> y de ningún otro.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={guardar}
              disabled={guardando || !respuesta.trim()}
              className="btn-primary disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Enseñárselo"}
            </button>
            {aviso && !aviso.ok && <span className="text-sm text-danger">{aviso.texto}</span>}
          </div>
        </div>
      )}

      {aviso?.ok && <p className="mt-3 text-sm text-success">{aviso.texto}</p>}
    </div>
  );
}
