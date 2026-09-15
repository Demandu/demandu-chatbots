"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
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
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-linea bg-tarjeta px-4 py-3">
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
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-tarjeta shadow transition-all ${valor ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
      <input type="checkbox" checked={valor} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  );
}

/* Claves, no frases: el texto lo pone el diccionario. Ver `SettingsNav`. */
const SILENCIAR_RAPIDO = [30, 60, 240, 1440] as const;

export function NotificationsSettings() {
  const t = useTranslations("avisos");
  /* LA HORA SE ESCRIBE EN EL IDIOMA DE QUIEN MIRA. Estaba clavado a "es-MX":
   * un panel en inglés decía «Silenciado hasta las 14:30» con formato mexicano.
   * El idioma ya viaja en cada petición; usarlo aquí no cuesta una consulta. */
  const locale = useLocale();
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
    setAviso(t("guardado"));
    setTimeout(() => setAviso(""), 2000);
  };

  const activarEscritorio = async (v: boolean) => {
    if (!v) return set({ escritorio: false });
    const ok = await pedirPermisoEscritorio();
    setPermiso(permisoEscritorio());
    set({ escritorio: ok });
  };

  const silenciar = (min: number) => set({ silenciarHasta: Date.now() + min * 60_000 });

  if (!listo) return <div className="text-sm text-ink-3">{t("cargando")}</div>;

  const silenciadoAhora = enSilencio(p);
  const hastaTexto =
    p.silenciarHasta && Date.now() < p.silenciarHasta
      ? new Date(p.silenciarHasta).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <div className="max-w-2xl space-y-5">
      {aviso && (
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-sm font-medium text-exito">
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
            <BellOff className="h-5 w-5 text-aviso" />
          ) : (
            <Bell className="h-5 w-5 text-exito" />
          )}
        </span>
        <div className="text-sm text-ink">
          {!p.activo
            ? t("apagados")
            : hastaTexto
            ? t("silenciadoHasta", { hora: hastaTexto })
            : silenciadoAhora
            ? t("enSilencio", { desde: p.silencioDesde, hasta: p.silencioHasta })
            : t("activos")}
        </div>
        {hastaTexto && (
          <button onClick={() => set({ silenciarHasta: 0 })} className="btn-soft ml-auto px-3 py-1.5 text-xs">
            {t("reactivar")}
          </button>
        )}
      </div>

      <Switch
        titulo={t("principalTitulo")}
        detalle={t("principalDetalle")}
        valor={p.activo}
        onChange={(v) => set({ activo: v })}
        icono={<Bell className="h-4 w-4" />}
      />

      <div className={p.activo ? "space-y-3" : "pointer-events-none space-y-3 opacity-45"}>
        <Switch
          titulo={t("enAppTitulo")}
          detalle={t("enAppDetalle")}
          valor={p.enApp}
          onChange={(v) => set({ enApp: v })}
          icono={<MessageSquare className="h-4 w-4" />}
        />

        <Switch
          titulo={t("sonidoTitulo")}
          detalle={t("sonidoDetalle")}
          valor={p.sonido}
          onChange={(v) => set({ sonido: v })}
          icono={<Volume2 className="h-4 w-4" />}
        />

        {p.sonido && (
          <div className="rounded-xl border border-linea bg-tarjeta p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">{t("tono")}</p>
            <div className="flex flex-wrap gap-2">
              {TONOS_DISPONIBLES.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { set({ tono: id }); reproducirTono(id, p.volumen); }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
                    p.tono === id ? "border-violet bg-violet/10 font-semibold text-ink" : "border-linea-2 text-ink-2 hover:border-pink"
                  }`}
                >
                  <Play className="h-3.5 w-3.5" /> {t(`tonos.${id}`)}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">
                {t("volumen", { n: p.volumen })}
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
                  {t("probarTono")}
                </button>
              </div>
            </div>
          </div>
        )}

        <Switch
          titulo={t("escritorioTitulo")}
          detalle={t("escritorioDetalle")}
          valor={p.escritorio}
          onChange={activarEscritorio}
          icono={<Monitor className="h-4 w-4" />}
        />
        {permiso === "denied" && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-xs text-ink-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-aviso" />
            <span>{t("escritorioBloqueado")}</span>
          </div>
        )}
        {permiso === "no-soportado" && (
          <p className="px-1 text-xs text-ink-3">{t("escritorioNoSoportado")}</p>
        )}

        <Switch
          titulo={t("contadorTitulo")}
          detalle={t("contadorDetalle")}
          valor={p.titulo}
          onChange={(v) => set({ titulo: v })}
        />

        <Switch
          titulo={t("soloMiasTitulo")}
          detalle={t("soloMiasDetalle")}
          valor={p.soloMias}
          onChange={(v) => set({ soloMias: v })}
        />

        {/* Silencio */}
        <div className="rounded-xl border border-linea bg-tarjeta p-4">
          <div className="mb-2 flex items-center gap-2">
            <Moon className="h-4 w-4 text-ink-3" />
            <span className="text-sm font-semibold text-ink">{t("silenciarUnRato")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SILENCIAR_RAPIDO.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => silenciar(min)}
                className="btn-soft px-3 py-1.5 text-xs"
              >
                {t(`silenciar${min}`)}
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-linea pt-4">
            <Switch
              titulo={t("horarioSilencioTitulo")}
              detalle={t("horarioSilencioDetalle")}
              valor={p.silencioActivo}
              onChange={(v) => set({ silencioActivo: v })}
            />
            {p.silencioActivo && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">{t("desde")}</label>
                  <input
                    type="time"
                    value={p.silencioDesde}
                    onChange={(e) => set({ silencioDesde: e.target.value })}
                    className="input-l w-32"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">{t("hasta")}</label>
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

      <div className="rounded-xl border border-linea bg-tarjeta p-4">
        <div className="mb-1 text-sm font-semibold text-ink">{t("funcionaTitulo")}</div>
        <p className="mb-3 text-xs text-ink-3">{t("funcionaDetalle")}</p>
        <button
          type="button"
          onClick={() => {
            if (p.sonido) reproducirTono(p.tono, p.volumen);
            if (p.enApp) {
              lanzarAviso({
                titulo: t("pruebaTitulo"),
                cuerpo: t("pruebaCuerpo"),
                href: "/inbox",
              });
            }
          }}
          className="btn-soft px-3 py-2 text-sm"
        >
          {t("probarAviso")}
        </button>
        {!p.activo && (
          <p className="mt-2 text-[11px] text-ink-3">{t("apagadosAviso")}</p>
        )}
      </div>

      <p className="text-xs text-ink-3">
        {t.rich("sonDeEstaComputadora", {
          b: (c) => <b className="text-ink-2">{c}</b>,
        })}
      </p>
    </div>
  );
}
