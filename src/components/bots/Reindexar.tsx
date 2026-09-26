"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Check, Loader2, Sparkles } from "lucide-react";

/**
 * «Ponerle el buscador a lo que ya subí».
 *
 * Los vectores solo se calculaban al subir el documento, así que todo lo que
 * estaba cargado ANTES de encenderse la búsqueda por significado se quedaba
 * ciego — y en la pantalla se veía exactamente igual que el resto. El dueño
 * leía su fragmento en la lista y el chatbot no lo encontraba.
 *
 * Por eso esto dice un NÚMERO, no un «activado»: lo que importa no es que la
 * búsqueda esté encendida, es cuántos de sus fragmentos la tienen de verdad.
 */
export function Reindexar({
  botId,
  sinVector,
  accion,
}: {
  botId: string;
  sinVector: number;
  accion: (estado: any, formData: FormData) => Promise<{ ok: boolean; mensaje?: string }>;
}) {
  const [estado, enviar] = useFormState(accion, { ok: false });

  return (
    <form action={enviar} className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
      <input type="hidden" name="bot_id" value={botId} />
      <p className="text-xs leading-relaxed text-ink">
        <b>
          {sinVector} fragmento{sinVector === 1 ? "" : "s"} todavía se busca
          {sinVector === 1 ? "" : "n"} solo por palabras.
        </b>{" "}
        Se subieron antes de que la búsqueda por significado estuviera activa. Ponlos al día y tu
        chatbot los encontrará aunque le pregunten con otras palabras.
      </p>
      <Boton />
      {estado?.mensaje && (
        <p className={`mt-2 text-[11px] font-semibold ${estado.ok ? "text-success" : "text-danger"}`}>
          {estado.ok && <Check className="mr-1 inline h-3 w-3" />}
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-soft mt-3 text-xs">
      {pending ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Poniéndolos al día…
        </>
      ) : (
        <>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Ponerlos al día
        </>
      )}
    </button>
  );
}
