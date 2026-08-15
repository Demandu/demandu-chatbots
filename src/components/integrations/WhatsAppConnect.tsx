"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: any;
  }
}

/**
 * Conexión de WhatsApp por Embedded Signup (Meta).
 * El cliente hace clic → popup de Meta → elige su WABA/número → autoriza.
 * Recibimos un `code` + info de sesión (phone_number_id, waba_id) que el
 * servidor intercambia por un token y guarda. Sin pegar tokens a mano.
 */
export function WhatsAppConnect({
  appId,
  configId,
  bots,
  fixedBotId,
}: {
  appId?: string;
  configId?: string;
  bots: { id: string; name: string }[];
  /** Si se pasa, se conecta a este bot y no muestra el selector. */
  fixedBotId?: string;
}) {
  const [botId, setBotId] = useState(fixedBotId ?? bots[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [msg, setMsg] = useState("");
  const session = useRef<{ phone_number_id?: string; waba_id?: string }>({});

  useEffect(() => {
    if (!appId) return;
    window.fbAsyncInit = function () {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v20.0" });
    };
    if (!document.getElementById("fb-sdk")) {
      const s = document.createElement("script");
      s.id = "fb-sdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      document.body.appendChild(s);
    }
    const onMsg = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      if (!e.origin || !e.origin.endsWith("facebook.com")) return;
      try {
        const d = JSON.parse(e.data);
        if (d.type === "WA_EMBEDDED_SIGNUP" && d.data) {
          session.current = { phone_number_id: d.data.phone_number_id, waba_id: d.data.waba_id };
        }
      } catch {
        /* no-op */
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [appId]);

  const launch = () => {
    if (!window.FB || !configId) {
      setStatus("error");
      setMsg("Falta configurar el App ID / Config ID de Meta en Netlify.");
      return;
    }
    setStatus("connecting");
    setMsg("");
    window.FB.login(
      (response: any) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setStatus("error");
          setMsg("Conexión cancelada o sin permisos.");
          return;
        }
        fetch("/api/integrations/whatsapp/embedded", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            bot_id: botId,
            phone_number_id: session.current.phone_number_id,
            waba_id: session.current.waba_id,
          }),
        })
          .then((r) => r.json())
          .then((j) => {
            if (j.ok) {
              window.location.reload();
            } else {
              setStatus("error");
              setMsg(j.error ?? "No se pudo completar la conexión.");
            }
          })
          .catch(() => {
            setStatus("error");
            setMsg("Error de red al conectar.");
          });
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  };

  if (!appId || !configId) {
    return (
      <p className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-muted">
        Para habilitar la conexión con un clic, configura <b className="text-white">NEXT_PUBLIC_META_APP_ID</b> y{" "}
        <b className="text-white">NEXT_PUBLIC_META_CONFIG_ID</b> en Netlify (y <b className="text-white">META_APP_SECRET</b> como secreta).
      </p>
    );
  }

  return (
    <div className="mt-3">
      {!fixedBotId && (
        <div className="mb-2 max-w-xs">
          <label className="mb-1 block text-xs font-semibold text-muted">Bot que responderá</label>
          <select value={botId} onChange={(e) => setBotId(e.target.value)} className="input">
            <option value="">— elige un bot de WhatsApp —</option>
            {bots.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
        </div>
      )}
      <button
        onClick={launch}
        disabled={status === "connecting"}
        className="inline-flex items-center gap-2 rounded-xl bg-demandu-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {status === "connecting" ? "Conectando…" : "Conectar WhatsApp"}
      </button>
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}
    </div>
  );
}
