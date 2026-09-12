"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Link2, EyeOff, Eye } from "lucide-react";
import {
  LIENZO, REJILLA, acomodar, aforoDelSalon, conUnibles, lasQueSePisan,
  type MesaEnElMapa, type Par,
} from "@/lib/reservas/mapa";
import { crearTanda, moverMesa, editarMesa, borrarMesa, guardarUniones } from
  "@/app/(dashboard)/reservas/acciones";

/**
 * EL PLANO DEL SALÓN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Se arrastra para mover, se pulsa para elegir, y el panel de la derecha edita
 * la mesa elegida.
 *
 * ── SE GUARDA AL SOLTAR, NO MIENTRAS SE ARRASTRA ──────────────────────────
 *
 * Un arrastre son cientos de posiciones por segundo. Guardando cada una, mover
 * una mesa serían cientos de escrituras y el plano iría a tirones.
 *
 * ── Y SI EL GUARDADO FALLA, LA MESA VUELVE ────────────────────────────────
 *
 * Esto es lo que separa un plano de un dibujo. La mesa se mueve en pantalla al
 * instante —si no, se siente rota— pero si el servidor dice que no, vuelve a
 * donde estaba y se dice por qué. Dejarla donde el dueño la soltó, sabiendo que
 * la base tiene otra cosa, es enseñarle un salón que no existe: y el día de la
 * reserva Lana asigna mesas según la base, no según la pantalla.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function MapaDelSalon({
  mesas: inicial,
  pares: paresIniciales,
}: {
  mesas: MesaEnElMapa[];
  pares: Par[];
}) {
  const [mesas, setMesas] = useState<MesaEnElMapa[]>(inicial);
  const [pares, setPares] = useState<Par[]>(paresIniciales);
  const [elegida, setElegida] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ mal: boolean; texto: string } | null>(null);
  const [guardando, empezar] = useTransition();

  const lienzoRef = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ id: string; dx: number; dy: number; desde: MesaEnElMapa } | null>(null);
  /* El estado de las mesas, legible desde un manejador sin meterse dentro de un
   * actualizador de React. Ver `alSoltar`: hacerlo al revés dejaba la pantalla
   * en blanco. */
  const mesasRef = useRef<MesaEnElMapa[]>(inicial);
  mesasRef.current = mesas;

  const conSusUniones = useMemo(() => conUnibles(mesas, pares), [mesas, pares]);
  const sePisan = useMemo(() => lasQueSePisan(mesas), [mesas]);
  const aforo = useMemo(() => aforoDelSalon(mesas), [mesas]);
  const laElegida = conSusUniones.find((m) => m.id === elegida) ?? null;

  const decir = (mal: boolean, texto: string) => {
    setAviso({ mal, texto });
    // El aviso se va solo: uno que se queda pegado se convierte en decorado y
    // deja de leerse el día que dice algo importante.
    window.setTimeout(() => setAviso(null), mal ? 6000 : 2500);
  };

  // ── Arrastre ──────────────────────────────────────────────────────────────
  const alBajar = (e: React.MouseEvent, m: MesaEnElMapa) => {
    e.preventDefault();
    setElegida(m.id);
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!caja) return;
    arrastre.current = {
      id: m.id,
      dx: e.clientX - caja.left - m.x,
      dy: e.clientY - caja.top - m.y,
      desde: m,
    };
  };

  const alMover = useCallback((e: React.MouseEvent) => {
    const a = arrastre.current;
    const caja = lienzoRef.current?.getBoundingClientRect();
    if (!a || !caja) return;
    const sitio = acomodar({
      x: e.clientX - caja.left - a.dx,
      y: e.clientY - caja.top - a.dy,
      ancho: a.desde.ancho,
      alto: a.desde.alto,
    });
    setMesas((ms) => ms.map((m) => (m.id === a.id ? { ...m, ...sitio } : m)));
  }, []);

  const alSoltar = useCallback(() => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;

    /* ── POR QUÉ ESTO NO VA DENTRO DE `setMesas` ────────────────────────────
     *
     * 12 SEP 2026. La pantalla se quedaba EN BLANCO al soltar una mesa.
     *
     * La causa era que aquí se leía el estado desde dentro del actualizador de
     * `setMesas((ms) => …)` y, de paso, se lanzaba la petición al servidor
     * dentro de esa misma función. Un actualizador de React tiene que ser PURO:
     * React lo puede llamar dos veces, y llamar a `startTransition` desde
     * dentro revienta el render entero. Un render que revienta es una pantalla
     * en blanco — sin mensaje, sin nada.
     *
     * Ahora el estado se lee de un `ref` que se mantiene al día, y el guardado
     * ocurre FUERA de cualquier actualizador. */
    const ahora = mesasRef.current.find((m) => m.id === a.id);
    if (!ahora) return;
    // No se guarda si no se movió: un clic para elegir no es un cambio.
    if (ahora.x === a.desde.x && ahora.y === a.desde.y) return;

    const fd = new FormData();
    fd.set("id", a.id);
    fd.set("x", String(ahora.x));
    fd.set("y", String(ahora.y));
    fd.set("ancho", String(ahora.ancho));
    fd.set("alto", String(ahora.alto));

    empezar(async () => {
      const r = await moverMesa(fd);
      if (!r.ok) {
        // VUELVE A DONDE ESTABA. Ver la cabecera.
        setMesas((cs) => cs.map((m) => (m.id === a.id ? { ...m, ...a.desde } : m)));
        decir(true, r.error);
      }
    });
  }, []);

  // ── Acciones del panel ────────────────────────────────────────────────────

  /**
   * AÑADIR UNA TANDA. «Seis mesas de dos, redondas» en un clic.
   *
   * LAS MESAS SE AÑADEN AL ESTADO CON LO QUE DEVUELVE EL SERVIDOR, no con lo
   * que se pidió. Los ids y las posiciones definitivas los pone la base; si el
   * plano se los inventara, la siguiente que se arrastrara se guardaría contra
   * un id que no existe y el fallo aparecería mucho después.
   */
  const anadirTanda = (fd: FormData) => {
    const cuantas = Number(fd.get("cuantas")) || 0;
    empezar(async () => {
      const r = await crearTanda(fd);
      if (!r.ok) return decir(true, r.error);
      setMesas((ms) => [...ms, ...(r.mesas as unknown as MesaEnElMapa[])]);
      const n = r.mesas.length;
      decir(
        false,
        n < cuantas
          ? `Cupieron ${n} de ${cuantas}. Acomoda y añade las demás.`
          : `${n} mesa${n === 1 ? "" : "s"} añadida${n === 1 ? "" : "s"}.`,
      );
    });
  };

  const guardarFicha = (fd: FormData) => {
    empezar(async () => {
      const r = await editarMesa(fd);
      if (!r.ok) return decir(true, r.error);
      // Se pinta lo que quedó guardado, no lo que se escribió en el formulario.
      const guardada = (r.mesas ?? [])[0] as unknown as MesaEnElMapa | undefined;
      if (guardada) setMesas((ms) => ms.map((m) => (m.id === guardada.id ? { ...m, ...guardada } : m)));
      decir(false, "Cambio guardado.");
    });
  };

  const quitar = (id: string, nombre: string) => {
    const fd = new FormData();
    fd.set("id", id);
    empezar(async () => {
      const r = await borrarMesa(fd);
      if (r.ok) {
        setMesas((ms) => ms.filter((m) => m.id !== id));
        setPares((ps) => ps.filter((p) => p.mesa_a !== id && p.mesa_b !== id));
        setElegida(null);
        decir(false, `${nombre} eliminada.`);
      } else decir(true, r.error);
    });
  };

  const cambiarUnion = (otro: string, unir: boolean) => {
    if (!laElegida) return;
    const actuales = new Set(laElegida.unibles ?? []);
    if (unir) actuales.add(otro);
    else actuales.delete(otro);

    const fd = new FormData();
    fd.set("id", laElegida.id);
    for (const x of actuales) fd.append("con", x);

    empezar(async () => {
      const r = await guardarUniones(fd);
      if (!r.ok) return decir(true, r.error);
      setPares((ps) => {
        const otros = ps.filter((p) => p.mesa_a !== laElegida.id && p.mesa_b !== laElegida.id);
        const mios = [...actuales].map((x) =>
          laElegida.id < x ? { mesa_a: laElegida.id, mesa_b: x } : { mesa_a: x, mesa_b: laElegida.id },
        );
        return [...otros, ...mios];
      });
      decir(false, unir ? "Mesas unidas." : "Unión quitada.");
    });
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
      {/* ── El plano ───────────────────────────────────────────────────── */}
      <div>
        {/* ── AÑADIR EN TANDA ──────────────────────────────────────────────
            Nadie dibuja veinticuatro mesas de una en una. Se dice cuántas, de
            cuánta gente y de qué forma, y aparecen acomodadas solas. */}
        <form action={anadirTanda} className="card-l mb-3 flex flex-wrap items-end gap-3 p-4">
          <div className="w-20">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Cuántas</label>
            <input name="cuantas" type="number" min={1} max={60} defaultValue={4} required className="input-l" />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Personas</label>
            <input name="capacidad" type="number" min={1} max={40} defaultValue={2} required className="input-l" />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Forma</label>
            <select name="forma" defaultValue="redonda" className="input-l">
              <option value="redonda">Redondas</option>
              <option value="cuadrada">Cuadradas</option>
              <option value="rectangular">Rectangulares</option>
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-semibold text-ink-2">Zona (opcional)</label>
            <input name="zona" className="input-l" placeholder="Terraza, Salón…" />
          </div>
          <button className="btn-primary" disabled={guardando}>
            <Plus className="h-4 w-4" /> Añadir al plano
          </button>
          <p className="w-full text-[11px] text-ink-3">
            Aparecen acomodadas en el espacio libre. Después las arrastras donde van.
          </p>
        </form>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-2">
            <strong className="text-ink">{mesas.filter((m) => m.activa !== false).length}</strong> mesas ·{" "}
            <strong className="text-ink">{aforo}</strong> personas de aforo
          </span>
          {sePisan.size > 0 && (
            <span className="rounded-full bg-[#fdecec] px-3 py-1 text-xs font-medium text-[#c0392b]">
              {sePisan.size} mesas se están pisando
            </span>
          )}
          {aviso && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                aviso.mal ? "bg-[#fdecec] text-[#c0392b]" : "bg-[#e8f7ee] text-[#1e7a45]"
              }`}
            >
              {aviso.texto}
            </span>
          )}
        </div>

        <div
          ref={lienzoRef}
          onMouseMove={alMover}
          onMouseUp={alSoltar}
          onMouseLeave={alSoltar}
          onClick={(e) => { if (e.target === e.currentTarget) setElegida(null); }}
          className="relative overflow-auto rounded-2xl border border-linea bg-suave-2"
          style={{
            width: "100%",
            height: 560,
            backgroundImage:
              `linear-gradient(#e3e6f0 1px, transparent 1px), linear-gradient(90deg, #e3e6f0 1px, transparent 1px)`,
            backgroundSize: `${REJILLA * 4}px ${REJILLA * 4}px`,
          }}
        >
          <div className="relative" style={{ width: LIENZO.ancho, height: LIENZO.alto }}>
            {conSusUniones.map((m) => {
              const activa = m.activa !== false;
              const seleccionada = m.id === elegida;
              const pisa = sePisan.has(m.id);
              return (
                <div
                  key={m.id}
                  onMouseDown={(e) => alBajar(e, m)}
                  title={`${m.nombre} · ${m.capacidad} personas${m.zona ? ` · ${m.zona}` : ""}`}
                  className={[
                    "absolute grid cursor-grab select-none place-items-center border-2 text-center shadow-sm transition-colors",
                    m.forma === "redonda" ? "rounded-full" : "rounded-lg",
                    !activa
                      ? "border-dashed border-linea-2 bg-white/60 text-ink-3"
                      : pisa
                        ? "border-[#e07a6a] bg-[#fdecec] text-[#c0392b]"
                        : seleccionada
                          ? "border-[#6E42FF] bg-[#efe9ff] text-ink"
                          : "border-linea-2 bg-white text-ink",
                  ].join(" ")}
                  style={{ left: m.x, top: m.y, width: m.ancho, height: m.alto }}
                >
                  <div className="pointer-events-none px-1">
                    <div className="text-[11px] font-semibold leading-tight">{m.nombre}</div>
                    <div className="text-[11px] opacity-70">{m.capacidad}p</div>
                    {(m.unibles?.length ?? 0) > 0 && (
                      <Link2 className="mx-auto mt-0.5 h-3 w-3 opacity-60" />
                    )}
                  </div>
                </div>
              );
            })}

            {mesas.length === 0 && (
              <div className="absolute inset-0 grid place-items-center text-center text-sm text-ink-3">
                <div>
                  Tu salón está vacío.<br />
                  Dí cuántas mesas tienes arriba y aparecen solas.
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-2 text-[11px] text-ink-3">
          Arrastra las mesas para colocarlas como están en tu salón. Se guarda solo al soltar.
        </p>
      </div>

      {/* ── El panel de la mesa elegida ────────────────────────────────── */}
      <div className="card-l p-5">
        {!laElegida ? (
          <p className="text-sm text-ink-3">
            Pulsa una mesa del plano para cambiar su nombre, cuánta gente cabe y con cuáles se puede juntar.
          </p>
        ) : (
          <div className="space-y-4">
            <form action={guardarFicha} className="space-y-3">
              <input type="hidden" name="id" value={laElegida.id} />
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre</label>
                <input name="nombre" defaultValue={laElegida.nombre} key={`n-${laElegida.id}`} className="input-l" required />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Personas</label>
                  <input
                    name="capacidad" type="number" min={1} max={40} required
                    defaultValue={laElegida.capacidad} key={`c-${laElegida.id}`} className="input-l"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Forma</label>
                  <select name="forma" defaultValue={laElegida.forma ?? "redonda"} key={`f-${laElegida.id}`} className="input-l">
                    <option value="redonda">Redonda</option>
                    <option value="cuadrada">Cuadrada</option>
                    <option value="rectangular">Rectangular</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-2">Zona (opcional)</label>
                <input
                  name="zona" defaultValue={laElegida.zona ?? ""} key={`z-${laElegida.id}`}
                  className="input-l" placeholder="Terraza, Salón, Barra…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" name="activa" value="si" defaultChecked={laElegida.activa !== false} key={`a-${laElegida.id}`} />
                {laElegida.activa !== false ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                Se puede reservar
              </label>
              <button className="btn-primary w-full" disabled={guardando}>Guardar cambios</button>
            </form>

            {/* ── Con cuáles se junta ────────────────────────────────── */}
            <div className="border-t border-linea pt-4">
              <div className="mb-1 text-xs font-semibold text-ink-2">Se puede juntar con</div>
              <p className="mb-2 text-[11px] text-ink-3">
                Marca solo las que de verdad caben juntas en tu salón. Lana únicamente juntará estas.
              </p>
              <div className="max-h-44 space-y-1 overflow-auto">
                {conSusUniones.filter((m) => m.id !== laElegida.id).length === 0 && (
                  <p className="text-[11px] text-ink-3">Necesitas al menos otra mesa.</p>
                )}
                {conSusUniones
                  .filter((m) => m.id !== laElegida.id)
                  .map((m) => {
                    const unida = (laElegida.unibles ?? []).includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-ink-2 hover:bg-suave">
                        <input
                          type="checkbox"
                          checked={unida}
                          disabled={guardando}
                          onChange={(e) => cambiarUnion(m.id, e.target.checked)}
                        />
                        {m.nombre} <span className="text-ink-3">· {m.capacidad}p</span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <button
              onClick={() => quitar(laElegida.id, laElegida.nombre)}
              disabled={guardando}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-linea px-3 py-2 text-sm text-[#c0392b] hover:bg-[#fdecec]"
            >
              <Trash2 className="h-4 w-4" /> Eliminar mesa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
