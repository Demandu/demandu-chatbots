import { createAdminClient } from "@/lib/supabase/admin";
import { ponerTopeIA } from "./actions";
import { TriangleAlert, Check } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Cuánto consume cada cliente, y cuánto nos cuesta.
 *
 * LO QUE SE MIRA AQUÍ NO ES QUIÉN USA MÁS IA. Un cliente grande que usa mucho
 * es un buen cliente. Lo que importa es **cuánto cuesta su IA comparado con lo
 * que paga** — por eso la tabla se ordena por ahí y no por consumo bruto.
 */

/** Lo que cuesta una respuesta de IA. Un solo sitio para cambiarlo. */
const COSTO_POR_RESPUESTA = 0.0028;

/** A partir de aquí conviene mirar. Por debajo, el margen está sano. */
const OJO_DESDE_PCT = 20;
/** A partir de aquí hay que hacer algo. */
const ACTUAR_DESDE_PCT = 35;

const usd = (v: number) =>
  `$${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ConsumoPage() {
  const admin = createAdminClient();
  const { data } = await admin.rpc("consumo_de_clientes");

  const filas = ((data as any[]) ?? [])
    .map((c) => {
      const ia = Number(c.ia_usada ?? 0);
      const precio = Number(c.precio ?? 0);
      const costo = ia * COSTO_POR_RESPUESTA;
      // Cuánto de lo que paga se va en pagarle la IA. Esta es LA cifra.
      const pct = precio > 0 ? (costo / precio) * 100 : ia > 0 ? 100 : 0;
      const msgs = Number(c.mensajes_usados ?? 0);
      return {
        ...c,
        ia,
        precio,
        costo,
        pct,
        msgs,
        // Qué tan "pensante" es su bot. Un bot con 80% de IA está mal armado
        // o hace algo que no previmos: en los dos casos conviene mirarlo.
        intensidad: msgs > 0 ? Math.round((ia / msgs) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  const costoTotal = filas.reduce((s, f) => s + f.costo, 0);
  const ingresoTotal = filas.reduce((s, f) => s + f.precio, 0);
  const enRiesgo = filas.filter((f) => f.pct >= OJO_DESDE_PCT).length;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-ink">Consumo por cliente</h2>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-ink-2">
        Mensajes y respuestas de IA de este mes. La columna que importa es{" "}
        <b className="text-ink">cuánto de lo que paga cada uno se va en pagarle su IA</b> — no cuánta IA usa en bruto.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Lo que nos cuesta la IA este mes", usd(costoTotal)],
          ["De un ingreso mensual de", usd(ingresoTotal)],
          ["Clientes para mirar", String(enRiesgo)],
        ].map(([t, v]) => (
          <div key={t} className="card-l p-4">
            <p className="text-xs text-ink-3">{t}</p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linea">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Mensajes</th>
              <th className="px-4 py-3">Respuestas de IA</th>
              <th className="px-4 py-3">Nos cuesta</th>
              <th className="px-4 py-3">De lo que paga</th>
              <th className="px-4 py-3">Freno</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => {
              const actuar = c.pct >= ACTUAR_DESDE_PCT;
              const ojo = !actuar && c.pct >= OJO_DESDE_PCT;
              return (
                <tr key={c.org_id} className="border-t border-linea bg-tarjeta align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{c.negocio ?? "—"}</div>
                    <div className="text-xs text-ink-3">
                      {c.plan_nombre ?? c.plan_code ?? "sin plan"}
                      {c.precio > 0 && ` · ${usd(c.precio)}/mes`}
                      {c.estado_cobro && c.estado_cobro !== "activa" && ` · ${c.estado_cobro}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {c.msgs.toLocaleString("es-MX")}
                    <span className="text-ink-3"> / {Number(c.mensajes_limite ?? 0).toLocaleString("es-MX")}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {c.ia.toLocaleString("es-MX")}
                    {c.intensidad > 0 && (
                      <div className="text-xs text-ink-3">{c.intensidad}% de sus mensajes</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{usd(c.costo)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        actuar
                          ? "bg-danger/15 text-danger"
                          : ojo
                            ? "bg-warning/20 text-aviso"
                            : "bg-success/15 text-exito"
                      }`}
                    >
                      {actuar || ojo ? <TriangleAlert className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                      {c.pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <form action={ponerTopeIA} className="flex items-center gap-1.5">
                      <input type="hidden" name="org_id" value={c.org_id} />
                      <input
                        name="tope"
                        defaultValue={c.tope_ia ?? ""}
                        placeholder="sin tope"
                        inputMode="numeric"
                        className="input-l w-24 px-2 py-1 text-xs"
                      />
                      <button className="btn-soft px-2.5 py-1 text-xs">Guardar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card-l mt-6 max-w-3xl p-5 text-sm leading-relaxed text-ink-2">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">Cómo leer esto</h3>
        <p>
          Con los planes actuales, <b className="text-ink">aunque un cliente usara el 100% de su plan en respuestas
          de IA</b>, el costo se queda entre el 14% y el 19% de lo que paga. El margen está estructuralmente
          protegido: la IA no puede desbordarse porque cada respuesta de IA es también un mensaje, y los mensajes
          ya están topados.
        </p>
        <p className="mt-2">
          Por eso, si aquí ves a alguien por encima del <b className="text-ink">{OJO_DESDE_PCT}%</b>, casi nunca es
          que «use mucha IA»: es que hay algo raro. Un plan a la medida mal calculado, un flujo en bucle, o un uso
          que no habíamos previsto. <b className="text-ink">Mira qué pasa antes de ponerle un freno.</b>
        </p>
        <p className="mt-2">
          <b className="text-ink">El freno no cobra más: limita.</b> Al llegar al tope el bot sigue funcionando con
          sus flujos y botones y solo deja de pensar respuestas nuevas. Subirle el precio a alguien sin que lo
          acepte es cómo se consiguen contracargos; el freno es para acotar el costo mientras hablas con él y
          acuerdan subirlo de plan.
        </p>
      </div>
    </div>
  );
}
