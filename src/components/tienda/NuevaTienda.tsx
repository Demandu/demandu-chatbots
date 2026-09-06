"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Store } from "lucide-react";
import { aDireccion, DOMINIO_TIENDAS } from "@/lib/tienda/direccion";
import type { EstadoTienda } from "@/app/(dashboard)/tienda/actions";

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Creando…" : "Crear tienda"}
    </button>
  );
}

/**
 * Crear una tienda: nombre, dirección y a qué chatbot llegan los pedidos.
 *
 * LA DIRECCIÓN SE VE MIENTRAS SE ESCRIBE, y no después de guardar. Es lo único
 * de esta pantalla que no se puede cambiar a la ligera —va impresa en volantes
 * y en la biografía de Instagram— así que el cliente tiene que leerla ANTES de
 * pulsar, no enterarse de que su tienda quedó en «paws-at-home--pty».
 */
export function NuevaTienda({
  accion,
  bots,
}: {
  accion: (estado: EstadoTienda, fd: FormData) => Promise<EstadoTienda>;
  bots: { id: string; name: string | null }[];
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");

  const direccion = aDireccion(slug || nombre);

  return (
    <form action={enviar} className="rounded-2xl border border-linea bg-tarjeta p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <Store className="h-4 w-4 text-violet" /> Nueva tienda
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del negocio</label>
          <input
            name="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Paws at Home"
            className="input-l"
          />
        </div>

        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">
            Dirección de la tienda
          </label>
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="se saca del nombre"
            className="input-l"
          />
        </div>

        <div className="min-w-[180px]">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">
            Los pedidos entran a
          </label>
          <select name="bot_id" defaultValue="" className="input-l">
            <option value="">Elegirlo después</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || "Chatbot sin nombre"}
              </option>
            ))}
          </select>
        </div>

        <Boton />
      </div>

      <p className="mt-3 text-xs text-ink-2">
        Su enlace será{" "}
        <b className="text-ink">
          {DOMINIO_TIENDAS}/{direccion || <span className="text-ink-2">…</span>}
        </b>
      </p>

      {estado.mensaje && (
        <p className={`mt-2 text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
