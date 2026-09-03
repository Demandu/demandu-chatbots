"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Trash2, ClipboardPaste, X } from "lucide-react";
import { comoDinero, type GrupoVariedad } from "@/lib/tienda/variedades";
import { escribirGrupos, leerGruposEscritos } from "@/lib/tienda/escritura";
import { leerPegado } from "@/lib/tienda/pegar";
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

/** Una fila mientras se edita: todo texto, porque es lo que hay en las casillas. */
type Fila = {
  /** Vacío = producto nuevo, todavía sin guardar. */
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio: string;
  precio_anterior: string;
  stock: string;
  oculto: boolean;
  imagen_url: string;
  variedades: string;
};

const dinero = (c: number | null) => (c === null || c === 0 ? "" : (c / 100).toFixed(2));

function aFila(p: Producto): Fila {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    categoria: p.categoria ?? "",
    precio: dinero(p.precio),
    precio_anterior: dinero(p.precio_anterior),
    stock: p.stock === null ? "" : String(p.stock),
    oculto: p.oculto,
    imagen_url: p.imagen_url ?? "",
    variedades: escribirGrupos(p.variedades),
  };
}

const FILA_VACIA: Fila = {
  id: "",
  nombre: "",
  descripcion: "",
  categoria: "",
  precio: "",
  precio_anterior: "",
  stock: "",
  oculto: false,
  imagen_url: "",
  variedades: "",
};

function Guardar({ cuantos }: { cuantos: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending || cuantos === 0}>
      {pending
        ? "Guardando…"
        : cuantos === 0
          ? "Sin cambios"
          : `Guardar ${cuantos} cambio${cuantos === 1 ? "" : "s"}`}
    </button>
  );
}

