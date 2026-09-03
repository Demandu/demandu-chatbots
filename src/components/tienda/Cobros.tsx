"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ShieldCheck, Copy, Check, PlugZap } from "lucide-react";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar cobros"}
    </button>
  );
}

function Probar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-soft" disabled={pending}>
      <PlugZap className="h-4 w-4" /> {pending ? "Probando…" : "Probar conexión"}
    </button>
  );
}

/**
 * Los cobros de una tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CADA NEGOCIO USA SU PROPIA CUENTA DE YAPPY: el dinero va de su cliente a su
 * banco sin pasar por Demandu. No es un detalle técnico, es lo que evita que
 * seamos intermediarios financieros de nadie.
 *
 * EL SECRETO NO SE ENSEÑA NUNCA, ni siquiera al dueño. Solo se dice si hay uno
 * guardado. Y dejar el campo en blanco NO lo borra: si lo borrara, guardar
 * cualquier otro cambio dejaría al negocio sin cobrar, sin aviso y sin pista
 * de por qué.
 *
 * EL DOMINIO SE ENSEÑA PARA COPIARLO, no para escribirlo. Yappy solo acepta
 * pagos que vengan del dominio registrado en su panel, y ese texto tiene que
 * coincidir carácter por carácter. Teclearlo a mano es la forma número uno de
 * que el primer pago real llegue y se caiga.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Cobros({
  tiendaId,
  comercio,
  tieneSecreto,
  activo,
  ambiente,
  dominio,
  validadoEn,
  accion,
  probar,
}: {
  tiendaId: string;
  comercio: string;
  tieneSecreto: boolean;
  activo: boolean;
  ambiente: "prueba" | "produccion";
  dominio: string;
  validadoEn: string | null;
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
  probar: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });
  const [prueba, lanzarPrueba] = useFormState(probar, { ok: false, mensaje: "" });
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(dominio);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* si el navegador no deja copiar, el texto está a la vista igual */
    }
  };

  return (
    <div className="grid max-w-2xl gap-4">
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

      <form action={enviar} className="grid gap-4">
        <input type="hidden" name="tienda_id" value={tiendaId} />

        <section className="card-l grid gap-3 p-4">
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

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Entorno</label>
            {/* PRODUCCIÓN VA PRIMERO Y ES EL NORMAL. Lo puse al revés al
                principio, dando por hecho que Yappy repartía llaves de sandbox
                a cualquier comercio; el portal entrega un solo juego, y son las
                de verdad. Arrancar en pruebas garantizaba que el primer intento
                de todo el mundo fallara con un mensaje que no explica nada. */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    v: "produccion",
                    t: "Producción",
                    p: "Las llaves que te dio tu panel de Yappy. Es lo normal.",
                  },
                  {
                    v: "prueba",
                    t: "Pruebas",
                    p: "Solo si Yappy te dio credenciales de integración aparte. Con las llaves normales, esto falla.",
                  },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className="flex cursor-pointer items-start gap-2 rounded-xl border border-linea px-3 py-2 text-sm text-ink"
                >
                  <input
                    type="radio"
                    name="yappy_ambiente"
                    value={o.v}
                    defaultChecked={ambiente === o.v}
                    className="mt-0.5 h-4 w-4 flex-none"
                    style={{ accentColor: "#6E42FF" }}
                  />
                  <span>
                    {o.t}
                    <span className="block text-xs text-ink-2">{o.p}</span>
                  </span>
                </label>
              ))}
            </div>
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
            Apagado, los pedidos siguen llegando por WhatsApp y se cobra como hasta ahora. Una
            tienda que dice cobrar y no puede es peor que una que no lo ofrece: el cliente llega
            hasta el final y se cae ahí.
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

      <section className="card-l grid gap-3 p-4">
        <h2 className="font-semibold text-ink">En tu panel de Yappy</h2>
        <p className="text-sm leading-relaxed text-ink-2">
          Entra a <b className="text-ink">Yappy Comercial → Botón de pago</b> y registra este
          dominio, tal cual, sin barra al final:
        </p>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-linea bg-tarjeta-2 px-3 py-2 text-sm text-ink">
            {dominio}
          </code>
          <button
            type="button"
            onClick={copiar}
            className="btn-soft flex-none"
            title="Copiar el dominio"
          >
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>

        <p className="text-xs text-ink-2">
          Yappy solo acepta pagos que vengan de ese dominio, y compara el texto exacto. Si ahí dice
          otra cosa, los pagos se rechazan aunque todo lo demás esté bien.
        </p>
      </section>

      <form action={lanzarPrueba} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="tienda_id" value={tiendaId} />
        <Probar />
        {prueba.mensaje ? (
          <span className={`text-sm ${prueba.ok ? "text-emerald-400" : "text-danger"}`}>
            {prueba.mensaje}
          </span>
        ) : (
          <span className="text-sm text-ink-2">
            {validadoEn
              ? `Última prueba correcta: ${new Date(validadoEn).toLocaleString("es")}`
              : "Todavía no se ha probado. Hazlo antes de la primera venta."}
          </span>
        )}
      </form>
    </div>
  );
}
