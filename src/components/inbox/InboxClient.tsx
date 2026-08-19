"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Bot, User, CheckCircle2, RotateCcw, CheckCheck, Smile, Paperclip, ChevronLeft, Hand, AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChannelBadge } from "./ChannelBadge";
import { ContactPanel } from "./ContactPanel";
import { ConvoMenu, type AccionChat } from "./ConvoMenu";
import { TraductorBoton } from "./TraductorBoton";
import { RespuestasRapidas } from "./RespuestasRapidas";
import { rellenar, type RespuestaRapida } from "@/lib/quickReplies";
import { Confirm } from "@/components/ui/Confirm";
import { bandera, paisDesdeTelefono } from "@/lib/phoneCountry";
import { paletaChat } from "@/lib/chatColors";

type Contact = {
  id: string; name: string | null; wa_name: string | null; phone: string | null; email: string | null;
  company: string | null; country: string | null; notes: string | null;
  attributes: Record<string, any> | null; channel: string | null; tags: string[] | null;
};
type State = { id: string; name: string; color: string };
type Member = { id: string; name: string };
type Convo = {
  id: string;
  channel: string;
  status: string;
  unread: number;
  last_message_at: string;
  /** Cuándo pidió el lead hablar con una persona (null = no pidió) */
  handoff_requested_at: string | null;
  state_id: string | null;
  opportunity_id?: string | null;
  assignee_member_id: string | null;
  contact: Contact | null;
  state: State | null;
  member: Member | null;
};
type Message = {
  id: string; direction: string; sender: string; body: string | null; created_at: string;
  /** Si WhatsApp rechazó el envío, aquí viene el motivo en humano. */
  payload?: { no_entregado?: { motivo: string; code: number | null } } | null;
};

const CH: Record<string, { label: string; emoji: string; color: string }> = {
  whatsapp: { label: "WhatsApp", emoji: "🟢", color: "#25D366" },
  instagram: { label: "Instagram", emoji: "📸", color: "#E1306C" },
  messenger: { label: "Messenger", emoji: "💬", color: "#0084FF" },
  telegram: { label: "Telegram", emoji: "✈️", color: "#229ED9" },
  webchat: { label: "Web Chat", emoji: "🌐", color: "#6E42FF" },
};

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}
function initials(name?: string | null) {
  return (name ?? "?").trim().slice(0, 2).toUpperCase();
}

// El estilo del chat ya no está fijo: sale de `paletaChat()` a partir del
// color de burbuja que eligió el cliente en Configuración → Apariencia.

