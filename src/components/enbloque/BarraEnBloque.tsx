"use client";

/**
 * La barra que aparece al marcar varios: Asignar · Etiquetas · Etapa · Cerrar.
 *
 * La misma en Contactos y en Conversaciones. Lo que hace cada botón, y por qué,
 * está en `src/lib/enBloque.ts`; esto solo pregunta y llama.
 *
 * NADA DE `text-white` PELADO: la Bandeja vive dentro de `.flow-light`, que
 * convierte `text-white` en tinta oscura. Por eso el botón de color lleva el
 * blanco en `style`.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserPlus, Tag, Columns3, CheckCircle2, X, Loader2 } from "lucide-react";
import { Confirm } from "@/components/ui/Confirm";
import {
  asignarEnBloque,
  etiquetasEnBloque,
  etapaEnBloque,
  cerrarEnBloque,
  type ResultadoEnBloque,
} from "@/app/(dashboard)/enBloque";
import { avisoDeCierre, cierraLaVenta } from "@/lib/enBloque";
import type { TipoSeleccion, Parte } from "@/lib/enBloque";

export type MiembroEB = { id: string; name: string };
export type EtiquetaEB = { id: string; name: string; color: string };
export type EtapaEB = {
  id: string; name: string; color: string;
  pipeline?: { name: string } | null;
  /** `ganado` / `perdido` / `abierto`. Las dos primeras CIERRAN la venta. */
  outcome?: string | null;
};

type Panel = null | "asignar" | "etiquetas" | "etapa";

