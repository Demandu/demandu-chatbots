"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Link2 } from "lucide-react";
import { aDireccion, DOMINIO_TIENDAS } from "@/lib/tienda/direccion";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar({ cambiado }: { cambiado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-soft flex-none" disabled={pending || !cambiado}>
      {pending ? "Cambiando…" : "Cambiar dirección"}
    </button>
  );
}

/**
 * La dirección pública de la tienda, editable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DOMINIO SE ENSEÑA PERO NO SE TOCA: es de la plataforma, y ponerlo en una
 * casilla invitaría a escribir ahí el dominio propio del negocio, que es otra
 * cosa y no la hacemos. Lo que va después de la barra sí es suyo.
 *
 * SE LIMPIA MIENTRAS ESCRIBE. Quien teclee «Panadería La Espiga» ve al momento
 * `panaderia-la-espiga`, en vez de descubrir después que su dirección no es lo
 * que puso.
 *
 * Y SE AVISA DE LO ÚNICO QUE IMPORTA: los enlaces ya repartidos siguen
 * funcionando. Sin decirlo, nadie se atreve a cambiarla — y con razón, porque
 * en cualquier otra plataforma eso rompe todo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Direccion({
  tiendaId,
  slug,
  accion,
}: {
  tiendaId: string;
  slug: string;
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });
  const [valor, setValor] = useState(slug);
  const limpia = aDireccion(valor);

  return (
    <form action={enviar} className="card-l grid gap-3 p-4">
      <input type="hidden" name="tienda_id" value={tiendaId} />

      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <Link2 className="h-4 w-4 text-violet" /> La dirección de tu tienda
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <span className="select-none whitespace-nowrap rounded-xl border border-linea bg-tarjeta-2 px-3 py-2 text-sm text-ink-2">
          {DOMINIO_TIENDAS}/
        </span>
        <input
          name="slug"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="input-l min-w-[180px] flex-1"
          placeholder="mi-negocio"
        />
        <Guardar cambiado={Boolean(limpia) && limpia !== slug} />
      </div>

      {limpia !== valor && (
        <p className="text-xs text-ink-2">
          Quedará como <b className="text-ink">{limpia || "…"}</b> — sin acentos, sin mayúsculas y
          sin espacios, porque hay que poder dictarla por teléfono.
        </p>
      )}

      <p className="text-xs text-ink-2">
        <b className="text-ink">La dirección anterior sigue funcionando.</b> Lo que ya repartiste
        —el enlace en tu Instagram, los enlaces de cobro que están en el chat de tus clientes— sigue
        llevando aquí. Nadie más puede quedarse con ella.
      </p>

      {estado.mensaje && (
        <p className={`text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
