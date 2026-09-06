import { Gift, Percent, CalendarPlus, X } from "lucide-react";
import { FEATURES } from "@/lib/planes/features";
import { regalarDias, regalarFuncion, quitarRegalo, darDescuento, quitarSuDescuento } from "@/app/superadmin/clientes/regalos";

/**
 * Los tratos que se le pueden dar a un cliente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PANTALLA SEPARA LO QUE LA GENTE CONFUNDE. «Regálale un mes» significa dos
 * cosas distintas y elegir mal cuesta dinero:
 *
 *   · Si TODAVÍA NO PAGA, se le alarga la prueba. Es una fecha nuestra.
 *   · Si YA PAGA, alargar la prueba no hace NADA — Stripe le cobra igual el día
 *     que toca. Ahí hace falta un cupón.
 *
 * Por eso la caja de arriba cambia según su estado, y la de los descuentos dice
 * en su propio texto que solo sirve para quien ya paga. Poner las dos iguales
 * sería confiar en que quien la usa se acuerde de la diferencia a las siete de
 * la tarde de un viernes.
 *
 * TODO PIDE UN MOTIVO. No es burocracia: dentro de tres meses alguien va a
 * preguntar por qué este cliente tiene la tienda gratis, y la respuesta no
 * puede ser «ni idea». Nadie se atreve a quitar un regalo que no sabe de dónde
 * salió.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function Tratos({
  orgId,
  yaPaga,
  pruebaHasta,
  regalos,
  descuento,
}: {
  orgId: string;
  yaPaga: boolean;
  pruebaHasta: string | null;
  regalos: { clave: string; hasta: string; motivo: string | null }[];
  descuento: { texto: string } | null;
}) {
  const fecha = (d: string) => new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  const diasQueFaltan = (d: string) =>
    Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));

  return (
    <div className="card-l p-5">
      <h3 className="font-display text-base font-semibold text-ink">Tratos con este cliente</h3>
      <p className="mt-1 text-xs text-ink-3">
        Todo queda apuntado en la bitácora con quién lo dio y por qué.
      </p>

      {/* ── Tiempo ──────────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-linea p-4">
        <div className="flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-violet" />
          <h4 className="text-sm font-semibold text-ink">Regalar tiempo</h4>
        </div>

        {yaPaga ? (
          // NO SE ESCONDE EL FORMULARIO, SE EXPLICA. Esconderlo dejaría a quien
          // lo busca pensando que la plataforma no puede hacerlo.
          <p className="mt-2 rounded-lg border border-aviso/30 bg-aviso-suave px-3 py-2 text-xs text-ink-2">
            Este cliente <b className="text-ink">ya paga por Stripe</b>. Alargarle la prueba no le
            ahorra nada: se le cobrará igual el día que toque. Para regalarle tiempo, usa
            «Mes gratis» aquí abajo.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-3">
              Se suma a lo que le quede.
              {pruebaHasta && ` Ahora tiene hasta el ${fecha(pruebaHasta)}.`}
            </p>
            <form action={regalarDias} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="org_id" value={orgId} />
              <label className="text-xs font-semibold text-ink-2">
                Días
                <input name="dias" inputMode="numeric" placeholder="30" className="input-l mt-1 w-24" />
              </label>
              <label className="flex-1 text-xs font-semibold text-ink-2">
                Por qué
                <input name="motivo" placeholder="Se le cayó el número, compensación" className="input-l mt-1" />
              </label>
              <button className="btn-primary">Regalar</button>
            </form>
          </>
        )}
      </div>

      {/* ── Funciones ───────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-linea p-4">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-pink" />
          <h4 className="text-sm font-semibold text-ink">Regalar una función</h4>
        </div>
        <p className="mt-1 text-xs text-ink-3">
          Con fecha: se apaga sola. Sin fecha, un «te lo dejo un mes» se convierte en gratis para
          siempre en cuanto se nos olvida quitarlo.
        </p>

        {regalos.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {regalos.map((r) => (
              <li
                key={r.clave}
                className="flex items-center justify-between gap-3 rounded-lg bg-suave px-3 py-2 text-xs"
              >
                <span className="text-ink">
                  <b>{FEATURES[r.clave as keyof typeof FEATURES]?.nombre ?? r.clave}</b> · quedan{" "}
                  {diasQueFaltan(r.hasta)} días (hasta el {fecha(r.hasta)})
                  {r.motivo && <span className="text-ink-3"> · {r.motivo}</span>}
                </span>
                <form action={quitarRegalo}>
                  <input type="hidden" name="org_id" value={orgId} />
                  <input type="hidden" name="clave" value={r.clave} />
                  <button className="inline-flex items-center gap-1 text-ink-3 hover:text-danger" title="Quitar">
                    <X className="h-3.5 w-3.5" /> quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={regalarFuncion} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="org_id" value={orgId} />
          <label className="text-xs font-semibold text-ink-2">
            Función
            <select name="clave" className="input-l mt-1">
              {Object.values(FEATURES).map((f) => (
                <option key={f.clave} value={f.clave}>{f.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-2">
            Días
            <input name="dias" inputMode="numeric" placeholder="30" className="input-l mt-1 w-24" />
          </label>
          <label className="flex-1 text-xs font-semibold text-ink-2">
            Por qué
            <input name="motivo" placeholder="Para que la pruebe antes de comprarla" className="input-l mt-1" />
          </label>
          <button className="btn-primary">Regalar</button>
        </form>
      </div>

      {/* ── Dinero ──────────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-linea p-4">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-exito" />
          <h4 className="text-sm font-semibold text-ink">Descuento o meses gratis</h4>
        </div>
        {/* SE DICE QUE VA A STRIPE. Quien lo usa tiene que saber que esto toca
            de verdad lo que se le cobra a una tarjeta. */}
        <p className="mt-1 text-xs text-ink-3">
          Se aplica en Stripe, sobre su suscripción. Solo funciona con clientes que ya pagan.
        </p>

        {descuento && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-suave px-3 py-2 text-xs">
            <span className="text-ink">
              Ahora tiene: <b>{descuento.texto}</b>
            </span>
            <form action={quitarSuDescuento}>
              <input type="hidden" name="org_id" value={orgId} />
              <button className="inline-flex items-center gap-1 text-ink-3 hover:text-danger">
                <X className="h-3.5 w-3.5" /> quitar
              </button>
            </form>
          </div>
        )}

        <form action={darDescuento} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="hidden" name="org_id" value={orgId} />
          <label className="text-xs font-semibold text-ink-2">
            Qué le das
            <select name="tipo" className="input-l mt-1">
              <option value="mes_gratis">Meses gratis (100%)</option>
              <option value="porcentaje">Un porcentaje de descuento</option>
            </select>
          </label>
          <div className="flex gap-2">
            <label className="text-xs font-semibold text-ink-2">
              %
              <input name="porcentaje" inputMode="numeric" placeholder="30" className="input-l mt-1 w-20" />
            </label>
            <label className="text-xs font-semibold text-ink-2">
              Meses
              <input name="meses" inputMode="numeric" placeholder="1" className="input-l mt-1 w-20" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" name="siempre" />
            Para siempre (solo con porcentaje)
          </label>
          <label className="text-xs font-semibold text-ink-2">
            Por qué
            <input name="motivo" placeholder="Cliente que trajo tres referidos" className="input-l mt-1" />
          </label>
          <div className="sm:col-span-2">
            <button className="btn-primary">Aplicar en Stripe</button>
          </div>
        </form>
      </div>
    </div>
  );
}
