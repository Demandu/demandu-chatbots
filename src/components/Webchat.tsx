"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Video, MoreVertical, Paperclip, Mic, Smile, ChevronLeft } from "lucide-react";
import type { Flow, FlowButton } from "@/lib/flow/types";
import { getNode, getStartNode, defaultNext, buttonTarget, renderText } from "@/lib/flow/engine";
import { hhmm } from "@/lib/utils";
import { LogoMark } from "./Logo";

type Msg =
  | { kind: "in"; html: string; time: string }
  | { kind: "out"; text: string; time: string }
  | { kind: "buttons"; buttons: FlowButton[]; nodeId: string }
  | { kind: "typing" };

/**
 * Webchat estilo WhatsApp que EJECUTA un flujo de Demandu.
 * Reutilizable como preview en el constructor y como widget embebible.
 */
export function Webchat({ flow, autostart = false }: { flow: Flow; autostart?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState("en línea");
  const [started, setStarted] = useState(false);
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
    setStatus("escribiendo…");
    setMsgs((m) => [...m, { kind: "typing" }]);
    await wait(850);
    setMsgs((m) => m.filter((x) => x.kind !== "typing").concat({ kind: "in", html: renderText(text), time: hhmm() }));
    setStatus("en línea");
    await wait(450);
  }, []);

  const userSay = useCallback((text: string) => {
    setMsgs((m) => m.filter((x) => x.kind !== "buttons").concat({ kind: "out", text, time: hhmm() }));
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
          await wait(900);
          userSay("Alejandro Castañón · Av. Bosque Real 123, Huixquilucan");
          await wait(500);
          { const n = defaultNext(flow, node); if (n) await step(n); }
          break;
        case "human":
          await botSay(node.data.text ?? "");
          setStatus("conectando con un asesor…");
          break;
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

  const run = useCallback(async () => {
    clearTimers();
    setMsgs([]);
    setStarted(true);
    userSay("Hola, vi su anuncio 👀");
    await wait(600);
    const start = getStartNode(flow);
    if (start) await step(start.id);
  }, [flow, step, userSay]);

  const reset = () => {
    clearTimers();
    setMsgs([]);
    setStarted(false);
    setStatus("en línea");
  };

  useEffect(() => {
    if (autostart && !started) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart]);

  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="flex h-[720px] w-[360px] flex-col overflow-hidden rounded-[38px] border-[10px] border-[#05070a] bg-[#0b141a] shadow-2xl">
        {/* Header */}
        <div className="flex flex-none items-center gap-2.5 bg-[#202c33] px-3.5 py-3">
          <ChevronLeft className="h-5 w-5 text-[#aebac1]" />
          <div className="grid h-10 w-10 place-items-center rounded-full bg-white p-1.5">
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
          <div className="flex-1 rounded-full bg-[#2a3942] px-3.5 py-2 text-[13.5px] text-[#8696a0]">
            Escribe un mensaje…
          </div>
          <Paperclip className="h-5 w-5 text-[#8696a0]" />
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#00a884] text-white">
            <Mic className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="flex gap-2.5">
        <button onClick={run} className="btn-primary">▶ Iniciar conversación</button>
        <button onClick={reset} className="btn-ghost">⟲ Reiniciar</button>
      </div>
    </div>
  );
}
