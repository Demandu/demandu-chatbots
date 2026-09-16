import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { guardarServicio, alternarServicio, borrarServicio } from "./acciones";
import { minutosQueOcupa, POR_DEFECTO_MIN, type Servicio } from "@/lib/duracionDeLaCita";
import { Clock, Plus, Trash2, Power } from "lucide-react";

export const dynamic = "force-dynamic";

/** «120» → «2 h». Nadie piensa su agenda en minutos sueltos a partir de una hora. */
function enHumano(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function precioEnHumano(centavos: number | null | undefined, moneda: string | null | undefined): string {
  if (typeof centavos !== "number") return "";
  return `${(centavos / 100).toFixed(2)} ${moneda ?? ""}`.trim();
}

/**
 * Los servicios del negocio: qué se agenda y cuánto dura.
 *
 * ── POR QUÉ ESTA PANTALLA EXISTE ───────────────────────────────────────────
 *
 * La tabla `servicios` y el motor llevaban días funcionando y no servían de
 * nada: solo se podía llenar por SQL. Una clínica no puede dar de alta
 * «Ultrasonido gemelar · 120 min» ella sola, así que TODO el mundo se quedaba
 * con la duración de fábrica — que es justo el fallo que veníamos arreglando.
 *
 * Construir el motor y no la pantalla es dejar el trabajo hecho a medias de la
 * forma más cara: parece terminado y no lo usa nadie.
 */
export default async function ServiciosPage({
  searchParams,
}: {
  searchParams?: { error?: string; ok?: string };
}) {
  const orgId = await getCurrentOrgId();
  const sb = createClient();

  const [{ data: filas }, { data: org }] = await Promise.all([
    sb.from("servicios").select("*").eq("org_id", orgId ?? "").order("orden").order("nombre"),
    sb.from("organizations").select("duracion_cita_min").eq("id", orgId ?? "").maybeSingle(),
  ]);

  const servicios = (filas ?? []) as Servicio[];
  const porDefecto = Number((org as any)?.duracion_cita_min) || POR_DEFECTO_MIN;

  return (
    <div className="max-w-3xl">
      <p className="mb-5 text-sm text-ink-2">
        Qué se puede agendar contigo y cuánto dura cada cosa. Tu chatbot usa esta lista para ofrecer
        huecos del tamaño correcto: sin ella, todas las citas duran{" "}
        <b className="text-ink">{enHumano(porDefecto)}</b>.
      </p>

      {searchParams?.error && (
        <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{searchParams.error}</p>
      )}

      {/* ── Alta y edición ────────────────────────────────────────────────── */}
      <form action={guardarServicio} className="mb-6 rounded-2xl border border-linea bg-tarjeta p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del servicio</label>
            <input name="nombre" required className="input-l" placeholder="Ultrasonido gemelar" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Dura (minutos)</label>
            <input
              name="duracion_min"
              type="number"
              min={5}
              max={1440}
              defaultValue={porDefecto}
              required
              className="input-l w-28"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Descripción (opcional)</label>
            <input name="descripcion" className="input-l" placeholder="Incluye informe y fotos" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Precio (opcional)</label>
            <input name="precio" className="input-l w-28" placeholder="2500.00" inputMode="decimal" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Moneda</label>
            <input name="moneda" maxLength={3} className="input-l w-20" placeholder="MXN" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Margen antes (min)</label>
            <input name="buffer_antes_min" type="number" min={0} max={240} defaultValue={0} className="input-l w-28" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Margen después (min)</label>
            <input name="buffer_despues_min" type="number" min={0} max={240} defaultValue={0} className="input-l w-28" />
          </div>
          <button className="btn-primary ml-auto">
            <Plus className="h-4 w-4" /> Agregar servicio
          </button>
        </div>

        <p className="mt-3 text-[11px] text-ink-3">
          Los márgenes son para limpiar la sala o preparar el equipo: ocupan tu agenda pero no se le cuentan
          al cliente como parte de su cita.
        </p>
      </form>

      {/* ── Lo que ya hay ─────────────────────────────────────────────────── */}
      {servicios.length === 0 ? (
        <p className="text-sm text-ink-3">
          Todavía no tienes servicios. Mientras no agregues ninguno, tu chatbot agenda todo con la misma
          duración de <b className="text-ink-2">{enHumano(porDefecto)}</b>.
        </p>
      ) : (
        <div className="space-y-2">
          {servicios.map((s) => {
            const ocupa = minutosQueOcupa(s);
            const apagado = s.activo === false;
            return (
              <div
                key={s.id}
                className={`flex items-start gap-3 rounded-xl border border-linea bg-tarjeta p-3.5 ${
                  apagado ? "opacity-55" : ""
                }`}
              >
                <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-violet/15 text-violet">
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">
                    {s.nombre}
                    {apagado && <span className="ml-2 text-[11px] font-normal text-ink-3">(apagado)</span>}
                  </div>
                  <div className="text-xs text-ink-3">
                    {enHumano(s.duracion_min)}
                    {/* Solo se enseña cuando de verdad ocupa más: si no, es ruido. */}
                    {ocupa !== s.duracion_min && ` · ocupa ${enHumano(ocupa)} con los márgenes`}
                    {precioEnHumano(s.precio_centavos, s.moneda) &&
                      ` · ${precioEnHumano(s.precio_centavos, s.moneda)}`}
                  </div>
                </div>

                <form action={alternarServicio} className="flex-none">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="activo" value={String(s.activo !== false)} />
                  <button
                    className="text-ink-3 transition hover:text-ink"
                    title={apagado ? "Volver a ofrecerlo" : "Dejar de ofrecerlo"}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </form>

                <form action={borrarServicio} className="flex-none">
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    className="text-ink-3 transition hover:text-danger"
                    title="Borrar. Las citas que ya se agendaron conservan su nombre, duración y precio."
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
