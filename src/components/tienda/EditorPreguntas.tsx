"use client";

import { useState } from "react";
import { Plus, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { MAX_PREGUNTAS, type PreguntaPedido, type TipoPregunta } from "@/lib/tienda/config";

/**
 * Las preguntas del pedido, hasta diez, como en la hoja.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES ESTO ERA UNA CAJA DE TEXTO donde había que escribir:
 *
 *     Forma de Pago* | Yappy, Efectivo, Tarjeta
 *
 * El mismo error que ya corregimos en las variedades, cometido dos veces. Quien
 * configura una tienda no habla ese idioma: las barras, el asterisco y el orden
 * son cosas de programador. Aquí no hay nada que aprender — se escribe la
 * pregunta, se elige de qué tipo es, y si es una lista se van agregando las
 * opciones.
 *
 * EL TOPE DE DIEZ ES EL DE LA HOJA (`pr_preg1`…`pr_preg10`), y además tiene
 * sentido: cada pregunta es una casilla más entre el carrito y el pedido
 * enviado, y eso se paga en pedidos que nadie termina.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const TIPOS: { valor: TipoPregunta; titulo: string; pista: string }[] = [
  { valor: "texto", titulo: "Texto corto", pista: "Un nombre, un edificio, un número de casa." },
  { valor: "telefono", titulo: "Teléfono", pista: "Abre el teclado numérico en el móvil." },
  { valor: "lista", titulo: "Lista de opciones", pista: "El cliente elige una de las que tú pongas." },
  { valor: "parrafo", titulo: "Texto largo", pista: "Indicaciones, referencias, comentarios." },
];

/** Lo que casi todas las tiendas preguntan, para no empezar en blanco. */
const PLANTILLAS: PreguntaPedido[] = [
  { id: "", etiqueta: "Nombre completo", tipo: "texto", obligatoria: true },
  { id: "", etiqueta: "Teléfono", tipo: "telefono", obligatoria: true },
  { id: "", etiqueta: "Dirección de entrega", tipo: "parrafo", obligatoria: true },
  { id: "", etiqueta: "Nombre PH", tipo: "texto", obligatoria: false },
  { id: "", etiqueta: "Número Apto / Casa", tipo: "texto", obligatoria: false },
  {
    id: "",
    etiqueta: "Método de pago",
    tipo: "lista",
    obligatoria: true,
    opciones: ["Efectivo", "Yappy", "MercadoPago", "Tarjeta de crédito"],
  },
  {
    id: "",
    etiqueta: "Entrega",
    tipo: "lista",
    obligatoria: true,
    opciones: ["Retiro en tienda", "Delivery"],
  },
];

export function EditorPreguntas({
  preguntas,
  onCambio,
}: {
  preguntas: PreguntaPedido[];
  onCambio: (p: PreguntaPedido[]) => void;
}) {
  const [ps, setPs] = useState<PreguntaPedido[]>(() => JSON.parse(JSON.stringify(preguntas ?? [])));

  const guardar = (nuevas: PreguntaPedido[]) => {
    setPs(nuevas);
    onCambio(nuevas);
  };

  const set = (i: number, cambio: Partial<PreguntaPedido>) =>
    guardar(ps.map((p, j) => (j === i ? { ...p, ...cambio } : p)));

  const mover = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= ps.length) return;
    const copia = [...ps];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    guardar(copia);
  };

  const lleno = ps.length >= MAX_PREGUNTAS;
  const yaEsta = (etiqueta: string) =>
    ps.some((p) => p.etiqueta.trim().toLowerCase() === etiqueta.toLowerCase());

  return (
    <div>
      <div className="grid gap-3">
        {ps.map((p, i) => (
          <section key={i} className="rounded-2xl border border-linea p-3">
            <div className="flex items-start gap-2">
              <span className="mt-2.5 w-5 flex-none text-center text-xs font-bold text-ink-3">
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <input
                  value={p.etiqueta}
                  onChange={(e) => set(i, { etiqueta: e.target.value })}
                  placeholder="¿Qué le preguntas? Ej: Método de pago"
                  className="input-l font-semibold"
                />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TIPOS.map((t) => {
                    const esta = p.tipo === t.valor;
                    return (
                      <button
                        key={t.valor}
                        type="button"
                        title={t.pista}
                        onClick={() =>
                          set(i, {
                            tipo: t.valor,
                            // Al pasar a lista se arranca con dos casillas: una
                            // lista de una sola opción no es una elección.
                            ...(t.valor === "lista" && !(p.opciones ?? []).length
                              ? { opciones: ["", ""] }
                              : {}),
                          })
                        }
                        className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition"
                        style={
                          esta
                            ? { borderColor: "#6E42FF", backgroundColor: "rgba(110,66,255,.16)", color: "var(--ink)" }
                            : { borderColor: "var(--linea)", color: "var(--ink-2)" }
                        }
                      >
                        {t.titulo}
                      </button>
                    );
                  })}

                  <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
                    <input
                      type="checkbox"
                      checked={p.obligatoria}
                      onChange={(e) => set(i, { obligatoria: e.target.checked })}
                      className="h-3.5 w-3.5"
                      style={{ accentColor: "#6E42FF" }}
                    />
                    Obligatoria
                  </label>
                </div>

                <p className="mt-1 text-[11px] text-ink-3">
                  {TIPOS.find((t) => t.valor === p.tipo)?.pista}
                </p>

                {p.tipo === "lista" && (
                  <div className="mt-2 grid gap-1.5">
                    {(p.opciones ?? []).map((o, k) => (
                      <div key={k} className="flex items-center gap-2">
                        <input
                          value={o}
                          onChange={(e) =>
                            set(i, {
                              opciones: (p.opciones ?? []).map((x, m) => (m === k ? e.target.value : x)),
                            })
                          }
                          placeholder="Ej: Yappy"
                          className="input-l flex-1"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            set(i, { opciones: (p.opciones ?? []).filter((_, m) => m !== k) })
                          }
                          className="flex-none text-ink-3 transition hover:text-danger"
                          title="Quitar esta opción"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => set(i, { opciones: [...(p.opciones ?? []), ""] })}
                      className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-violet transition hover:opacity-80"
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar opción
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-none flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  className="text-ink-3 transition hover:text-ink disabled:opacity-25"
                  title="Subir"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={i === ps.length - 1}
                  className="text-ink-3 transition hover:text-ink disabled:opacity-25"
                  title="Bajar"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => guardar(ps.filter((_, j) => j !== i))}
                  className="text-ink-3 transition hover:text-danger"
                  title="Quitar esta pregunta"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-soft"
          disabled={lleno}
          onClick={() =>
            guardar([...ps, { id: "", etiqueta: "", tipo: "texto", obligatoria: false }])
          }
        >
          <Plus className="h-4 w-4" /> Pregunta
        </button>

        {/* CONTRA LA PÁGINA EN BLANCO. «Agregar pregunta» y un campo vacío no le
            dice a nadie qué se espera; «Método de pago» sí, y encima llega con
            sus opciones puestas para corregir en vez de inventar. */}
        {PLANTILLAS.filter((t) => !yaEsta(t.etiqueta)).map((t) => (
          <button
            key={t.etiqueta}
            type="button"
            disabled={lleno}
            onClick={() => guardar([...ps, JSON.parse(JSON.stringify(t))])}
            className="rounded-lg border border-linea px-2.5 py-1 text-xs text-ink-2 transition hover:text-ink disabled:opacity-40"
          >
            + {t.etiqueta}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-ink-2">
        {ps.length} de {MAX_PREGUNTAS}
        {lleno && " · es el máximo. Cada pregunta de más es un pedido menos terminado."}
      </p>
    </div>
  );
}
