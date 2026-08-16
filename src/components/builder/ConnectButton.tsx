"use client";

import { useState } from "react";
import { X, Plug, Check, Copy } from "lucide-react";
import type { BotChannel } from "@/lib/flow/types";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { WhatsAppConnect } from "@/components/integrations/WhatsAppConnect";

const LABEL: Record<BotChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "tu sitio web",
};

export function ConnectButton({
  channel,
  botId,
  connected,
  number,
}: {
  channel: BotChannel;
  botId: string;
  connected?: boolean;
  number?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://demandu-chatbots.netlify.app";
  const snippet = `<script>
  (function(d){
    var s = d.createElement('script');
    s.src = '${origin}/widget.js';
    s.async = 1;
    s.dataset.bot = '${botId}';
    d.body.appendChild(s);
  })(document);
</script>`;

  const copy = () => {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
          connected
            ? "border border-success/40 bg-success/10 text-success"
            : "bg-demandu-gradient text-white hover:opacity-90"
        }`}
      >
        {connected ? (
          <>
            <Check className="h-3.5 w-3.5" /> Conectado{number ? ` · ${number}` : ""}
          </>
        ) : (
          <>
            <Plug className="h-3.5 w-3.5" /> Conectar {LABEL[channel]}
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white">
                <ChannelIcon channel={channel} className="h-6 w-6" />
              </span>
              <h3 className="flex-1 font-display text-lg font-semibold text-white">Conectar {LABEL[channel]}</h3>
              <button onClick={() => setOpen(false)} className="text-muted-2 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            {channel === "whatsapp" && (
              <div>
                <p className="mb-1 text-sm text-muted-2">
                  Se abrirá el registro oficial de Meta. Inicia sesión con Facebook, elige tu número de WhatsApp Business y autoriza — nosotros hacemos el resto.
                </p>
                <WhatsAppConnect
                  fixedBotId={botId}
                  bots={[]}
                  appId={process.env.NEXT_PUBLIC_META_APP_ID}
                  configId={process.env.NEXT_PUBLIC_META_CONFIG_ID}
                />
              </div>
            )}

            {(channel === "instagram" || channel === "messenger") && (
              <div className="space-y-3 text-sm text-muted">
                <p className="text-muted-2">
                  Conecta tu cuenta con Facebook para que el bot responda {channel === "instagram" ? "DM, historias y comentarios de Instagram" : "los mensajes y comentarios de tu página de Facebook"}.
                </p>
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[12px] text-muted">
                  La conexión de {LABEL[channel]} estará disponible muy pronto. Escríbenos a soporte y la habilitamos para tu cuenta.
                </div>
              </div>
            )}

            {channel === "webchat" && (
              <div>
                <p className="mb-2 text-sm text-muted-2">
                  Para el sitio web no conectas una cuenta: instalas este código. Pégalo antes de <code className="font-mono text-muted">&lt;/body&gt;</code> en tu página.
                </p>
                <div className="relative">
                  <pre className="max-h-56 overflow-auto rounded-xl border border-surface-border bg-[#0a0a1f] p-3 text-[11px] leading-relaxed text-[#e9edef]">{snippet}</pre>
                  <button
                    onClick={copy}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-surface-raised px-2 py-1 text-[11px] font-semibold text-white hover:bg-surface-border"
                  >
                    {copied ? <><Check className="h-3 w-3" /> Copiado</> : <><Copy className="h-3 w-3" /> Copiar</>}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-2">El widget embebible (widget.js) queda activo en el siguiente paso; el código ya apunta a este bot.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
