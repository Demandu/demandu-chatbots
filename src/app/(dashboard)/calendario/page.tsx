import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { getCurrentOrgId } from "@/lib/org";
import { cargarAgenda } from "@/lib/agenda/cargar";
import { cuantasAgendoLana } from "@/lib/agenda/vista";

export const dynamic = "force-dynamic";

/**
 * LA AGENDA DEL NEGOCIO.
 *
 * Enseña lo que de verdad hay en su calendario —incluido lo que puso a mano— y
 * marca cuáles agendó el bot. Esa marca es lo que hace que la pantalla valga:
 * un negocio que ve «4 de tus 7 citas las agendó tu bot» entiende lo que paga
 * sin que nadie se lo explique.
 */

const DIAS = 30;

function agrupaPorDia(citas: { inicio: string }[]) {
  const dias = new Map<string, any[]>();
  for (const c of citas) {
    const d = new Date(c.inicio);
    const clave = isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
    if (!clave) continue;
    (dias.get(clave) ?? dias.set(clave, []).get(clave)!).push(c);
  }
  return [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const dia = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long",
  });

const hora = (iso: string, todoElDia: boolean) =>
  todoElDia ? "Todo el día"
    : new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });

export default async function CalendarioPage() {
  const orgId = await getCurrentOrgId();
  const agenda = orgId ? await cargarAgenda(orgId, DIAS) : { ok: false as const, motivo: "sin_agenda" as const };

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Calendario</span>} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="font-display text-2xl font-bold text-ink">Calendario</h2>

        {!agenda.ok && agenda.motivo === "sin_agenda" && (
          <div className="mt-6 rounded-2xl border border-linea bg-tarjeta p-6">
            <p className="text-ink-2">
              Todavía no tienes una agenda conectada. Conecta tu Google Calendar y aquí
              verás tus citas, incluidas las que agende tu chatbot.
            </p>
            <Link href="/settings/integrations" className="btn-soft mt-4 inline-block px-4 py-2 text-sm">
              Conectar mi agenda
            </Link>
          </div>
        )}

        {/* NO SE PUDO MIRAR NO ES «NO TIENES NADA». Son dos cosas distintas y se
            arreglan distinto: decir «no tienes citas» con la conexión rota manda
            al negocio a buscar un problema que no existe. */}
        {!agenda.ok && agenda.motivo === "no_se_pudo_leer" && (
          <div className="mt-6 rounded-2xl border border-linea bg-tarjeta p-6">
            <p className="font-semibold text-ink">No se pudo leer tu calendario.</p>
            <p className="mt-1 text-ink-2">
              Esto no quiere decir que no tengas citas: quiere decir que la conexión con
              Google no está respondiendo. Vuelve a conectarla y prueba otra vez.
            </p>
            <Link href="/settings/integrations" className="btn-soft mt-4 inline-block px-4 py-2 text-sm">
              Revisar la conexión
            </Link>
          </div>
        )}

        {agenda.ok && (
          <>
            <p className="mb-6 mt-1 text-ink-2">
              {agenda.citas.length === 0
                ? `No tienes nada agendado en los próximos ${DIAS} días.`
                : `${agenda.citas.length} ${agenda.citas.length === 1 ? "cita" : "citas"} en los próximos ${DIAS} días` +
                  (cuantasAgendoLana(agenda.citas) > 0
                    ? ` · ${cuantasAgendoLana(agenda.citas)} las agendó tu chatbot`
                    : "")}
            </p>

            <div className="space-y-6">
              {agrupaPorDia(agenda.citas).map(([clave, delDia]) => (
                <div key={clave}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
                    {dia(clave)}
                  </p>
                  <ul className="space-y-2">
                    {delDia.map((c: any) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-linea bg-tarjeta p-3"
                      >
                        <span className="w-24 flex-none text-sm font-semibold text-ink">
                          {hora(c.inicio, c.todoElDia)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{c.titulo}</span>
                          {c.nombre && (
                            <span className="block truncate text-xs text-ink-3">
                              {c.nombre}
                              {c.correo ? ` · ${c.correo}` : ""}
                            </span>
                          )}
                        </span>

                        {c.quien === "lana" ? (
                          <span className="flex-none rounded-full bg-pink/15 px-2 py-0.5 text-[11px] font-semibold text-pink">
                            La agendó tu bot
                          </span>
                        ) : (
                          <span className="flex-none rounded-full bg-suave px-2 py-0.5 text-[11px] text-ink-3">
                            Tuya
                          </span>
                        )}

                        {/* La cita existe y a esa persona no le llegó nada. Se dice
                            aquí porque es el único sitio donde se puede ver. */}
                        {c.sinInvitacion && (
                          <span
                            title="Se agendó por chat pero sin correo, así que no se envió invitación."
                            className="flex-none rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600"
                          >
                            Sin invitación
                          </span>
                        )}

                        {c.conversacionId && (
                          <Link
                            href={`/inbox?c=${c.conversacionId}`}
                            className="btn-soft flex-none px-2.5 py-1 text-xs"
                          >
                            Ver chat
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
