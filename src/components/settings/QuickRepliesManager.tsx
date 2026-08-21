"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Zap, Pencil, Trash2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { Confirm } from "@/components/ui/Confirm";
import { VARIABLES, limpiarAtajo, type RespuestaRapida } from "@/lib/quickReplies";

type Estado = { ok: boolean; mensaje: string };

function Guardar({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : editando ? "Guardar cambios" : "Crear respuesta"}
    </button>
  );
}

export function QuickRepliesManager({
  iniciales,
  guardar,
  borrar,
}: {
  iniciales: RespuestaRapida[];
  guardar: (estado: Estado, fd: FormData) => Promise<Estado>;
  borrar: (fd: FormData) => void;
}) {
  const [estado, formAction] = useFormState(guardar, { ok: false, mensaje: "" });
  const [editando, setEditando] = useState<RespuestaRapida | null>(null);
  const [atajo, setAtajo] = useState("");
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [porBorrar, setPorBorrar] = useState<RespuestaRapida | null>(null);
  const [aviso, setAviso] = useState<Estado | null>(null);
  const formBorrar = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado.mensaje) return;
    setAviso(estado);
    if (estado.ok) limpiar();
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const limpiar = () => {
    setEditando(null);
    setAtajo("");
    setTitulo("");
    setCuerpo("");
    setCategoria("");
  };

  const editar = (r: RespuestaRapida) => {
    setEditando(r);
    setAtajo(r.shortcut);
    setTitulo(r.title);
    setCuerpo(r.body);
    setCategoria(r.category ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const insertarVariable = (clave: string) => setCuerpo((c) => `${c}{{${clave}}}`);

  // El atajo se propone solo a partir del nombre, pero se puede cambiar.
  const atajoFinal = limpiarAtajo(atajo || titulo);

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            aviso.ok ? "bg-success/15 text-exito" : "bg-danger/10 text-danger"
          }`}
        >
          {aviso.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {aviso.mensaje}
        </div>
      )}

      {/* Alta / edición */}
      <form action={formAction} className="card-l max-w-2xl space-y-3 p-5">
        {editando && <input type="hidden" name="id" value={editando.id} />}

        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-ink">
            {editando ? `Editando “${editando.title}”` : "Nueva respuesta rápida"}
          </h3>
          {editando && (
            <button type="button" onClick={limpiar} className="btn-soft px-3 py-1.5 text-xs">
              <X className="h-3.5 w-3.5" /> Cancelar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre</label>
            <input
              name="title"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
              placeholder="Saludo inicial"
              className="input-l"
            />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Atajo</label>
            <div className="flex items-center gap-1 rounded-xl border border-linea-2 bg-tarjeta px-2.5">
              <span className="font-mono text-sm font-bold text-violet">/</span>
              <input
                name="shortcut"
                value={atajo}
                onChange={(e) => setAtajo(e.target.value)}
                placeholder={limpiarAtajo(titulo) || "saludo"}
                className="w-full bg-transparent py-2 font-mono text-sm text-ink placeholder:text-ink-3 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-3">
              En el chat escribes <b className="text-ink-2">/{atajoFinal || "saludo"}</b>
            </p>
          </div>
          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Categoría (opcional)</label>
            <input
              name="category"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ventas"
              className="input-l"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-2">Mensaje</label>
          <textarea
            name="body"
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            required
            rows={4}
            placeholder="¡Hola {{nombre}}! Gracias por escribirnos 😊 ¿En qué te ayudo?"
            className="input-l min-h-[110px]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-ink-3">Insertar:</span>
            {VARIABLES.map((v) => (
              <button
                key={v.clave}
                type="button"
                title={v.etiqueta}
                onClick={() => insertarVariable(v.clave)}
                className="rounded-lg border border-linea-2 bg-tarjeta px-2 py-1 font-mono text-[11px] text-ink-2 transition hover:border-violet hover:text-ink"
              >
                {`{{${v.clave}}}`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">
            Se reemplazan con los datos reales del lead al usar la respuesta. Si un dato falta, se quita solo.
          </p>
        </div>

        <Guardar editando={!!editando} />
      </form>

      {/* Listado */}
      <div>
        <h3 className="mb-3 font-display text-base font-semibold text-ink">
          Tus respuestas {iniciales.length > 0 && <span className="text-ink-3">· {iniciales.length}</span>}
        </h3>

        {iniciales.length === 0 ? (
          <div className="rounded-xl border border-dashed border-linea px-4 py-8 text-center">
            <Zap className="mx-auto mb-2 h-6 w-6 text-ink-3" />
            <p className="text-sm text-ink-2">Todavía no tienes respuestas rápidas.</p>
            <p className="mt-1 text-xs text-ink-3">
              Crea la primera arriba. Luego, en el chat, escribe <b className="text-ink-2">/</b> y aparecen.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {iniciales.map((r) => (
              <div key={r.id} className="card-l flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="rounded bg-violet/15 px-1.5 py-0.5 font-mono text-[11px] font-bold text-violet">
                      /{r.shortcut}
                    </span>
                    <div className="mt-1 truncate font-semibold text-ink">{r.title}</div>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => editar(r)}
                      aria-label="Editar"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-suave hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPorBorrar(r)}
                      aria-label="Eliminar"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-wrap text-xs text-ink-2">{r.body}</p>

                <div className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-3">
                  {r.category && (
                    <span className="rounded-full bg-suave px-2 py-0.5 font-medium">{r.category}</span>
                  )}
                  <span>Usada {r.uses} {r.uses === 1 ? "vez" : "veces"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmación de borrado. Va en su propio formulario para no
          mezclarse con el de alta. */}
      <form ref={formBorrar} action={borrar}>
        <input type="hidden" name="id" value={porBorrar?.id ?? ""} />
      </form>
      <Confirm
        abierto={!!porBorrar}
        titulo="¿Eliminar esta respuesta rápida?"
        detalle={
          <>
            Se borra <b className="text-ink">“{porBorrar?.title}”</b> (/{porBorrar?.shortcut}). Los mensajes que ya
            enviaste con ella no se tocan.
          </>
        }
        onConfirmar={() => {
          // El id ya está en el campo oculto; enviamos y cerramos.
          formBorrar.current?.requestSubmit();
          setPorBorrar(null);
        }}
        onCancelar={() => setPorBorrar(null)}
      />

    </div>
  );
}
