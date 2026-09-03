"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Pencil, EyeOff, X } from "lucide-react";
import { comoDinero, type GrupoVariedad } from "@/lib/tienda/variedades";
import { escribirGrupos } from "@/lib/tienda/escritura";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

export type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  precio_anterior: number | null;
  oculto: boolean;
  stock: number | null;
  imagen_url: string | null;
  variedades: GrupoVariedad[];
};

function Guardar({ texto }: { texto: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : texto}
    </button>
  );
}

function Borrar() {
  const { pending } = useFormStatus();
  return (
    <button
      className="text-sm font-semibold text-danger transition hover:opacity-80"
      disabled={pending}
    >
      {pending ? "Borrando…" : "Borrar"}
    </button>
  );
}

/**
 * El catálogo de una tienda.
 *
 * LOS PRECIOS SE ESCRIBEN EN DINERO Y SE GUARDAN EN CENTAVOS. Aquí se enseñan
 * con dos decimales siempre: «12.5» y «12.50» son el mismo número para el
 * programa, pero solo uno de los dos parece un precio.
 *
 * LAS VARIEDADES SE ESCRIBEN IGUAL QUE EN LA HOJA que ya usan. Es la decisión
 * que hace que migrar una tienda sea copiar y pegar en vez de rehacerla
 * producto por producto.
 */
