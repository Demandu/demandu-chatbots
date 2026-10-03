import { Megaphone, Info, Repeat2 } from "lucide-react";
import { BarrasHorizontales, SinDatos } from "./Charts";
import { numero, porcentaje } from "@/lib/analytics";
import { dinero } from "@/lib/crm";

/** Una fila del desglose por UTM: una fuente, un medio o un anuncio. */
export type FilaDeUtm = { valor: string; leads: number; importe: number };

export type ResumenDeCampanas = {
  total_leads: number;
  total_con_campana: number;
  /** Conversaciones que arrancó un anuncio en el periodo (no personas). */
  charlas_con_campana?: number;
  /** Lo que han comprado los leads que llegaron en el periodo. */
  importe_total?: number;
  moneda?: string;
  /** El cliente vende en más de una moneda: el total es aproximado. */
  monedas_mezcladas?: boolean;
  por_plataforma: {
    plataforma: string;
    leads: number;
    pasaron_a_persona: number;
    conversaciones?: number;
    importe?: number;
  }[];
  por_campana: {
    campana: string;
    titular: string | null;
    plataforma: string;
    leads: number;
    pasaron_a_persona: number;
    conversaciones?: number;
    importe?: number;
  }[];
  /** Campañas que no trajeron a nadie nuevo pero hicieron VOLVER a alguien. */
  volvieron?: {
    campana: string;
    titular: string | null;
    plataforma: string;
    conversaciones: number;
  }[];
  por_fuente?: FilaDeUtm[];
  por_medio?: FilaDeUtm[];
  por_contenido?: FilaDeUtm[];
};

/**
 * Cómo se llama cada origen para quien paga los anuncios.
 *
 * META VA JUNTO, y no es pereza: el webhook de WhatsApp manda EL MISMO objeto
 * para un anuncio visto en Facebook y para uno visto en Instagram — no incluye
 * la colocación. Poner dos barras separadas sería repartir a ojo un número que
 * no tenemos, y alguien tomaría decisiones de presupuesto con él.
 */
const NOMBRE: Record<string, string> = {
  meta: "Facebook e Instagram",
  google: "Google",
  tiktok: "TikTok",
  bing: "Bing",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X (Twitter)",
  enlace: "Enlace propio (QR, web, volante)",
};
const COLOR: Record<string, string> = {
  meta: "#0866FF",
  google: "#EA4335",
  tiktok: "#00F2EA",
  bing: "#00A4EF",
  linkedin: "#0A66C2",
  youtube: "#FF0000",
  x: "#111111",
  enlace: "#6E42FF",
};

