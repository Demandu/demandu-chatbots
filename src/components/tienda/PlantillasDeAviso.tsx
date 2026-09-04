"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, Clock, AlertTriangle, CircleDashed } from "lucide-react";
import type { Estado } from "@/app/(dashboard)/tienda/[id]/actions";

function Crear({ hayAlgunaSin }: { hayAlgunaSin: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={pending}>
      {pending ? "Creando…" : hayAlgunaSin ? "Crear las que faltan" : "Volver a comprobar"}
    </button>
  );
}

/**
 * En qué va cada plantilla de aviso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTA PANTALLA EXISTE. WhatsApp solo entrega texto libre dentro de las
 * 24 h siguientes al último mensaje del cliente. Fuera de eso hace falta una
 * PLANTILLA aprobada por Meta — y las plantillas viven en la cuenta de WhatsApp
 * de cada negocio, no en la nuestra. Así que cada tienda necesita las suyas.
 *
 * SIN ESTO, EL FALLO ES INVISIBLE. Los avisos siguen saliendo dentro de las 24 h
 * y todo parece funcionar; lo que se pierde es el «va en camino» de quien pidió
 * anoche — que es justo el que la gente espera. Un negocio no tiene forma de
 * darse cuenta solo.
 *
 * LO QUE NO SE PUEDE MEDIR VA EN GRIS. Una plantilla que no está en la tabla no
 * se pinta como aprobada ni como rechazada: se pinta como «sin crear», que es lo
 * que de verdad sabemos. Es la misma regla del tablero de estado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function PlantillasDeAviso({
  tiendaId,
  plantillas,
  accion,
}: {
  tiendaId: string;
  plantillas: { nombre: string; etiqueta: string; estado: string }[];
  accion: (e: Estado, fd: FormData) => Promise<Estado>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: true, mensaje: "" });

  const aprobadas = plantillas.filter((p) => p.estado === "APPROVED").length;
  const hayAlgunaSin = aprobadas < plantillas.length;

  const pinta = (e: string) => {
    if (e === "APPROVED") {
      return { icono: <CheckCircle2 className="h-4 w-4 text-exito" />, texto: "aprobada", color: "text-exito" };
    }
    if (e === "PENDING" || e === "IN_APPEAL" || e === "PENDING_DELETION") {
      return { icono: <Clock className="h-4 w-4 text-aviso" />, texto: "esperando a Meta", color: "text-aviso" };
    }
    if (e === "REJECTED" || e === "DISABLED" || e === "PAUSED") {
      return { icono: <AlertTriangle className="h-4 w-4 text-alerta" />, texto: e.toLowerCase(), color: "text-alerta" };
    }
    return { icono: <CircleDashed className="h-4 w-4 text-ink-3" />, texto: "sin crear", color: "text-ink-3" };
  };

  return (
    <div className="card-l p-5">
      <h3 className="font-display text-base font-semibold text-ink">
        Avisos a quien lleva más de un día sin escribir
      </h3>
      <p className="mt-1 text-sm text-ink-2">
        WhatsApp solo deja mandar un mensaje normal dentro de las 24 horas siguientes al último
        mensaje de tu cliente. Después hace falta una plantilla aprobada por Meta, y las plantillas
        viven en tu cuenta de WhatsApp. Estas son las tuyas.
      </p>

      {/* LO QUE PASA MIENTRAS TANTO, DICHO SIN RODEOS. Que no estén aprobadas no
          rompe nada, y el negocio tiene que saberlo para no asustarse. */}
      {hayAlgunaSin && (
        <p className="mt-2 rounded-xl border border-linea bg-suave px-3 py-2 text-xs text-ink-2">
          Mientras tanto no se rompe nada: los avisos siguen saliendo normal si tu cliente escribió
          en el último día. Lo único que falta es avisarle a quien lleva más tiempo callado.
        </p>
      )}

      <ul className="mt-4 divide-y divide-linea">
        {plantillas.map((p) => {
          const v = pinta(p.estado);
          return (
            <li key={p.nombre} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm text-ink">{p.etiqueta}</div>
                <div className="font-mono text-[11px] text-ink-3">{p.nombre}</div>
              </div>
              <span className={`inline-flex flex-none items-center gap-1.5 text-xs ${v.color}`}>
                {v.icono} {v.texto}
              </span>
            </li>
          );
        })}
      </ul>

      <form action={enviar} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="tienda_id" value={tiendaId} />
        <Crear hayAlgunaSin={hayAlgunaSin} />
        <span className="text-xs text-ink-3">
          {aprobadas} de {plantillas.length} aprobadas. Meta tarda de unos minutos a un día.
        </span>
      </form>

      {estado.mensaje && (
        <p
          className={
            "mt-3 text-sm " +
            (!estado.ok ? "text-alerta" : estado.tono === "aviso" ? "text-aviso" : "text-exito")
          }
        >
          {estado.mensaje}
        </p>
      )}
    </div>
  );
}
