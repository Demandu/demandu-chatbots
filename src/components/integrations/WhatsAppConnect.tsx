"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: any;
  }
}

/** Traduce los códigos de error del backend a mensajes de cara al cliente. */
const ERROR_MAP: Record<string, string> = {
  unauthorized: "Tu sesión expiró. Vuelve a iniciar sesión e inténtalo de nuevo.",
  no_org: "No encontramos tu cuenta. Cierra sesión y vuelve a entrar.",
  server_not_configured: "La conexión con WhatsApp no está disponible en este momento. Contacta a soporte.",
  missing_waba_or_phone: "No recibimos los datos de tu número desde Meta. Vuelve a intentar la conexión.",
};
function friendlyError(code?: string): string {
  if (code && ERROR_MAP[code]) return ERROR_MAP[code];
  return "No se pudo completar la conexión. Inténtalo de nuevo o contacta a soporte.";
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
 * Conexión de WhatsApp por Embedded Signup (Meta), reusando la app
 * "Demandu Tech". El resultado real (waba_id, phone_number_id) llega por
 * el evento WA_EMBEDDED_SIGNUP del popup, NO por el callback de FB.login.
 * Con esos datos llamamos a la Edge Function `whatsapp-embedded`, que hace
 * el override de webhook POR NÚMERO (sin tocar el webhook de la app) y
 * guarda el canal. El App Secret no se usa; el backend usa un System User
 * token (secreto en Supabase).
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
  const allChecked = checked.every(Boolean);
  const toggle = (i: number) => setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));

  // El listener de postMessage necesita el botId más reciente sin re-suscribirse.
  const botIdRef = useRef(botId);
  botIdRef.current = botId;

  /** Cierra la conexión llamando a la Edge Function con los datos del popup. */
  const completeConnection = async (waba_id: string, phone_number_id: string) => {
    setStatus("connecting");
    setMsg("");
    try {
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
        body: JSON.stringify({ waba_id, phone_number_id, bot_id: botIdRef.current }),
      });
      const j = await res.json();
      if (j.ok) {
        window.location.reload();
      } else {
        setStatus("error");
        setMsg(friendlyError(j.error));
      }
    } catch {
      setStatus("error");
      setMsg("Error de red al conectar.");
    }
  };

  useEffect(() => {
    if (!appId) return;
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, autoLogAppEvents: true, xfbml: false, version: "v20.0" });
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
      let d: any;
      try {
        d = JSON.parse(e.data);
      } catch {
        return;
      }
      if (d.type !== "WA_EMBEDDED_SIGNUP") return;
      // Éxito: llegan waba_id + phone_number_id
      const { phone_number_id, waba_id } = d.data || {};
      if (phone_number_id && waba_id) {
        completeConnection(waba_id, phone_number_id);
      } else if (d.data?.error_message || d.event === "ERROR") {
        setStatus("error");
        setMsg(d.data?.error_message ?? "Meta reportó un error al conectar.");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const launch = () => {
    if (!allChecked) return;
    if (!window.FB || !configId) {
      setStatus("error");
      setMsg("La conexión con WhatsApp no está disponible en este momento. Contacta a soporte.");
      return;
    }
    setStatus("connecting");
    setMsg("");
    window.FB.login(
      (response: any) => {
        // El resultado real (waba_id, phone_number_id) llega por el
        // listener de postMessage (onMsg). Aquí solo detectamos cancelación.
        if (!response?.authResponse) {
          setStatus((s) => (s === "connecting" ? "idle" : s));
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
        La conexión con WhatsApp no está disponible en este momento. Escríbenos a soporte y lo habilitamos para tu cuenta.
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
