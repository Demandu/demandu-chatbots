"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Bot, User, CheckCircle2, RotateCcw, MailPlus, CheckCheck, Smile, Paperclip, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ChannelBadge } from "./ChannelBadge";
import { ContactPanel } from "./ContactPanel";
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
  state_id: string | null;
  assignee_member_id: string | null;
  contact: Contact | null;
  state: State | null;
  member: Member | null;
};
type Message = { id: string; direction: string; sender: string; body: string | null; created_at: string };

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
}: {
  initial: Convo[];
  members: Member[];
  states: State[];
  tags: { id: string; name: string; color: string }[];
  /** Atributos personalizados del cliente, para la ficha del lead. */
  attrs?: { id: string; name: string; key: string }[];
  /** Color de las burbujas que enviamos: lo elige cada cliente. */
  bubbleOut?: string | null;
}) {
  const sb = useMemo(() => createClient(), []);
  const [convos, setConvos] = useState<Convo[]>(initial);
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"todas" | "abiertas" | "cerradas">("todas");
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Toda la paleta del chat sale del color de burbuja que eligió el cliente,
  // así el fondo y los textos siempre contrastan bien.
  const paleta = useMemo(() => paletaChat(bubbleOut), [bubbleOut]);

  const sel = convos.find((c) => c.id === selId) ?? null;

  const selectSql =
    "id, channel, status, unread, last_message_at, state_id, assignee_member_id, " +
    "contact:contacts(id,name,wa_name,phone,email,company,country,notes,attributes,channel,tags), " +
    "state:conversation_states(id,name,color), member:team_members(id,name)";

  const loadConvos = useCallback(async () => {
    const { data } = await sb.from("conversations").select(selectSql).order("last_message_at", { ascending: false });
    if (data) setConvos(data as any);
  }, [sb]);

  const loadMessages = useCallback(
    async (id: string) => {
      const { data } = await sb.from("messages").select("id,direction,sender,body,created_at").eq("conversation_id", id).order("created_at");
      setMessages((data as any) ?? []);
    },
    [sb]
  );

  // Al seleccionar: carga mensajes y marca como leído
  useEffect(() => {
    if (!selId) return;
    loadMessages(selId);
    setConvos((cs) => cs.map((c) => (c.id === selId ? { ...c, unread: 0 } : c)));
    sb.from("conversations").update({ unread: 0 }).eq("id", selId).then(() => {});
  }, [selId, loadMessages, sb]);

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
  const markUnread = async () => {
    if (!sel) return;
    const id = sel.id;
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: Math.max(1, c.unread) } : c)));
    await sb.from("conversations").update({ unread: 1 }).eq("id", id);
    setSelId(null);
  };

  const filtered = convos.filter((c) => {
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
            {(["todas", "abiertas", "cerradas"] as const).map((f) => (
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
              <button
                key={c.id}
                onClick={() => setSelId(c.id)}
                className={`flex w-full items-center gap-3 border-b border-surface-border px-3.5 py-3 text-left transition hover:bg-surface-raised ${active ? "bg-surface-raised" : ""}`}
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
                    <span className="flex-none text-[11px] text-muted-2">{ago(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-2">{c.member?.name ? `👤 ${c.member.name}` : "Sin asignar"}</span>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-pink px-1 text-[10px] font-bold text-white">{c.unread}</span>
                    )}
                  </div>
                  {c.state && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${c.state.color}22`, color: c.state.color }}>
                      ● {c.state.name}
                    </span>
                  )}
                </div>
              </button>
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
              <button
                onClick={markUnread}
                title="Marcar como no leído"
                className="grid h-8 w-8 place-items-center rounded-lg border border-surface-border bg-surface-raised text-muted transition hover:text-white"
              >
                <MailPlus className="h-4 w-4" />
              </button>
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
                  <span
                    className="ml-2 inline-flex select-none items-center gap-0.5 align-bottom text-[10px]"
                    style={{ color: out ? paleta.metaOut : "rgba(0,0,0,.42)" }}
                  >
                    {clock(m.created_at)}
                    {out && <CheckCheck className="h-3 w-3" />}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Composer (estilo WhatsApp Web · Demandu) */}
          <div className="flex flex-none items-end gap-2 px-3 py-2.5" style={{ backgroundColor: "#ffffff" }}>
            <Smile className="mb-2 h-6 w-6 flex-none text-muted-2" />
            <Paperclip className="mb-2 h-5 w-5 flex-none text-muted-2" />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Escribe un mensaje"
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
            onPatch={(patch) =>
              setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, contact: { ...c.contact!, ...patch } as any } : c)))
            }
            onToggleTag={toggleTag}
          />
        </div>
      )}

    </div>
  );
}
