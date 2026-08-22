"use client";

import { useState, useTransition } from "react";
import { KeyRound, Copy, Check, TriangleAlert } from "lucide-react";
import { crearLlave, revocarLlave } from "@/app/(dashboard)/settings/integrations/llaves";

export type LlaveFila = {
  id: string;
  nombre: string;
  prefijo: string;
  created_at: string;
  ultimo_uso: string | null;
  revocada_at: string | null;
};

/**
 * Llaves de API.
 *
 * LA LLAVE SE ENSEÑA UNA SOLA VEZ. No es un descuido de la pantalla: en la base
 * solo queda su huella, así que ni nosotros podemos volver a mostrarla. Por eso
 * el aviso es grande y el botón de copiar está al lado — el momento de
 * guardarla es ese, y no hay segunda oportunidad.
 */
export function LlavesApi({ llaves }: { llaves: LlaveFila[] }) {
  const [nombre, setNombre] = useState("");
  const [reciente, setReciente] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, empezar] = useTransition();

  const crear = () =>
    empezar(async () => {
      setError("");
      const r = await crearLlave(nombre);
      if (r.ok && r.llave) {
        setReciente(r.llave);
        setNombre("");
        setCopiada(false);
      } else {
        setError(r.error ?? "No se pudo crear.");
      }
    });

  const activas = llaves.filter((l) => !l.revocada_at);
  const revocadas = llaves.filter((l) => l.revocada_at);

  return (
    <div className="rounded-2xl border border-linea bg-tarjeta p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-linea bg-tarjeta text-ink-2">
          <KeyRound className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-ink">Llaves de API</h3>
          <p className="mt-1 text-xs text-ink-3">
            Para conectar Demandu con Zapier, Make o tus propios sistemas. Cada llave da acceso a
            los datos de tu cuenta: trátala como una contraseña.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-semibold text-ink-2">
                ¿Para qué la vas a usar?
              </label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Zapier · leads a mi hoja"
                maxLength={60}
                className="input-l"
              />
            </div>
            <button onClick={crear} disabled={ocupado} className="btn-primary disabled:opacity-60">
              {ocupado ? "Creando…" : "Crear llave"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          {reciente && (
            <div className="mt-4 rounded-xl border border-warning/50 bg-warning/10 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink">
                <TriangleAlert className="h-4 w-4 text-warning" /> Cópiala ahora
              </p>
              <p className="mt-1 text-xs text-ink-2">
                Es la única vez que se muestra. Ni nosotros podemos volver a verla — si la pierdes,
                hay que crear otra.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-suave px-3 py-2 font-mono text-[12px] text-ink">
                  {reciente}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(reciente).then(() => setCopiada(true));
                  }}
                  className="flex-none rounded-lg border border-linea px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-suave-2"
                >
                  {copiada ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {activas.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {activas.map((l) => (
                <Fila key={l.id} l={l} />
              ))}
            </div>
          )}

          {revocadas.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-ink-3">
                {revocadas.length} revocada{revocadas.length > 1 ? "s" : ""}
              </summary>
              <div className="mt-1.5 space-y-1.5">
                {revocadas.map((l) => (
                  <Fila key={l.id} l={l} />
                ))}
              </div>
            </details>
          )}

          <p className="mt-4 text-[11px] text-ink-3">
            Prueba que funciona:{" "}
            <code className="font-mono">
              curl -H &quot;Authorization: Bearer TU_LLAVE&quot; https://platform.demandu.tech/api/v1/yo
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

function Fila({ l }: { l: LlaveFila }) {
  const [ocupado, empezar] = useTransition();
  const revocada = !!l.revocada_at;

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-linea px-3 py-2 ${
        revocada ? "opacity-60" : ""
      }`}
    >
      <code className="font-mono text-[12px] text-ink">{l.prefijo}…</code>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{l.nombre}</span>
      <span className="text-[11px] text-ink-3">
        {revocada
          ? `revocada ${fecha(l.revocada_at)}`
          : l.ultimo_uso
            ? `último uso ${fecha(l.ultimo_uso)}`
            : "sin usar todavía"}
      </span>
      {!revocada && (
        <button
          onClick={() => empezar(async () => { await revocarLlave(l.id); })}
          disabled={ocupado}
          className="rounded-lg border border-danger/40 px-2.5 py-1 text-[11px] font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-60"
        >
          {ocupado ? "…" : "Revocar"}
        </button>
      )}
    </div>
  );
}
