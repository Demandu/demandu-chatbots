import { Trash2, ArrowRight, ShieldCheck } from "lucide-react";
import {
  crearReglaDeCalificacion,
  quitarReglaDeCalificacion,
} from "@/app/(dashboard)/settings/actions";

const OPERADORES: { valor: string; texto: string; sinValor?: boolean }[] = [
  { valor: ">=", texto: "es mayor o igual que" },
  { valor: "<", texto: "es menor que" },
  { valor: ">", texto: "es mayor que" },
  { valor: "<=", texto: "es menor o igual que" },
  { valor: "=", texto: "es igual a" },
  { valor: "!=", texto: "es distinto de" },
  { valor: "contiene", texto: "contiene" },
  { valor: "no_vacio", texto: "tiene algún valor", sinValor: true },
  { valor: "vacio", texto: "está vacío", sinValor: true },
];

const TEXTO_OPERADOR = Object.fromEntries(OPERADORES.map((o) => [o.valor, o.texto]));

/** Los datos fijos de la ficha, que siempre existen aunque nadie cree campos. */
const CAMPOS_FIJOS = [
  { key: "email", name: "Correo" },
  { key: "phone", name: "Teléfono" },
  { key: "name", name: "Nombre" },
  { key: "company", name: "Empresa" },
];

/**
 * Calificación automática: la parte que NO depende de que la IA se acuerde.
 *
 * POR QUÉ EXISTE. Pedirle a un modelo «etiqueta lead-bajo si gana menos de
 * 890» funciona casi siempre, y «casi» no sirve para una regla con dinero
 * detrás. En una prueba real la IA capturó bien el ingreso —500— y aun así no
 * etiquetó: se limitó a narrar lo que iba a hacer.
 *
 * Aquí el trabajo se reparte por lo que cada uno hace bien: la IA conversa y
 * captura el dato; la base compara y etiqueta. Siempre, sin excepciones, y sin
 * gastar IA.
 *
 * Y como la regla vive en la ficha y no en el chatbot, da igual QUIÉN escribió
 * el dato: la IA, un bloque del flujo, o un vendedor tecleándolo a mano en la
 * Bandeja. Los tres caminos califican igual.
 */
export function ReglasDeCalificacion({
  reglas,
  campos,
  etiquetas,
}: {
  reglas: { id: string; campo: string; operador: string; valor: string | null; etiqueta: { name: string; color: string | null } | null }[];
  campos: { key: string; name: string }[];
  etiquetas: { id: string; name: string; grupo: string | null }[];
}) {
  const todos = [...campos, ...CAMPOS_FIJOS.filter((f) => !campos.some((c) => c.key === f.key))];
  const nombreCampo = (k: string) => todos.find((c) => c.key === k)?.name ?? k;

  return (
    <div className="mt-8 rounded-2xl border border-linea bg-tarjeta p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-success/15 text-exito">
          <ShieldCheck className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">Calificación automática</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            En cuanto un dato entra en la ficha, la etiqueta se pone sola. No depende de que el
            asistente se acuerde: <b className="text-ink">se cumple siempre</b>, lo escriba la IA, un
            flujo o tu equipo a mano.
          </p>
        </div>
      </div>

      {reglas.length > 0 && (
        <div className="mb-4 mt-4 space-y-2">
          {reglas.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-linea bg-suave/40 px-3 py-2 text-sm"
            >
              <span className="text-ink-2">Si</span>
              <b className="text-ink">{nombreCampo(r.campo)}</b>
              <span className="text-ink-2">{TEXTO_OPERADOR[r.operador] ?? r.operador}</span>
              {r.valor && <b className="text-ink">{r.valor}</b>}
              <ArrowRight className="h-3.5 w-3.5 flex-none text-ink-3" />
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: r.etiqueta?.color ?? "#8b5cf6" }}
                />
                <b className="text-ink">{r.etiqueta?.name ?? "—"}</b>
              </span>
              <form action={quitarReglaDeCalificacion} className="ml-auto flex-none">
                <input type="hidden" name="id" value={r.id} />
                <button className="text-ink-3 transition hover:text-danger" title="Quitar">
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </div>
          ))}
          <p className="text-[11px] text-ink-3">
            Gana la <b className="text-ink-2">primera regla que se cumple</b>, de arriba abajo. El
            orden es la regla.
          </p>
        </div>
      )}

      <form action={crearReglaDeCalificacion} className="mt-4 flex flex-wrap items-end gap-2.5">
        <label className="min-w-[140px] flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Si el dato</span>
          <select name="campo" required className="input-l w-full">
            <option value="">Elige…</option>
            {todos.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[150px] flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Cumple que</span>
          <select name="operador" required defaultValue=">=" className="input-l w-full">
            {OPERADORES.map((o) => (
              <option key={o.valor} value={o.valor}>{o.texto}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[100px] flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Valor</span>
          <input name="valor" placeholder="890" className="input-l w-full" />
        </label>

        <label className="min-w-[140px] flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-ink-2">Ponle la etiqueta</span>
          <select name="etiqueta_id" required className="input-l w-full">
            <option value="">Elige…</option>
            {etiquetas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.grupo ? `${t.name} · ${t.grupo}` : t.name}
              </option>
            ))}
          </select>
        </label>

        <button className="btn-primary">Añadir regla</button>
      </form>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Los números se entienden aunque vengan escritos a la ligera: <b className="text-ink-2">1000
        dolitas</b> se lee como 1000. Y si la persona no da un número —«no sé», «depende»— la regla
        NO se cumple y la calificación se queda como estaba:{" "}
        <b className="text-ink-2">desconocido no es lo mismo que bajo</b>.
      </p>
    </div>
  );
}
