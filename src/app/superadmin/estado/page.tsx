import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { QUE_ES } from "@/lib/estado/servicios";
import { CALIDAD, LIMITE } from "@/lib/estado/meta";
import { revisarAhora, revisarMetaAhora } from "./acciones";
import { CheckCircle2, XCircle, HelpCircle, RefreshCw, TriangleAlert, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Estado de la plataforma.
 *
 * DOS DECISIONES QUE ORDENAN ESTA PANTALLA:
 *
 * 1. **Gris no es verde.** Cuando no se pudo medir algo, se dice. Un tablero
 *    que ante la duda pinta verde es peor que no tener tablero: da calma
 *    falsa justo cuando hace falta lo contrario.
 *
 * 2. **Se ordena por quién hay que llamar hoy**, no por consumo ni por
 *    alfabeto. La lista de Meta va de más riesgo a menos, porque el sentido
 *    entero de medir esto es adelantarse.
 */

const NOMBRE: Record<string, string> = {
  "base-de-datos": "Base de datos",
  "motor-whatsapp": "Motor de WhatsApp",
  "plataforma-web": "Plataforma web",
  "meta-whatsapp": "Meta / WhatsApp",
  "inteligencia-artificial": "Inteligencia artificial",
  "cobros-stripe": "Cobros (Stripe)",
};

function haceCuanto(v: string | null | undefined): string {
  if (!v) return "nunca";
  const min = Math.floor((Date.now() - Date.parse(v)) / 60000);
  if (!Number.isFinite(min)) return "nunca";
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** Pasadas dos horas, la medición ya no dice cómo están las cosas AHORA. */
function estaVieja(v: string | null | undefined): boolean {
  if (!v) return true;
  return Date.now() - Date.parse(v) > 2 * 60 * 60 * 1000;
}

export default async function EstadoPage() {
  const admin = createAdminClient();

  const [{ data: servicios }, { data: salud }, { data: orgs }] = await Promise.all([
    admin.from("estado_servicios").select("*"),
    admin.from("meta_salud").select("*").order("riesgo", { ascending: false, nullsFirst: false }),
    admin.from("organizations").select("id, name"),
  ]);

  const nombreDe = new Map<string, string>(((orgs as any[]) ?? []).map((o) => [o.id, o.name]));
  const lista = (servicios as any[]) ?? [];
  const metas = (salud as any[]) ?? [];

  const orden = Object.keys(NOMBRE);
  lista.sort((a, b) => orden.indexOf(a.servicio) - orden.indexOf(b.servicio));

  const caidos = lista.filter((s) => s.ok === false).length;
  const sinMedir = lista.filter((s) => s.ok === null).length;
  const enRiesgo = metas.filter((m) => (m.riesgo ?? 0) >= 30).length;
  const ultima = lista.length ? lista[0].medido_at : null;
  const vieja = estaVieja(ultima);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Estado de la plataforma</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Qué está funcionando y qué cuenta de Meta corre riesgo. Sirve para llamar al cliente{" "}
            <b className="text-ink">antes</b> de que le pase algo, no después.
          </p>
        </div>
        <form action={revisarAhora}>
          <button className="btn-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Revisar ahora
          </button>
        </form>
      </div>

      {/* Si la última medición es vieja, eso es LO PRIMERO que hay que saber:
          todo lo de abajo puede estar contando cómo estaban las cosas ayer. */}
      {(vieja || !lista.length) && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-ink-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none text-aviso" />
          <span>
            {!lista.length ? (
              <>
                <b className="text-ink">Nunca se ha revisado.</b> Los datos de abajo no existen todavía. Pulsa
                «Revisar ahora» — y para que esto se vigile solo hace falta programar la tarea.
              </>
            ) : (
              <>
                <b className="text-ink">La última revisión es de {haceCuanto(ultima)}.</b> Lo de abajo puede
                estar viejo. Mientras la tarea programada no exista, esto solo se actualiza a mano.
              </>
            )}
          </span>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Servicios caídos", String(caidos), caidos > 0],
          ["Sin poder medir", String(sinMedir), false],
          ["Cuentas de Meta en riesgo", String(enRiesgo), enRiesgo > 0],
        ].map(([t, v, malo]: any) => (
          <div key={t} className={`card-l p-4 ${malo ? "border-danger/40" : ""}`}>
            <p className="text-xs text-ink-3">{t}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${malo ? "text-danger" : "text-ink"}`}>{v}</p>
          </div>
        ))}
      </div>

      <h3 className="mb-3 font-display text-lg font-semibold text-ink">Servicios</h3>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {lista.map((s) => {
          const Icono = s.ok === true ? CheckCircle2 : s.ok === false ? XCircle : HelpCircle;
          const color = s.ok === true ? "text-exito" : s.ok === false ? "text-danger" : "text-ink-3";
          const borde =
            s.ok === false ? "border-danger/40 bg-danger/5" : s.ok === null ? "border-linea bg-suave" : "border-linea";
          return (
            <div key={s.servicio} className={`rounded-xl border p-4 ${borde}`}>
              <div className="flex items-start gap-2.5">
                <Icono className={`mt-0.5 h-4 w-4 flex-none ${color}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{NOMBRE[s.servicio] ?? s.servicio}</p>
                    {s.latencia_ms != null && (
                      <span className="text-[11px] text-ink-3">{s.latencia_ms} ms</span>
                    )}
                  </div>
                  <p className={`mt-0.5 text-sm ${s.ok === false ? "text-danger" : "text-ink-2"}`}>{s.detalle}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">{QUE_ES[s.servicio] ?? ""}</p>
                </div>
              </div>
            </div>
          );
        })}
        {!lista.length && (
          <p className="text-sm text-ink-3">Todavía no hay ninguna medición.</p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-ink">Cuentas de Meta por cliente</h3>
        <form action={revisarMetaAhora}>
          <button className="btn-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Consultar a Meta
          </button>
        </form>
      </div>

      {!metas.length ? (
        <div className="rounded-xl border border-linea bg-suave px-4 py-6 text-center text-sm text-ink-3">
          Todavía no se ha consultado a Meta. Pulsa «Consultar a Meta».
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Calidad</th>
                <th className="px-4 py-3">Puede enviar</th>
                <th className="px-4 py-3">Riesgo</th>
                <th className="px-4 py-3">Qué pasa</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => {
                const cal = CALIDAD[m.calidad ?? "UNKNOWN"] ?? CALIDAD.UNKNOWN;
                const riesgo = m.riesgo;
                return (
                  <tr key={m.org_id} className="border-t border-linea bg-tarjeta align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/superadmin/clientes/${m.org_id}`}
                        className="inline-flex items-center gap-1 font-semibold text-ink hover:text-pink"
                      >
                        {nombreDe.get(m.org_id) ?? "—"} <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                      <div className="text-[11px] text-ink-3">{haceCuanto(m.medido_at)}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {m.numero ?? "—"}
                      {m.nombre_para_mostrar && (
                        <div className="text-xs text-ink-3">{m.nombre_para_mostrar}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.error ? (
                        <span className="text-xs text-ink-3">—</span>
                      ) : (
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            cal.tono === "bien"
                              ? "bg-success/15 text-exito"
                              : cal.tono === "ojo"
                                ? "bg-warning/20 text-aviso"
                                : "bg-danger/15 text-danger"
                          }`}
                        >
                          {cal.texto}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {m.limite_envio ? LIMITE[m.limite_envio] ?? m.limite_envio : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {/* Sin medición NO hay riesgo bajo: hay riesgo desconocido. */}
                      {m.error || riesgo == null ? (
                        <span className="inline-block rounded-md bg-suave-2 px-2 py-0.5 text-[11px] font-bold text-ink-3">
                          Sin datos
                        </span>
                      ) : (
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            riesgo >= 50
                              ? "bg-danger/15 text-danger"
                              : riesgo >= 30
                                ? "bg-warning/20 text-aviso"
                                : "bg-success/15 text-exito"
                          }`}
                        >
                          {riesgo}/100
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.error ? (
                        <span className="text-xs text-danger">{m.error}</span>
                      ) : (m.motivos ?? []).length ? (
                        <ul className="space-y-1 text-xs text-ink-2">
                          {(m.motivos as string[]).map((x, i) => (
                            <li key={i}>· {x}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-ink-3">Todo en orden</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-l mt-6 max-w-3xl p-5 text-sm leading-relaxed text-ink-2">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">Cómo leer esto</h3>
        <p>
          <b className="text-ink">Meta no avisa antes de bloquear un número.</b> Lo que sí hace es bajarle la
          calidad primero: verde, amarillo, rojo. Ese semáforo va por delante del problema, y por eso lo
          miramos.
        </p>
        <p className="mt-2">
          Un cliente en <b className="text-aviso">amarillo</b> tiene arreglo — casi siempre es que está
          escribiendo a gente que no pidió nada, o mandando plantillas que se marcan como no deseadas. Uno en{" "}
          <b className="text-danger">rojo</b> está a un paso de que le limiten o le bloqueen el número, y ahí
          ya hay poco que hacer. La llamada hay que hacerla en amarillo.
        </p>
        <p className="mt-2">
          <b className="text-ink">«Sin datos» no quiere decir que esté bien</b>: quiere decir que no pudimos
          preguntarle a Meta — casi siempre un token caducado. Eso hay que resolverlo igual que un problema,
          porque mientras tanto estamos ciegos con ese cliente.
        </p>
      </div>
    </div>
  );
}
