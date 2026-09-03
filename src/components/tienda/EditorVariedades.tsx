"use client";

import { useState } from "react";
import { Plus, Trash2, X, Copy } from "lucide-react";
import { aCentavos, comoDinero, type GrupoVariedad, type ModoVariedad } from "@/lib/tienda/variedades";

/**
 * Las opciones de un producto, SIN ESCRIBIR NADA RARO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VERSIÓN ANTERIOR PEDÍA ESTO:
 *
 *     Sabor | hasta completar 3 | Pollo, Salmón {2.50}
 *
 * Y eso está bien para quien programa. Para la señora de la panadería es un
 * idioma que no habla: las barras, las llaves, y encima el orden importa. Si
 * para poner tres sabores hay que aprender una sintaxis, la tienda no se arma —
 * y una tienda a medias no vende.
 *
 * Aquí no hay nada que escribir salvo las palabras del negocio: el nombre del
 * grupo, el de cada opción, y cuánto cuesta más si cuesta más. Lo demás son
 * botones.
 *
 * LAS PLANTILLAS EXISTEN POR LA PÁGINA EN BLANCO. «Agregar grupo» y un cuadro
 * vacío no le dice a nadie qué se espera de él. «Tamaño», «Sabor», «Extras» sí:
 * se pulsa una, aparece con opciones de ejemplo, y se corrigen. Empezar
 * corrigiendo es mucho más fácil que empezar inventando.
 * ─────────────────────────────────────────────────────────────────────────────
 */

type Plantilla = { titulo: string; grupo: GrupoVariedad };

const PLANTILLAS: Plantilla[] = [
  {
    titulo: "Tamaño",
    grupo: {
      nombre: "Tamaño",
      modo: "una",
      opciones: [
        { texto: "Pequeño", recargo: 0 },
        { texto: "Mediano", recargo: 0 },
        { texto: "Grande", recargo: 0 },
      ],
    },
  },
  {
    titulo: "Peso",
    grupo: {
      nombre: "Peso",
      modo: "una",
      opciones: [
        { texto: "5 lbs.", recargo: 0 },
        { texto: "15 lbs.", recargo: 0 },
        { texto: "30 lbs.", recargo: 0 },
      ],
    },
  },
  {
    titulo: "Sabor",
    grupo: {
      nombre: "Sabor",
      modo: "una",
      opciones: [
        { texto: "Pollo", recargo: 0 },
        { texto: "Res", recargo: 0 },
        { texto: "Salmón", recargo: 0 },
      ],
    },
  },
  {
    titulo: "Talla",
    grupo: {
      nombre: "Talla",
      modo: "una",
      opciones: [
        { texto: "S", recargo: 0 },
        { texto: "M", recargo: 0 },
        { texto: "L", recargo: 0 },
        { texto: "XL", recargo: 0 },
      ],
    },
  },
  {
    titulo: "Extras",
    grupo: {
      nombre: "Extras",
      modo: "varias",
      opciones: [
        { texto: "Queso extra", recargo: 100 },
        { texto: "Salsa aparte", recargo: 0 },
      ],
    },
  },
];

const MODOS: { valor: ModoVariedad; titulo: string; pista: string }[] = [
  { valor: "una", titulo: "Elige una sola", pista: "Como el tamaño: o pequeño o grande, no los dos." },
  { valor: "varias", titulo: "Elige las que quiera", pista: "Como los extras: puede llevar todos o ninguno." },
  {
    valor: "hasta_completar",
    titulo: "Elige una cantidad exacta",
    pista: "Como una caja de 6: tiene que elegir 6 en total, repitiendo si quiere.",
  },
];