export function Campanas({ datos }: { datos: ResumenDeCampanas }) {
  const conCampana = datos.total_con_campana ?? 0;
  const totales = datos.total_leads ?? 0;
  const sinAtribuir = Math.max(0, totales - conCampana);
  const importe = Number(datos.importe_total ?? 0);
  const moneda = datos.moneda || "MXN";
  const volvieron = datos.volvieron ?? [];
  const desgloses: { titulo: string; filas: FilaDeUtm[] }[] = [
    { titulo: "Por fuente", filas: datos.por_fuente ?? [] },
    { titulo: "Por medio", filas: datos.por_medio ?? [] },
    { titulo: "Anuncio por anuncio", filas: datos.por_contenido ?? [] },
  ].filter((d) => d.filas.length > 0);

  return (
    <div className="card-l p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-violet/15 text-violet">
          <Megaphone className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Leads que trajo la publicidad</h3>
          <p className="text-xs text-ink-3">
            Quién llegó por un anuncio, y cuántos de esos pidieron hablar con una persona.
          </p>
        </div>
      </div>

      {conCampana === 0 ? (
        <SinDatos texto="Todavía no llegó ningún lead identificado con una campaña." />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato titulo="Desde anuncios" valor={numero(conCampana)} />
            <Dato
              titulo="Del total de leads"
              valor={totales ? porcentaje(Math.round((100 * conCampana) / totales)) : "—"}
              nota={`${numero(totales)} en el periodo`}
            />
            <Dato titulo="Llegaron por su cuenta" valor={numero(sinAtribuir)} />
            {/* LA CIFRA POR LA QUE SE ABRE ESTA TARJETA. Va la última porque se
                lee de izquierda a derecha y es la conclusión, no el dato de
                partida: cien leads que no compran no son una buena campaña. */}
            <Dato
              titulo="Han comprado"
              valor={dinero(importe, moneda) || "—"}
              nota={
                datos.monedas_mezcladas
                  ? "Aproximado: vendes en más de una moneda"
                  : conCampana > 0
                    ? `${dinero(Math.round(importe / conCampana), moneda)} por lead`
                    : undefined
              }
            />
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Por plataforma</p>
          <BarrasHorizontales
            filas={(datos.por_plataforma ?? []).map((p) => ({
              etiqueta: NOMBRE[p.plataforma] ?? p.plataforma,
              valor: p.leads,
              color: COLOR[p.plataforma] ?? "#6E42FF",
              nota:
                p.leads > 0
                  ? [
                      Number(p.importe ?? 0) > 0 ? dinero(Number(p.importe), moneda) : null,
                      `${numero(p.pasaron_a_persona)} pidieron una persona`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : undefined,
            }))}
            sufijo="leads"
          />

          {(datos.por_campana ?? []).length > 0 && (
            <>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                Campaña por campaña
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-xs text-ink-3">
                      <th className="pb-2 font-medium">Campaña</th>
                      {/* EL DINERO VA PRIMERO, pegado al nombre, porque es la
                          columna por la que se abre esta tabla. La de leads
                          dice cuánta gente miró; esta dice cuánta pagó, y un
                          anuncio que trae cien curiosos vale menos que uno que
                          trae diez que compran. */}
                      <th className="pb-2 text-right font-medium">Han comprado</th>
                      <th className="pb-2 text-right font-medium">Leads</th>
                      <th className="pb-2 text-right font-medium">Pidieron persona</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.por_campana.map((c) => (
                      <tr key={c.campana} className="border-b border-linea-2 last:border-0">
                        <td className="py-2 pr-3">
                          <span className="block truncate text-ink">{c.titular || c.campana}</span>
                          <span className="block truncate font-mono text-[11px] text-ink-3">
                            {NOMBRE[c.plataforma] ?? c.plataforma} · {c.campana}
                            {Number(c.conversaciones ?? 0) > 0
                              ? ` · ${numero(Number(c.conversaciones))} charlas`
                              : ""}
                          </span>
                        </td>
                        {/* Un cero se escribe «—» a propósito: un «$0» se lee
                            como un dato medido y esto casi siempre significa
                            que esa venta no pasó por la plataforma. */}
                        <td className="py-2 text-right font-semibold text-ink">
                          {Number(c.importe ?? 0) > 0 ? dinero(Number(c.importe), moneda) : "—"}
                        </td>
                        <td className="py-2 text-right text-ink-2">{numero(c.leads)}</td>
                        <td className="py-2 text-right text-ink-2">
                          {numero(c.pasaron_a_persona)}
                          {c.leads > 0 && (
                            <span className="ml-1 text-[11px] text-ink-3">
                              {porcentaje(Math.round((100 * c.pasaron_a_persona) / c.leads))}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── LOS QUE VOLVIERON ────────────────────────────────────────
              Estas campañas no trajeron a nadie NUEVO en el periodo, así que
              en la tabla de arriba no saldrían: salen con cero y parecerían
              inútiles. Lo que hicieron fue traer de vuelta a gente que ya era
              cliente, y eso también se paga. */}
          {volvieron.length > 0 && (
            <>
              <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                <Repeat2 className="h-3.5 w-3.5" /> Hicieron volver a gente que ya tenías
              </p>
              <div className="flex flex-wrap gap-2">
                {volvieron.map((c) => (
                  <span
                    key={c.campana}
                    className="rounded-lg border border-linea bg-tarjeta-2 px-2.5 py-1.5 text-xs text-ink-2"
                  >
                    <b className="text-ink">{c.titular || c.campana}</b>{" "}
                    <span className="text-ink-3">
                      {NOMBRE[c.plataforma] ?? c.plataforma} · {numero(c.conversaciones)} charlas
                    </span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── EL DESGLOSE POR UTM ──────────────────────────────────────
              Solo aparece cuando hay UTMs que desglosar, que en la práctica
              quiere decir «este cliente trae gente desde su web». Quien solo
              usa click-to-WhatsApp no ve una sección vacía pidiéndole algo que
              no tiene por qué configurar. */}
          {desgloses.map((d) => (
            <div key={d.titulo}>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                {d.titulo}
              </p>
              <BarrasHorizontales
                filas={d.filas.map((f) => ({
                  etiqueta: f.valor,
                  valor: f.leads,
                  color: "#6E42FF",
                  nota: Number(f.importe ?? 0) > 0 ? dinero(Number(f.importe), moneda) : undefined,
                }))}
                sufijo="leads"
              />
            </div>
          ))}
        </>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-linea bg-suave/40 p-3 text-xs leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 flex-none text-violet" />
        <span>
          <b className="text-ink">«Han comprado» es de la gente, no del mes.</b> Se toman los leads
          que llegaron en estas fechas y se suma todo lo que esas personas te han comprado, aunque la
          compra sea posterior. Así un anuncio de enero no parece inútil en el informe de marzo.
          Cuenta los pedidos que no se cancelaron —también los de pago contra entrega— y las
          oportunidades que marcaste como ganadas.
          <br />
          <b className="text-ink">Facebook e Instagram van juntos</b> porque WhatsApp no dice en cuál
          de las dos se vio el anuncio: manda el mismo dato para ambas. Separarlas sería inventarlo.
          <br />
          Para medir <b className="text-ink">Google</b> u otro origen en WhatsApp, pon en el enlace del
          anuncio un mensaje ya escrito con tu código:{" "}
          <code className="rounded bg-suave px-1 font-mono text-[11px] text-ink-2">
            wa.me/TUNUMERO?text=Hola%20[cmp:google-verano]
          </code>
          . El código llega con el primer mensaje y aparece aquí. En el{" "}
          <b className="text-ink">chat de tu web</b> no hay que hacer nada: los{" "}
          <code className="rounded bg-suave px-1 font-mono text-[11px] text-ink-2">utm_</code> y el{" "}
          <code className="rounded bg-suave px-1 font-mono text-[11px] text-ink-2">gclid</code> del
          enlace del anuncio se leen solos.
        </span>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-linea bg-tarjeta-2 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-3">{titulo}</div>
      <div className="mt-0.5 text-xl font-bold text-ink">{valor}</div>
      {nota && <div className="text-[11px] text-ink-3">{nota}</div>}
    </div>
  );
}
