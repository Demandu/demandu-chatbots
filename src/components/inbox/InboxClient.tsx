"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Bot, User, Phone, Mail, Tag as TagIcon, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Contact = { id: string; name: string | null; phone: string | null; email: string | null; channel: string | null; tags: string[] | null };
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

export function InboxClient({
  initial,
  members,
  states,
  tags,
}: {
  initial: Convo[];
  members: Member[];
  states: State[];
  tags: { id: string; name: string; color: string }[];
}) {
  const sb = useMemo(() => createClient(), []);
  const [convos, setConvos] = useState<Convo[]>(initial);
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<"todas" | "abiertas" | "cerradas">("todas");
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const sel = convos.find((c) => c.id === selId) ?? null;

  const selectSql =
    "id, channel, status, unread, last_message_at, state_id, assignee_member_id, " +
    "contact:contacts(id,name,phone,email,channel,tags), state:conversation_states(id,name,color), member:team_members(id,name)";

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

  const filtered = convos.filter((c) => {
    if (filter === "abiertas" && c.status === "closed") return false;
    if (filter === "cerradas" && c.status !== "closed") return false;
    if (q && !(c.contact?.name ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Lista de conversaciones ── */}
      <div className="flex w-[330px] flex-none flex-col border-r border-surface-border bg-surface">
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
                    {initials(c.contact?.name)}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 text-[11px]" title={ch.label}>{ch.emoji}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white">{c.contact?.name ?? "Contacto"}</span>
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
        <div className="flex flex-1 items-center justify-center bg-[#0b0b23] text-center">
          <div className="max-w-xs">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink/20 to-violet/20 text-2xl">💬</div>
            <h3 className="font-display text-lg font-semibold text-white">Bandeja unificada</h3>
            <p className="mt-1 text-sm text-muted-2">Selecciona una conversación para atenderla.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col bg-[#0b0b23]">
          {/* Header */}
          <div className="flex flex-none items-center gap-3 border-b border-surface-border bg-surface px-4 py-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-xs font-bold text-white">{initials(sel.contact?.name)}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{sel.contact?.name ?? "Contacto"}</div>
              <div className="text-[11px] text-muted-2">{(CH[sel.channel] ?? CH.webchat).label} · {sel.contact?.phone ?? "—"}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
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

          {/* Mensajes */}
          <div ref={bodyRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 py-4">
            {messages.map((m) => {
              const out = m.direction === "outbound";
              return (
                <div key={m.id} className={`max-w-[64%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug ${out ? "self-end rounded-tr-sm bg-demandu-gradient text-white" : "self-start rounded-tl-sm bg-surface-card text-white"}`}>
                  {out && (
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-80">
                      {m.sender === "bot" ? <><Bot className="h-3 w-3" /> Lana</> : <><User className="h-3 w-3" /> Agente</>}
                    </div>
                  )}
                  <div>{m.body}</div>
                  <div className={`mt-0.5 text-right text-[10px] ${out ? "text-white/70" : "text-muted-2"}`}>{clock(m.created_at)}</div>
                </div>
              );
            })}
          </div>

          {/* Composer */}
          <div className="flex flex-none items-end gap-2 border-t border-surface-border bg-surface px-4 py-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Escribe un mensaje…  (Enter para enviar)"
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-white placeholder:text-muted-2 focus:border-pink focus:outline-none"
            />
            <button onClick={send} disabled={!text.trim()} className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-demandu-gradient text-white disabled:opacity-50">
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Perfil del contacto ── */}
      {sel && (
        <div className="hidden w-[300px] flex-none flex-col overflow-auto border-l border-surface-border bg-surface p-4 xl:flex">
          <div className="flex flex-col items-center border-b border-surface-border pb-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-pink to-violet text-lg font-bold text-white">{initials(sel.contact?.name)}</div>
            <div className="mt-2 font-display text-base font-semibold text-white">{sel.contact?.name ?? "Contacto"}</div>
            <div className="text-xs text-muted-2">{(CH[sel.channel] ?? CH.webchat).label}</div>
          </div>

          <div className="space-y-2.5 border-b border-surface-border py-4 text-sm">
            <div className="flex items-center gap-2.5 text-muted"><Phone className="h-4 w-4 text-muted-2" /> {sel.contact?.phone ?? "—"}</div>
            <div className="flex items-center gap-2.5 text-muted"><Mail className="h-4 w-4 text-muted-2" /> {sel.contact?.email ?? "—"}</div>
            <div className="flex items-center gap-2.5 text-muted"><User className="h-4 w-4 text-muted-2" /> {sel.member?.name ?? "Sin asignar"}</div>
          </div>

          <div className="py-4">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2"><TagIcon className="h-3.5 w-3.5" /> Etiquetas</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 && <span className="text-[11px] text-muted-2">Crea etiquetas en Configuración.</span>}
              {tags.map((t) => {
                const on = (sel.contact?.tags ?? []).includes(t.name);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? "border-transparent text-white" : "border-surface-border bg-surface-raised text-muted hover:text-white"}`}
                    style={on ? { background: t.color } : undefined}
                  >
                    {on ? "✓ " : ""}{t.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-auto rounded-xl border border-surface-border bg-surface-raised p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2"><Sparkles className="h-3.5 w-3.5 text-violet" /> Resumen IA</div>
            <p className="text-xs text-muted-2">Disponible cuando conectes Lana AI: un resumen automático de la conversación y el siguiente mejor paso.</p>
          </div>
        </div>
      )}
    </div>
  );
}
