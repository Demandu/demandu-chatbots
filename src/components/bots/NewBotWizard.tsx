"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { ConnectButton } from "@/components/builder/ConnectButton";
import { LanaAvatar } from "@/components/Lana";
import { canalConectado, createDraftBot, setWelcomeMessage } from "@/app/(dashboard)/bots/actions";
import type { BotChannel } from "@/lib/flow/types";
import { Check, ArrowRight, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

const CHANNELS: { value: BotChannel; label: string; desc: string; color: string }[] = [
  { value: "whatsapp", label: "WhatsApp", desc: "El canal más usado por tus clientes", color: "#25D366" },
  { value: "instagram", label: "Instagram", desc: "Mensajes directos y comentarios", color: "#E1306C" },
  { value: "messenger", label: "Messenger", desc: "Facebook Messenger", color: "#0084FF" },
  { value: "webchat", label: "Mi sitio web", desc: "Una burbuja de chat en tu página", color: "#6E42FF" },
];

const STEPS = ["Canal", "Nombre", "Conectar", "Primer mensaje"];
const DEFAULT_WELCOME = "¡Hola! 👋 Gracias por escribirnos. ¿En qué te puedo ayudar hoy?";

/*
 * LO QUE DICE LANA NO PUEDE PROMETER LO QUE NO PASÓ.
 *
 * El paso 4 terminaba con «¡Y listo!» pasara lo que pasara. Un cliente nuevo
 * creó su chatbot de Instagram, no consiguió conectarlo —Meta no le dejó—, leyó
 * «listo» y salió creyendo que ya funcionaba. No iba a recibir un solo mensaje.
 *
 * Por eso el texto del último paso depende de si el canal quedó conectado DE
 * VERDAD, que es un dato que hay que pedirle al servidor.
 */
function lanaText(step: number, channelLabel: string, conectado: boolean | null) {
  switch (step) {
    case 1: return "¡Hola! Soy Lana 🩷 Te acompaño a crear tu chatbot. Primero, ¿dónde vas a atender a tus clientes?";
    case 2: return `Perfecto, ${channelLabel}. Ahora ponle un nombre para reconocerlo — como “Ventas” o “Soporte”. Tranqui, se puede cambiar después.`;
    case 3: return "Vamos a conectarlo para que reciba mensajes de verdad. Si prefieres, puedes hacerlo después desde la pestaña Conexión.";
    case 4:
      return conectado === false
        ? `Escribe el primer mensaje de tu chatbot. Eso sí: ${channelLabel} todavía NO está conectado, así que aún no le van a llegar mensajes.`
        : "Por último, escribe el primer mensaje que enviará tu chatbot cuando alguien le escriba. ¡Y listo!";
    default: return "";
  }
}

export function NewBotWizard({ initialChannel }: { initialChannel?: string }) {
  const router = useRouter();
  const preset = CHANNELS.find((c) => c.value === initialChannel)?.value;
  const [step, setStep] = useState(preset ? 2 : 1);
  const [channel, setChannel] = useState<BotChannel | "">(preset ?? "");
  const [name, setName] = useState("");
  const [botId, setBotId] = useState("");
  const [flowId, setFlowId] = useState("");
  const [welcome, setWelcome] = useState(DEFAULT_WELCOME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // `null` = todavía no lo hemos preguntado. NO se inicializa en `true`: eso
  // haría que el caso bueno fuera el que se enseña mientras no se sabe, que es
  // justo la mentira que estamos quitando.
  const [conectado, setConectado] = useState<boolean | null>(null);

  const chMeta = CHANNELS.find((c) => c.value === channel);

  const pick = (ch: BotChannel) => { setChannel(ch); setStep(2); };

  /**
   * Del paso 3 al 4 se le PREGUNTA al servidor si el canal quedó conectado.
   *
   * No se puede saber de otra forma: conectar es salir a Meta y volver por otra
   * ruta, así que el asistente no ve nada de lo que pasó por el camino. Si la
   * consulta falla se asume que NO está conectado — ante la duda, avisar de más
   * es mucho mejor que decirle «listo» a quien no lo tiene.
   */
  const irAlUltimoPaso = async () => {
    setStep(4);
    if (!botId) return;
    try {
      setConectado(await canalConectado(botId));
    } catch {
      setConectado(false);
    }
  };

  const create = async () => {
    if (!channel) return;
    setBusy(true); setError("");
    try {
      const res = await createDraftBot(channel, name);
      if (!res) { setError("No se pudo crear el chatbot. Inténtalo de nuevo."); return; }
      setBotId(res.botId); setFlowId(res.flowId);
      setStep(3);
    } catch {
      setError("No se pudo crear el chatbot. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await setWelcomeMessage(flowId, welcome || DEFAULT_WELCOME);
    } catch { /* seguimos igual */ }
    // SIN CONECTAR SE ATERRIZA EN CONEXIÓN, no en el editor. Mandar a alguien
    // al editor de flujos de un chatbot que no recibe mensajes es enseñarle a
    // decorar una puerta que no abre.
    router.push(conectado === false ? `/bots/${botId}/install` : `/bots/${botId}`);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Lana */}
      <div className="mb-5 flex items-end gap-3">
        <LanaAvatar size={64} />
        <div className="rounded-2xl rounded-bl-md border border-pink/25 bg-gradient-to-br from-pink/10 to-violet/10 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-pink">Lana</div>
          <p className="text-sm text-ink">{lanaText(step, chMeta?.label ?? "", conectado)}</p>
        </div>
      </div>

      {/* Progreso */}
      <div className="mb-6 flex items-center">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const now = n === step;
          return (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <span className={`grid h-8 w-8 flex-none place-items-center rounded-full text-sm font-bold ${
                  done ? "bg-demandu-gradient text-white" : now ? "border-2 border-pink text-ink shadow-[0_0_0_4px_rgba(246,74,151,0.12)]" : "border-2 border-linea-2 text-ink-3"
                }`}>
                  {done ? <Check className="h-4 w-4" /> : n}
                </span>
                <span className={`hidden text-[13px] font-semibold sm:block ${now || done ? "text-ink" : "text-ink-3"}`}>{s}</span>
              </div>
              {n < STEPS.length && <span className={`mx-2 h-0.5 flex-1 rounded ${done ? "bg-demandu-gradient" : "bg-[#e2e4f0]"}`} />}
            </div>
          );
        })}
      </div>

      {error && <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</div>}

      {/* Paso 1: Canal */}
      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <button key={c.value} onClick={() => pick(c.value)} className="card-l flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5 hover:border-pink">
              <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl" style={{ background: `${c.color}1f` }}>
                <ChannelIcon channel={c.value} className="h-7 w-7" />
              </span>
              <div>
                <div className="font-display text-base font-semibold text-ink">{c.label}</div>
                <div className="text-xs text-ink-3">{c.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Paso 2: Nombre */}
      {step === 2 && (
        <div className="card-l p-6">
          <h2 className="font-display text-xl font-bold text-ink">¿Cómo se va a llamar tu chatbot?</h2>
          <p className="mt-1 text-sm text-ink-2">Es solo para que tú lo reconozcas. Por ejemplo: “Ventas”, “Soporte” o “Reservaciones”.</p>
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del chatbot</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") create(); }}
              placeholder={`Atención ${chMeta?.label ?? ""}`.trim()}
              className="input-l"
            />
            {chMeta && (
              <p className="mt-2 text-xs text-ink-3">
                Vas a atender por <b style={{ color: chMeta.color }}>{chMeta.label}</b>.
              </p>
            )}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => setStep(1)} className="btn-soft"><ArrowLeft className="h-4 w-4" /> Atrás</button>
            <button onClick={create} disabled={busy} className="btn-primary">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creando…</> : <>Continuar <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      )}

      {/* Paso 3: Conectar */}
      {step === 3 && (
        <div className="card-l p-6">
          <h2 className="font-display text-xl font-bold text-ink">Conecta tu {chMeta?.label}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {channel === "webchat"
              ? "Instala el widget en tu sitio para que el chatbot atienda a tus visitantes."
              : `Enlaza tu cuenta para que el chatbot reciba y responda mensajes en vivo.`}
          </p>
          <div className="mt-4">
            {channel && botId && (
              <ConnectButton channel={channel as BotChannel} botId={botId} connected={false} number={null} />
            )}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button onClick={irAlUltimoPaso} className="text-sm font-semibold text-ink-3 transition hover:text-ink">Conectar después</button>
            <button onClick={irAlUltimoPaso} className="btn-primary">Continuar <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Paso 4: Primer mensaje */}
      {step === 4 && (
        <div className="card-l p-6">
          <h2 className="font-display text-xl font-bold text-ink">Tu primer mensaje</h2>
          <p className="mt-1 text-sm text-ink-2">Esto es lo que tu chatbot responderá cuando alguien le escriba por primera vez.</p>

          {/* EL AVISO VA AQUÍ, ANTES DEL BOTÓN DE TERMINAR, y no en una pantalla
              posterior: quien termina el asistente tiene que salir sabiendo lo
              que tiene, no descubrirlo cuando nadie le escriba. */}
          {conectado === false && (
            <div className="mt-4 flex gap-3 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm leading-relaxed text-ink-2">
              <AlertTriangle className="h-5 w-5 flex-none text-danger" />
              <div>
                <b className="text-ink">{chMeta?.label} todavía no está conectado.</b> Tu chatbot se va a
                crear igual y puedes seguir preparándolo, pero <b className="text-ink">no va a recibir ni
                un mensaje</b> hasta que conectes la cuenta. Al terminar te llevamos a esa pantalla.
              </div>
            </div>
          )}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Mensaje de bienvenida</label>
            <textarea
              autoFocus
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              rows={4}
              className="input-l min-h-[110px]"
            />
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => setStep(3)} className="btn-soft"><ArrowLeft className="h-4 w-4" /> Atrás</button>
            <button onClick={finish} disabled={busy} className="btn-primary">
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Terminando…</>
                : conectado === false
                  ? <><ArrowRight className="h-4 w-4" /> Terminar e ir a conectar</>
                  : <><Check className="h-4 w-4" /> Terminar y abrir mi chatbot</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
