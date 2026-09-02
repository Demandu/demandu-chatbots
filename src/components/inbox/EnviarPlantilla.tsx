"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Mandar una plantilla aprobada desde la Bandeja.
 *
 * POR QUÉ EXISTE. Pasadas 24 horas desde el último mensaje de la persona,
 * WhatsApp no deja escribirle texto libre: la plantilla aprobada es la ÚNICA
 * puerta para retomar la conversación. Hasta ahora el botón «Enviar una
 * plantilla» era un enlace a la pantalla de gestión —donde se crean y se mandan
 * a aprobar—, así que el agente llegaba a un sitio donde no podía enviar nada. Y
 * si la conversación no tenía chatbot asignado, el enlace lo dejaba directamente
 * en la lista de chatbots, sin ninguna explicación.
 *
 * SOLO SE OFRECEN LAS APROBADAS. Una plantilla en revisión o rechazada la
 * rechaza Meta en el momento del envío, y el agente se quedaría creyendo que
 * reabrió la conversación cuando no llegó nada.
 */

type Plantilla = {
  name: string;
  language: string;
  body: string | null;
  variables: number | null;
  category: string | null;
};

/** El texto con los datos puestos: exactamente lo que va a leer la persona. */
export function conValores(cuerpo: string | null, valores: string[]): string {
  const base = String(cuerpo ?? "").trim();
  if (!base) return "";
  return base.replace(/\{\{\s*(\d+)\s*\}\}/g, (entero, n) => {
    const v = valores[Number(n) - 1];
    return v && v.trim() ? v : entero;
  });
}

export function EnviarPlantilla({
  conversacionId,
  botId,
  onEnviada,
  onCerrar,
}: {
  conversacionId: string;
  botId: string | null;
  onEnviada: (mensaje: any) => void;
  onCerrar: () => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [cargando, setCargando] = useState(true);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [elegida, setElegida] = useState<Plantilla | null>(null);
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // SE FILTRA POR CHATBOT SOLO SI LO HAY. Una conversación puede no tener
      // chatbot asignado —llegó a un número sin bot, o se creó a mano—, y eso
      // no puede dejar al agente sin plantillas: las de la organización sirven
      // igual, porque cuelgan de la misma cuenta de WhatsApp. RLS ya limita lo
      // que se ve a la organización de quien mira.
      let q = sb
        .from("whatsapp_templates")
        .select("name, language, body, variables, category")
        .eq("status", "APPROVED")
        .order("updated_at", { ascending: false });
      if (botId) q = q.eq("bot_id", botId);

      const { data, error: err } = await q;
      if (!vivo) return;
      if (err) setError("No pude leer las plantillas.");
      setPlantillas((data as Plantilla[]) ?? []);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [sb, botId]);

  const cuantas = Number(elegida?.variables ?? 0);
  const listo = !!elegida && valores.filter((v) => v.trim()).length === cuantas;

  const enviar = async () => {
    if (!elegida || !listo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/canales/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversacion: conversacionId,
          plantilla: {
            nombre: elegida.name,
            idioma: elegida.language,
            valores: valores.slice(0, cuantas),
          },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // El motivo viene del servidor en cristiano. Enseñarlo aquí y NO cerrar
        // deja al agente corregir sin volver a empezar.
        setError(j?.error ?? "No se pudo enviar la plantilla.");
        setEnviando(false);
        return;
      }
      onEnviada(j?.mensaje);
      onCerrar();
    } catch {
      setError("No se pudo conectar. Inténtalo otra vez.");
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onCerrar}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-surface-border shadow-card"
        style={{ backgroundColor: "var(--tarjeta)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center gap-3 border-b border-surface-border px-5 py-4">
          <h3 className="flex-1 font-display text-base font-semibold text-white">
            Retomar la conversación
          </h3>
          <button onClick={onCerrar} className="text-muted hover:text-white" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <p className="mb-4 text-xs leading-relaxed text-muted">
            Pasaron más de 24 horas, así que WhatsApp solo permite escribirle con una plantilla
            aprobada. En cuanto la persona conteste, vuelves a poder escribirle con normalidad.
          </p>

          {cargando && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando tus plantillas…
            </p>
          )}

          {/* SIN PLANTILLAS NO SE PUEDE HACER NADA, y hay que decir por qué y
              qué hacer. Un panel vacío deja al agente pensando que se rompió. */}
          {!cargando && !plantillas.length && (
            <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-[13px] leading-relaxed text-muted">
              <b className="text-white">No hay ninguna plantilla aprobada todavía.</b> Las
              plantillas se crean y se mandan a aprobar a Meta desde la pantalla de Plantillas del
              chatbot, y Meta suele tardar unos minutos en revisarlas.
              {botId && (
                <>
                  {" "}
                  <a href={`/bots/${botId}/templates`} className="font-semibold underline">
                    Ir a Plantillas
                  </a>
                </>
              )}
            </div>
          )}

          {!cargando && plantillas.length > 0 && !elegida && (
            <ul className="space-y-2">
              {plantillas.map((p) => (
                <li key={`${p.name}·${p.language}`}>
                  <button
                    onClick={() => {
                      setElegida(p);
                      setValores(Array(Number(p.variables ?? 0)).fill(""));
                      setError(null);
                    }}
                    className="w-full rounded-xl border border-surface-border p-3 text-left transition hover:border-white/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-sm font-semibold text-white">{p.name}</span>
                      <span className="flex-none rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted ring-1 ring-surface-border">
                        {p.language}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {p.body || "(sin texto)"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {elegida && (
            <div className="space-y-4">
              <button
                onClick={() => { setElegida(null); setError(null); }}
                className="text-xs font-semibold text-muted hover:text-white"
              >
                ← Elegir otra plantilla
              </button>

              {cuantas > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-white">
                    Rellena {cuantas === 1 ? "el dato" : `los ${cuantas} datos`} de la plantilla
                  </p>
                  {Array.from({ length: cuantas }).map((_, i) => (
                    <input
                      key={i}
                      value={valores[i] ?? ""}
                      onChange={(e) => {
                        const v = [...valores];
                        v[i] = e.target.value;
                        setValores(v);
                      }}
                      placeholder={`Dato ${i + 1}`}
                      className="w-full rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-muted focus:border-white/30"
                    />
                  ))}
                </div>
              )}

              {/* LA VISTA PREVIA ES LO QUE EVITA EL RIDÍCULO. Una plantilla se
                  manda una vez y no se puede borrar del teléfono de nadie: ver
                  el texto final antes de darle a enviar es barato. */}
              <div>
                <p className="mb-1 text-xs font-semibold text-white">Lo que va a recibir</p>
                <div className="whitespace-pre-wrap rounded-xl bg-[#005c4b] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef]">
                  {conValores(elegida.body, valores) || "(plantilla sin texto)"}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-white">
              {error}
            </p>
          )}
        </div>

        {elegida && (
          <div className="flex flex-none items-center justify-end gap-2 border-t border-surface-border px-5 py-3">
            <button
              onClick={enviar}
              disabled={!listo || enviando}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "#6E42FF" }}
            >
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {enviando ? "Enviando…" : "Enviar plantilla"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
