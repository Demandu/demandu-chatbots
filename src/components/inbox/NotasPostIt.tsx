"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, Plus, Trash2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Nota = {
  id: string;
  body: string;
  author_name: string | null;
  author_id: string | null;
  color: string;
  created_at: string;
};

/** Colores de post-it. El nombre se guarda, no el hex, para poder retocar la paleta después. */
const COLORES: Record<string, { fondo: string; borde: string; nombre: string }> = {
  amarillo: { fondo: "#FFF6C9", borde: "#F2E39B", nombre: "Amarillo" },
  rosa: { fondo: "#FFE1EE", borde: "#F5C2D8", nombre: "Rosa" },
  azul: { fondo: "#DCEBFF", borde: "#BFD8F7", nombre: "Azul" },
  verde: { fondo: "#D9F5E3", borde: "#B6E3C8", nombre: "Verde" },
  violeta: { fondo: "#E8DEFF", borde: "#CFC0F5", nombre: "Violeta" },
};
const ORDEN = Object.keys(COLORES);

function cuando(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (mismoDia) return `Hoy ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `Ayer ${hora}`;
  return `${d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} ${hora}`;
}

/**
 * Notas internas del equipo sobre el lead, en forma de post-it.
 * Cada una guarda QUIÉN la escribió y CUÁNDO, para poder seguir el historial.
 * El cliente final nunca las ve.
 */
export function NotasPostIt({ contactId, orgId }: { contactId: string; orgId: string }) {
  const sb = createClient();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [texto, setTexto] = useState("");
  const [color, setColor] = useState("amarillo");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [yo, setYo] = useState<{ id: string; nombre: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const cargar = useCallback(async () => {
    const { data } = await sb
      .from("contact_notes")
      .select("id, body, author_name, author_id, color, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });
    setNotas((data as any[]) ?? []);
    setCargando(false);
  }, [sb, contactId]);

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [cargar]);

  // Quién soy, para firmar la nota
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      const nombre =
        (u.user_metadata as any)?.full_name ||
        (u.user_metadata as any)?.name ||
        u.email?.split("@")[0] ||
        "Alguien del equipo";
      setYo({ id: u.id, nombre });
    });
  }, [sb]);

  const agregar = async () => {
    const body = texto.trim();
    if (!body || guardando) return;
    setGuardando(true);
    const { data, error } = await sb
      .from("contact_notes")
      .insert({
        org_id: orgId,
        contact_id: contactId,
        body,
        color,
        author_id: yo?.id ?? null,
        author_name: yo?.nombre ?? null,
      })
      .select("id, body, author_name, author_id, color, created_at")
      .single();
    setGuardando(false);
    if (error) return;
    setNotas((n) => [data as any, ...n]);
    setTexto("");
    areaRef.current?.focus();
  };

  const borrar = async (id: string) => {
    setNotas((n) => n.filter((x) => x.id !== id));
    await sb.from("contact_notes").delete().eq("id", id);
  };

  return (
    <div className="border-t border-surface-border pt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-2">
        <StickyNote className="h-3.5 w-3.5" /> Notas internas
        {notas.length > 0 && <span className="text-muted-2">· {notas.length}</span>}
      </div>
      <p className="mb-2.5 text-[11px] text-muted-2">Solo las ve tu equipo. El cliente nunca.</p>

      {/* Nueva nota */}
      <div
        className="rounded-xl border p-2.5 shadow-sm"
        style={{ backgroundColor: COLORES[color].fondo, borderColor: COLORES[color].borde }}
      >
        <textarea
          ref={areaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
          rows={2}
          placeholder="Ej: Pidió cotización de 50 piezas, llamar el lunes…"
          className="w-full resize-none bg-transparent text-[13px] text-[#3a3410] placeholder:text-[#3a341088] focus:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {ORDEN.map((c) => (
              <button
                key={c}
                type="button"
                title={COLORES[c].nombre}
                aria-label={COLORES[c].nombre}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition ${
                  color === c ? "border-[#3a3410]" : "border-transparent"
                }`}
                style={{ backgroundColor: COLORES[c].fondo, boxShadow: `inset 0 0 0 1px ${COLORES[c].borde}` }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={agregar}
            disabled={!texto.trim() || guardando}
            className="inline-flex items-center gap-1 rounded-lg bg-[#3a3410] px-2.5 py-1 text-xs font-semibold text-[#fffdf2] transition hover:bg-[#54491a] disabled:opacity-40"
          >
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Pegar nota
          </button>
        </div>
      </div>

      {/* Historial */}
      <div className="mt-3 space-y-2">
        {cargando && <p className="text-[11px] text-muted-2">Cargando notas…</p>}
        {!cargando && notas.length === 0 && (
          <p className="text-[11px] text-muted-2">Todavía no hay notas de este lead.</p>
        )}
        {notas.map((n) => {
          const col = COLORES[n.color] ?? COLORES.amarillo;
          return (
            <div
              key={n.id}
              className="group relative rounded-xl border p-2.5 shadow-sm"
              style={{ backgroundColor: col.fondo, borderColor: col.borde }}
            >
              <p className="whitespace-pre-wrap break-words pr-5 text-[13px] leading-snug text-[#3a3410]">{n.body}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium text-[#3a341099]">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-[#3a341022] text-[8px] font-bold">
                  {(n.author_name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                {n.author_name ?? "Alguien del equipo"} · {cuando(n.created_at)}
              </div>
              {/* Solo puedes borrar tus propias notas: el historial del equipo no se toca */}
              {yo && n.author_id === yo.id && (
                <button
                  type="button"
                  aria-label="Borrar nota"
                  onClick={() => borrar(n.id)}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg text-[#3a341066] opacity-0 transition hover:text-danger group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
