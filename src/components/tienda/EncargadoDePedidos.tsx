"use client";

import { useFormState, useFormStatus } from "react-dom";
import { UserCheck } from "lucide-react";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-soft flex-none" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}

/**
 * Quién se encarga de los pedidos de esta tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VA EN LA PESTAÑA DE PEDIDOS, que es donde alguien se pregunta quién los
 * atiende. En Configuración → Reparto está la regla general del equipo; esto es
 * otra cosa: el dueño de ESTOS pedidos.
 *
 * SIN ESTO EL RECORRIDO SE CORTA. El cliente manda su pedido por WhatsApp, el
 * mensaje entra a la Bandeja, y ahí se queda sin dueño mientras el pedido vive
 * en otra pantalla. El negocio acaba atando a mano el chat, el pedido y el
 * cobro — tres cosas que ya sabemos que son la misma.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function EncargadoDePedidos({
  tiendaId,
  atiendeId,
  equipo,
  accion,
}: {
  tiendaId: string;
  atiendeId: string | null;
  equipo: { id: string; name: string | null; available: boolean }[];
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });

  return (
    <form action={enviar} className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-linea p-3">
      <input type="hidden" name="tienda_id" value={tiendaId} />

      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <UserCheck className="h-4 w-4 text-violet" /> Atiende los pedidos
      </span>

      <select
        name="atiende_id"
        defaultValue={atiendeId ?? ""}
        className="input-l min-w-[200px] flex-1"
      >
        {/* VACÍO NO ES «NADIE», es el reparto de siempre. Decirlo aquí evita
            que alguien lo deje sin poner creyendo que así no molesta a nadie. */}
        <option value="">Reparto automático (al que menos carga tenga)</option>
        {equipo.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || "Sin nombre"}
            {m.available ? "" : " · no disponible"}
          </option>
        ))}
      </select>

      <Guardar />

      {estado.mensaje && (
        <span className={`text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
          {estado.mensaje}
        </span>
      )}

      <p className="w-full text-xs text-ink-2">
        Cuando el cliente manda su pedido por WhatsApp, esa conversación entra a la Bandeja
        <b className="text-ink"> ya asignada</b> y con el pedido enganchado.
      </p>
    </form>
  );
}
