"use client";

import { useState } from "react";

/**
 * Vista previa en vivo del widget web: lo que el visitante verá en el sitio.
 * Los campos son controlados para que el usuario vea el cambio al instante,
 * pero se envían con el mismo <form> del server action.
 */
export function WidgetPreview({
  botId,
  initial,
}: {
  botId: string;
  initial: {
    color: string;
    position: string;
    title: string;
    subtitle: string;
    launcher: string;
    greeting: string;
  };
}) {
  const [v, setV] = useState(initial);
  const set = (k: keyof typeof initial) => (e: any) => setV({ ...v, [k]: e.target.value });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Formulario */}
      <div className="card-l p-5">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink">Personaliza tu burbuja</h3>
        <div className="space-y-3">
          <input type="hidden" name="bot_id" value={botId} form="widget-form" />
          <div className="flex gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-2">Color</label>
              <input
                form="widget-form"
                type="color"
                name="color"
                value={v.color}
                onChange={set("color")}
                className="h-11 w-16 cursor-pointer rounded-lg border border-[#e2e4f0] bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-ink-2">¿De qué lado aparece?</label>
              <select form="widget-form" name="position" value={v.position} onChange={set("position")} className="input-l">
                <option value="right">Abajo a la derecha</option>
                <option value="left">Abajo a la izquierda</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Texto del botón</label>
            <input form="widget-form" name="launcher" value={v.launcher} onChange={set("launcher")} className="input-l" placeholder="Chatea con nosotros" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Título</label>
            <input form="widget-form" name="title" value={v.title} onChange={set("title")} className="input-l" placeholder="¿Podemos ayudarte?" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Subtítulo</label>
            <input form="widget-form" name="subtitle" value={v.subtitle} onChange={set("subtitle")} className="input-l" placeholder="Normalmente respondemos al instante" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">Saludo de respaldo (opcional)</label>
            <input form="widget-form" name="greeting" value={v.greeting} onChange={set("greeting")} className="input-l" placeholder="¡Hola! ¿En qué te ayudo?" />
            <p className="mt-1 text-[11px] text-ink-3">
              Solo se usa si el chatbot aún no tiene una conversación de bienvenida.
            </p>
          </div>
        </div>
      </div>

      {/* Vista previa */}
      <div>
        <h3 className="mb-3 font-display text-lg font-semibold text-ink">Así se verá en tu sitio</h3>
        <div className="relative h-[430px] overflow-hidden rounded-2xl border border-[#e6e8f2] bg-[#eef0f7]">
          {/* barra de navegador simulada */}
          <div className="flex items-center gap-1.5 border-b border-[#e6e8f2] bg-white px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 h-4 flex-1 rounded bg-[#f1f2f9]" />
          </div>

          <div
            className={`absolute bottom-4 w-[270px] overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-12px_rgba(0,0,0,.35)] ${
              v.position === "left" ? "left-4" : "right-4"
            }`}
          >
            <div className="px-4 py-3 text-white" style={{ background: v.color }}>
              <div className="text-sm font-bold">{v.title || "¿Podemos ayudarte?"}</div>
              {v.subtitle && <div className="text-[11px] opacity-90">{v.subtitle}</div>}
            </div>
            <div className="space-y-2 bg-[#f4f5fb] p-3">
              <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-[12px] text-ink shadow-sm">
                {v.greeting || "¡Hola! 👋 ¿En qué te puedo ayudar?"}
              </div>
              <div className="ml-auto max-w-[75%] rounded-xl rounded-br-sm px-3 py-2 text-[12px] text-white" style={{ background: v.color }}>
                Quiero información
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-[#e6e8f2] p-2">
              <div className="flex-1 rounded-full border border-[#e2e4f0] px-3 py-1.5 text-[11px] text-ink-3">Escribe tu mensaje…</div>
              <span className="grid h-7 w-7 place-items-center rounded-full text-white" style={{ background: v.color }}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-6-6 18-3.5-7.5L3 11Z" /></svg>
              </span>
            </div>
          </div>

          <div
            className={`absolute bottom-4 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg ${
              v.position === "left" ? "left-[300px]" : "right-[300px]"
            }`}
            style={{ background: v.color }}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" /></svg>
            {v.launcher || "Chatea con nosotros"}
          </div>
        </div>
      </div>
    </div>
  );
}
