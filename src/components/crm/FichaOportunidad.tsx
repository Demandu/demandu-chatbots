"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  X, MessageSquare, Check, Plus, Trash2, Loader2, CalendarClock, AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bandera, nombrePais } from "@/lib/phoneCountry";
import {
  vencimiento, nombreTarjeta, CUANDO, fechaDeAtajo,
  type Tarjeta, type Columna,
} from "@/lib/crm";
import { aFechaCorta, deFechaCorta } from "@/lib/analytics";

/** Fecha de una tarea en el formato que entiende <input type="date">. */
function paraCampoFecha(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : aFechaCorta(d);
}

interface Tarea {
  id: string;
  title: string;
  due_at: string | null;
  done_at: string | null;
  kind: string;
}

/**
 * Ficha de una oportunidad: cajón lateral.
 *
 * Los campos se guardan al salir del campo, sin botón de guardar — el mismo
 * criterio que la ficha del lead en la Bandeja. Menos fricción para gente no
 * técnica, y una cosa menos que se les olvide tocar.
 */
export function FichaOportunidad({
  tarjeta, columnas, responsables, orgId, onCerrar, onCambio,
}: {
  tarjeta: Tarjeta;
  columnas: Columna[];
  responsables: { id: string; nombre: string }[];
  orgId: string;
  onCerrar: (huboCambios: boolean) => void;
  onCambio: () => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [titulo, setTitulo] = useState(tarjeta.titulo ?? "");
  const [importe, setImporte] = useState(tarjeta.importe != null ? String(tarjeta.importe) : "");
  const [etapa, setEtapa] = useState(
    columnas.find((c) => c.tarjetas.some((t) => t.id === tarjeta.id))?.id ?? "",
  );
  const [responsable, setResponsable] = useState(tarjeta.assignee_member_id ?? "");
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [nuevaTarea, setNuevaTarea] = useState("");
  const [cuando, setCuando] = useState<string>("manana");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Para no volver a pedir el tablero entero si el cliente solo miró la ficha.
  const [cambiado, setCambiado] = useState(false);

  const cerrar = () => onCerrar(cambiado);

  /** Confirmación breve: sin botón de guardar, hay que ver que algo pasó. */
  const confirmar = () => {
    setCambiado(true);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1600);
  };

  useEffect(() => {
    (async () => {
      const { data } = await sb
        .from("tasks")
        .select("id, title, due_at, done_at, kind")
        .eq("opportunity_id", tarjeta.id)
        .order("done_at", { nullsFirst: true })
        .order("due_at", { nullsFirst: false });
      setTareas((data ?? []) as Tarea[]);
    })();
  }, [sb, tarjeta.id]);

  const guardar = async (patch: Record<string, any>) => {
    setGuardando(true);
    const { error } = await sb.from("opportunities").update(patch).eq("id", tarjeta.id);
    setGuardando(false);
    if (error) { setAviso("No se pudo guardar."); return; }
    setAviso(null);
    confirmar();
  };

  const agregarTarea = async () => {
    const t = nuevaTarea.trim();
    if (!t) return;
    setNuevaTarea("");
    const due = fechaDeAtajo(cuando).toISOString();
    const { data, error } = await sb
      .from("tasks")
      .insert({
        org_id: orgId,
        opportunity_id: tarjeta.id,
        contact_id: tarjeta.contact_id,
        title: t,
        due_at: due,
        assignee_member_id: responsable || null,
      })
      .select("id, title, due_at, done_at, kind")
      .single();
    if (error) { setAviso("No se pudo agendar la tarea."); return; }
    setTareas((xs) => [data as Tarea, ...xs]);
    confirmar();
  };

  /** Editar una tarea ya agendada: el texto o la fecha. */
  const editarTarea = async (id: string, patch: Partial<Tarea>) => {
    setTareas((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await sb.from("tasks").update(patch).eq("id", id);
    if (error) { setAviso("No se pudo guardar la tarea."); return; }
    confirmar();
  };

  const marcarHecha = async (id: string, hecha: boolean) => {
    const cuandoIso = hecha ? new Date().toISOString() : null;
    setTareas((xs) => xs.map((x) => (x.id === id ? { ...x, done_at: cuandoIso } : x)));
    await sb.from("tasks").update({ done_at: cuandoIso }).eq("id", id);
    confirmar();
  };

  const borrarTarea = async (id: string) => {
    setTareas((xs) => xs.filter((x) => x.id !== id));
    await sb.from("tasks").delete().eq("id", id);
    confirmar();
  };

  const pendientes = tareas.filter((t) => !t.done_at);
  const nombre = nombreTarjeta(tarjeta);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Fondo: cerrar tocando fuera */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={cerrar}
        className="flex-1 cursor-default bg-[#0a0a28]/40 backdrop-blur-[2px]"
      />

      <aside className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-tarjeta shadow-[0_0_60px_-10px_rgba(10,10,40,.5)] sm:max-w-[420px]">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-linea bg-tarjeta px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-base font-bold text-ink">{nombre}</h2>
          {guardando ? (
            <Loader2 className="h-4 w-4 flex-none animate-spin text-ink-3" />
          ) : guardado ? (
            <span className="flex flex-none items-center gap-1 text-xs font-semibold text-success">
              <Check className="h-3.5 w-3.5" /> Guardado
            </span>
          ) : null}
          <button
            type="button"
            onClick={cerrar}
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-ink-3 transition hover:bg-suave hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-5 p-4">
          {aviso && (
            <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink-2">
              <AlertTriangle className="h-4 w-4 flex-none text-danger" /> {aviso}
            </p>
          )}

          {/* Datos de la venta */}
          <section className="flex flex-col gap-3">
            <Campo etiqueta="Título">
              <input
                className="input-l"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                onBlur={() => titulo !== tarjeta.titulo && guardar({ title: titulo.trim() || "Sin nombre" })}
              />
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Valor">
                <input
                  className="input-l"
                  inputMode="decimal"
                  placeholder="0"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value.replace(/[^\d.]/g, ""))}
                  onBlur={() => {
                    const v = importe.trim() === "" ? null : Number(importe);
                    if (v !== null && !Number.isFinite(v)) return;
                    guardar({ value: v });
                  }}
                />
              </Campo>
              <Campo etiqueta="Etapa">
                <select
                  className="input-l"
                  value={etapa}
                  onChange={(e) => { setEtapa(e.target.value); guardar({ stage_id: e.target.value }); }}
                >
                  {columnas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </Campo>
            </div>

            <Campo etiqueta="Responsable">
              <select
                className="input-l"
                value={responsable}
                onChange={(e) => { setResponsable(e.target.value); guardar({ assignee_member_id: e.target.value || null }); }}
              >
                <option value="">Sin asignar</option>
                {responsables.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </Campo>
          </section>

          {/* Próximos pasos */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display text-sm font-semibold text-ink">Próximos pasos</h3>
              {!pendientes.length && (
                <span className="rounded-lg bg-warning/20 px-2 py-0.5 text-[11px] font-semibold text-aviso">
                  Sin próximo paso
                </span>
              )}
            </div>

            <div className="mb-3 rounded-xl border border-linea p-2.5">
              <input
                className="input-l mb-2"
                placeholder="Llamar para confirmar la cotización…"
                value={nuevaTarea}
                onChange={(e) => setNuevaTarea(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarTarea(); } }}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {CUANDO.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCuando(c.key)}
                    className={
                      cuando === c.key
                        ? "rounded-lg bg-violet px-2.5 py-1 text-xs font-semibold text-white"
                        : "rounded-lg border border-linea-2 px-2.5 py-1 text-xs text-ink-2 transition hover:border-linea-fuerte"
                    }
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={agregarTarea}
                  disabled={!nuevaTarea.trim()}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg bg-demandu-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Agendar
                </button>
              </div>
            </div>

            {!tareas.length ? (
              <p className="px-1 text-xs text-ink-3">
                Agenda el siguiente paso y esta tarjeta deja de aparecer en la alerta.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {tareas.map((t) => {
                  const v = vencimiento(t.due_at);
                  const hecha = !!t.done_at;
                  return (
                    <li
                      key={t.id}
                      className="group flex items-start gap-2 rounded-xl border border-linea px-2.5 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => marcarHecha(t.id, !hecha)}
                        className={`mt-0.5 grid h-4 w-4 flex-none place-items-center rounded border transition ${
                          hecha ? "border-success bg-success text-white" : "border-linea-fuerte hover:border-violet"
                        }`}
                        title={hecha ? "Marcar como pendiente" : "Marcar como hecha"}
                      >
                        {hecha && <Check className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        {/* El texto y la fecha se editan aquí mismo y se
                            guardan al salir del campo, igual que el resto de
                            la ficha. Antes solo se podía marcar o borrar. */}
                        <input
                          defaultValue={t.title}
                          onBlur={(e) => {
                            const nuevo = e.target.value.trim();
                            if (nuevo && nuevo !== t.title) editarTarea(t.id, { title: nuevo });
                            else e.target.value = t.title;
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className={`w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-linea-2 focus:border-pink focus:outline-none ${
                            hecha ? "text-ink-3 line-through" : "text-ink"
                          }`}
                        />
                        {!hecha && (
                          <div className="flex flex-wrap items-center gap-2 px-1">
                            <span
                              className={`flex items-center gap-1 text-[11px] ${
                                v.estado === "vencida" ? "font-semibold text-alerta"
                                : v.estado === "hoy" ? "font-semibold text-aviso"
                                : "text-ink-3"
                              }`}
                            >
                              <CalendarClock className="h-3 w-3" /> {v.texto}
                            </span>
                            <input
                              type="date"
                              value={paraCampoFecha(t.due_at)}
                              onChange={(e) => {
                                const d = deFechaCorta(e.target.value);
                                if (d) { d.setHours(9, 0, 0, 0); editarTarea(t.id, { due_at: d.toISOString() }); }
                              }}
                              className="rounded-md border border-linea-2 bg-tarjeta px-1.5 py-0.5 text-[11px] text-ink-2 focus:border-pink focus:outline-none"
                              title="Cambiar la fecha"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => borrarTarea(t.id)}
                        className="mt-0.5 flex-none text-ink-3 opacity-0 transition hover:text-danger group-hover:opacity-100"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Quién es */}
          <section>
            <h3 className="mb-2 font-display text-sm font-semibold text-ink">Contacto</h3>
            <dl className="flex flex-col gap-1.5 rounded-xl border border-linea p-3 text-sm">
              <Dato k="Nombre" v={tarjeta.contacto || tarjeta.wa_name} />
              <Dato k="Teléfono" v={tarjeta.telefono} />
              <Dato k="Correo" v={tarjeta.email} />
              <Dato
                k="País"
                v={tarjeta.pais ? `${bandera(tarjeta.pais)} ${nombrePais(tarjeta.pais) ?? tarjeta.pais}` : null}
              />
              <Dato k="Canal" v={tarjeta.canal} />
            </dl>
            {tarjeta.conversation_id && (
              <Link
                href={`/inbox?c=${tarjeta.conversation_id}`}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-demandu-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                <MessageSquare className="h-4 w-4" /> Abrir la conversación
              </Link>
            )}
          </section>

          {/* Eliminar */}
          <section className="border-t border-linea pt-4">
            <button
              type="button"
              onClick={async () => {
                await sb.from("opportunities").delete().eq("id", tarjeta.id);
                onCambio();
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-linea-2 px-3 py-2 text-sm text-ink-2 transition hover:border-danger hover:text-danger"
            >
              <Trash2 className="h-4 w-4" /> Eliminar del embudo
            </button>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
              Se quita la tarjeta y sus tareas. La conversación y el contacto se quedan como están.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-2">{etiqueta}</span>
      {children}
    </label>
  );
}

function Dato({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-20 flex-none text-xs text-ink-3">{k}</dt>
      <dd className="min-w-0 flex-1 truncate text-ink">{v || "—"}</dd>
    </div>
  );
}
