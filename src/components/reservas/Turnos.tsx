"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Clock } from "lucide-react";
import {
  DIAS_CORTOS, diasEnPalabras, horaEnPalabras, type Turno as TurnoLogico,
} from "@/lib/reservas/turnos";
import {
  crearTurno, editarTurno, borrarTurno, guardarAjustes, type Turno,
} from "@/app/(dashboard)/reservas/acciones";

/**
 * LOS TURNOS DEL SALÓN Y LOS AJUSTES DEL COMPLEMENTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Sin turnos, el plano es un dibujo: no hay «a qué hora» donde sentar a nadie.
 *
 * ── «CONFIRMA SOLA» ES POR TURNO, Y ESO SE EXPLICA EN PANTALLA ────────────
 *
 * El riesgo no es del restaurante, es de la hora pico. El martes a las 7 se
 * puede cerrar solo; el sábado a las 9, donde una mesa de más significa gente
 * de pie en la puerta, lo mira una persona. Si no se explica, nadie lo marca —
 * o peor, lo marcan todos y descubren por qué un sábado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Ajustes = {
  recordatorio_horas: number;
  recordatorio_activo: boolean;
  grupo_grande: number;
  max_mesas_juntas: number;
};

const VACIO = {
  id: "", nombre: "", hora: "19:00", dias: [1, 2, 3, 4, 5, 6, 0],
  duracion_min: 120, confirma_sola: false, activo: true, orden: 0,
};

export function Turnos({
  turnos: iniciales,
  ajustes: ajustesIniciales,
  hayMesas,
}: {
  turnos: Turno[];
  ajustes: Ajustes;
  hayMesas: boolean;
}) {
  const [turnos, setTurnos] = useState<Turno[]>(iniciales);
  const [editando, setEditando] = useState<Turno | null>(null);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);
  const [guardando, empezar] = useTransition();

  const decir = (mal: boolean, texto: string) => {
    setAviso({ mal, texto });
    window.setTimeout(() => setAviso(null), mal ? 6000 : 2500);
  };

  const guardar = (fd: FormData) => {
    const esNuevo = !String(fd.get("id") ?? "").trim();
    empezar(async () => {
      const r = esNuevo ? await crearTurno(fd) : await editarTurno(fd);
      if (!r.ok) return decir(true, r.error);
      const guardado = (r.turnos ?? [])[0];
      if (guardado) {
        setTurnos((ts) =>
          esNuevo ? [...ts, guardado] : ts.map((t) => (t.id === guardado.id ? guardado : t)),
        );
      }
      setEditando(null);
      decir(false, esNuevo ? "Turno creado." : "Turno guardado.");
    });
  };

  const quitar = (t: Turno) => {
    const fd = new FormData();
    fd.set("id", t.id);
    empezar(async () => {
      const r = await borrarTurno(fd);
      if (!r.ok) return decir(true, r.error);
      setTurnos((ts) => ts.filter((x) => x.id !== t.id));
      setEditando(null);
      decir(false, `«${t.nombre}» eliminado.`);
    });
  };

  const enOrden = [...turnos].sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

  return (
    <div className="space-y-5">
      {aviso && (
        <div
          className={`rounded-xl px-4 py-2 text-sm font-medium ${
            aviso.mal ? "bg-[#fdecec] text-[#c0392b]" : "bg-[#e8f7ee] text-[#1e7a45]"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {!hayMesas && (
        <div className="rounded-xl bg-[#fff6e5] px-4 py-3 text-sm text-[#8a5a00]">
          Todavía no tienes mesas en el plano. Los turnos sin mesas no aceptan reservas:
          dibuja tu salón primero.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        {/* ── La lista ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {enOrden.length === 0 && (
            <div className="card-l p-6 text-center text-sm text-ink-3">
              Todavía no tienes turnos. Crea el primero a la derecha:
              por ejemplo «Primer turno», 7:00 p.m.
            </div>
          )}

          {enOrden.map((t) => (
            <div
              key={t.id}
              className={`card-l flex flex-wrap items-center gap-3 p-4 ${t.activo ? "" : "opacity-60"}`}
            >
              <div className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-suave text-ink-2">
                <Clock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">
                  {t.nombre}{" "}
                  <span className="font-normal text-ink-2">· {horaEnPalabras(t.hora)}</span>
                </div>
                <div className="text-xs text-ink-3">
                  {diasEnPalabras(t.dias)} · {t.duracion_min} min
                  {t.confirma_sola ? " · Lana confirma sola" : " · lo confirmas tú"}
                  {t.activo ? "" : " · APAGADO"}
                </div>
              </div>
              <button
                onClick={() => setEditando(t)}
                className="rounded-xl border border-linea px-3 py-1.5 text-xs text-ink-2 hover:bg-suave"
              >
                Editar
              </button>
            </div>
          ))}
        </div>

        {/* ── El formulario ─────────────────────────────────────────────── */}
        <div className="card-l p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-ink">
              {editando ? "Editar turno" : "Nuevo turno"}
            </h3>
            {editando && (
              <button onClick={() => setEditando(null)} className="text-xs text-ink-3 underline">
                Cancelar
              </button>
            )}
          </div>

          <form action={guardar} className="space-y-3" key={editando?.id ?? "nuevo"}>
            <input type="hidden" name="id" value={editando?.id ?? ""} />

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre</label>
              <input
                name="nombre" required className="input-l" placeholder="Primer turno"
                defaultValue={editando?.nombre ?? ""}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-ink-2">Hora</label>
                <input
                  name="hora" type="time" required className="input-l"
                  defaultValue={String(editando?.hora ?? VACIO.hora).slice(0, 5)}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-ink-2">Dura (min)</label>
                <input
                  name="duracion_min" type="number" min={15} max={480} step={15} className="input-l"
                  defaultValue={editando?.duracion_min ?? VACIO.duracion_min}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-2">Qué días</label>
              <div className="flex flex-wrap gap-1.5">
                {/* Lunes primero, como se lee una semana. El valor sigue siendo
                    el número de Postgres (0 = domingo). */}
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label
                    key={d}
                    className="cursor-pointer select-none rounded-lg border border-linea px-2.5 py-1.5 text-xs text-ink-2 has-[:checked]:border-[#6E42FF] has-[:checked]:bg-[#efe9ff] has-[:checked]:text-ink"
                  >
                    <input
                      type="checkbox" name="dias" value={d} className="sr-only"
                      defaultChecked={(editando?.dias ?? VACIO.dias).includes(d)}
                    />
                    {DIAS_CORTOS[d]}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                Sin ningún día marcado, este turno no aceptaría reservas nunca.
              </p>
            </div>

            <label className="flex items-start gap-2 rounded-xl bg-suave p-3 text-sm text-ink-2">
              <input
                type="checkbox" name="confirma_sola" value="si" className="mt-0.5"
                defaultChecked={editando?.confirma_sola ?? false}
              />
              <span>
                <strong className="text-ink">Lana confirma sola en este turno</strong>
                <span className="mt-0.5 block text-[11px] text-ink-3">
                  Déjalo apagado en tus horas pico. En un turno lleno, una mesa de más
                  significa gente de pie en la puerta. Apagado, Lana aparta la mesa y te
                  avisa para que confirmes tú.
                </span>
              </span>
            </label>

            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="activo" value="si" defaultChecked={editando?.activo ?? true} />
              Este turno está en uso
            </label>

            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={guardando}>
                <Plus className="h-4 w-4" /> {editando ? "Guardar" : "Crear turno"}
              </button>
              {editando && (
                <button
                  type="button"
                  onClick={() => quitar(editando)}
                  disabled={guardando}
                  className="rounded-xl border border-linea px-3 text-[#c0392b] hover:bg-[#fdecec]"
                  title="Eliminar turno"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ── Ajustes del complemento ────────────────────────────────────── */}
      <div className="card-l p-5">
        <h3 className="mb-3 font-display text-lg font-semibold text-ink">Cómo trabaja Lana</h3>
        <form
          action={(fd) => {
            empezar(async () => {
              const r = await guardarAjustes(fd);
              decir(!r.ok, r.ok ? "Ajustes guardados." : (r as any).error);
            });
          }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">
              Recordatorio, horas antes
            </label>
            <input
              name="recordatorio_horas" type="number" min={1} max={72} className="input-l"
              defaultValue={ajustesIniciales.recordatorio_horas}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox" name="recordatorio_activo" value="si"
                defaultChecked={ajustesIniciales.recordatorio_activo}
              />
              Mandar recordatorio
            </label>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">
              Grupo grande, a partir de
            </label>
            <input
              name="grupo_grande" type="number" min={2} max={100} className="input-l"
              defaultValue={ajustesIniciales.grupo_grande}
            />
            <p className="mt-1 text-[11px] text-ink-3">
              De ahí para arriba Lana no decide: te avisa para que lo coordines tú.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-2">
              Mesas que se pueden juntar
            </label>
            <input
              name="max_mesas_juntas" type="number" min={1} max={4} className="input-l"
              defaultValue={ajustesIniciales.max_mesas_juntas}
            />
            <p className="mt-1 text-[11px] text-ink-3">
              Cuántas como máximo para un mismo grupo. Juntar muchas es mover sillas
              y bloquear un pasillo.
            </p>
          </div>

          <div className="sm:col-span-3">
            <button className="btn-primary" disabled={guardando}>Guardar ajustes</button>
          </div>
        </form>
      </div>
    </div>
  );
}
