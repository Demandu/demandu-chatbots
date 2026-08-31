"use client";

import { useState } from "react";
import { Plug, Trash2, CircleCheck, TriangleAlert, Copy, Check } from "lucide-react";
import { EVENTOS } from "@/lib/salidas-eventos";
import { crearSalida, quitarSalida } from "@/app/(dashboard)/settings/integrations/salidas";

export type SalidaFila = {
  id: string;
  nombre: string;
  url: string;
  secreto: string;
  eventos: string[];
  activa: boolean;
  ultimo_intento_at: string | null;
  ultimo_estado: number | null;
  ultimo_error: string | null;
};

/**
 * Conectar Demandu con el CRM del cliente.
 *
 * POR QUÉ SE LLAMA «Enviar a tu CRM» Y NO «Webhooks». Quien lo va a usar es el
 * dueño de una tienda, no un programador: «webhook» no le dice nada, y quien sí
 * sabe qué es lo reconoce igual al ver el campo de la dirección.
 *
 * EL SECRETO SE ENSEÑA SIEMPRE, no una sola vez como las llaves de API. No es
 * una credencial para entrar a Demandu: es lo que el OTRO lado necesita para
 * comprobar que el aviso viene de nosotros. Esconderlo obligaría a rehacer la
 * salida cada vez que alguien cambia de sistema, sin ganar nada.
 */
export function SalidasCrm({ salidas }: { salidas: SalidaFila[] }) {
  const [copiado, setCopiado] = useState<string | null>(null);

  const copiar = async (id: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      /* si el navegador no deja, el valor está a la vista para copiarlo a mano */
    }
  };

  return (
    <div className="card-l p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-violet/15 text-violet">
          <Plug className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">Enviar a tu CRM</h3>
          <p className="text-xs text-ink-3">
            Cada vez que entre un lead, se agende una cita o alguien pida hablar con una persona, te
            lo mandamos a donde nos digas. Funciona con HubSpot, Zoho, Salesforce, Zapier, Make o tu
            propio sistema.
          </p>
        </div>
      </div>

      {salidas.length > 0 && (
        <div className="mb-4 space-y-2.5">
          {salidas.map((s) => {
            const fallando = s.ultimo_error !== null;
            return (
              <div key={s.id} className="rounded-xl border border-linea bg-tarjeta p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{s.nombre}</span>
                      {fallando ? (
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">
                          <TriangleAlert className="h-3 w-3" /> No está recibiendo
                        </span>
                      ) : s.ultimo_intento_at ? (
                        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-exito">
                          <CircleCheck className="h-3 w-3" /> Recibiendo
                        </span>
                      ) : (
                        <span className="flex-none rounded-full bg-suave-2 px-2 py-0.5 text-[11px] text-ink-3">
                          Sin estrenar
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{s.url}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {s.eventos.length === 0
                        ? "Le mandamos todo"
                        : `Solo: ${s.eventos.join(", ")}`}
                    </p>
                    {fallando && (
                      <p className="mt-1 text-[11px] text-danger">
                        Último error: {s.ultimo_error}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <code className="truncate rounded bg-suave px-2 py-1 font-mono text-[11px] text-ink-2">
                        {s.secreto}
                      </code>
                      <button
                        type="button"
                        onClick={() => copiar(s.id, s.secreto)}
                        className="flex-none text-ink-3 transition hover:text-ink"
                        title="Copiar el secreto de firma"
                      >
                        {copiado === s.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-ink-3">
                      Con este secreto tu sistema puede comprobar que el aviso viene de Demandu. Va
                      firmado en la cabecera <b className="text-ink-2">X-Demandu-Firma</b>.
                    </p>
                  </div>

                  <form action={quitarSalida} className="flex-none">
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-ink-3 transition hover:text-danger" title="Quitar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <form action={crearSalida} className="rounded-xl border border-linea-2 bg-suave/40 p-3">
        <div className="grid gap-2.5 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-2">Nombre</label>
            <input name="nombre" placeholder="Mi HubSpot" className="input-l w-full" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-2">
              Dirección a la que enviamos
            </label>
            <input
              name="url"
              required
              type="url"
              placeholder="https://..."
              className="input-l w-full font-mono text-xs"
            />
          </div>
        </div>

        <p className="mb-1.5 mt-3 text-[11px] font-semibold text-ink-2">Qué quieres que te mandemos</p>
        <div className="flex flex-wrap gap-2">
          {EVENTOS.map((e) => (
            <label
              key={e.clave}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-linea-2 px-2.5 py-1.5 text-xs text-ink-2 transition hover:border-violet/40"
              title={e.desc}
            >
              <input type="checkbox" name={`ev_${e.clave}`} defaultChecked className="accent-violet" />
              {e.nombre}
            </label>
          ))}
        </div>

        <button className="btn-primary mt-3 px-4 py-2 text-sm">Conectar</button>
        <p className="mt-2 text-[11px] text-ink-3">
          Solo direcciones que empiecen por <b className="text-ink-2">https</b>: por http, los datos de
          tus leads viajarían sin cifrar.
        </p>
      </form>
    </div>
  );
}