export function Productos({
  tiendaId,
  productos,
  moneda,
  guardar,
  borrar,
}: {
  tiendaId: string;
  productos: Producto[];
  moneda: string;
  guardar: (e: Estado, fd: FormData) => Promise<Estado>;
  borrar: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  // `null` = cerrado; `{}` = nuevo; un producto = editando ese.
  const [editando, setEditando] = useState<Partial<Producto> | null>(null);
  const [estado, enviarGuardar] = useFormState(guardar, { ok: false, mensaje: "" });
  const [estadoBorrar, enviarBorrar] = useFormState(borrar, { ok: false, mensaje: "" });

  const categorias = [...new Set(productos.map((p) => p.categoria).filter(Boolean))] as string[];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {productos.length === 0
            ? "Todavía no hay productos."
            : `${productos.length} producto${productos.length === 1 ? "" : "s"}`}
          {categorias.length > 0 && ` · ${categorias.length} categoría${categorias.length === 1 ? "" : "s"}`}
        </p>
        <button type="button" className="btn-primary" onClick={() => setEditando({})}>
          <Plus className="h-4 w-4" /> Agregar producto
        </button>
      </div>

      {(estado.mensaje || estadoBorrar.mensaje) && !editando && (
        <p
          className={`mb-3 text-sm ${
            estado.ok || estadoBorrar.ok ? "text-emerald-400" : "text-danger"
          }`}
        >
          {estado.mensaje || estadoBorrar.mensaje}
        </p>
      )}

      {productos.length === 0 ? (
        <div className="rounded-2xl border border-linea-2 bg-tarjeta p-5 text-sm leading-relaxed text-ink-2">
          <b className="text-ink">Empieza por un producto.</b>
          <p className="mt-1">
            Si ya tienes tu catálogo en una hoja de cálculo, escríbelo aquí igual que allá — las
            variedades con su recargo entre llaves funcionan tal cual: <code>Pollo, Salmón {"{2.50}"}</code>.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {productos.map((p) => (
            <div key={p.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{p.nombre}</p>
                  {p.categoria && <p className="truncate text-xs text-ink-2">{p.categoria}</p>}
                </div>
                {p.oculto && (
                  <span className="flex flex-none items-center gap-1 rounded-full bg-surface-border px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                    <EyeOff className="h-3 w-3" /> oculto
                  </span>
                )}
              </div>

              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-lg font-bold text-ink">{comoDinero(p.precio, moneda)}</span>
                {p.precio_anterior ? (
                  <span className="text-xs text-ink-2 line-through">
                    {comoDinero(p.precio_anterior, moneda)}
                  </span>
                ) : null}
              </p>

              <p className="mt-1 text-xs text-ink-2">
                {p.stock === null
                  ? "sin control de existencias"
                  : p.stock === 0
                    ? "agotado"
                    : `${p.stock} en existencia`}
                {p.variedades?.length ? ` · ${p.variedades.length} grupo${p.variedades.length === 1 ? "" : "s"} de variedades` : ""}
              </p>

              <button
                type="button"
                onClick={() => setEditando(p)}
                className="mt-3 inline-flex items-center gap-1.5 self-start text-xs font-semibold text-violet transition hover:opacity-80"
              >
                <Pencil className="h-3 w-3" /> Editar
              </button>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-linea bg-tarjeta p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink">
                {editando.id ? "Editar producto" : "Nuevo producto"}
              </h2>
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="text-ink-2 transition hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={(fd) => {
                enviarGuardar(fd);
                setEditando(null);
              }}
              className="grid gap-3"
            >
              <input type="hidden" name="tienda_id" value={tiendaId} />
              {editando.id && <input type="hidden" name="producto_id" value={editando.id} />}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre</label>
                  <input name="nombre" required defaultValue={editando.nombre ?? ""} className="input-l" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">Precio</label>
                  <input
                    name="precio"
                    defaultValue={editando.precio ? (editando.precio / 100).toFixed(2) : ""}
                    placeholder="12.50"
                    className="input-l"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                    Antes costaba (opcional)
                  </label>
                  <input
                    name="precio_anterior"
                    defaultValue={
                      editando.precio_anterior ? (editando.precio_anterior / 100).toFixed(2) : ""
                    }
                    placeholder="15.00"
                    className="input-l"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">Categoría</label>
                  <input
                    name="categoria"
                    defaultValue={editando.categoria ?? ""}
                    placeholder="Royal Canin"
                    className="input-l"
                    list="categorias-tienda"
                  />
                  <datalist id="categorias-tienda">
                    {categorias.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                    Existencias (vacío = sin control)
                  </label>
                  <input
                    name="stock"
                    inputMode="numeric"
                    defaultValue={editando.stock ?? ""}
                    className="input-l"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                    Enlace de la foto
                  </label>
                  <input
                    name="imagen_url"
                    defaultValue={editando.imagen_url ?? ""}
                    placeholder="https://…/producto.jpg"
                    className="input-l"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                    Descripción
                  </label>
                  <textarea
                    name="descripcion"
                    rows={2}
                    defaultValue={editando.descripcion ?? ""}
                    className="input-l"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-2">
                  Variedades — una por línea
                </label>
                <textarea
                  name="variedades"
                  rows={3}
                  defaultValue={escribirGrupos(editando.variedades ?? [])}
                  placeholder={"Tamaño | una | 5 lbs., 15 lbs. {3}\nSabor | hasta completar 3 | Pollo, Salmón {2.50}"}
                  className="input-l font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-ink-2">
                  Nombre del grupo, cómo se elige (<code className="text-ink">una</code>,{" "}
                  <code className="text-ink">varias</code> o{" "}
                  <code className="text-ink">hasta completar 3</code>) y las opciones. Entre llaves,
                  lo que suma esa opción al precio.
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="oculto"
                  defaultChecked={editando.oculto ?? false}
                  className="h-4 w-4"
                  style={{ accentColor: "#6E42FF" }}
                />
                Esconderlo del escaparate (sin borrarlo)
              </label>

              <div className="mt-2 flex items-center gap-3">
                <Guardar texto={editando.id ? "Guardar cambios" : "Agregar producto"} />
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="text-sm text-ink-2 transition hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
            </form>

            {editando.id && (
              <form
                action={(fd) => {
                  enviarBorrar(fd);
                  setEditando(null);
                }}
                className="mt-4 border-t border-linea pt-3"
              >
                <input type="hidden" name="tienda_id" value={tiendaId} />
                <input type="hidden" name="producto_id" value={editando.id} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-2">
                    Borrar es para siempre. Para sacarlo del escaparate y conservarlo, usa
                    «esconderlo».
                  </p>
                  <Borrar />
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
