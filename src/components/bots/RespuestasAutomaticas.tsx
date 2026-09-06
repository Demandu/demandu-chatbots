"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { MediaUpload } from "@/components/builder/MediaUpload";
import { DONDE_PROMO } from "@/lib/canales/respuestasAutomaticas";
import { guardarDondeContesta, guardarPromo, borrarPromo } from "@/app/(dashboard)/bots/[id]/respuestas/acciones";

type Sitio = {
  valor: string;
  label: string;
  desc: string;
  admitePublica: boolean;
  encendido: boolean;
  publica: boolean;
};

type Promo = {
  nombre: string;
  palabra: string;
  mensaje: string;
  archivo: string;
  donde: string;
  publica: boolean;
  activa: boolean;
};

/**
 * La pantalla simple: interruptores y promociones.
 *
 * ES DE CLIENTE por una sola razón: la casilla «y también en el comentario»
 * solo tiene sentido si el sitio está encendido, y la de subir archivo necesita
 * enseñar el nombre de lo subido. Todo lo demás son formularios normales que
 * guardan en el servidor.
 */
export function RespuestasAutomaticas({
  botId,
  orgId,
  sitios,
  promos,
}: {
  botId: string;
  orgId: string | null;
  sitios: Sitio[];
  promos: Promo[];
}) {
  const [estado, setEstado] = useState(sitios);
  const [abierta, setAbierta] = useState(false);

  const cambiar = (valor: string, patch: Partial<Sitio>) =>
    setEstado((s) => s.map((x) => (x.valor === valor ? { ...x, ...patch } : x)));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* ── DÓNDE CONTESTA LANA ─────────────────────────────────────────── */}
      <form action={guardarDondeContesta} className="card-l p-5 sm:p-6">
        <input type="hidden" name="bot_id" value={botId} />

        <h3 className="font-display text-lg font-bold text-ink">Dónde contesta Lana</h3>
        <p className="mt-1 text-sm text-ink-2">
          Lo que está encendido lo contesta ella sola, con la información de tu negocio que hayas
          puesto en Entrenamiento.
        </p>

        <div className="mt-4 flex flex-col divide-y divide-linea">
          {estado.map((s) => (
            <div key={s.valor} className="flex flex-col gap-2 py-3.5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name={`on_${s.valor}`}
                  value="si"
                  checked={s.encendido}
                  onChange={(e) => cambiar(s.valor, { encendido: e.target.checked })}
                  className="mt-0.5 h-4 w-4 flex-none accent-pink"
                />
                <span className="min-w-0">
                  <b className="text-sm font-semibold text-ink">{s.label}</b>
                  <span className="block text-xs leading-relaxed text-ink-2">{s.desc}</span>
                </span>
              </label>

              {/* La segunda casilla solo cuando hay comentario donde contestar
                  Y el sitio está encendido: ofrecerla apagada sería dejar
                  marcada una opción que no puede pasar. */}
              {s.admitePublica && s.encendido && (
                <label className="ml-7 flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    name={`pub_${s.valor}`}
                    value="si"
                    checked={s.publica}
                    onChange={(e) => cambiar(s.valor, { publica: e.target.checked })}
                    className="h-3.5 w-3.5 accent-pink"
                  />
                  Que además conteste en el comentario, a la vista de todos
                </label>
              )}
            </div>
          ))}
        </div>

        <button className="btn-primary mt-5 h-9 px-4 text-sm">Guardar</button>
      </form>

      {/* ── PROMOCIONES ─────────────────────────────────────────────────── */}
      <div className="card-l p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Promociones por palabra</h3>
            <p className="mt-1 max-w-xl text-sm text-ink-2">
              «Comenta ENVÍO y te mando el catálogo». Escribes la palabra y lo que quieres mandar;
              cuando alguien la escriba, le llega por privado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            className="btn-ghost h-9 whitespace-nowrap px-4 text-sm"
          >
            {abierta ? "Cancelar" : "Añadir promoción"}
          </button>
        </div>

        {abierta && <FormularioDePromo botId={botId} orgId={orgId} onListo={() => setAbierta(false)} />}

        {promos.length === 0 ? (
          <p className="mt-4 text-sm text-ink-2">Todavía no tienes ninguna.</p>
        ) : (
          <div className="mt-4 flex flex-col divide-y divide-linea">
            {promos.map((p) => (
              <div key={p.nombre} className="flex items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <b className="text-sm font-semibold text-ink">{p.palabra}</b>
                  <span className="ml-2 rounded-full bg-suave px-2 py-0.5 text-[11px] text-ink-2">
                    {DONDE_PROMO.find((d) => d.valor === p.donde)?.label ?? p.donde}
                  </span>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{p.mensaje}</p>
                  {p.archivo && <p className="mt-0.5 text-[11px] text-ink-2">Con archivo adjunto</p>}
                </div>

                <form action={borrarPromo}>
                  <input type="hidden" name="bot_id" value={botId} />
                  <input type="hidden" name="palabra" value={p.palabra} />
                  <button
                    className="rounded-lg p-2 text-ink-2 transition hover:bg-danger/10 hover:text-danger"
                    aria-label={`Borrar la promoción ${p.palabra}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** El formulario de una promoción nueva. */
function FormularioDePromo({
  botId,
  orgId,
  onListo,
}: {
  botId: string;
  orgId: string | null;
  onListo: () => void;
}) {
  const [archivo, setArchivo] = useState<{ url: string; nombre: string; tipo: string } | null>(null);

  return (
    <form action={guardarPromo} onSubmit={onListo} className="mt-4 flex flex-col gap-3 rounded-2xl border border-linea bg-suave/40 p-4">
      <input type="hidden" name="bot_id" value={botId} />
      <input type="hidden" name="archivo" value={archivo?.url ?? ""} />
      <input type="hidden" name="tipo_archivo" value={archivo?.tipo ?? "file"} />

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px] flex-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            La palabra
          </label>
          <input name="palabra" required maxLength={40} placeholder="envío" className="input h-9 text-sm" />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-2">
            Dónde vale
          </label>
          <select name="donde" defaultValue="ambos" className="input h-9 text-sm">
            {DONDE_PROMO.map((d) => (
              <option key={d.valor} value={d.valor}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-2">
          Lo que le llega por privado
        </label>
        <textarea
          name="mensaje"
          required
          rows={3}
          maxLength={900}
          placeholder="¡Aquí lo tienes! Estos son nuestros precios de envío 👇"
          className="input py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-2">
          Un enlace (opcional)
        </label>
        <input name="enlace" maxLength={500} placeholder="https://mitienda.com/catalogo" className="input h-9 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-2">
          O un archivo (opcional)
        </label>
        <MediaUpload
          orgId={orgId}
          kind="file"
          value={archivo?.url}
          fileName={archivo?.nombre}
          onUploaded={(p) =>
            setArchivo({ url: p.mediaUrl, nombre: p.mediaName ?? "archivo", tipo: p.mediaType ?? "file" })
          }
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" name="publica" value="si" defaultChecked className="h-3.5 w-3.5 accent-pink" />
        Cuando lo comenten, que Lana conteste también en el comentario
      </label>

      <button className="btn-primary h-9 self-start px-4 text-sm">Guardar promoción</button>
    </form>
  );
}