/**
 * El catálogo, como una hoja de cálculo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES ERA UNA VENTANITA POR PRODUCTO Y ESTABA MAL. Con cincuenta productos,
 * abrir, escribir, guardar y cerrar cincuenta veces no lo hace nadie: se
 * abandona a la mitad y el catálogo se queda en la hoja vieja para siempre. La
 * forma correcta de editar una tabla es una tabla.
 *
 * Y SE PUEDE PEGAR DESDE GOOGLE SHEETS. Al copiar celdas, el portapapeles trae
 * texto separado por tabulaciones; eso significa que migrar una tienda entera
 * es seleccionar, copiar, pegar — sin integración, sin permisos y sin que la
 * hoja tenga que ser pública.
 *
 * SE GUARDA TODO DE UNA VEZ, no casilla por casilla. Guardar en cada tecla
 * convierte una corrección en cincuenta escrituras y, cuando la red falla a
 * mitad de camino, deja el catálogo a medio cambiar sin que nadie lo sepa. Aquí
 * lo que no se ha guardado se ve marcado, y se guarda cuando el negocio decide.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Productos({
  tiendaId,
  productos,
  moneda,
  guardar,
}: {
  tiendaId: string;
  productos: Producto[];
  moneda: string;
  guardar: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const originales = useMemo(() => productos.map(aFila), [productos]);
  const [filas, setFilas] = useState<Fila[]>(originales);
  const [borradas, setBorradas] = useState<string[]>([]);
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState("");
  const [estado, enviar] = useFormState(guardar, { ok: false, mensaje: "" });

  const porId = useMemo(() => new Map(originales.map((f) => [f.id, f])), [originales]);
  const cambiada = (f: Fila) => {
    if (!f.id) return f.nombre.trim() !== "";
    const o = porId.get(f.id);
    return !o || JSON.stringify(o) !== JSON.stringify(f);
  };
  const pendientes = filas.filter(cambiada).length + borradas.length;

  const set = (i: number, campo: keyof Fila, valor: string | boolean) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  const quitar = (i: number) => {
    const f = filas[i];
    if (f.id) setBorradas((b) => [...b, f.id]);
    setFilas((xs) => xs.filter((_, j) => j !== i));
  };

  const pegar = () => {
    const nuevas = leerPegado(texto).map((p) => ({
      id: "",
      nombre: p.nombre,
      descripcion: p.descripcion,
      categoria: p.categoria,
      precio: dinero(p.precio),
      precio_anterior: dinero(p.precio_anterior),
      stock: p.stock === null ? "" : String(p.stock),
      oculto: p.oculto,
      imagen_url: p.imagen_url,
      variedades: escribirGrupos(p.variedades),
    }));
    if (!nuevas.length) return;
    // SE AÑADEN, NO SE SUSTITUYE. Pegar encima borraría en un segundo un
    // catálogo entero por una selección equivocada, y sin manera de deshacer.
    setFilas((f) => [...f.filter((x) => x.nombre.trim() || x.id), ...nuevas]);
    setTexto("");
    setPegando(false);
  };

  const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))];
  const total = filas.reduce((s, f) => {
    const n = Number(String(f.precio).replace(",", "."));
    return s + (Number.isFinite(n) ? Math.round(n * 100) : 0);
  }, 0);

  return (
    <form action={enviar}>
      <input type="hidden" name="tienda_id" value={tiendaId} />
      {/* La tabla entera viaja como un solo campo. Un `input` por casilla serían
          quinientos campos en el formulario y ningún control sobre el orden. */}
      <input type="hidden" name="filas" value={JSON.stringify(filas)} />
      <input type="hidden" name="borradas" value={JSON.stringify(borradas)} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {filas.length} producto{filas.length === 1 ? "" : "s"}
          {categorias.length > 0 && ` · ${categorias.length} categoría${categorias.length === 1 ? "" : "s"}`}
          {filas.length > 0 && ` · catálogo de ${comoDinero(total, moneda)} en precios de lista`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-soft" onClick={() => setPegando(true)}>
            <ClipboardPaste className="h-4 w-4" /> Pegar desde una hoja
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => setFilas((f) => [...f, { ...FILA_VACIA }])}
          >
            <Plus className="h-4 w-4" /> Fila
          </button>
          <Guardar cuantos={pendientes} />
        </div>
      </div>

      {estado.mensaje && (
        <p className={`mb-3 text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
          {estado.mensaje}
        </p>
      )}

      {pendientes > 0 && (
        <p className="mb-3 text-xs text-warning">
          Tienes {pendientes} cambio{pendientes === 1 ? "" : "s"} sin guardar. Si sales ahora, se
          pierden.
        </p>
      )}

      {filas.length === 0 ? (
        <div className="rounded-2xl border border-linea-2 bg-tarjeta p-5 text-sm leading-relaxed text-ink-2">
          <b className="text-ink">Trae tu catálogo de una vez.</b>
          <p className="mt-1">
            Abre tu hoja de cálculo, selecciona las filas de productos con sus encabezados, copia, y
            pulsa <b className="text-ink">Pegar desde una hoja</b>. Se entienden tus columnas tal y
            como están: Nombre, Descripcion, Variedades, Variedades2, Precio, Ocultar, Categoria…
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="bg-tarjeta text-left text-xs font-semibold uppercase tracking-wide text-ink-2">
                <th className="px-2 py-2">Nombre</th>
                <th className="px-2 py-2">Descripción</th>
                <th className="px-2 py-2">Categoría</th>
                <th className="w-24 px-2 py-2">Precio</th>
                <th className="w-24 px-2 py-2">Antes</th>
                <th className="w-20 px-2 py-2">Stock</th>
                <th className="w-16 px-2 py-2" title="Escóndelo del escaparate sin borrarlo">
                  Ocultar
                </th>
                <th className="px-2 py-2">Foto</th>
                <th className="px-2 py-2">Variedades</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const nueva = !f.id;
                const editada = cambiada(f);
                return (
                  <tr
                    key={f.id || `nueva-${i}`}
                    className="border-t border-linea align-top"
                    style={
                      editada
                        ? { backgroundColor: nueva ? "rgba(16,185,129,.07)" : "rgba(245,158,11,.07)" }
                        : undefined
                    }
                  >
                    <td className="p-1">
                      <input
                        value={f.nombre}
                        onChange={(e) => set(i, "nombre", e.target.value)}
                        className="w-full min-w-[160px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink outline-none focus:border-linea-2 focus:bg-tarjeta"
                        placeholder="Nombre del producto"
                      />
                    </td>
                    <td className="p-1">
                      <textarea
                        rows={1}
                        value={f.descripcion}
                        onChange={(e) => set(i, "descripcion", e.target.value)}
                        className="w-full min-w-[180px] resize-y rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink-2 outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={f.categoria}
                        onChange={(e) => set(i, "categoria", e.target.value)}
                        list="cats-tienda"
                        className="w-full min-w-[110px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ink-2 outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={f.precio}
                        onChange={(e) => set(i, "precio", e.target.value)}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-ink outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={f.precio_anterior}
                        onChange={(e) => set(i, "precio_anterior", e.target.value)}
                        inputMode="decimal"
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-ink-2 outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={f.stock}
                        onChange={(e) => set(i, "stock", e.target.value)}
                        inputMode="numeric"
                        placeholder="—"
                        title="Vacío = sin control de existencias. 0 = agotado."
                        className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-ink-2 outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={f.oculto}
                        onChange={(e) => set(i, "oculto", e.target.checked)}
                        className="mt-1.5 h-4 w-4"
                        style={{ accentColor: "#6E42FF" }}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={f.imagen_url}
                        onChange={(e) => set(i, "imagen_url", e.target.value)}
                        placeholder="https://…"
                        className="w-full min-w-[120px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-xs text-ink-2 outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                    </td>
                    <td className="p-1">
                      <textarea
                        rows={1}
                        value={f.variedades}
                        onChange={(e) => set(i, "variedades", e.target.value)}
                        placeholder="Sabor | una | Pollo, Salmón {2.50}"
                        title="Grupo | cómo se elige | opciones. Entre llaves, lo que suma al precio."
                        className="w-full min-w-[200px] resize-y rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-[11px] text-ink-2 outline-none focus:border-linea-2 focus:bg-tarjeta"
                      />
                      {/* Lo que el cliente va a ver de verdad, contado en corto:
                          la línea escrita es cómoda para editar pero difícil de
                          revisar de un vistazo. */}
                      {f.variedades.trim() && (
                        <p className="px-1.5 pt-0.5 text-[10px] text-ink-3">
                          {leerGruposEscritos(f.variedades)
                            .map((g) => `${g.nombre}: ${g.opciones.length}`)
                            .join(" · ") || "no se entiende: revisa las barras"}
                        </p>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        className="mt-1 text-ink-3 transition hover:text-danger"
                        title="Quitar esta fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="cats-tienda">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      )}

      {filas.length > 0 && (
        <p className="mt-3 text-xs text-ink-2">
          Verde = producto nuevo. Ámbar = con cambios sin guardar. Las variedades se escriben{" "}
          <code className="text-ink">Grupo | una · varias · hasta completar 3 | Opción, Otra {"{2.50}"}</code>.
        </p>
      )}

      {pegando && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-linea bg-tarjeta p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink">Pegar desde una hoja</h2>
              <button
                type="button"
                onClick={() => setPegando(false)}
                className="text-ink-2 transition hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-ink-2">
              En tu hoja, selecciona los productos <b className="text-ink">con la fila de
              encabezados</b>, copia, y pega aquí. Se reconocen tus nombres de columna tal y como
              están.
            </p>
            <textarea
              autoFocus
              rows={8}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text/plain");
                if (t) {
                  e.preventDefault();
                  setTexto(t);
                }
              }}
              placeholder={"Nombre\tPrecio\tCategoria\nCroquetas\t12.50\tRoyal Canin"}
              className="input-l font-mono text-xs"
            />
            <p className="mt-2 text-xs text-ink-2">
              {texto.trim()
                ? `Se van a agregar ${leerPegado(texto).length} producto(s). Se suman a los que ya tienes; no se borra nada.`
                : "Nada pegado todavía."}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                className="btn-primary"
                onClick={pegar}
                disabled={leerPegado(texto).length === 0}
              >
                Agregar a la tabla
              </button>
              <button
                type="button"
                onClick={() => setPegando(false)}
                className="text-sm text-ink-2 transition hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
