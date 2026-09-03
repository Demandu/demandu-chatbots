"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ChevronRight } from "lucide-react";
import { comoDinero } from "@/lib/tienda/variedades";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

export type EstadoPedido =
  | "recibido"
  | "confirmado"
  | "preparando"
  | "en_camino"
  | "entregado"
  | "cancelado";

export type PedidoEnLista = {
  id: string;
  numero: number;
  estado: EstadoPedido;
  total: number;
  created_at: string;
  respuestas: { id: string; etiqueta: string; valor: string }[];
  lineas: { nombre: string; cantidad: number; precio: number; elegidas: { grupo: string; texto: string }[]; nota: string | null }[];
};

/**
 * El ciclo, corto a propósito.
 *
 * Doce estados no los mantiene nadie, y acaban con todos los pedidos en el
 * primero. Con estos cinco, mirar la columna ya dice qué falta hacer hoy.
 */
export const COLUMNAS: { clave: EstadoPedido; titulo: string; siguiente?: EstadoPedido }[] = [
  { clave: "recibido", titulo: "Recibidos", siguiente: "confirmado" },
  { clave: "confirmado", titulo: "Confirmados", siguiente: "preparando" },
  { clave: "preparando", titulo: "Preparando", siguiente: "en_camino" },
  { clave: "en_camino", titulo: "En camino", siguiente: "entregado" },
  { clave: "entregado", titulo: "Entregados" },
];

const cuando = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

function Avanzar({ titulo }: { titulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-white transition disabled:opacity-50"
      style={{ backgroundColor: "#6E42FF" }}
      disabled={pending}
    >
      {pending ? "…" : titulo} <ChevronRight className="h-3 w-3" />
    </button>
  );
}

/**
 * Los pedidos, en columnas por estado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES LA PANTALLA QUE EL NEGOCIO VA A MIRAR TODO EL DÍA — más que Productos y
 * más que Diseño, que se tocan una vez y se olvidan.
 *
 * CADA TARJETA TRAE LO QUE HACE FALTA PARA PREPARAR: qué se pidió, con qué
 * opciones, la nota, y lo que contestó en el formulario. Si para saber qué
 * lleva un pedido hay que abrirlo, en hora punta nadie lo abre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Pedidos({
  tiendaId,
  pedidos,
  moneda,
  cambiarEstado,
}: {
  tiendaId: string;
  pedidos: PedidoEnLista[];
  moneda: string;
  cambiarEstado: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(cambiarEstado, { ok: false, mensaje: "" });
  const [verCancelados, setVerCancelados] = useState(false);

  const cancelados = pedidos.filter((p) => p.estado === "cancelado");
  const hoy = pedidos.filter((p) => p.estado !== "cancelado" && p.estado !== "entregado");
  const vendido = pedidos
    .filter((p) => p.estado !== "cancelado")
    .reduce((s, p) => s + p.total, 0);

  if (pedidos.length === 0) {
    return (
      <div className="rounded-2xl border border-linea-2 bg-tarjeta p-5 text-sm leading-relaxed text-ink-2">
        <b className="text-ink">Todavía no ha entrado ningún pedido.</b>
        <p className="mt-1">
          Cuando alguien pida desde tu tienda, aparece aquí con su número — aunque no llegue a
          enviarte el mensaje de WhatsApp. Así no se te pierde ninguno.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {pedidos.length} pedido{pedidos.length === 1 ? "" : "s"} · {hoy.length} sin entregar ·{" "}
          {comoDinero(vendido, moneda)} vendidos
        </p>
        {cancelados.length > 0 && (
          <button
            type="button"
            onClick={() => setVerCancelados((v) => !v)}
            className="text-xs text-ink-2 underline transition hover:text-ink"
          >
            {verCancelados ? "Ocultar" : "Ver"} {cancelados.length} cancelado
            {cancelados.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {estado.mensaje && (
        <p className={`mb-3 text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
          {estado.mensaje}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-5">
        {COLUMNAS.map((col) => {
          const items = pedidos.filter((p) => p.estado === col.clave);
          return (
            <section key={col.clave} className="rounded-2xl border border-linea p-2">
              <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-2">
                {col.titulo}{" "}
                <span className="text-ink-3">{items.length > 0 ? items.length : ""}</span>
              </p>

              {items.length === 0 && <p className="px-1 pb-2 text-xs text-ink-3">—</p>}

              {items.map((p) => (
                <article key={p.id} className="mb-2 rounded-xl bg-tarjeta-2 p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-ink">#{p.numero}</span>
                    <span className="text-sm font-bold text-ink">{comoDinero(p.total, moneda)}</span>
                  </div>
                  <p className="text-[11px] text-ink-3">{cuando(p.created_at)}</p>

                  <ul className="mt-1.5 grid gap-0.5">
                    {p.lineas.map((l, i) => (
                      <li key={i} className="text-xs text-ink-2">
                        <b className="text-ink">{l.cantidad}×</b> {l.nombre}
                        {l.elegidas.length > 0 && (
                          <span className="block pl-4 text-[11px] text-ink-3">
                            {l.elegidas.map((e) => e.texto).join(", ")}
                          </span>
                        )}
                        {l.nota && (
                          <span className="block pl-4 text-[11px] italic text-ink-3">{l.nota}</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {p.respuestas.length > 0 && (
                    <div className="mt-1.5 border-t border-linea pt-1.5">
                      {p.respuestas.map((r) => (
                        <p key={r.id} className="text-[11px] text-ink-2">
                          <span className="text-ink-3">{r.etiqueta}:</span> {r.valor}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {col.siguiente && (
                      <form action={enviar}>
                        <input type="hidden" name="tienda_id" value={tiendaId} />
                        <input type="hidden" name="pedido_id" value={p.id} />
                        <input type="hidden" name="estado" value={col.siguiente} />
                        <Avanzar
                          titulo={
                            COLUMNAS.find((c) => c.clave === col.siguiente)?.titulo.replace(/s$/, "") ??
                            "Siguiente"
                          }
                        />
                      </form>
                    )}
                    {p.estado !== "entregado" && (
                      <form action={enviar}>
                        <input type="hidden" name="tienda_id" value={tiendaId} />
                        <input type="hidden" name="pedido_id" value={p.id} />
                        <input type="hidden" name="estado" value="cancelado" />
                        <button className="mt-2 text-[11px] text-ink-3 underline transition hover:text-danger">
                          Cancelar
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {/* Los cancelados NO se borran: un pedido cancelado sigue siendo
          información —cuántos se caen y por qué— y borrarlo es perderla. */}
      {verCancelados && cancelados.length > 0 && (
        <div className="mt-4 rounded-2xl border border-linea p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">Cancelados</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {cancelados.map((p) => (
              <div key={p.id} className="rounded-xl bg-tarjeta-2 p-2.5 opacity-70">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-ink">#{p.numero}</span>
                  <span className="text-sm text-ink-2">{comoDinero(p.total, moneda)}</span>
                </div>
                <p className="text-[11px] text-ink-3">{cuando(p.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
