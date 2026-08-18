"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Volume2, Play, Monitor, Moon, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { lanzarAviso } from "./Toasts";
import {
  PREFS_DEFAULT, TONOS_DISPONIBLES, guardarPrefs, leerPrefs, permisoEscritorio,
  pedirPermisoEscritorio, reproducirTono, enSilencio, type PrefsAviso, type Tono,
} from "@/lib/notifications";

/** Interruptor grande y claro, pensado para que nadie dude de si está prendido. */
function Switch({
  titulo, detalle, valor, onChange, icono,
}: {
  titulo: string; detalle?: string; valor: boolean; onChange: (v: boolean) => void; icono?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#e6e8f2] bg-white px-4 py-3">
      <span className="flex min-w-0 items-start gap-3">
        {icono && <span className="mt-0.5 flex-none text-ink-3">{icono}</span>}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{titulo}</span>
          {detalle && <span className="mt-0.5 block text-xs text-ink-3">{detalle}</span>}
        </span>
      </span>
      <span
        onClick={(e) => { e.preventDefault(); onChange(!valor); }}
        className={`relative h-6 w-11 flex-none rounded-full transition ${valor ? "bg-demandu-gradient" : "bg-[#d7d9e8]"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${valor ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

const SILENCIAR_RAPIDO = [
  { min: 30, texto: "30 min" },
  { min: 60, texto: "1 hora" },
  { min: 240, texto: "4 horas" },
  { min: 1440, texto: "Hasta mañana" },
];

export function NotificationsSettings() {
  const [p, setP] = useState<PrefsAviso>(PREFS_DEFAULT);
  const [listo, setListo] = useState(false);
  const [permiso, setPermiso] = useState<string>("default");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    setP(leerPrefs());
    setPermiso(permisoEscritorio());
    setListo(true);
  }, []);

  // Cada cambio se guarda al momento: no hay botón de guardar que se te olvide.
  const set = (patch: Partial<PrefsAviso>) => {
    const next = { ...p, ...patch };
    setP(next);
    guardarPrefs(next);
    setAviso("Guardado");
    setTimeout(() => setAviso(""), 2000);
  };

  const activarEscritorio = async (v: boolean) => {
    if (!v) return set({ escritorio: false });
    const ok = await pedirPermisoEscritorio();
    setPermiso(permisoEscritorio());
    set({ escritorio: ok });
  };

  const silenciar = (min: number) => set({ silenciarHasta: Date.now() + min * 60_000 });

  if (!listo) return <div className="text-sm text-ink-3">Cargando tus preferencias…</div>;

  const silenciadoAhora = enSilencio(p);
  const hastaTexto =
    p.silenciarHasta && Date.now() < p.silenciarHasta
      ? new Date(p.silenciarHasta).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <div className="max-w-2xl space-y-5">
      {aviso && (
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-sm font-medium text-[#0f9d63]">
          <CheckCircle2 className="h-4 w-4" /> {aviso}
        </div>
      )}

      {/* Estado actual, en una frase */}
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
          !p.activo || silenciadoAhora ? "border-warning/50 bg-warning/10" : "border-success/40 bg-success/10"
        }`}
      >
        <span className="flex-none">
          {!p.activo || silenciadoAhora ? (
            <BellOff className="h-5 w-5 text-[#a06a00]" />
          ) : (
            <Bell className="h-5 w-5 text-[#0f9d63]" />
          )}
        </span>
        <div className="text-sm text-ink">
          {!p.activo
            ? "Los avisos están apagados. No te enteras de mensajes nuevos."
            : hastaTexto
            ? `Silenciado hasta las ${hastaTexto}.`
            : silenciadoAhora
            ? `En modo silencio (${p.silencioDesde} a ${p.silencioHasta}).`
            : "Te avisamos cuando un cliente escriba."}
        </div>
        {hastaTexto && (
          <button onClick={() => set({ silenciarHasta: 0 })} className="btn-soft ml-auto px-3 py-1.5 text-xs">
            Reactivar
          </button>
        )}
      </div>

      <Switch
        titulo="Avisarme de mensajes nuevos"
        detalle="Es el interruptor principal. Si lo apagas, no suena nada ni aparece ningún aviso."
        valor={p.activo}
        onChange={(v) => set({ activo: v })}
        icono={<Bell className="h-4 w-4" />}
      />

      <div className={p.activo ? "space-y-3" : "pointer-events-none space-y-3 opacity-45"}>
        <Switch
          titulo="Aviso dentro de la app"
          detalle="La tarjeta que aparece arriba a la derecha con el nombre y un adelanto del mensaje. Tócala para abrir la conversación."
          valor={p.enApp}
          onChange={(v) => set({ enApp: v })}
          icono={<MessageSquare className="h-4 w-4" />}
        />

        <Switch
          titulo="Sonido"
          detalle="Reproduce un tono corto cuando llega un mensaje."
          valor={p.sonido}
          onChange={(v) => set({ sonido: v })}
          icono={<Volume2 className="h-4 w-4" />}
        />

        {p.sonido && (
          <div className="rounded-xl border border-[#e6e8f2] bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Tono</p>
            <div className="flex flex-wrap gap-2">
              {TONOS_DISPONIBLES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { set({ tono: t.id as Tono }); reproducirTono(t.id as Tono, p.volumen); }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
                    p.tono === t.id ? "border-violet bg-violet/10 font-semibold text-ink" : "border-[#e2e4f0] text-ink-2 hover:border-pink"
                  }`}
                >
                  <Play className="h-3.5 w-3.5" /> {t.nombre}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                Volumen · {p.volumen}%
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={p.volumen}
                  onChange={(e) => setP({ ...p, volumen: Number(e.target.value) })}
                  onMouseUp={() => { guardarPrefs(p); reproducirTono(p.tono, p.volumen); }}
                  onTouchEnd={() => { guardarPrefs(p); reproducirTono(p.tono, p.volumen); }}
                  className="h-1.5 flex-1 cursor-pointer accent-pink"
                />
                <button
                  type="button"
                  onClick={() => reproducirTono(p.tono, p.volumen)}
                  className="btn-soft flex-none px-3 py-1.5 text-xs"
                >
                  Probar
                </button>
              </div>
            </div>
          </div>
        )}

        <Switch
          titulo="Aviso en el escritorio"
          detalle="La notificación de tu sistema, para cuando estás en OTRA pestaña o programa. Si estás viendo Demandu, verás la tarjeta de arriba en vez de esta."
          valor={p.escritorio}
          onChange={activarEscritorio}
          icono={<Monitor className="h-4 w-4" />}
        />
        {permiso === "denied" && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-xs text-ink-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#a06a00]" />
            <span>
              Tu navegador tiene bloqueadas las notificaciones para este sitio. Búscalo en el candado de la barra de
              direcciones y permítelas para poder activarlo.
            </span>
          </div>
        )}
        {permiso === "no-soportado" && (
          <p className="px-1 text-xs text-ink-3">Este navegador no soporta avisos de escritorio.</p>
        )}

        <Switch
          titulo="Contador en la pestaña"
          detalle="Muestra cuántos mensajes sin leer tienes en el título de la pestaña del navegador."
          valor={p.titulo}
          onChange={(v) => set({ titulo: v })}
        />

        <Switch
          titulo="Solo mis conversaciones"
          detalle="Avisar únicamente cuando escriban en un chat asignado a alguien de tu equipo, no en los que aún no tienen dueño."
          valor={p.soloMias}
          onChange={(v) => set({ soloMias: v })}
        />

        {/* Silencio */}
        <div className="rounded-xl border border-[#e6e8f2] bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <Moon className="h-4 w-4 text-ink-3" />
            <span className="text-sm font-semibold text-ink">Silenciar un rato</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SILENCIAR_RAPIDO.map((s) => (
              <button
                key={s.min}
                type="button"
                onClick={() => silenciar(s.min)}
                className="btn-soft px-3 py-1.5 text-xs"
              >
                {s.texto}
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-[#eef0f7] pt-4">
            <Switch
              titulo="Horario de silencio"
              detalle="No avisar dentro de este rango, todos los días."
              valor={p.silencioActivo}
              onChange={(v) => set({ silencioActivo: v })}
            />
            {p.silencioActivo && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Desde</label>
                  <input
                    type="time"
                    value={p.silencioDesde}
                    onChange={(e) => set({ silencioDesde: e.target.value })}
                    className="input-l w-32"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Hasta</label>
                  <input
                    type="time"
                    value={p.silencioHasta}
                    onChange={(e) => set({ silencioHasta: e.target.value })}
                    className="input-l w-32"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#e6e8f2] bg-white p-4">
        <div className="mb-1 text-sm font-semibold text-ink">¿Funciona?</div>
        <p className="mb-3 text-xs text-ink-3">
          Lanza un aviso de prueba con tu configuración actual, tal cual lo verías al llegar un mensaje real.
        </p>
        <button
          type="button"
          onClick={() => {
            if (p.sonido) reproducirTono(p.tono, p.volumen);
            if (p.enApp) {
              lanzarAviso({
                titulo: "Mensaje de prueba",
                cuerpo: "Así se ve un aviso cuando un cliente te escribe. 👋",
                href: "/inbox",
              });
            }
          }}
          className="btn-soft px-3 py-2 text-sm"
        >
          Probar aviso
        </button>
        {!p.activo && (
          <p className="mt-2 text-[11px] text-ink-3">
            Los avisos están apagados: préndelos arriba para recibirlos de verdad.
          </p>
        )}
      </div>

      <p className="text-xs text-ink-3">
        Estas preferencias son de <b className="text-ink-2">esta computadora</b>. Cada persona de tu equipo configura
        las suyas, sin afectar a los demás.
      </p>
    </div>
  );
}
