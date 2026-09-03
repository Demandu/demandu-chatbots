"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ShieldCheck } from "lucide-react";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar cobros"}
    </button>
  );
}

/**
 * Los cobros de una tienda.
 *
 * CADA NEGOCIO USA SU PROPIA CUENTA DE YAPPY: el dinero va de su cliente a su
 * banco sin pasar por Demandu. No es un detalle técnico, es lo que evita que
 * seamos intermediarios financieros de nadie.
 *
 * EL SECRETO NO SE ENSEÑA NUNCA, ni siquiera al dueño. Solo se dice si hay uno
 * guardado. Y dejar el campo en blanco NO lo borra: si lo borrara, guardar
 * cualquier otro cambio dejaría al negocio sin cobrar, sin aviso y sin pista
 * de por qué.
 */
export function Cobros({
  tiendaId,
  comercio,
  tieneSecreto,
  activo,
  accion,
}: {
  tiendaId: string;
  comercio: string;
  tieneSecreto: boolean;
  activo: boolean;
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });

  return (
    <form action={enviar} className="grid max-w-2xl gap-4">
      <input type="hidden" name="tienda_id" value={tiendaId} />

      <div className="flex gap-3 rounded-2xl border border-linea-2 bg-tarjeta p-4">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-emerald-400/12 text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <p className="text-sm leading-relaxed text-ink-2">
          <b className="text-ink">El dinero es tuyo desde el primer momento.</b> El cobro se hace
          con tu propia cuenta de comercio de Yappy, así que entra directo a tu banco: Demandu no lo
          toca ni lo retiene.
        </p>
      </div>

      <section className="card grid gap-3 p-4">
        <h2 className="font-semibold text-ink">Yappy</h2>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">
            Número de comercio
          </label>
          <input name="yappy_comercio" defaultValue={comercio} className="input-l" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">
            Secreto de comercio
          </label>
          <input
            name="yappy_secreto"
            type="password"
            autoComplete="new-password"
            placeholder={tieneSecreto ? "•••••••• (guardado — escribe uno nuevo para cambiarlo)" : "Pégalo aquí"}
            className="input-l"
          />
          <p className="mt-1.5 text-xs text-ink-2">
            {tieneSecreto
              ? "Ya hay uno guardado. Déjalo en blanco y no se toca."
              : "Se guarda en el servidor, donde solo tu organización puede leerlo, y no se vuelve a mostrar en pantalla."}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="yappy_activo"
            defaultChecked={activo}
            className="h-4 w-4"
            style={{ accentColor: "#6E42FF" }}
          />
          Cobrar con Yappy en esta tienda
        </label>

        <p className="text-xs text-ink-2">
          Apagado, los pedidos siguen llegando por WhatsApp y se cobra como hasta ahora. Una tienda
          que dice cobrar y no puede es peor que una que no lo ofrece: el cliente llega hasta el
          final y se cae ahí.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Guardar />
        {estado.mensaje && (
          <span className={`text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
            {estado.mensaje}
          </span>
        )}
      </div>
    </form>
  );
}
