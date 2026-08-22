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
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);

  /**
   * Comprobar la llave sin salir de la pantalla.
   *
   * Solo se puede hacer AQUÍ, con la llave recién creada: en cuanto se cierre
   * esta tarjeta deja de existir en claro, ni siquiera para nosotros. Por eso
   * el botón vive junto al aviso de "cópiala ahora" y no en la lista de abajo.
   */
  const probar = async () => {
    if (!reciente) return;
    setProbando(true);
    setPrueba(null);
    try {
      const r = await fetch("/api/v1/yo", { headers: { Authorization: `Bearer ${reciente}` } });
      const j = await r.json();
      setPrueba(
        r.ok && j?.ok
          ? { ok: true, texto: `Funciona — conectada a «${j.organizacion?.nombre ?? "tu cuenta"}»` }
          : { ok: false, texto: j?.error ?? "La llave no funcionó." },
      );
    } catch {
      setPrueba({ ok: false, texto: "No se pudo comprobar. Revisa tu conexión." });
    } finally {
      setProbando(false);
    }
  };

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
                  title="Copiar"
                  className="flex-none rounded-lg border border-linea px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-suave-2"
                >
                  {copiada ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {/* Comprobarla es cosa de un clic, no de un comando. Y solo se
                  puede AQUÍ: en cuanto se cierre esta tarjeta la llave deja de
                  existir en claro, ni siquiera para nosotros. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  onClick={probar}
                  disabled={probando}
                  className="rounded-lg border border-linea bg-tarjeta px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-suave-2 disabled:opacity-60"
                >
                  {probando ? "Probando…" : "Probar la llave"}
                </button>
                {prueba && (
                  <span className={`text-xs font-semibold ${prueba.ok ? "text-success" : "text-danger"}`}>
                    {prueba.texto}
                  </span>
                )}
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

          {/* Lo técnico, escondido. Quien conecta Zapier lo busca; quien no,
              no tiene por qué tropezarse con un comando de terminal en la
              pantalla de su negocio. */}
          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-ink-3">
              Para quien programa: dirección y ejemplo
            </summary>
            <div className="mt-2 space-y-1.5 rounded-xl border border-linea bg-suave p-3">
              <p className="text-[11px] text-ink-2">
                Base: <code className="font-mono text-ink">https://platform.demandu.tech/api/v1</code>
                {" · "}autenticación por cabecera{" "}
                <code className="font-mono text-ink">Authorization: Bearer TU_LLAVE</code>
              </p>
              <pre className="overflow-x-auto rounded-lg bg-tarjeta p-2.5 font-mono text-[11px] text-ink-2">
{`curl -H "Authorization: Bearer TU_LLAVE" \\
  https://platform.demandu.tech/api/v1/yo`}
              </pre>
            </div>
          </details>
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
