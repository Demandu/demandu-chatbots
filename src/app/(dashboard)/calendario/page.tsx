import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { getCurrentOrgId } from "@/lib/org";
import { cargarAgenda } from "@/lib/agenda/cargar";
import { cuantasAgendoLana } from "@/lib/agenda/vista";
import { mesEnCuadricula, mesVecino, diaEnZona } from "@/lib/agenda/mes";
import { guardarCalendariosVisibles } from "./acciones";

export const dynamic = "force-dynamic";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Cuántas caben en una celda antes de resumir. Más de tres no se leen. */
const CABEN = 3;

function mesPedido(sp: { m?: string }) {
  const hoy = new Date();
  const t = String(sp?.m ?? "").trim();
  const m = /^(\d{4})-(\d{1,2})$/.exec(t);
  if (!m) return { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1 };
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  // Un mes fuera de rango en la dirección no puede dejar la pantalla en blanco.
  if (mes < 1 || mes > 12 || anio < 2020 || anio > 2100) {
    return { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1 };
  }
  return { anio, mes };
}

export default async function CalendarioPage({ searchParams }: { searchParams: { m?: string } }) {
  const { anio, mes } = mesPedido(searchParams);
  const orgId = await getCurrentOrgId();

  // Se pide el mes entero más un margen, para que la primera y la última
  // semana —que traen días del mes de al lado— no salgan vacías por recorte.
  const desde = new Date(Date.UTC(anio, mes - 1, 1) - 7 * 86400000);
  const hasta = new Date(Date.UTC(anio, mes, 1) + 7 * 86400000);

  const agenda = orgId
    ? await cargarAgenda(orgId, desde, hasta)
    : { ok: false as const, motivo: "sin_agenda" as const, citas: [], calendarios: [], zona: "UTC" };

  const grid = mesEnCuadricula(anio, mes, agenda.citas, agenda.zona);
  const hoy = diaEnZona(new Date().toISOString(), agenda.zona);
  const antes = mesVecino(anio, mes, -1);
  const luego = mesVecino(anio, mes, 1);
  const delMes = agenda.citas.filter((c) => (diaEnZona(c.inicio, agenda.zona) ?? "").startsWith(
    `${anio}-${String(mes).padStart(2, "0")}`,
  ));

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Calendario</span>} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-bold text-ink">
            {MESES[mes - 1]} {anio}
          </h2>
          <div className="flex items-center gap-1">
            <Link href={`/calendario?m=${antes.anio}-${antes.mes}`} className="btn-soft px-2.5 py-1 text-sm">←</Link>
            <Link href="/calendario" className="btn-soft px-2.5 py-1 text-sm">Hoy</Link>
            <Link href={`/calendario?m=${luego.anio}-${luego.mes}`} className="btn-soft px-2.5 py-1 text-sm">→</Link>
          </div>
          {agenda.ok && delMes.length > 0 && (
            <span className="text-sm text-ink-2">
              {delMes.length} {delMes.length === 1 ? "cita" : "citas"}
              {cuantasAgendoLana(delMes) > 0 && ` · ${cuantasAgendoLana(delMes)} las agendó tu chatbot`}
            </span>
          )}
        </div>

        {!agenda.ok && agenda.motivo === "sin_agenda" && (
          <div className="rounded-2xl border border-linea bg-tarjeta p-6">
            <p className="text-ink-2">
              Todavía no tienes una agenda conectada. Conecta tu Google Calendar y aquí verás
              tus citas, incluidas las que agende tu chatbot.
            </p>
            <Link href="/settings/integrations" className="btn-soft mt-4 inline-block px-4 py-2 text-sm">
              Conectar mi agenda
            </Link>
          </div>
        )}

        {/* NO SE PUDO MIRAR NO ES «NO TIENES NADA». Se arreglan distinto. */}
        {!agenda.ok && agenda.motivo === "no_se_pudo_leer" && (
          <div className="rounded-2xl border border-linea bg-tarjeta p-6">
            <p className="font-semibold text-ink">No se pudo leer tu calendario.</p>
            <p className="mt-1 text-ink-2">
              Esto no quiere decir que no tengas citas: la conexión con Google no está
              respondiendo. Vuelve a conectarla y prueba otra vez.
            </p>
            <Link href="/settings/integrations" className="btn-soft mt-4 inline-block px-4 py-2 text-sm">
              Revisar la conexión
            </Link>
          </div>
        )}

        {agenda.ok && (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-7 gap-px">
                  {DIAS.map((d) => (
                    <div key={d} className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-linea bg-linea">
                  {grid.map((celda) => (
                    <div
                      key={celda.dia}
                      className={`min-h-[104px] bg-tarjeta p-1.5 ${celda.delMes ? "" : "opacity-45"}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={
                            celda.dia === hoy
                              ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink text-[11px] font-bold text-white"
                              : "text-[11px] font-semibold text-ink-3"
                          }
                        >
                          {Number(celda.dia.slice(8))}
                        </span>
                      </div>

                      <ul className="space-y-1">
                        {celda.citas.slice(0, CABEN).map((c: any) => (
                          <li
                            key={c.id}
                            title={`${c.titulo}${c.nombre ? ` · ${c.nombre}` : ""}${c.sinInvitacion ? " · sin invitación" : ""}`}
                            className={`truncate rounded px-1 py-0.5 text-[11px] leading-tight ${
                              c.quien === "lana"
                                ? "bg-pink/15 text-pink"
                                : "bg-suave text-ink-2"
                            }`}
                          >
                            {!c.todoElDia && (
                              <span className="font-semibold">
                                {new Date(c.inicio).toLocaleTimeString("es-MX", {
                                  hour: "numeric", minute: "2-digit", timeZone: agenda.zona,
                                })}{" "}
                              </span>
                            )}
                            {c.titulo}
                            {c.sinInvitacion && " ⚠"}
                          </li>
                        ))}
                        {celda.citas.length > CABEN && (
                          <li className="px-1 text-[11px] text-ink-3">
                            +{celda.citas.length - CABEN} más
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-pink/40" /> La agendó tu chatbot
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded bg-suave" /> Tuya
              </span>
              <span>⚠ Se agendó sin correo, así que no se envió invitación</span>
            </p>

            {/* ── QUÉ CALENDARIOS SE VEN ──────────────────────────────────────
                Un calendario de trabajo lleva médicos, colegios y cumpleaños.
                Esta pantalla la abre el equipo, así que el negocio decide qué
                aparece — y de fábrica solo el principal y donde ya agenda. */}
            {agenda.calendarios.length > 0 && (
              <details className="mt-6 rounded-2xl border border-linea bg-tarjeta p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink">
                  Qué calendarios se ven aquí
                  <span className="ml-2 font-normal text-ink-3">
                    ({agenda.calendarios.filter((c) => c.visible).length} de {agenda.calendarios.length})
                  </span>
                </summary>
                <p className="mt-2 text-xs text-ink-3">
                  Solo tú decides cuáles aparecen. Ten en cuenta que esta pantalla la ve
                  todo tu equipo.
                </p>
                <form action={guardarCalendariosVisibles} className="mt-3">
                  <ul className="space-y-2">
                    {agenda.calendarios.map((c) => (
                      <li key={c.id} className="flex items-center gap-2 text-sm text-ink-2">
                        <input
                          type="checkbox"
                          name="calendario"
                          value={c.id}
                          defaultChecked={c.visible}
                          id={`cal-${c.id}`}
                        />
                        <label htmlFor={`cal-${c.id}`} className="min-w-0 truncate">{c.nombre}</label>
                      </li>
                    ))}
                  </ul>
                  <button className="btn-soft mt-3 px-4 py-1.5 text-xs">Guardar</button>
                </form>
              </details>
            )}
          </>
        )}
      </div>
    </>
  );
}
