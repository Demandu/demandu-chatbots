import { createClient } from "@/lib/supabase/server";
import {
  createState, updateState, deleteState,
  createPipeline, updatePipeline, deletePipeline,
} from "../actions";
import { Trophy, KanbanSquare } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Embudos y etapas.
 *
 * Un embudo agrupa etapas; las etapas son las columnas del tablero. Cada etapa
 * dice además qué significa para la venta: sigue abierta, se ganó o se perdió.
 * Eso es lo que alimenta la efectividad de cierre en Resultados — sin ello la
 * plataforma no tiene forma de saber qué cuenta como cierre.
 *
 * Nota técnica: las etapas viven en la tabla `conversation_states`, que ya
 * existía como "estados de conversación" y ya era un embudo disfrazado. No se
 * renombró la tabla a propósito: la usan la Bandeja, los catálogos y la
 * analítica, y romper eso no aportaba nada.
 */
const RESULTADOS = [
  { key: "abierto", label: "Sigue abierta" },
  { key: "ganado", label: "Venta ganada" },
  { key: "perdido", label: "Se perdió" },
];

export default async function EmbudosPage() {
  const sb = createClient();
  const [{ data: pipes }, { data: stages }] = await Promise.all([
    sb.from("pipelines").select("*").order("sort"),
    sb.from("conversation_states").select("*").order("sort"),
  ]);

  const embudos = (pipes ?? []) as any[];
  const etapas = (stages ?? []) as any[];
  const marcados = etapas.filter((e) => e.outcome === "ganado" || e.outcome === "perdido").length;
  const porDefecto = embudos.find((p) => p.is_default) ?? embudos[0];

  return (
    <div className="flex flex-col gap-8">
      {/* ── Por qué importa ─────────────────────────────────────────────── */}
      <div className="flex gap-3 rounded-xl border border-linea-2 bg-tarjeta-2 p-4 text-sm leading-relaxed text-ink-2">
        <Trophy className="mt-0.5 h-4 w-4 flex-none text-violet" />
        <div>
          <b className="text-ink">Marca cuáles etapas son cierre.</b> La plataforma no puede
          adivinar si “En proceso” es una venta. Di aquí qué etapas significan <b>venta ganada</b>{" "}
          y cuáles <b>se perdió</b>, y la efectividad de cierre aparece sola en Resultados — por
          equipo y por persona.
          {marcados === 0 && (
            <span className="mt-1.5 block font-semibold text-aviso">
              Todavía no marcaste ninguna, así que ese número sale vacío.
            </span>
          )}
        </div>
      </div>

      {/* ── Embudos ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-1 font-display text-lg font-semibold text-ink">Embudos</h3>
        <p className="mb-4 text-sm text-ink-2">
          La mayoría de los negocios usa uno solo. Crea otro si vendes cosas muy distintas y no
          quieres mezclarlas en el mismo tablero.
        </p>

        <div className="mb-3 flex flex-col gap-2">
          {embudos.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2.5 rounded-xl border border-linea bg-tarjeta px-3 py-2.5"
            >
              <form action={updatePipeline} className="flex flex-1 flex-wrap items-center gap-2.5">
                <input type="hidden" name="id" value={p.id} />
                <KanbanSquare className="h-4 w-4 flex-none text-violet" />
                <input
                  name="name"
                  defaultValue={p.name}
                  className="min-w-[120px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-ink hover:border-linea-2 focus:border-pink focus:outline-none"
                />
                <label className="flex items-center gap-1.5 text-xs text-ink-2" title="El tablero que se abre por defecto y al que llegan las conversaciones nuevas">
                  <input type="checkbox" name="is_default" defaultChecked={p.is_default} className="accent-violet" />
                  Principal
                </label>
                <label className="flex items-center gap-1.5 text-xs text-ink-2" title="Crear una tarjeta sola cuando alguien escribe por primera vez">
                  <input type="checkbox" name="auto_create" defaultChecked={p.auto_create} className="accent-violet" />
                  Crear tarjetas solo
                </label>
                <button className="btn-soft px-3 py-1.5 text-xs">Guardar</button>
              </form>
              {embudos.length > 1 && (
                <form action={deletePipeline}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="px-1 text-ink-3 transition hover:text-danger" title="Eliminar embudo">
                    ✕
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>

        <form action={createPipeline} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nuevo embudo</label>
            <input name="name" required placeholder="Posventa" className="input-l" />
          </div>
          <button className="btn-primary">Crear embudo</button>
        </form>

        <p className="mt-2 text-xs text-ink-3">
          <b className="text-ink-2">Crear tarjetas solo</b>: cuando alguien te escribe por primera
          vez aparece su tarjeta sin que hagas nada. Si vuelve a escribir no se duplica — se crea
          una nueva solo cuando la anterior ya se ganó o se perdió. Apágalo si prefieres crear las
          tarjetas a mano.
        </p>
      </section>

      {/* ── Etapas de cada embudo ───────────────────────────────────────── */}
      {embudos.map((p) => {
        const suyas = etapas.filter((e) => e.pipeline_id === p.id);
        return (
          <section key={p.id}>
            <h3 className="mb-1 font-display text-lg font-semibold text-ink">
              Etapas de “{p.name}”
            </h3>
            <p className="mb-4 text-sm text-ink-2">
              Son las columnas del tablero, en este orden.
            </p>

            <div className="mb-3 flex flex-col gap-2">
              {suyas.map((st) => (
                <div
                  key={st.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-linea bg-tarjeta px-3 py-2"
                >
                  <form action={updateState} className="flex flex-1 flex-wrap items-center gap-2.5">
                    <input type="hidden" name="id" value={st.id} />
                    <input
                      type="color"
                      name="color"
                      defaultValue={st.color}
                      className="h-8 w-9 flex-none cursor-pointer rounded-md border border-linea-2 bg-tarjeta"
                      title="Color"
                    />
                    <input
                      name="name"
                      defaultValue={st.name}
                      className="min-w-[110px] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-ink hover:border-linea-2 focus:border-pink focus:outline-none"
                    />
                    <select
                      name="outcome"
                      defaultValue={st.outcome ?? "abierto"}
                      className="rounded-lg border border-linea-2 bg-tarjeta px-2 py-1.5 text-xs text-ink focus:border-pink focus:outline-none"
                      title="Qué significa esta etapa para la efectividad de cierre"
                    >
                      {RESULTADOS.map((r) => (
                        <option key={r.key} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                    <button className="btn-soft px-3 py-1.5 text-xs">Guardar</button>
                  </form>
                  <form action={deleteState}>
                    <input type="hidden" name="id" value={st.id} />
                    <button className="px-1 text-ink-3 transition hover:text-danger" title="Eliminar etapa">
                      ✕
                    </button>
                  </form>
                </div>
              ))}
              {!suyas.length && (
                <p className="rounded-xl border border-dashed border-linea-2 p-4 text-center text-sm text-ink-3">
                  Este embudo no tiene etapas todavía.
                </p>
              )}
            </div>

            <form action={createState} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="pipeline_id" value={p.id} />
              <div className="min-w-[160px] flex-1">
                <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nueva etapa</label>
                <input name="name" required placeholder="En negociación" className="input-l" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-2">Color</label>
                <input
                  type="color"
                  name="color"
                  defaultValue="#3A85FF"
                  className="h-11 w-14 cursor-pointer rounded-lg border border-linea-2 bg-tarjeta"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-2">¿Qué significa?</label>
                <select name="outcome" defaultValue="abierto" className="input-l w-auto">
                  {RESULTADOS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              <button className="btn-primary">Agregar etapa</button>
            </form>
          </section>
        );
      })}

      {/* Etapas huérfanas: pueden existir si se borró su embudo desde la base. */}
      {etapas.some((e) => !e.pipeline_id) && porDefecto && (
        <p className="text-xs text-ink-3">
          Hay etapas sin embudo. Vuelve a guardarlas para asignarlas a “{porDefecto.name}”.
        </p>
      )}
    </div>
  );
}
