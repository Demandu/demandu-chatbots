"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Plus, Trash2, ClipboardPaste, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { comoDinero, type GrupoVariedad } from "@/lib/tienda/variedades";
import { leerPegado } from "@/lib/tienda/pegar";
import { EditorVariedades } from "./EditorVariedades";
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

/** Una fila mientras se edita. El dinero es texto: es lo que hay en la casilla. */
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
  /** Ya no es texto con barras: son los grupos de verdad. */
  variedades: GrupoVariedad[];
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
    variedades: Array.isArray(p.variedades) ? p.variedades : [],
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
  variedades: [],
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

const casilla =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-linea-2 focus:bg-tarjeta";

/**
 * El catálogo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS CORRECCIONES DE RUMBO, LAS DOS POR LO MISMO: quien arma la tienda no
 * sabe de esto, y cada obstáculo es una tienda que se queda a medias.
 *
 * 1. Era una ventanita por producto. Con cincuenta productos eso son cincuenta
 *    veces abrir, escribir, guardar y cerrar: nadie lo termina. Ahora es una
 *    tabla, que es la forma natural de repasar y corregir muchos precios.
 *
 * 2. La tabla pedía las opciones así: `Sabor | hasta completar 3 | Pollo,
 *    Salmón {2.50}`. Eso es un idioma de programador. Ahora la columna es un
 *    BOTÓN que abre una pantalla con casillas y botones, sin sintaxis ninguna.
 *
 * Y ARRANCA CON POCAS COLUMNAS —foto, nombre, precio, categoría y opciones—
 * porque diez columnas de golpe asustan y ocho de ellas casi nunca se tocan.
 * «Más columnas» destapa el resto para quien las necesita.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Productos({
  tiendaId,
  productos,
  moneda,
  guardar,
  vaciar,
}: {
  tiendaId: string;
  productos: Producto[];
  moneda: string;
  guardar: (e: Estado, fd: FormData) => Promise<Estado>;
  vaciar: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const originales = useMemo(() => productos.map(aFila), [productos]);
  const [filas, setFilas] = useState<Fila[]>(originales);
  const [borradas, setBorradas] = useState<string[]>([]);
  const [pegando, setPegando] = useState(false);
  const [texto, setTexto] = useState("");
  const [todo, setTodo] = useState(false);
  const [opcionesDe, setOpcionesDe] = useState<number | null>(null);
  const [estado, enviar] = useFormState(guardar, { ok: false, mensaje: "" });
  const [vaciando, setVaciando] = useState(false);
  const [palabra, setPalabra] = useState("");
  const [estadoVaciar, enviarVaciar] = useFormState(vaciar, { ok: false, mensaje: "" });

  /*
   * LA TABLA SE VUELVE A LEER CUANDO EL SERVIDOR CAMBIA.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ESTO NACIÓ DE UN FALLO CON DIENTES. Alex vació el catálogo: los 96
   * productos se borraron de verdad en la base, y la pantalla siguió
   * enseñándolos como si nada. `useState(originales)` solo mira su valor
   * inicial la PRIMERA vez que se monta el componente; después, aunque el
   * servidor mande otra cosa, el estado se queda con lo de antes.
   *
   * Enseñar datos viejos ya es malo. Lo peligroso es lo siguiente: esas 96
   * filas seguían siendo filas «sin id», así que pulsar Guardar las habría
   * vuelto a crear TODAS. El cliente borra su catálogo, guarda cualquier
   * cosa, y el catálogo resucita — y no hay forma de que entienda por qué.
   *
   * Se compara una FIRMA del contenido, no la identidad del array: cada
   * render del servidor crea un array nuevo, así que comparar referencias
   * borraría lo que estás escribiendo en cada refresco. Con la firma, solo se
   * resincroniza cuando los datos cambiaron de verdad — que es justo cuando
   * hay que hacerlo: acabas de guardar, de vaciar, o alguien más editó.
   * ─────────────────────────────────────────────────────────────────────────
   */
  const firma = useMemo(() => JSON.stringify(originales), [originales]);
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) {
    setFirmaVista(firma);
    setFilas(originales);
    setBorradas([]);
    setOpcionesDe(null);
  }

  const porId = useMemo(() => new Map(originales.map((f) => [f.id, f])), [originales]);
  const cambiada = (f: Fila) => {
    if (!f.id) return f.nombre.trim() !== "";
    const o = porId.get(f.id);
    return !o || JSON.stringify(o) !== JSON.stringify(f);
  };
  const pendientes = filas.filter(cambiada).length + borradas.length;

  const set = (i: number, campo: keyof Fila, valor: string | boolean | GrupoVariedad[]) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  const quitar = (i: number) => {
    const f = filas[i];
    if (f.id) setBorradas((b) => [...b, f.id]);
    setFilas((xs) => xs.filter((_, j) => j !== i));
  };

  const pegar = () => {
    const nuevas: Fila[] = leerPegado(texto).map((p) => ({
      id: "",
      nombre: p.nombre,
      descripcion: p.descripcion,
      categoria: p.categoria,
      precio: dinero(p.precio),
      precio_anterior: dinero(p.precio_anterior),
      stock: p.stock === null ? "" : String(p.stock),
      oculto: p.oculto,
      imagen_url: p.imagen_url,
      variedades: p.variedades,
    }));
    if (!nuevas.length) return;
    // SE AÑADEN, NO SE SUSTITUYE. Pegar encima borraría en un segundo un
    // catálogo entero por una selección equivocada, y sin manera de deshacer.
    setFilas((f) => [...f.filter((x) => x.nombre.trim() || x.id), ...nuevas]);
    setTexto("");
    setPegando(false);
  };

  const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))];

  return (
    <>
    <form action={enviar}>
      <input type="hidden" name="tienda_id" value={tiendaId} />
      {/* La tabla entera viaja como un solo campo: un `input` por casilla serían
          quinientos campos y ningún control sobre el orden. */}
      <input type="hidden" name="filas" value={JSON.stringify(filas)} />
      <input type="hidden" name="borradas" value={JSON.stringify(borradas)} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {filas.length} producto{filas.length === 1 ? "" : "s"}
          {categorias.length > 0 &&
            ` · ${categorias.length} categoría${categorias.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-soft"
            onClick={() => setTodo((v) => !v)}
            title="Descripción, precio anterior, existencias y ocultar"
          >
            <SlidersHorizontal className="h-4 w-4" /> {todo ? "Menos columnas" : "Más columnas"}
          </button>
          <button type="button" className="btn-soft" onClick={() => setPegando(true)}>
            <ClipboardPaste className="h-4 w-4" /> Pegar desde una hoja
          </button>
          <button
            type="button"
            className="btn-soft"
            onClick={() => setFilas((f) => [...f, { ...FILA_VACIA }])}
          >
            <Plus className="h-4 w-4" /> Producto
          </button>
          <Guardar cuantos={pendientes} />
        </div>
      </div>

      {estado.mensaje && (
        <p className={`mb-3 text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
          {estado.mensaje}
        </p>
      )}

      {estadoVaciar.mensaje && (
        <p className={`mb-3 text-sm ${estadoVaciar.ok ? "text-emerald-400" : "text-danger"}`}>
          {estadoVaciar.mensaje}
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
          <b className="text-ink">Empieza por tus productos.</b>
          <p className="mt-1">
            Si ya los tienes en una hoja de cálculo, pulsa{" "}
            <b className="text-ink">Pegar desde una hoja</b>: copias las filas y entran todas de una
            vez. Si no, <b className="text-ink">Producto</b> agrega uno en blanco.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-tarjeta text-left text-xs font-semibold uppercase tracking-wide text-ink-2">
                <th className="w-12 px-2 py-2">Foto</th>
                <th className="px-2 py-2">Producto</th>
                <th className="px-2 py-2">Categoría</th>
                <th className="w-24 px-2 py-2 text-right">Precio</th>
                {todo && <th className="w-24 px-2 py-2 text-right">Antes</th>}
                {todo && <th className="w-20 px-2 py-2 text-right">Existencias</th>}
                {todo && <th className="w-16 px-2 py-2">Ocultar</th>}
                <th className="w-40 px-2 py-2">Opciones</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const nueva = !f.id;
                const editada = cambiada(f);
                const cuantasOpciones = f.variedades.reduce(
                  (n, g) => n + (g.opciones?.length ?? 0),
                  0,
                );
                return (
                  <tr
                    key={f.id || `nueva-${i}`}
                    className="border-t border-linea align-top"
                    style={
                      editada
                        ? {
                            backgroundColor: nueva
                              ? "rgba(16,185,129,.07)"
                              : "rgba(245,158,11,.07)",
                          }
                        : undefined
                    }
                  >
                    {/* La foto se ve, no se adivina por su enlace. Un enlace
                        roto pintado como texto pasa desapercibido hasta que un
                        cliente ve el hueco en la tienda. */}
                    <td className="p-1">
                      <label className="block cursor-pointer" title="Pega aquí el enlace de la foto">
                        {f.imagen_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={f.imagen_url}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="grid h-10 w-10 place-items-center rounded-lg border border-dashed border-linea-2 text-[10px] text-ink-3">
                            foto
                          </span>
                        )}
                        <input
                          value={f.imagen_url}
                          onChange={(e) => set(i, "imagen_url", e.target.value)}
                          className="sr-only"
                          aria-label="Enlace de la foto"
                        />
                      </label>
                    </td>

                    <td className="p-1">
                      <input
                        value={f.nombre}
                        onChange={(e) => set(i, "nombre", e.target.value)}
                        className={`${casilla} min-w-[160px] text-ink`}
                        placeholder="Nombre del producto"
                      />
                      {todo && (
                        <textarea
                          rows={1}
                          value={f.descripcion}
                          onChange={(e) => set(i, "descripcion", e.target.value)}
                          placeholder="Descripción"
                          className={`${casilla} mt-1 min-w-[160px] resize-y text-xs text-ink-2`}
                        />
                      )}
                      {/* El enlace de la foto, aquí y no en su columna: en la
                          columna ocupaba el ancho de dos y casi nunca se toca. */}
                      {todo && (
                        <input
                          value={f.imagen_url}
                          onChange={(e) => set(i, "imagen_url", e.target.value)}
                          placeholder="https://…  (enlace de la foto)"
                          className={`${casilla} mt-1 min-w-[160px] text-[11px] text-ink-3`}
                        />
                      )}
                    </td>

                    <td className="p-1">
                      <input
                        value={f.categoria}
                        onChange={(e) => set(i, "categoria", e.target.value)}
                        list="cats-tienda"
                        placeholder="—"
                        className={`${casilla} min-w-[110px] text-ink-2`}
                      />
                    </td>

                    <td className="p-1">
                      <input
                        value={f.precio}
                        onChange={(e) => set(i, "precio", e.target.value)}
                        inputMode="decimal"
                        placeholder="0.00"
                        className={`${casilla} text-right text-ink`}
                      />
                    </td>

                    {todo && (
                      <td className="p-1">
                        <input
                          value={f.precio_anterior}
                          onChange={(e) => set(i, "precio_anterior", e.target.value)}
                          inputMode="decimal"
                          title="El precio tachado. Solo se pinta si es mayor que el precio."
                          className={`${casilla} text-right text-ink-2`}
                        />
                      </td>
                    )}

                    {todo && (
                      <td className="p-1">
                        <input
                          value={f.stock}
                          onChange={(e) => set(i, "stock", e.target.value)}
                          inputMode="numeric"
                          placeholder="—"
                          title="Vacío = no llevas control. 0 = agotado."
                          className={`${casilla} text-right text-ink-2`}
                        />
                      </td>
                    )}

                    {todo && (
                      <td className="p-1 text-center">
                        <input
                          type="checkbox"
                          checked={f.oculto}
                          onChange={(e) => set(i, "oculto", e.target.checked)}
                          className="mt-1.5 h-4 w-4"
                          style={{ accentColor: "#6E42FF" }}
                        />
                      </td>
                    )}

                    {/* NADA DE SINTAXIS. Un botón que dice lo que hay dentro. */}
                    <td className="p-1">
                      <button
                        type="button"
                        onClick={() => setOpcionesDe(i)}
                        className="w-full rounded-lg border border-linea px-2 py-1.5 text-left text-xs transition hover:border-violet"
                      >
                        {f.variedades.length === 0 ? (
                          <span className="text-ink-3">Sin opciones · agregar</span>
                        ) : (
                          <span className="text-ink-2">
                            {f.variedades.map((g) => g.nombre).filter(Boolean).join(" · ")}{" "}
                            <span className="text-ink-3">({cuantasOpciones})</span>
                          </span>
                        )}
                        <ChevronDown className="ml-1 inline h-3 w-3 text-ink-3" />
                      </button>
                    </td>

                    <td className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        className="mt-1 text-ink-3 transition hover:text-danger"
                        title="Quitar este producto"
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

      {/* ABAJO Y DISCRETO, LEJOS DE GUARDAR. Un botón de borrar todo al lado del
          de guardar se pulsa por error, y eso no se deshace. */}
      {productos.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setPalabra("");
            setVaciando(true);
          }}
          className="mt-5 text-xs text-ink-3 underline transition hover:text-danger"
        >
          Vaciar el catálogo
        </button>
      )}

      {filas.length > 0 && (
        <p className="mt-3 text-xs text-ink-2">
          Verde = producto nuevo. Ámbar = con cambios sin guardar.
          {!todo && " Con «Más columnas» aparecen descripción, precio anterior, existencias y ocultar."}
        </p>
      )}

      {opcionesDe !== null && filas[opcionesDe] && (
        <EditorVariedades
          nombreProducto={filas[opcionesDe].nombre}
          grupos={filas[opcionesDe].variedades}
          moneda={moneda}
          otrosProductos={filas
            .filter((_, j) => j !== opcionesDe)
            .map((f) => ({ nombre: f.nombre || "Producto sin nombre", variedades: f.variedades }))}
          onGuardar={(g) => {
            set(opcionesDe, "variedades", g);
            setOpcionesDe(null);
          }}
          onCerrar={() => setOpcionesDe(null)}
        />
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
              En tu hoja de cálculo selecciona los productos{" "}
              <b className="text-ink">con la fila de encabezados</b>, cópialos, y pégalos aquí. Se
              reconocen tus nombres de columna tal y como están.
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

    {/* FUERA DEL FORMULARIO DE ARRIBA: un formulario dentro de otro no es HTML
        válido y el navegador lo desarma por su cuenta, con resultados raros. */}
    {vaciando && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
        <form
          action={(fd) => {
            enviarVaciar(fd);
            setVaciando(false);
          }}
          className="w-full max-w-md rounded-2xl border border-linea bg-tarjeta p-5"
        >
          <input type="hidden" name="tienda_id" value={tiendaId} />

          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-danger/12 text-danger">
              <Trash2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-ink">Vaciar el catálogo</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
                Se van a borrar <b className="text-ink">{productos.length} producto
                {productos.length === 1 ? "" : "s"}</b> con sus opciones.{" "}
                <b className="text-ink">Esto no se deshace</b>: no hay papelera ni copia.
              </p>
              <p className="mt-2 text-xs text-ink-2">
                Si lo que quieres es sacarlos de la tienda un tiempo, no los borres: márcalos como
                ocultos en «Más columnas» y vuelven cuando quieras.
              </p>
            </div>
          </div>

          <label className="mb-1.5 mt-4 block text-xs font-semibold text-ink-2">
            Escribe <b className="text-ink">BORRAR</b> para confirmar
          </label>
          <input
            autoFocus
            name="confirmacion"
            value={palabra}
            onChange={(e) => setPalabra(e.target.value)}
            autoComplete="off"
            className="input-l"
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              className="rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40"
              style={{ backgroundColor: "var(--danger, #dc2626)" }}
              disabled={palabra.trim().toUpperCase() !== "BORRAR"}
            >
              Borrar los {productos.length}
            </button>
            <button
              type="button"
              onClick={() => setVaciando(false)}
              className="text-sm text-ink-2 transition hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}
