import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { Filtros } from "@/components/analytics/Filtros";
import { GraficaTiempo, BarrasHorizontales, Dona, ColumnasHora, SinDatos } from "@/components/analytics/Charts";
import {
  numero, porcentaje, duracion, efectividadAgente, resultadosVacios,
  NOMBRE_CANAL, COLOR_CANAL, type Resultados, type Agrupacion,
} from "@/lib/analytics";
import { dinero } from "@/lib/crm";
import {
  MessagesSquare, UserPlus, Send, UserRound, Timer, Trophy, Info, Settings2,
  KanbanSquare, CalendarClock,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ResultadosPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sb = createClient();
  const orgId = await getCurrentOrgId();

  const s = (k: string) => {
    const v = searchParams?.[k];
    return typeof v === "string" ? v : "";
  };

  // Por defecto, los últimos 30 días. En el primer render el servidor todavía
  // no sabe la zona horaria de quien mira y usa UTC; el navegador la corrige
  // enseguida (ver Filtros).
  const ahora = new Date();
  const hastaDefecto = new Date(ahora.getTime() + 86_400_000);
  const desdeDefecto = new Date(ahora.getTime() - 29 * 86_400_000);

  const desde = s("desde") || desdeDefecto.toISOString();
  const hasta = s("hasta") || hastaDefecto.toISOString();
  const bucket = (["day", "week", "month", "quarter", "year"].includes(s("bucket"))
    ? s("bucket")
    : "day") as Agrupacion;
  const bot = s("bot") || null;
  const canal = s("canal") || null;
  const tz = s("tz") || "UTC";

  // Todo el tablero llega en UNA consulta: si cada tarjeta pidiera lo suyo
  // serían ~15 viajes a la base cada vez que se mueve el filtro de fechas.
  const [resBots, resDatos] = await Promise.all([
    sb.from("bots").select("id, name, channel").order("created_at"),
    orgId
      ? sb.rpc("analytics_overview", {
          p_org: orgId,
          p_desde: desde,
          p_hasta: hasta,
          p_bucket: bucket,
          p_bot: bot,
          p_channel: canal,
          p_tz: tz,
        })
      : null,
  ]);

  const bots = (resBots?.data ?? []) as { id: string; name: string; channel: string }[];
  const error = resDatos?.error ?? null;
  const r: Resultados = (resDatos?.data as Resultados) ?? resultadosVacios();
  // Los canales del selector salen de los chatbots que el cliente tiene, no de
  // los datos del periodo: si no, al filtrar por un canal se quedaría sin poder
  // volver a los demás.
  const canales = Array.from(
    new Set([...bots.map((b) => b.channel).filter(Boolean), ...(r.por_canal ?? []).map((c) => c.canal)]),
  );

  const tarjetas = [
    {
      titulo: "Conversaciones",
      valor: numero(r.totales.conversaciones),
      pie: `${numero(r.totales.contactos)} personas distintas`,
      icono: MessagesSquare,
      tinte: "bg-violet/12 text-violet",
    },
    {
      titulo: "Clientes nuevos",
      valor: numero(r.totales.nuevos),
      pie: `${numero(r.totales.recurrentes)} ya nos habían escrito`,
      icono: UserPlus,
      tinte: "bg-pink/12 text-pink",
    },
    {
      titulo: "Mensajes",
      valor: numero(r.mensajes.total),
      pie: `${r.mensajes.por_conversacion} por conversación · ${r.mensajes.por_dia} al día`,
      icono: Send,
      tinte: "bg-info/12 text-info",
    },
    {
      titulo: "Pasaron a una persona",
      valor: numero(r.totales.a_humano),
      pie: `${porcentaje(r.totales.a_humano_pct, 1)} de las conversaciones`,
      icono: UserRound,
      tinte: "bg-warning/15 text-aviso",
    },
    {
      titulo: "Tarda en contestar",
      valor: duracion(r.respuesta.mediana_seg),
      pie:
        r.respuesta.respuestas > 0
          ? `mediana de ${numero(r.respuesta.respuestas)} respuestas del equipo`
          : "todavía nadie del equipo ha contestado",
      icono: Timer,
      tinte: "bg-success/15 text-exito",
    },
    {
      titulo: "Efectividad de cierre",
      valor: r.cierre.efectividad === null ? "—" : porcentaje(r.cierre.efectividad, 0),
      pie:
        `${numero(r.cierre.ganadas)} ganadas · ${numero(r.cierre.perdidas)} perdidas` +
        (r.cierre.importe_ganado ? ` · ${dinero(r.cierre.importe_ganado)}` : ""),
      icono: Trophy,
      tinte: "bg-pink/12 text-pink",
    },
  ];

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Resultados</span>} />
      <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        <div className="mb-5">
          <h1 className="font-display text-2xl font-bold text-ink">Resultados</h1>
          <p className="mt-1 text-sm text-ink-2">
            Cuánta gente te escribe, qué tan bien contesta el bot y cómo va tu equipo.
          </p>
        </div>

        <Filtros bots={bots} canales={canales.length ? canales : ["whatsapp", "webchat"]} />

        {error && (
          <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-ink-2">
            No se pudieron cargar los números. Vuelve a intentarlo en un momento.
          </div>
        )}

        {/* ── Lo que hay que atender HOY ─────────────────────────────────── */}
        {/* Va antes que las gráficas a propósito: es lo único de esta pantalla
            sobre lo que se puede actuar ahora mismo. */}
        {(r.seguimiento?.sin_proximo_paso > 0 || r.seguimiento?.con_vencida > 0) && (
          <Link
            href="/crm"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 transition hover:border-warning"
          >
            <CalendarClock className="h-5 w-5 flex-none text-aviso" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-2">
              {r.seguimiento.sin_proximo_paso > 0 && (
                <>
                  <b className="text-ink">{numero(r.seguimiento.sin_proximo_paso)}</b> de tus{" "}
                  {numero(r.seguimiento.abiertas)} oportunidades abiertas no tienen ningún próximo
                  paso agendado.
                </>
              )}
              {r.seguimiento.con_vencida > 0 && (
                <>
                  {" "}
                  Y hay <b className="text-ink">{numero(r.seguimiento.con_vencida)}</b> con una
                  tarea vencida.
                </>
              )}
            </p>
            <span className="flex-none text-sm font-semibold text-violet">Ver el embudo →</span>
          </Link>
        )}

        {/* ── Los seis números de arriba ─────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-3 xl:grid-cols-6">
          {tarjetas.map((t) => (
            <div key={t.titulo} className="card-l p-4">
              <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${t.tinte}`}>
                <t.icono className="h-4 w-4" />
              </div>
              <div className="font-display text-[26px] font-bold leading-none text-ink">{t.valor}</div>
              <div className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{t.titulo}</div>
              <div className="mt-1 text-xs leading-snug text-ink-2">{t.pie}</div>
            </div>
          ))}
        </div>

        {/* ── Evolución ──────────────────────────────────────────────────── */}
        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <Tarjeta titulo="Conversaciones" sub="Cuántas empezaron en cada periodo">
            <GraficaTiempo
              datos={r.serie ?? []}
              agrupacion={bucket}
              series={[
                { clave: "conversaciones", nombre: "Total", color: "#6E42FF", area: true },
                { clave: "nuevos", nombre: "Clientes nuevos", color: "#F64A97" },
                { clave: "a_humano", nombre: "Pasaron a una persona", color: "#FFC857" },
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo="Mensajes" sub="Lo que te escriben y lo que se responde">
            <GraficaTiempo
              datos={r.serie_mensajes ?? []}
              agrupacion={bucket}
              series={[
                { clave: "entrantes", nombre: "Te escribieron", color: "#3A85FF", area: true },
                { clave: "salientes", nombre: "Se respondió", color: "#3DDC97" },
              ]}
            />
          </Tarjeta>
        </div>

        {/* ── Canal, reparto y horas ─────────────────────────────────────── */}
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <Tarjeta titulo="Por canal" sub="De dónde llegan tus clientes">
            <BarrasHorizontales
              filas={(r.por_canal ?? []).map((c) => ({
                etiqueta: NOMBRE_CANAL[c.canal] ?? c.canal,
                valor: c.conversaciones,
                color: COLOR_CANAL[c.canal] ?? "#6E42FF",
                nota: `${numero(c.mensajes)} mensajes · ${numero(c.a_humano)} pasaron a una persona`,
              }))}
            />
          </Tarjeta>

          <Tarjeta titulo="Nuevos vs. que regresan" sub="Cuánta gente vuelve a escribirte">
            <Dona
              partes={[
                { nombre: "Clientes nuevos", valor: r.totales.nuevos, color: "#F64A97" },
                { nombre: "Ya te habían escrito", valor: r.totales.recurrentes, color: "#6E42FF" },
              ]}
              centro={numero(r.totales.conversaciones)}
              subcentro="conversaciones"
            />
          </Tarjeta>

          <Tarjeta titulo="A qué horas te escriben" sub={`Hora de ${r.meta?.tz ?? tz}`}>
            <ColumnasHora datos={r.por_hora ?? []} />
          </Tarjeta>
        </div>

        {/* ── Chatbots ───────────────────────────────────────────────────── */}
        <div className="mb-6">
          <Tarjeta titulo="Por chatbot" sub="Cuál de tus chatbots trabaja más">
            <BarrasHorizontales
              filas={(r.por_bot ?? []).map((b) => ({
                etiqueta: b.nombre,
                valor: b.conversaciones,
                color: COLOR_CANAL[b.canal] ?? "#6E42FF",
                // El renglón "Sin chatbot asignado" no tiene canal: existe para
                // que los totales cuadren, no para señalar a un chatbot.
                nota: b.canal
                  ? `${NOMBRE_CANAL[b.canal] ?? b.canal} · ${numero(b.mensajes)} mensajes`
                  : `${numero(b.mensajes)} mensajes · entraron antes de quedar ligadas a un chatbot`,
              }))}
            />
          </Tarjeta>
        </div>

        {/* ── Flujos ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <Tarjeta
            titulo="Qué flujo funciona mejor"
            sub="De cada 100 personas que entran al flujo, cuántas lo terminan"
          >
            {!(r.por_flujo ?? []).length ? (
              <Aviso>
                Todavía no hay recorridos registrados. Esta tabla se llena sola en cuanto tus
                clientes empiecen a conversar con los chatbots — antes de hoy la plataforma no
                guardaba por qué flujos pasaba cada charla, así que no hay historial que mostrar.
              </Aviso>
            ) : (
              <Tabla
                columnas={["Flujo", "Entraron", "Lo terminaron", "Pasaron a una persona", "Se quedaron a medias", "Bloques", "Efectividad"]}
                filas={(r.por_flujo ?? []).map((f) => [
                  <span key="n" className="font-medium text-ink">{f.nombre}</span>,
                  numero(f.entradas),
                  numero(f.completadas),
                  numero(f.a_humano),
                  numero(f.abandonadas + f.reiniciadas),
                  String(f.pasos_promedio ?? 0),
                  <Pastilla key="e" valor={f.efectividad} />,
                ])}
              />
            )}
          </Tarjeta>
        </div>

        {/* ── Equipo ─────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <Tarjeta titulo="Tu equipo" sub="Cuánto atiende cada persona y qué tan rápido contesta">
            {!(r.por_agente ?? []).length ? (
              <SinDatos texto="Ninguna persona del equipo atendió conversaciones en este periodo." />
            ) : (
              <Tabla
                columnas={["Persona", "Conversaciones", "Mensajes", "Tarda en contestar", "Ganadas", "Vendido", "Efectividad"]}
                filas={(r.por_agente ?? []).map((a) => [
                  <span key="n" className="font-medium text-ink">{a.nombre}</span>,
                  numero(a.conversaciones),
                  numero(a.mensajes),
                  duracion(a.respuesta_mediana_seg),
                  numero(a.ganadas),
                  dinero(a.importe_ganado) || "—",
                  <Pastilla key="e" valor={efectividadAgente(a)} />,
                ])}
              />
            )}
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              El tiempo se mide desde el último mensaje del cliente hasta la primera respuesta de
              una persona. Lo que contesta el bot no cuenta: responde al instante y taparía el dato
              real de tu equipo.
            </p>
          </Tarjeta>
        </div>

        {/* ── Cierre ─────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo="Cierre" sub="De lo que ya decidiste, cuánto terminó en venta">
            {!r.meta?.hay_embudo ? (
              <Aviso>
                Todavía no hay oportunidades en el embudo. Se crean solas en cuanto un cliente te
                escriba —{" "}
                <Link href="/crm" className="font-semibold text-violet underline">
                  ve el tablero
                </Link>
                .
              </Aviso>
            ) : !r.meta?.hay_cierre ? (
              <Aviso>
                Para medir esto, la plataforma necesita saber cuáles de tus estados significan
                “vendido” y cuáles “se perdió”.{" "}
                <Link href="/settings/states" className="font-semibold text-violet underline">
                  Márcalos en Estados de conversación
                </Link>{" "}
                y este número aparece solo.
              </Aviso>
            ) : (
              <Dona
                partes={[
                  { nombre: "Ganadas", valor: r.cierre.ganadas, color: "#3DDC97" },
                  { nombre: "Perdidas", valor: r.cierre.perdidas, color: "#FF5A5F" },
                  { nombre: "Todavía abiertas", valor: r.cierre.abiertas, color: "#c9cce0" },
                ]}
                centro={r.cierre.efectividad === null ? "—" : `${Math.round(r.cierre.efectividad)}%`}
                subcentro="de cierre"
              />
            )}
            {!!r.cierre.importe_abierto && (
              <p className="mt-3 text-xs text-ink-2">
                Tienes <b className="text-ink">{dinero(r.cierre.importe_abierto)}</b> todavía en
                juego en las oportunidades abiertas.
              </p>
            )}
          </Tarjeta>

          <Tarjeta titulo="En qué etapa está cada oportunidad" sub="Tu embudo, como tú lo definiste">
            {!(r.por_estado ?? []).length ? (
              <SinDatos texto="Todavía no tienes etapas en tu embudo." />
            ) : (
              <BarrasHorizontales
                filas={(r.por_estado ?? []).map((e) => ({
                  etiqueta: e.nombre,
                  valor: e.conversaciones,
                  color: e.color || "#6E42FF",
                  nota: [
                    e.importe ? dinero(e.importe) : "",
                    e.outcome === "ganado" ? "Cuenta como venta ganada"
                    : e.outcome === "perdido" ? "Cuenta como perdida" : "",
                  ].filter(Boolean).join(" · ") || undefined,
                }))}
              />
            )}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Link href="/crm" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet hover:underline">
                <KanbanSquare className="h-3.5 w-3.5" />
                Abrir el embudo
              </Link>
              <Link href="/settings/states" className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet hover:underline">
                <Settings2 className="h-3.5 w-3.5" />
                Configurar mis etapas
              </Link>
            </div>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

// ─── Piezas de la pantalla ───────────────────────────────────────────────────

function Tarjeta({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card-l p-5">
      <h2 className="font-display text-base font-semibold text-ink">{titulo}</h2>
      {sub && <p className="mb-4 mt-0.5 text-xs text-ink-3">{sub}</p>}
      {children}
    </section>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-linea-2 bg-tarjeta-2 p-4 text-sm leading-relaxed text-ink-2">
      <Info className="mt-0.5 h-4 w-4 flex-none text-violet" />
      <div>{children}</div>
    </div>
  );
}

/** Porcentaje con color: verde si va bien, ámbar a medias, rojo si va mal. */
function Pastilla({ valor }: { valor: number | null | undefined }) {
  if (valor === null || valor === undefined) {
    return <span className="text-ink-3">—</span>;
  }
  const v = Number(valor);
  const tono =
    v >= 60 ? "bg-success/15 text-exito"
    : v >= 30 ? "bg-warning/20 text-aviso"
    : "bg-danger/12 text-alerta";
  return (
    <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${tono}`}>
      {Math.round(v)} %
    </span>
  );
}

function Tabla({ columnas, filas }: { columnas: string[]; filas: React.ReactNode[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr>
            {columnas.map((c, i) => (
              <th
                key={c}
                className={`border-b border-linea pb-2 text-xs font-semibold uppercase tracking-wide text-ink-3 ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-b border-[#f2f3f9] last:border-0">
              {f.map((celda, j) => (
                <td key={j} className={`py-2.5 ${j === 0 ? "text-left text-ink" : "text-right text-ink-2"}`}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
