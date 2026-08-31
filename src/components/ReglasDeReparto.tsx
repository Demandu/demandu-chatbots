import { Trash2, ArrowRight, Tag as TagIcon } from "lucide-react";
import { crearReglaDeReparto, quitarReglaDeReparto } from "@/app/(dashboard)/settings/actions";

type Fila = {
  id: string;
  prioridad: number;
  tag: { name: string; color: string | null } | null;
  destino: string;
};

/**
 * «Si el lead es alto, que le toque a Darwin.»
 *
 * POR QUÉ ESTO VIVE AQUÍ Y NO EN EL BLOQUE DEL FLUJO. Una conversación pide
 * persona por CUATRO caminos distintos: el bloque del flujo, el atajo «1», la
 * herramienta del agente de IA y el botón de la Bandeja. Si la regla viviera
 * dentro del bloque, los otros tres seguirían repartiendo por turnos y el
 * cliente juraría que no funciona — porque tres de cada cuatro veces no
 * funcionaría.
 *
 * LAS REGLAS GANAN AL REPARTO NORMAL, pero solo si la persona sigue disponible.
 * Mandarle el mejor lead del mes a alguien que terminó su turno es perderlo: si
 * no está, la conversación cae al reparto de siempre en vez de quedarse
 * esperando en el buzón de nadie.
 */
export function ReglasDeReparto({
  reglas,
  etiquetas,
  miembros,
  equipos,
}: {
  reglas: Fila[];
  etiquetas: { id: string; name: string; color: string | null; grupo: string | null }[];
  miembros: { id: string; name: string }[];
  equipos: { id: string; name: string }[];
}) {
  return (
    <div className="rounded-2xl border border-linea bg-tarjeta p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
        Excepciones por etiqueta
      </p>
      <p className="mb-4 mt-1.5 text-sm text-ink-2">
        Antes de repartir, se mira la etiqueta del contacto. Sirve para que tus mejores leads no
        caigan por turno: si está calificado como alto, va directo a quien tú digas.
      </p>

      {reglas.length > 0 && (
        <div className="mb-4 space-y-2">
          {reglas.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 rounded-xl border border-linea bg-suave/40 px-3 py-2 text-sm"
            >
              <TagIcon className="h-3.5 w-3.5 flex-none text-ink-3" />
              {r.tag ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: r.tag.color ?? "#8b5cf6" }}
                  />
                  <b className="text-ink">{r.tag.name}</b>
                </span>
              ) : (
                <span className="text-ink-2">Cualquier contacto</span>
              )}
              <ArrowRight className="h-3.5 w-3.5 flex-none text-ink-3" />
              <span className="text-ink">{r.destino}</span>
              <form action={quitarReglaDeReparto} className="ml-auto flex-none">
                <input type="hidden" name="id" value={r.id} />
                <button className="text-ink-3 transition hover:text-danger" title="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form action={crearReglaDeReparto} className="flex flex-wrap items-end gap-2.5">
        <label className="min-w-[150px] flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Si tiene la etiqueta</span>
          <select name="tag_id" className="input-l w-full" required>
            <option value="">Elige una…</option>
            {etiquetas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.grupo ? `${t.name} · ${t.grupo}` : t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[170px] flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">La atiende</span>
          {/* Persona O equipo, nunca los dos: el valor lleva el tipo delante
              para que no haya forma de mandar ambos y que la base lo rechace. */}
          <select name="destino" className="input-l w-full" required>
            <option value="">Elige a quién…</option>
            {miembros.length > 0 && (
              <optgroup label="Personas">
                {miembros.map((m) => (
                  <option key={m.id} value={`persona:${m.id}`}>{m.name}</option>
                ))}
              </optgroup>
            )}
            {equipos.length > 0 && (
              <optgroup label="Equipos (al más libre)">
                {equipos.map((e) => (
                  <option key={e.id} value={`equipo:${e.id}`}>{e.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <button className="btn-primary">Añadir regla</button>
      </form>

      {etiquetas.length === 0 && (
        <p className="mt-3 text-xs text-ink-3">
          Todavía no tienes etiquetas. Créalas en <b className="text-ink-2">Etiquetas</b> y vuelve aquí.
        </p>
      )}
    </div>
  );
}
