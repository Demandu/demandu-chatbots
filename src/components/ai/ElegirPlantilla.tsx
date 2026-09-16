"use client";

import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { PLANTILLAS_DE_RUBRO, type PlantillaDeRubro } from "@/lib/ai/plantillasDeRubro";

/**
 * Elegir una plantilla de personalidad según el giro del negocio.
 *
 * ── POR QUÉ NO LA APLICA SOLA ──────────────────────────────────────────────
 *
 * Se enseña el texto ENTERO antes de poner nada, y hay que pulsar «Usar esta».
 * Un botón que reescribe de golpe el prompt que el negocio llevaba dos meses
 * afinando es de los errores que no se perdonan: no hay deshacer, y lo que se
 * pierde es trabajo que nadie recuerda cómo estaba.
 *
 * Y se avisa cuando ya hay algo escrito, porque ese es justo el caso.
 *
 * ── LO QUE PONE, Y LO QUE NO ───────────────────────────────────────────────
 *
 * Rellena el cuadro de personalidad y el de estilo, y nada más. Horarios,
 * precios y servicios NO van aquí: viven en sus pantallas y las herramientas
 * los leen en el momento. Una plantilla con el horario escrito dentro sería una
 * segunda copia de la verdad, y se desincroniza el día que el negocio cambie su
 * horario y no se acuerde de venir a tocar el prompt.
 */
export function ElegirPlantilla({ hayAlgoEscrito }: { hayAlgoEscrito: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);

  const poner = (p: PlantillaDeRubro) => {
    // Los dos campos viven en el mismo formulario que este componente.
    const form = document.querySelector<HTMLFormElement>("form");
    const persona = form?.querySelector<HTMLTextAreaElement>('[name="persona"]');
    const style = form?.querySelector<HTMLInputElement>('[name="style"]');
    if (!persona) return;

    if (
      hayAlgoEscrito &&
      persona.value.trim() &&
      !confirm(
        "Esto reemplaza la personalidad que ya tienes escrita y no se puede deshacer.\n\n" +
          "¿Seguro que quieres poner la plantilla de «" + p.nombre + "»?",
      )
    ) {
      return;
    }

    persona.value = p.persona;
    if (style) style.value = p.style;
    // Sin esto React no se entera de que el valor cambió y al guardar se
    // manda el anterior: el cliente ve el texto nuevo y se guarda el viejo.
    persona.dispatchEvent(new Event("input", { bubbles: true }));
    style?.dispatchEvent(new Event("input", { bubbles: true }));
    persona.scrollIntoView({ behavior: "smooth", block: "center" });
    setAbierta(null);
  };

  return (
    <div className="mb-5 rounded-2xl border border-linea bg-tarjeta p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet/15 text-violet">
          <Sparkles className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-ink">Empieza por tu giro</h3>
      </div>
      <p className="mb-3 text-xs text-ink-3">
        Elige a qué se dedica tu negocio y te dejamos la personalidad casi lista. Después la ajustas a tu
        gusto. Los horarios, precios y servicios <b className="text-ink-2">no se escriben aquí</b>: salen de
        tus pantallas de Configuración y tu chatbot los consulta solo.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {PLANTILLAS_DE_RUBRO.map((p) => (
          <div key={p.clave} className="rounded-xl border border-linea-2 bg-suave p-3">
            <button
              type="button"
              onClick={() => setAbierta(abierta === p.clave ? null : p.clave)}
              className="flex w-full items-start gap-2 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{p.nombre}</span>
                <span className="block text-[11px] text-ink-3">{p.descripcion}</span>
              </span>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 flex-none text-ink-3 transition ${
                  abierta === p.clave ? "rotate-180" : ""
                }`}
              />
            </button>

            {abierta === p.clave && (
              <div className="mt-2 border-t border-linea pt-2">
                {/* EL TEXTO ENTERO, NO UN RESUMEN. Quien va a dejar que esto
                    hable con sus clientes tiene derecho a leerlo antes. */}
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-2">
                  {p.persona}
                </pre>
                <p className="mt-2 text-[11px] text-ink-3">
                  <b className="text-ink-2">Tono:</b> {p.style}
                </p>
                <button
                  type="button"
                  onClick={() => poner(p)}
                  className="mt-2 rounded-lg bg-demandu-gradient px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Usar esta plantilla
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
