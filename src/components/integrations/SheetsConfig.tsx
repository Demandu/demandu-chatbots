"use client";

import { useState, useTransition } from "react";
import { Table2, ExternalLink, TriangleAlert } from "lucide-react";
import { misHojas, usarHoja, nuevaHoja, apagarSheets } from "@/app/(dashboard)/settings/integrations/sheets";
import { ENCABEZADOS } from "@/lib/integrations/sheets";

export type ConfigSheets = {
  hoja_id: string;
  hoja_nombre: string | null;
  activo: boolean;
  ultimo_error: string | null;
} | null;

/**
 * Google Sheets: a qué hoja van los leads.
 *
 * DOS CAMINOS, Y EL RECOMENDADO ES CREAR UNA NUEVA. Elegir una existente
 * depende de que el cliente nos haya autorizado ese archivo, y con el permiso
 * estrecho que pedimos la lista puede salir vacía. Una hoja creada por nosotros
 * nace con el permiso correcto y con las columnas en el orden que escribimos,
 * así que las filas nunca caen descuadradas.
 */
export function SheetsConfig({
  config,
  googleConectado,
}: {
  config: ConfigSheets;
  googleConectado: boolean;
}) {
  const [hojas, setHojas] = useState<{ id: string; nombre: string }[] | null>(null);
  const [titulo, setTitulo] = useState("Leads de Demandu");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, empezar] = useTransition();

  const cargar = () =>
    empezar(async () => {
      const r = await misHojas();
      setHojas(r.hojas);
      if (r.sinGoogle) setMsg({ ok: false, texto: "Conecta primero tu cuenta de Google, aquí arriba." });
    });

  const crear = () =>
    empezar(async () => {
      const r = await nuevaHoja(titulo);
      setMsg(
        r.ok
          ? { ok: true, texto: `Listo. Los leads nuevos van a «${r.nombre}».` }
          : { ok: false, texto: r.error ?? "No se pudo." },
      );
    });

  const elegir = (id: string, nombre: string) =>
    empezar(async () => {
      const r = await usarHoja(id, nombre);
      setMsg(r.ok ? { ok: true, texto: `Listo. Los leads nuevos van a «${nombre}».` } : { ok: false, texto: r.error ?? "No se pudo." });
    });

  const activa = config?.activo && config.hoja_id;

  return (
    <div className="rounded-2xl border border-linea bg-tarjeta p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-xl text-white" style={{ backgroundColor: "#0F9D58" }}>
          <Table2 className="h-6 w-6" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-ink">Google Sheets</h3>
            {activa ? (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">Conectado</span>
            ) : (
              <span className="rounded-full bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">Sin conectar</span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Cada contacto nuevo aparece solo como una fila en tu hoja de cálculo, venga de donde
            venga: web, WhatsApp o cargado a mano.
          </p>

          {config?.ultimo_error && activa && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none text-warning" />
              Último intento falló: {config.ultimo_error}
            </p>
          )}

          {activa ? (
            <div className="mt-3">
              <p className="text-xs text-ink-2">
                Hoja: <b className="text-ink">{config!.hoja_nombre ?? "sin nombre"}</b>{" "}
                <a
                  href={`https://docs.google.com/spreadsheets/d/${config!.hoja_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-pink hover:underline"
                >
                  abrir <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <button
                onClick={() => empezar(async () => { await apagarSheets(); })}
                disabled={ocupado}
                className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-60"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-linea bg-suave p-3">
                <p className="mb-2 text-xs font-semibold text-ink">Lo más fácil: te creamos la hoja</p>
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    maxLength={80}
                    className="input-l min-w-[180px] flex-1"
                  />
                  <button onClick={crear} disabled={ocupado || !googleConectado} className="btn-primary disabled:opacity-60">
                    {ocupado ? "Creando…" : "Crear hoja"}
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-3">
                  Nace con las columnas puestas: {ENCABEZADOS.join(" · ")}
                </p>
              </div>

              <div>
                {hojas === null ? (
                  <button
                    onClick={cargar}
                    disabled={ocupado || !googleConectado}
                    className="rounded-xl border border-linea px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-suave-2 disabled:opacity-60"
                  >
                    {ocupado ? "Buscando…" : "…o usar una hoja que ya tengo"}
                  </button>
                ) : hojas.length === 0 ? (
                  <p className="text-xs text-ink-3">
                    No vemos ninguna hoja tuya. Es normal: Demandu solo puede ver los archivos que
                    le autorices expresamente. Lo más rápido es crear una arriba.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {hojas.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => elegir(h.id, h.nombre)}
                        disabled={ocupado}
                        className="block w-full truncate rounded-lg border border-linea px-3 py-1.5 text-left text-sm text-ink-2 transition hover:bg-suave-2 disabled:opacity-60"
                      >
                        {h.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!googleConectado && (
                <p className="text-xs text-ink-3">
                  Primero conecta tu cuenta de Google en la tarjeta de Google Calendar, aquí arriba.
                  Es la misma cuenta para las dos cosas.
                </p>
              )}
            </div>
          )}

          {msg && (
            <p className={`mt-3 text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.texto}</p>
          )}
        </div>
      </div>
    </div>
  );
}
