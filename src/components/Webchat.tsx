"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Video, MoreVertical, Paperclip, Mic, Send, Smile, ChevronLeft } from "lucide-react";
import type { Flow, FlowButton } from "@/lib/flow/types";
import { getNode, getStartNode, defaultNext, buttonTarget, renderText } from "@/lib/flow/engine";
import { hhmm } from "@/lib/utils";
import { LogoMark } from "./Logo";

type Slot = { startISO: string; endISO: string; label: string };
type Msg =
  | { kind: "in"; html: string; time: string }
  | { kind: "out"; text: string; time: string }
  | { kind: "buttons"; buttons: FlowButton[]; nodeId: string }
  | { kind: "slots"; slots: Slot[]; calendarId: string; nodeId: string; durationMin: number }
  | { kind: "typing" };

/**
 * Webchat estilo WhatsApp que EJECUTA un flujo de Demandu.
 * Reutilizable como preview en el constructor y como widget embebible.
 */
export function Webchat({ flow, autostart = false }: { flow: Flow; autostart?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState("en línea");
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [awaiting, setAwaiting] = useState<
    { nodeId: string; variable?: string; dataType?: string; retriesLeft: number; errorMessage?: string } | null
  >(null);
  /** Variables/atributos capturados durante la conversación (clave → valor). */
  const vars = useRef<Record<string, string>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const wait = (ms: number) => new Promise<void>((r) => timers.current.push(setTimeout(r, ms)));

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  useEffect(() => () => clearTimers(), []);

  const botSay = useCallback(async (text: string) => {
    // Sustituye {{atributo}} por el valor capturado
    const t = (text ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars.current[k] ?? "");
    setStatus("escribiendo…");
    setMsgs((m) => [...m, { kind: "typing" }]);
    await wait(850);
    setMsgs((m) => m.filter((x) => x.kind !== "typing").concat({ kind: "in", html: renderText(t), time: hhmm() }));
    setStatus("en línea");
    await wait(450);
  }, []);

  const userSay = useCallback((text: string) => {
    setMsgs((m) => m.filter((x) => x.kind !== "buttons" && x.kind !== "slots").concat({ kind: "out", text, time: hhmm() }));
  }, []);

  const step = useCallback(
    async (id: string) => {
      const node = getNode(flow, id);
      if (!node) return;
      switch (node.type) {
        case "start":
          if (node.data.to) await step(node.data.to);
          break;
        case "buttons":
          await botSay(node.data.text ?? "");
          setMsgs((m) => [...m, { kind: "buttons", buttons: node.data.buttons ?? [], nodeId: node.id }]);
          break;
        case "ai":
          await botSay("✨ Con base en lo que me cuentas, te recomiendo el *Kit Skincare* — es nuestro más vendido y va perfecto para empezar.");
          { const n = defaultNext(flow, node); if (n) await step(n); }
          break;
        case "question":
          await botSay(node.data.text ?? "");
          setAwaiting({
            nodeId: node.id,
            variable: node.data.variable,
            dataType: node.data.dataType,
            retriesLeft: node.data.retries ?? 2,
            errorMessage: node.data.errorMessage,
          });
          break;
        case "human":
          await botSay(node.data.text ?? "");
          setStatus("conectando con un asesor…");
          break;
        case "calendar": {
          await botSay(node.data.text ?? "¿Qué horario te acomoda mejor?");
          setStatus("consultando disponibilidad…");
          try {
            const res = await fetch("/api/calendar/slots", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ calendarId: node.data.calendarId, durationMin: node.data.durationMin ?? 30 }),
            });
            const j = await res.json();
            setStatus("en línea");
            if (j.error === "not_connected") {
              await botSay("⚠️ _(Preview)_ Conecta Google Calendar en *Configuración → Integraciones* para ofrecer horarios reales.");
              const n = defaultNext(flow, node); if (n) await step(n);
              break;
            }
            if (!j.slots || j.slots.length === 0) {
              await botSay("No encuentro horarios disponibles en el rango configurado. Revisa tu *Horario laboral*.");
              const n = defaultNext(flow, node); if (n) await step(n);
              break;
            }
            setMsgs((m) => [...m, { kind: "slots", slots: j.slots, calendarId: j.calendarId, nodeId: node.id, durationMin: node.data.durationMin ?? 30 }]);
          } catch {
            setStatus("en línea");
            await botSay("No pude consultar la disponibilidad en este momento.");
            const n = defaultNext(flow, node); if (n) await step(n);
          }
          break;
        }
        case "end":
          await botSay(node.data.text ?? "");
          break;
        default:
          // message / media / delay / action / calendar / tags
          await botSay(node.data.text ?? "");
          { const n = defaultNext(flow, node); if (n) await step(n); }
      }
    },
    [flow, botSay, userSay]
  );

  const onButton = async (b: FlowButton, nodeId: string) => {
    userSay(b.label);
    await wait(400);
    const t = buttonTarget(flow, nodeId, b);
    if (t) await step(t);
  };

  const onSlot = async (
    slot: Slot,
    meta: { calendarId: string; nodeId: string; durationMin: number }
  ) => {
    userSay(slot.label);
    setStatus("agendando…");
    await wait(300);
    const node = getNode(flow, meta.nodeId);
    const d = (node?.data ?? {}) as typeof flow.nodes[number]["data"];
    const email = d.attendeeAttr ? vars.current[d.attendeeAttr] : undefined;
    const name = d.nameAttr ? vars.current[d.nameAttr] : undefined;
    const company = d.companyAttr ? vars.current[d.companyAttr] : undefined;
    const summary = `Cita — ${name || "Cliente"}${company ? " · " + company : ""}`;
    const description =
      "Cita agendada desde el chatbot de Demandu." +
      (name ? `\nNombre: ${name}` : "") +
      (company ? `\nEmpresa: ${company}` : "") +
      (email ? `\nCorreo: ${email}` : "");
    try {
      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarId: meta.calendarId,
          startISO: slot.startISO,
          endISO: slot.endISO,
          durationMin: meta.durationMin,
          summary,
          description,
          attendeeEmail: email,
        }),
      });
      const j = await res.json();
      setStatus("en línea");
      if (j.ok) {
        await botSay(
          `¡Listo${name ? ", " + name : ""}! Agendé tu cita para *${slot.label}*.` +
            (email ? ` Te envié la invitación a *${email}*.` : "") +
            " ✅"
        );
      } else {
        await botSay(`No pude crear el evento${j.error ? ` (${j.error})` : ""}.`);
      }
    } catch {
      setStatus("en línea");
      await botSay("Hubo un problema al agendar.");
    }
    if (node) { const n = defaultNext(flow, node); if (n) await step(n); }
  };

  const submitInput = async () => {
    if (!awaiting) return;
    const text = input.trim();
    if (!text) return;
    userSay(text);
    setInput("");
    const valid =
      awaiting.dataType === "email"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
        : awaiting.dataType === "phone"
        ? text.replace(/\D/g, "").length >= 7
        : awaiting.dataType === "number"
        ? !isNaN(Number(text))
        : text.length > 0;
    if (!valid && awaiting.retriesLeft > 0) {
      await botSay(awaiting.errorMessage || "Ese dato no parece válido, ¿puedes intentarlo de nuevo?");
      setAwaiting({ ...awaiting, retriesLeft: awaiting.retriesLeft - 1 });
      return;
    }
    if (awaiting.variable) vars.current[awaiting.variable] = text;
    const node = getNode(flow, awaiting.nodeId);
    setAwaiting(null);
    if (node) { const n = defaultNext(flow, node); if (n) await step(n); }
  };

  const run = useCallback(async () => {
    clearTimers();
    setMsgs([]);
    vars.current = {};
    setAwaiting(null);
    setInput("");
    setStarted(true);
    userSay("Hola, vi su anuncio 👀");
    await wait(600);
    const start = getStartNode(flow);
    if (start) await step(start.id);
  }, [flow, step, userSay]);

  const reset = () => {
    clearTimers();
    setMsgs([]);
    vars.current = {};
    setAwaiting(null);
    setInput("");
    setStarted(false);
    setStatus("en línea");
  };

  useEffect(() => {
    if (autostart && !started) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="flex h-[min(720px,78vh)] w-full max-w-[360px] flex-col overflow-hidden rounded-[38px] border-[10px] border-[#05070a] bg-[#0b141a] shadow-2xl">
        {/* Header */}
        <div className="flex flex-none items-center gap-2.5 bg-[#202c33] px-3.5 py-3">
          <ChevronLeft className="h-5 w-5 text-[#aebac1]" />
          <div className="grid h-10 w-10 place-items-center rounded-full bg-tarjeta p-1.5">
            <LogoMark className="h-full w-full" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 text-[15px] font-semibold text-[#e9edef]">
              Lana · Tienda Demo <span className="text-[#53bdeb]">✔</span>
            </div>
            <div className="text-xs text-[#8696a0]">{status}</div>
          </div>
          <div className="ml-auto flex gap-4 text-[#aebac1]">
            <Video className="h-5 w-5" />
            <Phone className="h-5 w-5" />
            <MoreVertical className="h-5 w-5" />
          </div>
        </div>

        {/* Body */}
        <div
          ref={bodyRef}
          className="flex flex-1 flex-col gap-2 overflow-y-auto px-3.5 py-4"
          style={{
            backgroundColor: "#0b141a",
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cg fill='%23131f27' fill-opacity='0.5'%3E%3Ccircle cx='10' cy='10' r='1.5'/%3E%3Ccircle cx='40' cy='30' r='1.5'/%3E%3Ccircle cx='20' cy='50' r='1.5'/%3E%3C/g%3E%3C/svg%3E\")",
          }}
        >
          {msgs.map((m, i) => {
            if (m.kind === "typing")
              return (
                <div key={i} className="flex gap-1 self-start rounded-lg bg-[#202c33] px-3.5 py-2.5">
                  {[0, 1, 2].map((d) => (
                    <i
                      key={d}
                      className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-[#8696a0]"
                      style={{ animationDelay: `${d * 0.2}s` }}
                    />
                  ))}
                </div>
              );
            if (m.kind === "in")
              return (
                <div key={i} className="max-w-[80%] self-start rounded-lg rounded-tl-sm bg-[#202c33] px-2.5 py-1.5 text-[13.5px] leading-snug text-[#e9edef]">
                  <span dangerouslySetInnerHTML={{ __html: m.html }} />
                  <span className="ml-2 float-right text-[10px] text-[#8696a0]">{m.time}</span>
                </div>
              );
            if (m.kind === "out")
              return (
                <div key={i} className="max-w-[80%] self-end rounded-lg rounded-tr-sm bg-[#005c4b] px-2.5 py-1.5 text-[13.5px] leading-snug text-[#e9edef]">
                  {m.text}
                  <span className="ml-2 float-right text-[10px] text-[#a7c9bf]">{m.time} ✓✓</span>
                </div>
              );
            if (m.kind === "slots")
              return (
                <div key={i} className="my-1 max-w-[85%] self-start">
                  <div className="mb-1 text-[11px] text-[#8696a0]">📅 Horarios disponibles</div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {m.slots.map((s) => (
                      <button
                        key={s.startISO}
                        onClick={() => onSlot(s, { calendarId: m.calendarId, nodeId: m.nodeId, durationMin: m.durationMin })}
                        className="rounded-lg border border-[#2a3942] bg-[#182229] px-3 py-2 text-left text-[13px] font-medium capitalize text-[#e9edef] hover:border-[#00a884] hover:bg-[#1e2a32]"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            // buttons
            return (
              <div key={i} className="my-1 max-w-[80%] self-stretch overflow-hidden rounded-lg shadow">
                {m.buttons.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onButton(b, m.nodeId)}
                    className="block w-full border-t border-[#0b141a] bg-[#182229] py-2.5 text-sm font-medium text-[#53bdeb] first:border-t-0 hover:bg-[#1e2a32]"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-none items-center gap-2.5 bg-[#202c33] px-3 py-2.5">
          <Smile className="h-5 w-5 text-[#8696a0]" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitInput(); }
            }}
            disabled={!awaiting}
            placeholder={awaiting ? "Escribe tu respuesta…" : "Escribe un mensaje…"}
            className="flex-1 rounded-full bg-[#2a3942] px-3.5 py-2 text-[13.5px] text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none disabled:cursor-not-allowed"
          />
          <Paperclip className="h-5 w-5 text-[#8696a0]" />
          <button
            onClick={() => submitInput()}
            disabled={!awaiting || !input.trim()}
            className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#00a884] text-white transition disabled:opacity-50"
            title={awaiting ? "Enviar" : ""}
          >
            {awaiting ? <Send className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="flex gap-2.5">
        <button onClick={run} className="btn-primary">▶ Iniciar conversación</button>
        <button onClick={reset} className="btn-ghost">⟲ Reiniciar</button>
      </div>
    </div>
  );
}