export function InboxClient({
  initial,
  members,
  states,
  tags,
  attrs = [],
  bubbleOut,
  orgId,
  quickReplies = [],
}: {
  initial: Convo[];
  members: Member[];
  states: State[];
  tags: { id: string; name: string; color: string }[];
  /** Atributos personalizados del cliente, para la ficha del lead. */
  attrs?: { id: string; name: string; key: string }[];
  /** Color de las burbujas que enviamos: lo elige cada cliente. */
  bubbleOut?: string | null;
  /** Organización actual, para guardar las notas internas */
  orgId?: string | null;
  /** Mensajes prediseñados del equipo */
  quickReplies?: RespuestaRapida[];
}) {
  const sb = useMemo(() => createClient(), []);
  const [convos, setConvos] = useState<Convo[]>(initial);
  const params = useSearchParams();
  const pedida = params.get("c");
  const [selId, setSelId] = useState<string | null>(pedida ?? initial[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"todas" | "solicitudes" | "abiertas" | "cerradas">("todas");
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  // Acción destructiva pendiente de confirmar (vaciar o eliminar un chat)
  const [porConfirmar, setPorConfirmar] = useState<{ id: string; accion: "vaciar" | "eliminar"; quien: string } | null>(null);
  const [borrando, setBorrando] = useState(false);
  // Traductor: idioma elegido y traducciones ya resueltas (id del mensaje → texto)
  const [idioma, setIdioma] = useState<string | null>(null);
  const [traducciones, setTraducciones] = useState<Record<string, string>>({});
  const [traduciendo, setTraduciendo] = useState(false);
  const [errorTraduccion, setErrorTraduccion] = useState("");
  // Respuestas rápidas: se abren con el botón ⚡ o escribiendo "/" al inicio
  const [rapidasAbierto, setRapidasAbierto] = useState(false);
  const cajaTexto = useRef<HTMLTextAreaElement>(null);

  // Toda la paleta del chat sale del color de burbuja que eligió el cliente,
  // así el fondo y los textos siempre contrastan bien.
  const paleta = useMemo(() => paletaChat(bubbleOut), [bubbleOut]);

  const sel = convos.find((c) => c.id === selId) ?? null;

  const selectSql =
    "id, channel, status, unread, last_message_at, handoff_requested_at, state_id, assignee_member_id, opportunity_id, " +
    "contact:contacts(id,name,wa_name,phone,email,company,country,notes,attributes,channel,tags), " +
    "state:conversation_states(id,name,color), member:team_members(id,name)";

  const loadConvos = useCallback(async () => {
    const { data } = await sb.from("conversations").select(selectSql).order("last_message_at", { ascending: false });
    if (data) setConvos(data as any);
  }, [sb]);

  const loadMessages = useCallback(
    async (id: string) => {
      const { data } = await sb.from("messages").select("id,direction,sender,body,created_at,payload").eq("conversation_id", id).order("created_at");
      setMessages((data as any) ?? []);
    },
    [sb]
  );

  // Al seleccionar: carga mensajes y marca como leído
  useEffect(() => {
    if (!selId) return;
    loadMessages(selId);
    // Al abrirla se marca leída y, si el lead había pedido una persona,
    // la solicitud se da por atendida (deja de sonar en toda la plataforma).
    setConvos((cs) =>
      cs.map((c) => (c.id === selId ? { ...c, unread: 0, handoff_requested_at: null } : c)),
    );
    sb.from("conversations")
      .update({ unread: 0, handoff_requested_at: null })
      .eq("id", selId)
      .then(() => {});
  }, [selId, loadMessages, sb]);

  // Si llegamos desde un aviso (?c=…), abrimos esa conversación
  useEffect(() => {
    if (pedida) setSelId(pedida);
  }, [pedida]);

  // Refresco ligero (simula tiempo real mientras no hay motor en vivo)
  useEffect(() => {
    const t = setInterval(() => {
      loadConvos();
      if (selId) loadMessages(selId);
    }, 6000);
    return () => clearInterval(t);
  }, [loadConvos, loadMessages, selId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Al cambiar de conversación se limpia lo traducido (son otros mensajes)
  useEffect(() => setTraducciones({}), [selId]);

  // Traduce solo lo que todavía no está traducido, así los mensajes nuevos
  // que van llegando se traducen solos sin repetir trabajo.
  useEffect(() => {
    if (!idioma) return;
    const pendientes = messages.filter((m) => m.body && traducciones[m.id] === undefined);
    if (!pendientes.length) return;

    let cancelado = false;
    setTraduciendo(true);
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idioma, textos: pendientes.map((m) => m.body) }),
    })
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => {
        if (cancelado) return;
        if (!ok) {
          setErrorTraduccion(j?.error ?? "No se pudo traducir.");
          setIdioma(null);
          return;
        }
        setErrorTraduccion("");
        setTraducciones((prev) => {
          const next = { ...prev };
          pendientes.forEach((m, i) => { next[m.id] = j.traducciones?.[i] ?? ""; });
          return next;
        });
      })
      .catch(() => {
        if (!cancelado) { setErrorTraduccion("No se pudo conectar con el traductor."); setIdioma(null); }
      })
      .finally(() => { if (!cancelado) setTraduciendo(false); });

    return () => { cancelado = true; };
  }, [idioma, messages, traducciones]);

  const send = async () => {
    const body = text.trim();
    if (!body || !sel) return;
    setText("");
    const optimistic: Message = { id: `tmp-${Date.now()}`, direction: "outbound", sender: "agent", body, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    const orgRes = await sb.from("conversations").select("org_id").eq("id", sel.id).maybeSingle();
    const org_id = (orgRes.data as any)?.org_id;
    await sb.from("messages").insert({ conversation_id: sel.id, org_id, direction: "outbound", sender: "agent", body });
    await sb.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", sel.id);
    loadConvos();
  };

  const setState = async (stateId: string) => {
    if (!sel) return;
    const st = states.find((s) => s.id === stateId) ?? null;
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, state_id: stateId, state: st } : c)));
    await sb.from("conversations").update({ state_id: stateId }).eq("id", sel.id);
    // La etapa que se ve aquí y la columna del Embudo son la MISMA cosa: si
    // solo se guardara en la conversación, el agente movería el estado desde
    // el chat y la tarjeta se quedaría quieta en el tablero.
    if ((sel as any).opportunity_id) {
      await sb.from("opportunities").update({ stage_id: stateId }).eq("id", (sel as any).opportunity_id);
    }
  };
  const setAssignee = async (memberId: string) => {
    if (!sel) return;
    const mm = members.find((m) => m.id === memberId) ?? null;
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, assignee_member_id: memberId || null, member: mm } : c)));
    await sb.from("conversations").update({ assignee_member_id: memberId || null }).eq("id", sel.id);
  };
  const toggleTag = async (name: string) => {
    if (!sel?.contact) return;
    const cur = new Set(sel.contact.tags ?? []);
    if (cur.has(name)) cur.delete(name); else cur.add(name);
    const next = Array.from(cur);
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, contact: { ...c.contact!, tags: next } } : c)));
    await sb.from("contacts").update({ tags: next }).eq("id", sel.contact.id);
  };

  const setConvStatus = async (status: string) => {
    if (!sel) return;
    setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, status } : c)));
    await sb.from("conversations").update({ status }).eq("id", sel.id);
  };

  /** Marca sin leer sin abrirla (si estaba abierta, la cierra para que no se relea). */
  const marcarNoLeido = async (id: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: Math.max(1, c.unread) } : c)));
    if (selId === id) setSelId(null);
    await sb.from("conversations").update({ unread: 1 }).eq("id", id);
  };
  const marcarLeido = async (id: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    await sb.from("conversations").update({ unread: 0 }).eq("id", id);
  };
  const cambiarEstado = async (id: string, status: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    await sb.from("conversations").update({ status }).eq("id", id);
  };

  /** Borra los mensajes pero conserva la conversación y el contacto. */
  const vaciarChat = async (id: string) => {
    await sb.from("messages").delete().eq("conversation_id", id);
    if (selId === id) setMessages([]);
    loadConvos();
  };
  /** Borra la conversación entera (sus mensajes se van en cascada). El contacto se queda. */
  const eliminarChat = async (id: string) => {
    await sb.from("messages").delete().eq("conversation_id", id);
    await sb.from("conversations").delete().eq("id", id);
    setConvos((cs) => cs.filter((c) => c.id !== id));
    if (selId === id) { setSelId(null); setMessages([]); }
  };

  const nombreDe = (c: Convo | null) => c?.contact?.name || c?.contact?.wa_name || "este contacto";

  const onAccion = (c: Convo, a: AccionChat) => {
    if (a === "no_leido") return void marcarNoLeido(c.id);
    if (a === "leido") return void marcarLeido(c.id);
    if (a === "cerrar") return void cambiarEstado(c.id, "closed");
    if (a === "reabrir") return void cambiarEstado(c.id, "open");
    setPorConfirmar({ id: c.id, accion: a, quien: nombreDe(c) });
  };

  const confirmarAccion = async () => {
    if (!porConfirmar) return;
    setBorrando(true);
    try {
      if (porConfirmar.accion === "vaciar") await vaciarChat(porConfirmar.id);
      else await eliminarChat(porConfirmar.id);
    } finally {
      setBorrando(false);
      setPorConfirmar(null);
    }
  };

  /** Si el mensaje empieza con "/", lo que sigue filtra las respuestas rápidas. */
  const atajoEscrito = /^\/(\S*)$/.exec(text);
  const busquedaRapida = atajoEscrito ? atajoEscrito[1] : "";
  useEffect(() => {
    if (atajoEscrito) setRapidasAbierto(true);
    else if (busquedaRapida === "" && text !== "") setRapidasAbierto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  /** Mete la respuesta en el cuadro de escritura, con los datos del lead ya puestos. */
  const usarRapida = useCallback(
    async (r: RespuestaRapida) => {
      const c = sel?.contact;
      const nombre = c?.name || c?.wa_name || "";
      const cuerpo = rellenar(r.body, {
        nombre,
        primerNombre: nombre.split(/\s+/)[0] ?? "",
        telefono: c?.phone ?? "",
        empresa: (c as any)?.company ?? "",
        agente: sel?.member?.name ?? "",
      });
      setText(cuerpo);
      setRapidasAbierto(false);
      setTimeout(() => {
        cajaTexto.current?.focus();
        const n = cuerpo.length;
        cajaTexto.current?.setSelectionRange(n, n);
      }, 20);
      // Para poder ordenarlas por uso más adelante (no bloquea nada si falla)
      try { await sb.rpc("bump_quick_reply", { p_id: r.id }); } catch { /* opcional */ }
    },
    [sel, sb],
  );

  const filtered = convos.filter((c) => {
    if (filter === "solicitudes" && !c.handoff_requested_at) return false;
    if (filter === "abiertas" && c.status === "closed") return false;
    if (filter === "cerradas" && c.status !== "closed") return false;
    if (q && !(c.contact?.name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flow-light flex flex-1 overflow-hidden">
      {/* ── Lista de conversaciones ──
          En móvil se ve una cosa a la vez: la lista, o la conversación abierta. */}
      <div
        className={`w-full flex-none flex-col border-r border-surface-border bg-surface md:flex md:w-[330px] ${
          sel ? "hidden" : "flex"
        }`}
      >
        <div className="border-b border-surface-border p-3">
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-raised px-3 py-2">
            <Search className="h-4 w-4 text-muted-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar contacto…"
              className="w-full bg-transparent text-sm text-white placeholder:text-muted-2 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex gap-1">
            {(["todas", "solicitudes", "abiertas", "cerradas"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === f ? "bg-demandu-gradient text-white" : "text-muted hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-2">Sin conversaciones.</p>}
          {filtered.map((c) => {
            const ch = CH[c.channel] ?? CH.webchat;
            const active = c.id === selId;
            return (
              // Es un div (no un button) porque adentro lleva el menú "⋮",
              // y un botón dentro de otro botón no es HTML válido.
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelId(c.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(c.id); } }}
                className={`group flex w-full cursor-pointer items-center gap-3 border-b border-surface-border px-3.5 py-3 text-left transition hover:bg-surface-raised ${active ? "bg-surface-raised" : ""}`}
              >
                <div className="relative flex-none">
                  <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-pink to-violet font-display text-sm font-bold text-white">
                    {initials(c.contact?.name || c.contact?.wa_name)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5" title={ch.label}>
                    <ChannelBadge channel={c.channel} size={17} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="flex-none text-sm leading-none" title="País del lead">
                        {bandera(c.contact?.country ?? paisDesdeTelefono(c.contact?.phone))}
                      </span>
                      <span className="truncate text-sm font-semibold text-white">
                        {c.contact?.name || c.contact?.wa_name || "Contacto"}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1">
                      <span className="text-[11px] text-muted-2">{ago(c.last_message_at)}</span>
                      <ConvoMenu
                        cerrada={c.status === "closed"}
                        sinLeer={c.unread > 0}
                        onAccion={(a) => onAccion(c, a)}
                        className="-mr-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-2">{c.member?.name ? `👤 ${c.member.name}` : "Sin asignar"}</span>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-pink px-1 text-[10px] font-bold text-white">{c.unread}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {c.handoff_requested_at && (
                      <span className="inline-flex items-center gap-1 rounded bg-pink px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Hand className="h-3 w-3" /> Pide persona
                      </span>
                    )}
                    {c.state && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${c.state.color}22`, color: c.state.color }}>
                        ● {c.state.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Hilo de conversación ── */}
      {!sel ? (
        <div className="hidden flex-1 items-center justify-center text-center md:flex" style={{ backgroundColor: paleta.canvas }}>
          <div className="max-w-xs">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink/20 to-violet/20 text-2xl">💬</div>
            <h3 className="font-display text-lg font-semibold text-white">Bandeja unificada</h3>
            <p className="mt-1 text-sm text-muted-2">Selecciona una conversación para atenderla.</p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col" style={{ backgroundColor: paleta.canvas }}>
          {/* Header */}
          <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-surface-border px-3 py-2.5 sm:flex-nowrap sm:px-4" style={{ backgroundColor: "#ffffff" }}>
            {/* Volver a la lista (solo móvil) */}
            <button
              onClick={() => setSelId(null)}
              aria-label="Volver a la lista"
              className="-ml-1 grid h-9 w-9 flex-none place-items-center rounded-xl text-muted transition hover:text-white md:hidden"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="relative flex-none">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-xs font-bold text-white">{initials(sel.contact?.name || sel.contact?.wa_name)}</div>
              <span className="absolute -bottom-1 -right-1"><ChannelBadge channel={sel.channel} size={15} /></span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {sel.contact?.name || sel.contact?.wa_name || "Contacto"}
              </div>
              <div className="text-[11px] text-muted-2">{(CH[sel.channel] ?? CH.webchat).label} · {sel.contact?.phone ?? "—"}</div>
            </div>
            <div className="flex w-full items-center gap-2 overflow-x-auto sm:ml-auto sm:w-auto sm:overflow-visible">
              <TraductorBoton
                idioma={idioma}
                cargando={traduciendo}
                onElegir={(code) => { setErrorTraduccion(""); setTraducciones({}); setIdioma(code); }}
                onApagar={() => { setIdioma(null); setTraducciones({}); setErrorTraduccion(""); }}
              />
              <ConvoMenu
                cerrada={sel.status === "closed"}
                sinLeer={sel.unread > 0}
                onAccion={(a) => onAccion(sel, a)}
                className="flex-none rounded-lg border border-surface-border bg-surface-raised"
              />
              {sel.status === "closed" ? (
                <button
                  onClick={() => setConvStatus("open")}
                  className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                </button>
              ) : (
                <button
                  onClick={() => setConvStatus("closed")}
                  className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success transition hover:bg-success/20"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Cerrar
                </button>
              )}
              <select
                value={sel.assignee_member_id ?? ""}
                onChange={(e) => setAssignee(e.target.value)}
                className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
              <select
                value={sel.state_id ?? ""}
                onChange={(e) => setState(e.target.value)}
                className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-xs font-semibold text-white focus:outline-none"
              >
                <option value="">Estado…</option>
                {states.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
          </div>

          {(() => {
            const fallo = [...messages].reverse().find((m) => m.payload?.no_entregado)?.payload?.no_entregado;
            if (!fallo) return null;
            return (
              <div className="flex flex-none items-start gap-2 border-b border-danger/40 bg-danger/10 px-4 py-2.5 text-xs text-ink-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-danger" />
                <span>
                  <b className="text-danger">WhatsApp no está entregando tus mensajes.</b> {fallo.motivo}
                </span>
              </div>
            );
          })()}

          {errorTraduccion && (
            <div className="flex flex-none items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-xs text-ink-2">
              <span>{errorTraduccion}</span>
              <button onClick={() => setErrorTraduccion("")} className="font-semibold text-ink-3 hover:text-ink">
                Cerrar
              </button>
            </div>
          )}

          {/* Mensajes (estilo WhatsApp Web · paleta Demandu) */}
          <div
            ref={bodyRef}
            className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-[8%] py-4"
            style={{ backgroundColor: paleta.canvas, backgroundImage: paleta.doodle }}
          >
            {messages.map((m) => {
              const out = m.direction === "outbound";
              return (
                <div
                  key={m.id}
                  className={`relative max-w-[82%] px-2.5 pb-1.5 pt-1.5 text-[13.5px] leading-snug shadow-sm sm:max-w-[65%] ${
                    out ? "self-end rounded-lg rounded-tr-sm" : "self-start rounded-lg rounded-tl-sm"
                  }`}
                  style={{ backgroundColor: out ? paleta.out : paleta.in, color: out ? paleta.textOut : paleta.textIn }}
                >
                  {out && (
                    <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold" style={{ color: m.sender === "bot" ? "#8B66FF" : "#FF6FB0" }}>
                      {m.sender === "bot" ? <><Bot className="h-3 w-3" /> Lana</> : <><User className="h-3 w-3" /> Agente</>}
                    </div>
                  )}
                  <span className="whitespace-pre-wrap break-words align-bottom">{m.body}</span>
                  {idioma && traducciones[m.id] && (
                    <span
                      className="mt-1.5 block whitespace-pre-wrap break-words border-t pt-1.5 text-[12.5px] italic"
                      style={{
                        borderColor: out ? `${paleta.textOut}22` : "#00000014",
                        color: out ? paleta.textOut : paleta.textIn,
                        opacity: 0.78,
                      }}
                    >
                      {traducciones[m.id]}
                    </span>
                  )}
                  <span
                    className="ml-2 inline-flex select-none items-center gap-0.5 align-bottom text-[10px]"
                    style={{ color: out ? paleta.metaOut : "rgba(0,0,0,.42)" }}
                  >
                    {clock(m.created_at)}
                    {out && !m.payload?.no_entregado && <CheckCheck className="h-3 w-3" />}
                  </span>
                  {m.payload?.no_entregado && (
                    <span
                      className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold"
                      style={{ color: "#c02b31" }}
                      title={m.payload.no_entregado.motivo}
                    >
                      <AlertTriangle className="h-3 w-3" /> No se entregó
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Composer (estilo WhatsApp Web · Demandu) */}
          <div className="flex flex-none items-end gap-2 px-3 py-2.5" style={{ backgroundColor: "#ffffff" }}>
            <Smile className="mb-2 h-6 w-6 flex-none text-muted-2" />
            <Paperclip className="mb-2 h-5 w-5 flex-none text-muted-2" />
            <RespuestasRapidas
              respuestas={quickReplies}
              abierto={rapidasAbierto}
              busqueda={busquedaRapida}
              onAbrir={() => setRapidasAbierto(true)}
              onCerrar={() => setRapidasAbierto(false)}
              onElegir={usarRapida}
            />
            <textarea
              ref={cajaTexto}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Con el selector abierto, Enter elige la respuesta (no envía).
                if (rapidasAbierto && ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"].includes(e.key)) return;
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder="Escribe un mensaje  ·  / para respuestas rápidas"
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg bg-surface-raised px-3.5 py-2.5 text-sm text-white placeholder:text-muted-2 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!text.trim()}
              className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full text-white transition disabled:opacity-50"
              style={{ backgroundColor: "#6E42FF", color: "#fff" }}
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Ficha del lead ── */}
      {sel?.contact && (
        <div className="hidden w-[320px] flex-none flex-col overflow-auto border-l border-surface-border bg-surface p-4 xl:flex">
          <ContactPanel
            contact={sel.contact as any}
            canal={(CH[sel.channel] ?? CH.webchat).label}
            agente={sel.member?.name}
            tags={tags}
            attrs={attrs}
            orgId={orgId}
            onPatch={(patch) =>
              setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, contact: { ...c.contact!, ...patch } as any } : c)))
            }
            onToggleTag={toggleTag}
          />
        </div>
      )}

      <Confirm
        abierto={!!porConfirmar}
        ocupado={borrando}
        titulo={porConfirmar?.accion === "vaciar" ? "¿Vaciar los mensajes?" : "¿Eliminar este chat?"}
        detalle={
          porConfirmar?.accion === "vaciar" ? (
            <>
              Se borran todos los mensajes de la conversación con{" "}
              <b className="text-ink">{porConfirmar?.quien}</b>, pero la conversación y el contacto se quedan. Esto no
              se puede deshacer.
            </>
          ) : (
            <>
              Se borra la conversación con <b className="text-ink">{porConfirmar?.quien}</b> y todos sus mensajes.{" "}
              <b className="text-ink">El contacto se queda</b> en tu lista. Si te vuelve a escribir, se abre una
              conversación nueva. Esto no se puede deshacer.
            </>
          )
        }
        confirmar={porConfirmar?.accion === "vaciar" ? "Sí, vaciar" : "Sí, eliminar"}
        onConfirmar={confirmarAccion}
        onCancelar={() => setPorConfirmar(null)}
      />
    </div>
  );
}