export function BarraEnBloque({
  tipo,
  ids,
  miembros,
  etiquetas,
  etapas,
  onListo,
  onLimpiar,
}: {
  tipo: TipoSeleccion;
  ids: string[];
  miembros: MiembroEB[];
  etiquetas: EtiquetaEB[];
  etapas: EtapaEB[];
  /** Se llama con lo que contestó el servidor, ya traducido. Quien usa la barra enseña el aviso y recarga. */
  onListo: (r: { ok: boolean; texto: string }) => void;
  onLimpiar: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [cerrarAbierto, setCerrarAbierto] = useState(false);
  /* La etapa elegida que CIERRA la venta, esperando el sí. Mover a «Ganada» o
   * «Perdida» no es mover de columna: el disparador le pone el estado y la
   * fecha de cierre. En bloque eso cierra cuarenta ventas de una vez, y
   * deshacerlo es volver a mover cuarenta a mano. */
  const [cerrarVentas, setCerrarVentas] = useState<EtapaEB | null>(null);
  const [poner, setPoner] = useState<Set<string>>(new Set());
  const [quitar, setQuitar] = useState<Set<string>>(new Set());
  const [pendiente, empezar] = useTransition();
  const caja = useRef<HTMLDivElement>(null);
  const t = useTranslations("enBloque");
  /* El servidor contesta con claves (`enBloque.res.*`) para que el aviso salga
   * en el idioma de quien mira, no en el del servidor. */
  const traducir = (partes: Parte[]) => partes.map((p) => t(`res.${p.k}` as any, (p.v ?? {}) as any)).join(" ");

  // Clic fuera o Escape cierran el panel abierto.
  useEffect(() => {
    if (!panel) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setPanel(null);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [panel]);

  const n = ids.length;
  const que = t(
    tipo === "contactos" ? "contactos" : tipo === "oportunidades" ? "tarjetas" : "conversaciones",
    { n },
  );

  const correr = (f: () => Promise<ResultadoEnBloque>) => {
    setPanel(null);
    empezar(async () => {
      let r: { ok: boolean; texto: string };
      try {
        const res = await f();
        r = { ok: res.ok, texto: traducir(res.partes) };
      } catch (e) {
        console.error("[en bloque] la acción no contestó:", e);
        r = { ok: false, texto: t("noContesto") };
      }
      setPoner(new Set());
      setQuitar(new Set());
      onListo(r);
    });
  };

  /** Una etiqueta pasa por tres estados: sin tocar → poner → quitar → sin tocar. */
  const rotarEtiqueta = (nombre: string) => {
    const p = new Set(poner);
    const q = new Set(quitar);
    if (p.has(nombre)) {
      p.delete(nombre);
      q.add(nombre);
    } else if (q.has(nombre)) {
      q.delete(nombre);
    } else {
      p.add(nombre);
    }
    setPoner(p);
    setQuitar(q);
  };

  const conEmbudo = new Set(etapas.map((e) => e.pipeline?.name ?? "")).size > 1;

  const boton =
    "inline-flex items-center gap-1.5 rounded-lg border border-linea-2 bg-tarjeta px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-pink disabled:opacity-50";
  const cajaPanel =
    "absolute left-0 top-full z-40 mt-1.5 max-h-72 w-64 overflow-auto rounded-xl border border-linea-2 bg-tarjeta p-1.5 shadow-xl";
  const fila =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition hover:bg-suave";

  return (
    <div
      ref={caja}
      className="relative flex flex-wrap items-center gap-1.5 rounded-xl border border-pink/40 bg-pink/5 px-2.5 py-2"
    >
      <span className="mr-1 text-xs font-bold text-ink">{que}</span>

      <button type="button" disabled={pendiente} className={boton} onClick={() => setPanel(panel === "asignar" ? null : "asignar")}>
        <UserPlus className="h-3.5 w-3.5" /> {t("asignar")}
      </button>
      <button type="button" disabled={pendiente} className={boton} onClick={() => setPanel(panel === "etiquetas" ? null : "etiquetas")}>
        <Tag className="h-3.5 w-3.5" /> {t("etiquetas")}
      </button>
      <button type="button" disabled={pendiente} className={boton} onClick={() => setPanel(panel === "etapa" ? null : "etapa")}>
        <Columns3 className="h-3.5 w-3.5" /> {t("etapa")}
      </button>
      {/* DESDE EL TABLERO NO SE OFRECE «CERRAR», y no es por falta de sitio:
          cerrar conversaciones NO cierra la tarjeta (regla 3 del embudo), así
          que un botón «Cerrar» sobre tarjetas seleccionadas diría una cosa y
          haría otra. Lo que cierra una venta es moverla a Ganada o Perdida. */}
      {tipo !== "oportunidades" && (
        <button type="button" disabled={pendiente} className={boton} onClick={() => setCerrarAbierto(true)}>
          <CheckCircle2 className="h-3.5 w-3.5" /> {t("cerrar")}
        </button>
      )}

      {pendiente ? (
        <span className="inline-flex items-center gap-1 text-xs text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("guardando")}
        </span>
      ) : (
        <button
          type="button"
          onClick={onLimpiar}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-3 hover:text-ink"
          title={t("quitarSeleccionTitulo")}
        >
          <X className="h-3.5 w-3.5" /> {t("quitarSeleccion")}
        </button>
      )}

      {panel === "asignar" && (
        <div className={cajaPanel}>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3">{t("asignarA")}</p>
          {miembros.length === 0 && <p className="px-2.5 py-2 text-xs text-ink-3">{t("nadieEnEquipo")}</p>}
          {miembros.map((m) => (
            <button key={m.id} type="button" className={fila} onClick={() => correr(() => asignarEnBloque(tipo, ids, m.id))}>
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-suave text-[10px] font-bold text-ink-2">
                {(m.name || "?").slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{m.name}</span>
            </button>
          ))}
          {tipo === "contactos" && (
            <p className="px-2.5 pb-1 pt-2 text-[11px] leading-snug text-ink-3">
              {t("notaAsignarContactos")}
            </p>
          )}
        </div>
      )}

      {panel === "etiquetas" && (
        <div className={cajaPanel}>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-ink-3">
            {t("ayudaEtiquetas")}
          </p>
          {etiquetas.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-ink-3">{t("sinEtiquetas")}</p>
          )}
          <div className="flex flex-wrap gap-1.5 px-2 py-2">
            {etiquetas.map((t) => {
              const p = poner.has(t.name);
              const q = quitar.has(t.name);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => rotarEtiqueta(t.name)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    q ? "line-through opacity-70" : ""
                  }`}
                  style={{
                    borderColor: p || q ? (q ? "var(--danger, #e5484d)" : t.color) : "var(--linea-2)",
                    background: p ? `${t.color}22` : "transparent",
                    color: p ? t.color : undefined,
                  }}
                >
                  {p ? "+ " : q ? "− " : ""}
                  {t.name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={poner.size === 0 && quitar.size === 0}
            onClick={() => correr(() => etiquetasEnBloque(tipo, ids, Array.from(poner), Array.from(quitar)))}
            className="m-1 w-[calc(100%-0.5rem)] rounded-lg bg-demandu-gradient px-3 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ color: "#fff" }}
          >
            {t("aplicarA", { que })}
          </button>
        </div>
      )}

      {panel === "etapa" && (
        <div className={cajaPanel}>
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-3">{t("moverAEtapa")}</p>
          {etapas.length === 0 && <p className="px-2.5 py-2 text-xs text-ink-3">{t("sinEtapas")}</p>}
          {etapas.map((e, i) => {
            const grupo = e.pipeline?.name ?? "";
            const nuevoGrupo = conEmbudo && (i === 0 || (etapas[i - 1].pipeline?.name ?? "") !== grupo);
            return (
              <div key={e.id}>
                {nuevoGrupo && (
                  <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                    {grupo || t("sinEmbudo")}
                  </p>
                )}
                <button
                  type="button"
                  className={fila}
                  onClick={() => {
                    if (cierraLaVenta(e.outcome)) {
                      setPanel(null);
                      setCerrarVentas(e);
                      return;
                    }
                    correr(() => etapaEnBloque(tipo, ids, e.id));
                  }}
                >
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: e.color }} />
                  <span className="truncate">{e.name}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* EL NÚMERO VA EN LA PREGUNTA, no un «¿seguro?» a secas: lo que se
          decide no es mover, es cerrar N ventas. */}
      <Confirm
        abierto={!!cerrarVentas}
        peligro={cerrarVentas?.outcome === "perdido"}
        titulo={(() => {
          const a = cerrarVentas
            ? avisoDeCierre({ cuantas: ids.length, etapa: cerrarVentas.name, outcome: cerrarVentas.outcome })
            : null;
          return a ? t(`res.${a.k}` as any, (a.v ?? {}) as any) : "";
        })()}
        detalle={t("confirmarCierreDetalle")}
        confirmar={t("confirmarCierreSi")}
        onConfirmar={() => {
          const e = cerrarVentas;
          setCerrarVentas(null);
          if (e) correr(() => etapaEnBloque(tipo, ids, e.id));
        }}
        onCancelar={() => setCerrarVentas(null)}
      />

      <Confirm
        abierto={cerrarAbierto}
        peligro={false}
        titulo={t("cerrarTitulo", { que })}
        detalle={
          <>
            {t(tipo === "contactos" ? "cerrarDetalleContactos" : "cerrarDetalleConversaciones")}{" "}
            {t("cerrarDetalleTarjetas")}
          </>
        }
        confirmar={t("cerrarConfirmar")}
        onConfirmar={() => {
          setCerrarAbierto(false);
          correr(() => cerrarEnBloque(tipo, ids));
        }}
        onCancelar={() => setCerrarAbierto(false)}
      />
    </div>
  );
}
