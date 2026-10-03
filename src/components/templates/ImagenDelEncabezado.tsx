"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle, Check, ImagePlus } from "lucide-react";

/**
 * La imagen que se manda en el encabezado de una plantilla.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO EXISTE, Y POR QUÉ ESTÁ EN ROJO CUANDO FALTA.
 *
 * Una plantilla con imagen arriba necesita esa imagen EN CADA ENVÍO. Sin ella,
 * Meta rechaza el mensaje con «(#132012) Parameter format does not match format
 * in the created template» — un código que no dice qué falta y que llega
 * DESPUÉS de dar el mensaje por enviado.
 *
 * La muestra que se subió al crearla NO sirve: esa es solo para que Meta la
 * apruebe, y la dirección que devuelve caduca.
 *
 * Por eso aquí no hay un «opcional» discreto: si falta, la plantilla no se
 * puede mandar y la fila lo dice en rojo. Una plantilla aprobada que no sale es
 * peor que una rechazada, porque parece que está bien.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ImagenDelEncabezado({
  plantillaId,
  formato,
  urlActual,
  accion,
}: {
  plantillaId: string;
  formato: string;
  urlActual: string | null;
  accion: (estado: any, formData: FormData) => Promise<{ ok: boolean; mensaje?: string }>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false });
  const [abierto, setAbierto] = useState(!urlActual);

  const comoSeLlama =
    formato === "VIDEO" ? "video" : formato === "DOCUMENT" ? "documento" : "imagen";

  if (!abierto && urlActual) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-3 hover:text-pink"
      >
        <ImagePlus className="h-3 w-3" /> Cambiar la {comoSeLlama} de arriba
      </button>
    );
  }

  return (
    <form action={enviar} className="mt-2 max-w-md rounded-lg border border-danger/40 bg-danger/5 p-2.5">
      <input type="hidden" name="plantilla_id" value={plantillaId} />
      {!urlActual && (
        <p className="mb-1.5 flex items-start gap-1.5 text-[11px] font-semibold leading-snug text-danger">
          <AlertTriangle className="mt-px h-3 w-3 flex-none" />
          Lleva una {comoSeLlama} arriba y todavía no tiene cuál mandar. Sin ella, WhatsApp
          rechaza el envío.
        </p>
      )}
      <div className="flex gap-1.5">
        <input
          name="url"
          type="url"
          required
          defaultValue={urlActual ?? ""}
          placeholder={`https://… la ${comoSeLlama} que verá tu cliente`}
          className="input-l flex-1 text-[12px]"
        />
        <Guardar />
      </div>
      {estado?.mensaje && (
        <p className={`mt-1.5 text-[11px] font-semibold ${estado.ok ? "text-exito" : "text-danger"}`}>
          {estado.ok && <Check className="mr-1 inline h-3 w-3" />}
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-soft flex-none text-[12px]">
      {pending ? "Guardando…" : "Guardar"}
    </button>
  );
}
