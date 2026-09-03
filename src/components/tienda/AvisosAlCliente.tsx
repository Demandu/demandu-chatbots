"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { BellRing, ChevronDown } from "lucide-react";
import { MOMENTOS, MAX_AVISO, rellenarAviso, type AvisosTienda } from "@/lib/tienda/avisos";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Guardando…" : "Guardar avisos"}
    </button>
  );
}

/**
 * Los mensajes que recibe el cliente cuando su pedido se mueve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE VE LO QUE VA A LEER EL CLIENTE, no la plantilla con huecos. La vista previa
 * de al lado tiene datos de ejemplo puestos: es la única forma de que alguien se
 * dé cuenta de que escribió `{pedido}` en vez de `{numero}` ANTES de que ese
 * mensaje salga hacia el teléfono de un cliente de verdad.
 *
 * VA PLEGADO. Esta pantalla es el tablero de pedidos: quien entra viene a
 * despachar, no a redactar. Los textos de fábrica funcionan solos y el que
 * quiera cambiarlos lo abre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function AvisosAlCliente({
  tiendaId,
  avisos,
  moneda,
  tienda,
  accion,
}: {
  tiendaId: string;
  avisos: AvisosTienda;
  moneda: string;
  tienda: string;
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false, mensaje: "" });
  const [abierto, setAbierto] = useState(false);
  const [general, setGeneral] = useState(avisos.activo);
  const [textos, setTextos] = useState<Record<string, string>>(
    Object.fromEntries(MOMENTOS.map((m) => [m.clave, avisos.momentos[m.clave].texto])),
  );

  // Datos de mentira que se parecen a los de verdad. El número y el código son
  // los que más se equivocan al escribir el texto.
  const ejemplo = {
    numero: 128,
    tienda,
    total: `${moneda}25.00`,
    codigo: "C9UYJC3S76SB",
    cliente: "María",
  };

  const encendidos = MOMENTOS.filter((m) => avisos.momentos[m.clave].activo).length;

  return (
    <form action={enviar} className="mb-4 rounded-2xl border border-linea p-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <BellRing className="h-4 w-4 flex-none text-violet" />
        <span className="text-sm font-semibold text-ink">Avisos al cliente</span>
        <span className="text-sm text-ink-2">
          {avisos.activo
            ? `${encendidos} de ${MOMENTOS.length} encendidos`
            : "apagados: el cliente no recibe nada"}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 flex-none text-ink-2 transition ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {!abierto ? (
        <p className="mt-2 text-xs text-ink-2">
          Cuando mueves un pedido de columna, al cliente le llega un mensaje por WhatsApp solo.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          <input type="hidden" name="tienda_id" value={tiendaId} />

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="avisos_activo"
              checked={general}
              onChange={(e) => setGeneral(e.target.checked)}
            />
            Avisarle al cliente cuando su pedido cambie
          </label>

          {/* ─────────────────────────────────────────────────────────────────
              LA VENTANA DE 24 HORAS SE DICE AQUÍ Y NO CUANDO FALLA. WhatsApp
              solo deja escribir texto libre dentro de las 24 h siguientes al
              último mensaje del cliente. Quien no lo sabe, al ver que un aviso
              no salió, cree que el sistema está roto.
              ───────────────────────────────────────────────────────────────── */}
          <p className="rounded-xl bg-aviso-suave p-2 text-xs leading-relaxed text-ink-2">
            WhatsApp solo permite escribirle a alguien <b className="text-ink">dentro de las 24 horas</b>{" "}
            siguientes a su último mensaje. Un pedido que se entrega al día siguiente puede quedarse
            fuera de esa ventana: el pedido se mueve igual y aquí te decimos si el aviso no salió.
          </p>

          {MOMENTOS.map((m) => {
            const previa = rellenarAviso(textos[m.clave] || m.texto, ejemplo);
            return (
              <div
                key={m.clave}
                className={`rounded-xl border border-linea-2 p-3 ${general ? "" : "opacity-50"}`}
              >
                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    name={`activo_${m.clave}`}
                    defaultChecked={avisos.momentos[m.clave].activo}
                  />
                  {m.etiqueta}
                  <span className="font-normal text-ink-2">· {m.cuando}</span>
                </label>

                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <textarea
                    name={`texto_${m.clave}`}
                    value={textos[m.clave]}
                    maxLength={MAX_AVISO}
                    rows={3}
                    onChange={(e) =>
                      setTextos((t) => ({ ...t, [m.clave]: e.target.value }))
                    }
                    className="input-l text-sm"
                  />

                  {/* Se pinta como una burbuja de WhatsApp a propósito: se lee
                      distinto un texto en una casilla que el mismo texto con la
                      forma que va a tener en el teléfono. */}
                  <div className="rounded-xl bg-[#DCF8C6] p-2 text-sm leading-snug text-[#111]">
                    {previa || <span className="opacity-50">(vacío: sale el texto de fábrica)</span>}
                  </div>
                </div>
              </div>
            );
          })}

          <p className="text-xs text-ink-2">
            Puedes usar{" "}
            <code className="text-ink">
              {"{numero}"} {"{tienda}"} {"{total}"} {"{codigo}"} {"{cliente}"}
            </code>
            . Si no sabemos el nombre del cliente, ese hueco desaparece solo.
          </p>

          <div className="flex items-center gap-3">
            <Guardar />
            {estado.mensaje && (
              <span className={`text-sm ${estado.ok ? "text-emerald-400" : "text-danger"}`}>
                {estado.mensaje}
              </span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
