"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Video, MoreVertical, Paperclip, Mic, Send, Smile, ChevronLeft } from "lucide-react";
import { renderText } from "@/lib/flow/engine";
import { hhmm } from "@/lib/utils";
import { LogoMark } from "./Logo";

/**
 * EL TELÉFONO DE «PROBAR FLUJO». SOLO LA PANTALLA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE ARCHIVO YA NO INTERPRETA FLUJOS, Y ESE ES TODO EL CAMBIO.
 *
 * Traía su propio motor: 7 tipos de bloque contra los 29 del motor de Node y
 * los 49 del de WhatsApp. Multimedia, Tienda, Reservas, Condición y Redirigir
 * caían en su rama por defecto y solo imprimían el texto del nodo — por eso una
 * imagen salía como una etiqueta en vez de como imagen.
 *
 * Y el bloque de IA tenía la respuesta ESCRITA A MANO aquí dentro: una
 * recomendación de un «Kit Skincare», la misma para todos los clientes de la
 * plataforma. El negocio probaba, veía contestar a «Lana», creía que su
 * entrenamiento funcionaba, publicaba, y WhatsApp hacía otra cosa.
 *
 * Ahora cada turno va a `/api/flujo/probar`, que corre el motor de verdad. Lo
 * que se ve aquí es lo que hace el producto, incluidos sus fallos — que es
 * exactamente para lo que sirve una prueba.
 *
 * SI ALGUIEN VUELVE A METER UN `switch (node.type)` EN ESTE ARCHIVO, está
 * naciendo el tercer motor otra vez. Hay una regla estática que lo impide.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Boton = { id: string; label: string };
type Msg =
  | { kind: "in"; text: string; buttons?: Boton[]; time: string }
  | { kind: "out"; text: string; time: string }
  | { kind: "typing" }
  | { kind: "aviso"; text: string };

/** ¿Este texto es, él solo, un enlace a una imagen o un vídeo? */
function medio(texto: string): { url: string; video: boolean } | null {
  const t = (texto ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  const limpio = t.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(limpio)) return { url: t, video: false };
  if (/\.(mp4|webm|mov|m4v)$/.test(limpio)) return { url: t, video: true };
  return null;
}