export function EditorVariedades({
  nombreProducto,
  grupos,
  moneda,
  otrosProductos,
  onGuardar,
  onCerrar,
}: {
  nombreProducto: string;
  grupos: GrupoVariedad[];
  moneda: string;
  /** Para copiar las opciones de otro producto que ya las tenga puestas. */
  otrosProductos: { nombre: string; variedades: GrupoVariedad[] }[];
  onGuardar: (g: GrupoVariedad[]) => void;
  onCerrar: () => void;
}) {
  const [gs, setGs] = useState<GrupoVariedad[]>(() => JSON.parse(JSON.stringify(grupos ?? [])));
  const [copiando, setCopiando] = useState(false);

  const setGrupo = (i: number, cambio: Partial<GrupoVariedad>) =>
    setGs((xs) => xs.map((g, j) => (j === i ? { ...g, ...cambio } : g)));

  const setOpcion = (i: number, k: number, cambio: Partial<{ texto: string; recargo: number }>) =>
    setGs((xs) =>
      xs.map((g, j) =>
        j === i ? { ...g, opciones: g.opciones.map((o, m) => (m === k ? { ...o, ...cambio } : o)) } : g,
      ),
    );

  const conOpciones = otrosProductos.filter((p) => p.variedades?.length);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-linea bg-tarjeta p-5">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Opciones del producto</h2>
            <p className="text-sm text-ink-2">{nombreProducto || "Producto sin nombre"}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-ink-2 transition hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 mt-2 text-sm leading-relaxed text-ink-2">
          Lo que el cliente elige antes de agregarlo al carrito: el tamaño, el sabor, los extras. Si
          alguna opción cuesta más, se escribe cuánto y se suma sola al precio.
        </p>

        {gs.length === 0 && (
          <div className="mb-4 rounded-2xl border border-linea-2 bg-suave p-4">
            <p className="text-sm text-ink-2">
              <b className="text-ink">Este producto se vende tal cual, sin opciones.</b> Si tiene
              tamaños, sabores o extras, empieza por una de estas:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PLANTILLAS.map((p) => (
                <button
                  key={p.titulo}
                  type="button"
                  className="btn-soft"
                  onClick={() => setGs((xs) => [...xs, JSON.parse(JSON.stringify(p.grupo))])}
                >
                  <Plus className="h-3.5 w-3.5" /> {p.titulo}
                </button>
              ))}
            </div>
            {conOpciones.length > 0 && (
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet transition hover:opacity-80"
                onClick={() => setCopiando(true)}
              >
                <Copy className="h-3.5 w-3.5" /> …o copiar las de otro producto
              </button>
            )}
          </div>
        )}

        {/* COPIAR DE OTRO PRODUCTO. En una tienda de comida, veinte platos
            llevan exactamente los mismos extras. Volver a teclearlos veinte
            veces es donde se abandona el catálogo. */}
        {copiando && (
          <div className="mb-4 rounded-2xl border border-linea-2 bg-suave p-3">
            <p className="mb-2 text-xs font-semibold text-ink-2">Copiar las opciones de…</p>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {conOpciones.map((p, i) => (
                <button
                  key={`${p.nombre}-${i}`}
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-left text-sm text-ink-2 transition hover:bg-tarjeta hover:text-ink"
                  onClick={() => {
                    setGs(JSON.parse(JSON.stringify(p.variedades)));
                    setCopiando(false);
                  }}
                >
                  {p.nombre}{" "}
                  <span className="text-xs text-ink-3">
                    ({p.variedades.map((g) => g.nombre).join(", ")})
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCopiando(false)}
              className="mt-2 text-xs text-ink-2 transition hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="grid gap-4">
          {gs.map((g, i) => (
            <section key={i} className="rounded-2xl border border-linea p-3">
              <div className="flex items-center gap-2">
                <input
                  value={g.nombre}
                  onChange={(e) => setGrupo(i, { nombre: e.target.value })}
                  placeholder="¿Qué elige? Ej: Tamaño"
                  className="input-l flex-1 font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setGs((xs) => xs.filter((_, j) => j !== i))}
                  className="flex-none text-ink-3 transition hover:text-danger"
                  title="Quitar este grupo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {MODOS.map((m) => {
                  const esta = g.modo === m.valor;
                  return (
                    <button
                      key={m.valor}
                      type="button"
                      onClick={() =>
                        setGrupo(i, {
                          modo: m.valor,
                          ...(m.valor === "hasta_completar" ? { cantidad: g.cantidad || 2 } : {}),
                        })
                      }
                      title={m.pista}
                      className="rounded-lg border px-2.5 py-1 text-xs font-semibold transition"
                      style={
                        esta
                          ? { borderColor: "#6E42FF", backgroundColor: "rgba(110,66,255,.16)", color: "var(--ink)" }
                          : { borderColor: "var(--linea)", color: "var(--ink-2)" }
                      }
                    >
                      {m.titulo}
                    </button>
                  );
                })}
                {g.modo === "hasta_completar" && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                    <input
                      value={g.cantidad ?? 2}
                      onChange={(e) =>
                        setGrupo(i, { cantidad: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })
                      }
                      inputMode="numeric"
                      className="w-14 rounded-lg border border-linea bg-transparent px-2 py-1 text-center text-ink"
                    />
                    en total
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-[11px] text-ink-3">
                {MODOS.find((m) => m.valor === g.modo)?.pista}
              </p>

              <div className="mt-3 grid gap-1.5">
                {g.opciones.map((o, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <input
                      value={o.texto}
                      onChange={(e) => setOpcion(i, k, { texto: e.target.value })}
                      placeholder="Nombre de la opción"
                      className="input-l flex-1"
                    />
                    <span className="flex flex-none items-center gap-1 text-xs text-ink-2">
                      cuesta más
                      <input
                        value={o.recargo ? (o.recargo / 100).toFixed(2) : ""}
                        onChange={(e) => setOpcion(i, k, { recargo: aCentavos(e.target.value) })}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="w-20 rounded-lg border border-linea bg-transparent px-2 py-1.5 text-right text-ink"
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setGs((xs) =>
                          xs.map((x, j) =>
                            j === i ? { ...x, opciones: x.opciones.filter((_, m) => m !== k) } : x,
                          ),
                        )
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
                  className="mt-1 inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-violet transition hover:opacity-80"
                  onClick={() =>
                    setGs((xs) =>
                      xs.map((x, j) =>
                        j === i ? { ...x, opciones: [...x.opciones, { texto: "", recargo: 0 }] } : x,
                      ),
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar opción
                </button>
              </div>
            </section>
          ))}
        </div>

        {gs.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-soft"
              onClick={() =>
                setGs((xs) => [...xs, { nombre: "", modo: "una", opciones: [{ texto: "", recargo: 0 }] }])
              }
            >
              <Plus className="h-4 w-4" /> Otro grupo
            </button>
            {PLANTILLAS.filter((p) => !gs.some((g) => g.nombre === p.titulo)).map((p) => (
              <button
                key={p.titulo}
                type="button"
                className="rounded-lg border border-linea px-2.5 py-1 text-xs text-ink-2 transition hover:text-ink"
                onClick={() => setGs((xs) => [...xs, JSON.parse(JSON.stringify(p.grupo))])}
              >
                + {p.titulo}
              </button>
            ))}
            {conOpciones.length > 0 && (
              <button
                type="button"
                className="rounded-lg border border-linea px-2.5 py-1 text-xs text-ink-2 transition hover:text-ink"
                onClick={() => setCopiando(true)}
              >
                Copiar de otro producto
              </button>
            )}
          </div>
        )}

        {/* LO QUE VA A VER EL CLIENTE, en su idioma y con el dinero ya sumado.
            Sin esto, nadie sabe si «cuesta más 2.50» es el precio final o el
            recargo — y esa duda se paga cobrando mal. */}
        {gs.some((g) => g.opciones.some((o) => o.recargo)) && (
          <p className="mt-4 rounded-xl border border-linea-2 bg-suave p-3 text-xs text-ink-2">
            <b className="text-ink">Así lo verá tu cliente:</b>{" "}
            {gs
              .flatMap((g) => g.opciones.filter((o) => o.recargo && o.texto))
              .slice(0, 3)
              .map((o) => `${o.texto} (+${comoDinero(o.recargo, moneda)})`)
              .join(" · ")}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button type="button" className="btn-primary" onClick={() => onGuardar(gs)}>
            Listo
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="text-sm text-ink-2 transition hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
