"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: any;
  }
}

/** Requisitos que el usuario debe confirmar ANTES de abrir el Embedded Signup. */
const REQUISITOS = [
  "Tengo un número de teléfono que NO está registrado en la app de WhatsApp ni WhatsApp Business (o puedo eliminarlo de ahí), y que puede recibir SMS o llamada para el código de verificación.",
  "Ese número no está conectado a otra cuenta de WhatsApp Business API (WABA).",
  "Tengo acceso al Meta Business Suite (Business Manager) de mi negocio.",
  "Mi negocio y el nombre para mostrar cumplen las Políticas de WhatsApp Business y de Comercio de Meta (sin productos o servicios prohibidos).",
  "Entiendo que los mensajes fuera de la ventana de 24 h requieren plantillas aprobadas por Meta.",
  "Confirmo que la información de mi negocio es real y verificable.",
];

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
  const [checked, setChecked] = useState<boolean[]>(() => REQUISITOS.map(() => false));
  const session = useRef<{ phone_number_id?: string; waba_id?: string }>({});
  const allChecked = checked.every(Boolean);
  const toggle = (i: number) => setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));

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
    if (!allChecked) return;
    if (!window.FB || !configId) {
      setStatus("error");
      setMsg("Falta configurar el App ID / Config ID de Meta en Netlify.");
      return;
    }
    setStatus("connecting");
    setMsg("");
    window.FB.login(
      async (response: any) => {
        const code = response?.authResponse?.code;
        if (!code) {
          setStatus("error");
          setMsg("Conexión cancelada o sin permisos.");
          return;
        }
        try {
          // El intercambio del código lo hace una Edge Function de Supabase
          // (ahí vive el App Secret, no en Netlify). Mandamos el access_token
          // del usuario para que el servidor identifique su organización.
          const supabase = createClient();
          const { data: { session: sess } } = await supabase.auth.getSession();
          const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const res = await fetch(`${base}/functions/v1/whatsapp-embedded`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sess?.access_token ?? ""}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            },
            body: JSON.stringify({
              code,
              bot_id: botId,
              phone_number_id: session.current.phone_number_id,
              waba_id: session.current.waba_id,
            }),
          });
          const j = await res.json();
          if (j.ok) {
            window.location.reload();
          } else {
            setStatus("error");
            setMsg(j.error ?? "No se pudo completar la conexión.");
          }
        } catch {
          setStatus("error");
          setMsg("Error de red al conectar.");
        }
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
        <b className="text-white">NEXT_PUBLIC_META_CONFIG_ID</b> en Netlify, y el secreto <b className="text-white">META_APP_SECRET</b> en Supabase (Edge Functions → Secrets).
      </p>
    );
  }

  return (
    <div className="mt-3">
      {!fixedBotId && (
        <div className="mb-3 max-w-xs">
          <label className="mb-1 block text-xs font-semibold text-muted">Bot que responderá</label>
          <select value={botId} onChange={(e) => setBotId(e.target.value)} className="input">
            <option value="">— elige un bot de WhatsApp —</option>
            {bots.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
        </div>
      )}

      {/* Checklist de requisitos */}
      <div className="mb-3 rounded-xl border border-surface-border bg-surface-raised p-3">
        <p className="mb-2 text-xs font-bold text-white">Antes de continuar, confirma que cumples con los requisitos:</p>
        <div className="space-y-2">
          {REQUISITOS.map((r, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-muted">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => toggle(i)}
                className="mt-0.5 h-3.5 w-3.5 flex-none accent-pink"
              />
              <span>{r}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Disclaimer transparente */}
      <div className="mb-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11.5px] leading-relaxed text-muted">
        <b className="text-danger">⚠️ Importante:</b> Si conectas o creas tu cuenta de WhatsApp Business API a través de Demandu <b className="text-white">sin cumplir estos requisitos</b>, Meta puede <b className="text-white">bloquear o suspender tu número o tu cuenta de inmediato</b> desde tu Meta Business Suite por incumplir sus políticas. Demandu solo facilita la conexión con la API oficial de Meta; la aprobación y el cumplimiento dependen de Meta y de ti. Al continuar, aceptas esta responsabilidad.
      </div>

      <button
        onClick={launch}
        disabled={!allChecked || status === "connecting"}
        className="inline-flex items-center gap-2 rounded-xl bg-demandu-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        title={!allChecked ? "Marca todos los requisitos para continuar" : ""}
      >
        {status === "connecting" ? "Conectando…" : "Cumplo con los requisitos · Conectar WhatsApp"}
      </button>
      {!allChecked && <p className="mt-1.5 text-[11px] text-muted-2">Marca las {REQUISITOS.length} casillas para habilitar la conexión.</p>}
      {msg && <p className="mt-2 text-[11px] text-danger">{msg}</p>}
    </div>
  );
}