export function Webchat({ flowId, autostart = false }: { flowId?: string; autostart?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState("en línea");
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  /**
   * Un turno contra el motor de verdad.
   *
   * SI FALLA, SE DICE. Antes un turno mudo era indistinguible de «el flujo no
   * tiene nada que contestar», y el dueño se quedaba mirando una pantalla en
   * blanco sin saber si su flujo estaba mal o si la prueba estaba rota.
   */
  const turno = useCallback(
    async (cuerpo: { text?: string; start?: boolean; reiniciar?: boolean }) => {
      if (!flowId) {
        setMsgs((m) => [...m, { kind: "aviso", text: "Guarda la conversación antes de probarla." }]);
        return;
      }
      setOcupado(true);
      setStatus("escribiendo…");
      setMsgs((m) => [...m, { kind: "typing" }]);
      try {
        const res = await fetch("/api/flujo/probar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId, ...cuerpo }),
        });
        const j = await res.json().catch(() => ({}));
        setMsgs((m) => m.filter((x) => x.kind !== "typing"));
        if (!res.ok) {
          const porQue =
            j?.error === "sin_permiso"
              ? "Tu usuario no puede probar chatbots."
              : j?.error === "flujo_no_existe"
                ? "Esta conversación ya no existe. Recarga la página."
                : j?.error === "sin_sesion"
                  ? "Tu sesión caducó. Vuelve a entrar."
                  : "No se pudo correr la prueba. Inténtalo otra vez.";
          setMsgs((m) => [...m, { kind: "aviso", text: porQue }]);
          return;
        }
        if (j?.vacio) {
          setMsgs((m) => [...m, { kind: "aviso", text: "Esta conversación todavía no tiene bloques." }]);
          return;
        }
        const salida = (j?.messages ?? []) as { text?: string; buttons?: Boton[] }[];
        if (!salida.length) {
          setMsgs((m) => [...m, { kind: "aviso", text: "El flujo no contestó nada en este paso." }]);
          return;
        }
        setMsgs((m) => [
          ...m,
          ...salida.map((s) => ({
            kind: "in" as const,
            text: String(s.text ?? ""),
            buttons: s.buttons,
            time: hhmm(),
          })),
        ]);
      } catch {
        setMsgs((m) => m.filter((x) => x.kind !== "typing").concat({ kind: "aviso", text: "No hay conexión con el servidor." }));
      } finally {
        setOcupado(false);
        setStatus("en línea");
      }
    },
    [flowId],
  );

  const run = useCallback(async () => {
    setMsgs([]);
    setInput("");
    setStarted(true);
    await turno({ start: true, reiniciar: true });
  }, [turno]);

  const enviar = async () => {
    const t = input.trim();
    if (!t || ocupado) return;
    setInput("");
    setMsgs((m) => [...m, { kind: "out", text: t, time: hhmm() }]);
    await turno({ text: t });
  };

  /**
   * ── SE MANDA EL IDENTIFICADOR DEL BOTÓN, NO SU ETIQUETA ─────────────────
   *
   * Es lo que hace el widget de verdad (`public/widget.js`: `post({ text: b.id })`),
   * y no es un detalle de estilo: en el bloque de agendar, el id del botón ES
   * LA HORA EN ISO. Mandando la etiqueta —«mar 15 de sep, 09:00»— el motor no
   * reconocía ninguna hora, volvía a pedir que eligiera una de la lista, y la
   * prueba se quedaba dando vueltas para siempre.
   *
   * En pantalla se sigue viendo la etiqueta: lo que cambia es lo que viaja.
   */
  const pulsar = async (b: Boton) => {
    if (ocupado) return;
    setMsgs((m) => [...m, { kind: "out", text: b.label, time: hhmm() }]);
    await turno({ text: b.id });
  };

  useEffect(() => {
    if (autostart && !started) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  /* ── LOS BOTONES VAN DEBAJO DE SU PROPIO MENSAJE ─────────────────────
   *
   * Estaban debajo del ÚLTIMO mensaje entrante, y con el motor de verdad eso
   * los hacía desaparecer: el motor manda después de las opciones su aviso de
   * atajos («Escribe 0 para volver al inicio»), así que el último mensaje ya
   * no era el de los botones y no se pintaba ninguno.
   *
   * Siguen visibles después de contestar —como en WhatsApp— pero apagados:
   * borrarlos dejaría la conversación sin memoria de lo que se ofreció, y
   * dejarlos vivos permitiría contestar dos veces la misma pregunta. */
  const ultimaRespuesta = msgs.reduce((n, m, i) => (m.kind === "out" ? i : n), -1);

  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      {/* Bajó de 78vh a 66vh: con los botones y la nota de abajo, el marco se
          salía del panel y la cabecera del teléfono quedaba cortada. */}
      <div className="flex h-[min(640px,66vh)] w-full max-w-[360px] flex-col overflow-hidden rounded-[38px] border-[10px] border-[#05070a] bg-[#0b141a] shadow-2xl">
        <div className="flex flex-none items-center gap-2.5 bg-[#202c33] px-3.5 py-3">
          <ChevronLeft className="h-5 w-5 text-[#aebac1]" />
          <div className="grid h-10 w-10 place-items-center rounded-full bg-tarjeta p-1.5">
            <LogoMark className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">Prueba de tu conversación</p>
            <p className="truncate text-[11px] text-[#8696a0]">{status}</p>
          </div>
          <Video className="h-5 w-5 text-[#aebac1]" />
          <Phone className="h-5 w-5 text-[#aebac1]" />
          <MoreVertical className="h-5 w-5 text-[#aebac1]" />
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 space-y-2 overflow-auto bg-[#0b141a] px-3 py-4">
          {msgs.length === 0 && (
            <p className="mt-6 text-center text-xs text-[#8696a0]">
              Pulsa «Iniciar conversación» para probarla.
            </p>
          )}
          {msgs.map((m, i) => {
            if (m.kind === "typing") {
              return (
                <div key={i} className="w-fit rounded-xl bg-[#202c33] px-3 py-2 text-[#8696a0]">
                  ···
                </div>
              );
            }
            if (m.kind === "aviso") {
              return (
                <p key={i} className="mx-auto w-fit rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[11px] text-[#ffd279]">
                  {m.text}
                </p>
              );
            }
            const mio = m.kind === "out";
            const med = !mio ? medio(m.text) : null;
            return (
              <div key={i} className={mio ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-sm ${
                    mio ? "bg-[#005c4b] text-white" : "bg-[#202c33] text-[#e9edef]"
                  }`}
                >
                  {med ? (
                    med.video ? (
                      <video src={med.url} controls className="max-h-56 rounded-lg" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={med.url} alt="" className="max-h-56 rounded-lg" />
                    )
                  ) : (
                    <span dangerouslySetInnerHTML={{ __html: renderText(m.text) }} />
                  )}
                  <span className="ml-2 align-bottom text-[10px] text-white/50">{m.time}</span>
                  {!mio && m.buttons?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.buttons.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => pulsar(b)}
                          disabled={ocupado || i < ultimaRespuesta}
                          className="rounded-lg border border-[#2a3942] bg-[#0b141a] px-3 py-1.5 text-xs text-[#53bdeb] disabled:opacity-40"
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

        </div>

        <div className="flex flex-none items-center gap-2 bg-[#202c33] px-2.5 py-2.5">
          <Smile className="h-5 w-5 flex-none text-[#8696a0]" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Escribe un mensaje…"
            className="min-w-0 flex-1 rounded-full bg-[#2a3942] px-3.5 py-2 text-sm text-[#e9edef] outline-none placeholder:text-[#8696a0]"
          />
          <Paperclip className="h-5 w-5 flex-none text-[#8696a0]" />
          <button
            onClick={enviar}
            disabled={ocupado || !input.trim()}
            className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#00a884] text-white transition disabled:opacity-50"
            title="Enviar"
          >
            {input.trim() ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex gap-2.5">
        <button onClick={run} disabled={ocupado} className="btn-primary disabled:opacity-60">
          ▶ Iniciar conversación
        </button>
        <button onClick={run} disabled={ocupado} className="btn-ghost disabled:opacity-60">
          ⟲ Reiniciar
        </button>
      </div>

      {/* DECIR LO QUE ESTA PRUEBA NO PUEDE PROBAR ES PARTE DE LA PRUEBA.
          Prometer que aquí se ve todo lo de WhatsApp sería repetir el error
          que este cambio corrige. */}
      <p className="max-w-[360px] text-center text-[11px] leading-relaxed text-ink-3">
        Corre el motor real y prueba <strong>lo último guardado</strong>. Los bloques
        exclusivos de WhatsApp no se pueden probar aquí: para esos, escríbele a tu
        número conectado.
      </p>
    </div>
  );
}
