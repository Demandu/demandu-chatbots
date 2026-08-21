"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, MoveRight, MessageSquare, AlertTriangle, CalendarClock,
  RefreshCw, Loader2, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bandera } from "@/lib/phoneCountry";
import {
  dinero, hace, alerta, nombreTarjeta, iniciales, vecinos, moverEnMemoria,
  type Tablero as TableroTipo, type Tarjeta, type Columna,
} from "@/lib/crm";
import { FichaOportunidad } from "./FichaOportunidad";

/**
 * El tablero del embudo.
 *
 * DOS FORMAS DE MOVER UNA TARJETA, a propósito:
 *  · Arrastrar — en computadora, que es donde se usa un tablero de verdad.
 *  · Botón "Mover a" — en teléfono. El arrastre de HTML5 NO existe en táctil;
 *    fingirlo con eventos de dedo sale mal y pelea con el scroll horizontal
 *    de las columnas. Un menú es más rápido y no se equivoca.
 *
 * El movimiento se pinta ANTES de que la base conteste. Si la base falla, se
 * revierte y se avisa: es preferible eso a que arrastrar se sienta lento.
 */
export function Tablero({
  inicial,
  orgId,
}: {
  inicial: TableroTipo;
  orgId: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tablero, setTablero] = useState<TableroTipo>(inicial);
  const [pipeline, setPipeline] = useState<string | null>(inicial.pipeline_id);
  const [responsable, setResponsable] = useState("");
  const [buscar, setBuscar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [abierta, setAbierta] = useState<Tarjeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const arrastrando = useRef<string | null>(null);
  const [indicador, setIndicador] = useState<{ col: string; idx: number } | null>(null);
  const debounce = useRef<any>(null);

  // Next guarda la respuesta del servidor unos segundos: al ir a la Bandeja y
  // volver, el tablero llegaba con las tarjetas donde estaban ANTES de moverlas
  // y parecía que el cambio no se había guardado (sí se guardaba). Con esto, el
  // estado de la pantalla sigue a lo que manda el servidor.
  useEffect(() => {
    setTablero(inicial);
    setPipeline(inicial.pipeline_id);
  }, [inicial]);

  // ── Traer el tablero ──────────────────────────────────────────────────────
  const recargar = useCallback(
    async (over: Partial<{ pipeline: string | null; responsable: string; buscar: string }> = {}) => {
      setCargando(true);
      const { data, error } = await sb.rpc("crm_board", {
        p_org: orgId,
        p_pipeline: over.pipeline !== undefined ? over.pipeline : pipeline,
        p_member: (over.responsable !== undefined ? over.responsable : responsable) || null,
        p_bot: null,
        p_canal: null,
        p_buscar: (over.buscar !== undefined ? over.buscar : buscar) || null,
        p_limite: 50,
      });
      setCargando(false);
      if (error) {
        setError("No se pudo cargar el embudo.");
        return;
      }
      setError(null);
      setTablero(data as TableroTipo);
      setPipeline((data as TableroTipo).pipeline_id);
    },
    [sb, orgId, pipeline, responsable, buscar],
  );

  // Al volver a esta pestaña se vuelve a pedir el tablero: si alguien del
  // equipo movió algo mientras tanto, aparece sin tener que recargar.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === "visible") recargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [recargar]);

  const buscarConEspera = (v: string) => {
    setBuscar(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => recargar({ buscar: v }), 350);
  };

  // ── Mover una tarjeta ─────────────────────────────────────────────────────
  const mover = useCallback(
    async (idTarjeta: string, idColumna: string, indice: number) => {
      const previo = tablero;
      const destino = tablero.columnas.find((c) => c.id === idColumna);
      if (!destino) return;

      const { antes, despues } = vecinos(destino.tarjetas, indice, idTarjeta);
      setTablero(moverEnMemoria(tablero, idTarjeta, idColumna, indice));
      setIndicador(null);

      const { error } = await sb.rpc("crm_mover_tarjeta", {
        p_op: idTarjeta,
        p_stage: idColumna,
        p_antes: antes,
        p_despues: despues,
      });
      if (error) {
        setTablero(previo);                       // se deshace: la base manda
        setError("No se pudo mover la tarjeta. Inténtalo otra vez.");
        return;
      }
      // La etapa también cambió en la conversación (lo hace la base). Se le
      // avisa a Next para que la Bandeja y Resultados no queden con lo viejo.
      router.refresh();
    },
    [sb, tablero, router],
  );

  const columnas = tablero.columnas ?? [];
  const r = tablero.resumen;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Barra: resumen y filtros ───────────────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Chip valor={String(r.abiertas)} etiqueta="abiertas" />
          <Chip valor={dinero(r.importe_abierto) || "—"} etiqueta="en juego" tono="violeta" />
          <Chip valor={dinero(r.importe_ganado) || "—"} etiqueta="ganado" tono="verde" />
          {r.vencidas > 0 && <Chip valor={String(r.vencidas)} etiqueta="con tarea vencida" tono="rojo" />}
          {r.sin_proximo_paso > 0 && (
            <Chip valor={String(r.sin_proximo_paso)} etiqueta="sin próximo paso" tono="ambar" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(tablero.embudos ?? []).length > 1 && (
            <select
              className="input-l w-auto"
              value={pipeline ?? ""}
              onChange={(e) => { setPipeline(e.target.value); recargar({ pipeline: e.target.value }); }}
              aria-label="Embudo"
            >
              {(tablero.embudos ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}

          <select
            className="input-l w-auto"
            value={responsable}
            onChange={(e) => { setResponsable(e.target.value); recargar({ responsable: e.target.value }); }}
            aria-label="Responsable"
          >
            <option value="">Todo el equipo</option>
            {(tablero.responsables ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>

          <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              className="input-l pl-9"
              placeholder="Buscar nombre o teléfono…"
              value={buscar}
              onChange={(e) => buscarConEspera(e.target.value)}
            />
          </div>

          <button type="button" onClick={() => recargar()} className="btn-soft px-3" title="Actualizar">
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>

          <Link href="/settings/states" className="btn-soft px-3 text-xs">Editar etapas</Link>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink-2">
            <AlertTriangle className="h-4 w-4 flex-none text-danger" />
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto text-ink-3 hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Columnas ───────────────────────────────────────────────────── */}
      {!columnas.length ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-linea-2 bg-tarjeta p-10 text-center">
          <p className="text-sm text-ink-2">
            Este embudo todavía no tiene etapas.{" "}
            <Link href="/settings/states" className="font-semibold text-violet underline">
              Créalas en Configuración
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="-mx-4 min-h-0 flex-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex h-full min-h-[340px] items-start gap-3.5">
            {columnas.map((c) => (
              <ColumnaTablero
                key={c.id}
                columna={c}
                columnas={columnas}
                indicador={indicador?.col === c.id ? indicador.idx : null}
                onSobre={(idx) => setIndicador({ col: c.id, idx })}
                onSalir={() => setIndicador((i) => (i?.col === c.id ? null : i))}
                onSoltar={(idx) => {
                  const id = arrastrando.current;
                  arrastrando.current = null;
                  if (id) mover(id, c.id, idx);
                }}
                onArrastrar={(id) => (arrastrando.current = id)}
                onAbrir={setAbierta}
                onMoverA={(idTarjeta, idCol) => mover(idTarjeta, idCol, 0)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Ficha lateral ──────────────────────────────────────────────── */}
      {abierta && (
        <FichaOportunidad
          tarjeta={abierta}
          columnas={columnas}
          responsables={tablero.responsables ?? []}
          orgId={orgId}
          onCerrar={(huboCambios) => {
            setAbierta(null);
            // Solo se vuelve a pedir el tablero si de verdad cambió algo.
            if (huboCambios) { recargar(); router.refresh(); }
          }}
          onCambio={() => { setAbierta(null); recargar(); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Columna ────────────────────────────────────────────────────────────────

function ColumnaTablero({
  columna, columnas, indicador, onSobre, onSalir, onSoltar, onArrastrar, onAbrir, onMoverA,
}: {
  columna: Columna;
  columnas: Columna[];
  indicador: number | null;
  onSobre: (idx: number) => void;
  onSalir: () => void;
  onSoltar: (idx: number) => void;
  onArrastrar: (id: string) => void;
  onAbrir: (t: Tarjeta) => void;
  onMoverA: (idTarjeta: string, idColumna: string) => void;
}) {
  const tarjetas = columna.tarjetas ?? [];
  const ocultas = Math.max(0, (columna.total ?? 0) - tarjetas.length);

  return (
    <section
      className="flex h-full w-[290px] flex-none flex-col rounded-2xl border border-linea bg-tarjeta-2"
      onDragOver={(e) => { e.preventDefault(); onSobre(tarjetas.length); }}
      onDragLeave={onSalir}
      onDrop={(e) => { e.preventDefault(); onSoltar(indicador ?? tarjetas.length); }}
    >
      <header className="flex items-center gap-2 border-b border-linea px-3.5 py-3">
        <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: columna.color || "#6E42FF" }} />
        <h3 className="min-w-0 truncate text-sm font-semibold text-ink">{columna.nombre}</h3>
        {columna.tipo !== "abierto" && (
          <span
            className={`flex-none rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
              columna.tipo === "ganado" ? "bg-success/15 text-exito" : "bg-danger/12 text-alerta"
            }`}
          >
            {columna.tipo === "ganado" ? "Ganada" : "Perdida"}
          </span>
        )}
        <span className="ml-auto flex-none rounded-lg bg-tarjeta px-2 py-0.5 text-xs font-semibold text-ink-2">
          {columna.total ?? 0}
        </span>
      </header>

      {!!columna.importe && (
        <div className="border-b border-linea px-3.5 py-1.5 text-xs font-semibold text-violet">
          {dinero(columna.importe)}
        </div>
      )}

      <div className="min-h-[80px] flex-1 overflow-y-auto p-2.5">
        {tarjetas.map((t, i) => (
          <div key={t.id}>
            {indicador === i && <Guia />}
            <TarjetaCrm
              tarjeta={t}
              columnas={columnas}
              columnaActual={columna.id}
              onArrastrar={onArrastrar}
              onSobre={(mitadInferior) => onSobre(mitadInferior ? i + 1 : i)}
              onAbrir={onAbrir}
              onMoverA={onMoverA}
            />
          </div>
        ))}
        {indicador === tarjetas.length && <Guia />}

        {!tarjetas.length && (
          <p className="px-1 py-6 text-center text-xs text-ink-3">
            {columna.total ? "Sin resultados con este filtro" : "Vacía"}
          </p>
        )}
        {ocultas > 0 && (
          <p className="px-1 pt-2 text-center text-[11px] text-ink-3">
            y {ocultas} más — usa el buscador para encontrarlas
          </p>
        )}
      </div>
    </section>
  );
}

function Guia() {
  return <div className="mx-1 my-1 h-0.5 rounded-full bg-violet" />;
}

// ─── Tarjeta ────────────────────────────────────────────────────────────────

function TarjetaCrm({
  tarjeta: t, columnas, columnaActual, onArrastrar, onSobre, onAbrir, onMoverA,
}: {
  tarjeta: Tarjeta;
  columnas: Columna[];
  columnaActual: string;
  onArrastrar: (id: string) => void;
  onSobre: (mitadInferior: boolean) => void;
  onAbrir: (t: Tarjeta) => void;
  onMoverA: (idTarjeta: string, idColumna: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const av = alerta(t);
  const nombre = nombreTarjeta(t);

  return (
    <article
      draggable
      onDragStart={(e) => { onArrastrar(t.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => {
        e.preventDefault();
        const caja = e.currentTarget.getBoundingClientRect();
        onSobre(e.clientY > caja.top + caja.height / 2);
      }}
      className="group mb-2 cursor-grab rounded-xl border border-linea bg-tarjeta p-3 transition hover:border-violet/50 hover:shadow-[0_6px_20px_-10px_rgba(20,20,60,.35)] active:cursor-grabbing"
    >
      <button type="button" onClick={() => onAbrir(t)} className="block w-full text-left">
        <div className="flex items-start gap-2">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-demandu-gradient text-[10px] font-bold text-white">
            {iniciales(nombre)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{nombre}</p>
            <p className="truncate text-xs text-ink-3">
              {t.pais ? `${bandera(t.pais)} ` : ""}
              {t.telefono || t.email || "—"}
            </p>
          </div>
          {!!t.importe && (
            <span className="flex-none text-xs font-bold text-violet">{dinero(t.importe, t.moneda)}</span>
          )}
        </div>

        {av && (
          <p
            className={`mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${
              av.tono === "rojo" ? "bg-danger/10 text-alerta" : "bg-warning/20 text-aviso"
            }`}
          >
            {av.tono === "rojo" ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
            {av.texto}
          </p>
        )}
        {!av && t.tarea && (
          <p className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-ink-2">
            <CalendarClock className="h-3 w-3 flex-none text-ink-3" />
            {t.tarea}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
          <span>{hace(t.dias_quieta)}</span>
          {t.responsable && <span className="truncate">· {t.responsable}</span>}
          {!!t.unread && (
            <span className="ml-auto flex-none rounded-full bg-pink px-1.5 py-0.5 font-bold text-white">
              {t.unread}
            </span>
          )}
        </div>
      </button>

      <div className="mt-2 flex items-center gap-1.5 border-t border-[#f2f3f9] pt-2">
        {t.conversation_id && (
          <Link
            href={`/inbox?c=${t.conversation_id}`}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-2 transition hover:bg-suave hover:text-ink"
          >
            <MessageSquare className="h-3 w-3" /> Abrir chat
          </Link>
        )}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-2 transition hover:bg-suave hover:text-ink"
            title="Mover a otra etapa"
          >
            <MoveRight className="h-3 w-3" /> Mover
          </button>
          {menu && (
            <>
              {/* Capa para cerrar tocando fuera, sin escuchar clics en todo el documento */}
              <button
                type="button"
                aria-label="Cerrar menú"
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setMenu(false)}
              />
              <div className="absolute bottom-full right-0 z-30 mb-1 w-52 overflow-hidden rounded-xl border border-linea bg-tarjeta py-1 shadow-[0_12px_40px_-12px_rgba(20,20,60,.3)]">
                {columnas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={c.id === columnaActual}
                    onClick={() => { setMenu(false); onMoverA(t.id, c.id); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition hover:bg-suave disabled:cursor-default disabled:opacity-40"
                  >
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: c.color || "#6E42FF" }} />
                    <span className="truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Chip de resumen ────────────────────────────────────────────────────────

function Chip({
  valor, etiqueta, tono = "neutro",
}: {
  valor: string;
  etiqueta: string;
  tono?: "neutro" | "violeta" | "verde" | "rojo" | "ambar";
}) {
  const tonos: Record<string, string> = {
    neutro: "bg-tarjeta text-ink border-linea",
    violeta: "bg-violet/10 text-violet border-violet/20",
    verde: "bg-success/12 text-exito border-success/25",
    rojo: "bg-danger/10 text-alerta border-danger/25",
    ambar: "bg-warning/18 text-aviso border-warning/35",
  };
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5 ${tonos[tono]}`}>
      <b className="font-display text-sm font-bold">{valor}</b>
      <span className="text-xs opacity-80">{etiqueta}</span>
    </span>
  );
}
