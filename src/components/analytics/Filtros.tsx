"use client";

import { useEffect, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  PRESETS, AGRUPACIONES, rangoDePreset, agrupacionSugerida, zonaHoraria,
  aFechaCorta, deFechaCorta, NOMBRE_CANAL, type Preset, type Agrupacion,
} from "@/lib/analytics";

/**
 * Barra de filtros de la pantalla de Resultados.
 *
 * Las fechas se calculan AQUÍ, en el navegador, porque es el único lado que
 * sabe en qué zona horaria vive el cliente. El servidor solo recibe dos
 * instantes exactos y la zona, y no tiene que adivinar nada.
 */
export function Filtros({
  bots,
  canales,
}: {
  bots: { id: string; name: string }[];
  canales: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, empezar] = useTransition();

  const preset = (params.get("preset") as Preset) ?? "30d";
  const bucket = (params.get("bucket") as Agrupacion) ?? "day";
  const bot = params.get("bot") ?? "";
  const canal = params.get("canal") ?? "";
  const desdeIso = params.get("desde") ?? "";
  const hastaIso = params.get("hasta") ?? "";

  const aplicar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    empezar(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  // Primera carga: el servidor no sabe la zona horaria de quien mira, así que
  // por defecto usa UTC. En cuanto el navegador se enciende, corregimos.
  useEffect(() => {
    if (params.get("tz")) return;
    const { desde, hasta } = rangoDePreset(preset === "personalizado" ? "30d" : preset);
    aplicar({
      tz: zonaHoraria(),
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      bucket: params.get("bucket") ?? agrupacionSugerida(desde, hasta),
    });
    // Solo al montar: después manda lo que elija el cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegirPreset = (p: Preset) => {
    if (p === "personalizado") {
      aplicar({ preset: p });
      return;
    }
    const { desde, hasta } = rangoDePreset(p);
    aplicar({
      preset: p,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      bucket: agrupacionSugerida(desde, hasta),
      tz: zonaHoraria(),
    });
  };

  const cambiarFecha = (cual: "desde" | "hasta", valor: string) => {
    // `hasta` se guarda como el arranque del día siguiente, para que el último
    // día entre completo. Si no, "18 al 18 de agosto" no traería nada.
    const fecha = deFechaCorta(valor, cual === "hasta");
    if (!fecha) return;
    const otro = cual === "desde" ? new Date(hastaIso || Date.now()) : new Date(desdeIso || Date.now());
    const desde = cual === "desde" ? fecha : otro;
    const hasta = cual === "hasta" ? fecha : otro;
    if (hasta <= desde) return;
    aplicar({
      preset: "personalizado",
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
      bucket: agrupacionSugerida(desde, hasta),
      tz: zonaHoraria(),
    });
  };

  const valorCampo = (iso: string, restarUnDia = false) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    if (restarUnDia) d.setDate(d.getDate() - 1);
    return aFechaCorta(d);
  };

  return (
    <div className="mb-6 flex flex-col gap-3">
      {/* Atajos de periodo */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => elegirPreset(p.key)}
            className={
              preset === p.key
                ? "rounded-xl bg-demandu-gradient px-3.5 py-2 text-sm font-semibold text-white"
                : "rounded-xl border border-linea-2 bg-tarjeta px-3.5 py-2 text-sm font-medium text-ink transition hover:border-linea-fuerte"
            }
          >
            {p.label}
          </button>
        ))}
        {pendiente && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
      </div>

      {/* Rango a mano */}
      {preset === "personalizado" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-linea bg-tarjeta p-3">
          <CalendarDays className="h-4 w-4 text-ink-3" />
          <label className="text-sm text-ink-2" htmlFor="f-desde">Del</label>
          <input
            id="f-desde" type="date" className="input-l w-auto"
            value={valorCampo(desdeIso)}
            onChange={(e) => cambiarFecha("desde", e.target.value)}
          />
          <label className="text-sm text-ink-2" htmlFor="f-hasta">al</label>
          <input
            id="f-hasta" type="date" className="input-l w-auto"
            value={valorCampo(hastaIso, true)}
            onChange={(e) => cambiarFecha("hasta", e.target.value)}
          />
        </div>
      )}

      {/* Agrupación, canal y chatbot */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input-l w-auto"
          value={bucket}
          onChange={(e) => aplicar({ bucket: e.target.value })}
          aria-label="Agrupar por"
        >
          {AGRUPACIONES.map((a) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>

        <select
          className="input-l w-auto"
          value={canal}
          onChange={(e) => aplicar({ canal: e.target.value })}
          aria-label="Canal"
        >
          <option value="">Todos los canales</option>
          {canales.map((c) => (
            <option key={c} value={c}>{NOMBRE_CANAL[c] ?? c}</option>
          ))}
        </select>

        <select
          className="input-l w-auto"
          value={bot}
          onChange={(e) => aplicar({ bot: e.target.value })}
          aria-label="Chatbot"
        >
          <option value="">Todos los chatbots</option>
          {bots.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
