import { Megaphone, Info } from "lucide-react";
import { BarrasHorizontales, SinDatos } from "./Charts";
import { numero, porcentaje } from "@/lib/analytics";

export type ResumenDeCampanas = {
  total_leads: number;
  total_con_campana: number;
  por_plataforma: { plataforma: string; leads: number; pasaron_a_persona: number }[];
  por_campana: {
    campana: string;
    titular: string | null;
    plataforma: string;
    leads: number;
    pasaron_a_persona: number;
  }[];
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
  enlace: "Enlace propio (QR, web, volante)",
};
const COLOR: Record<string, string> = {
  meta: "#0866FF",
  google: "#EA4335",
  tiktok: "#00F2EA",
  enlace: "#6E42FF",
};

export function Campanas({ datos }: { datos: ResumenDeCampanas }) {
  const conCampana = datos.total_con_campana ?? 0;
  const totales = datos.total_leads ?? 0;
  const sinAtribuir = Math.max(0, totales - conCampana);

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
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Dato titulo="Desde anuncios" valor={numero(conCampana)} />
            <Dato
              titulo="Del total de leads"
              valor={totales ? porcentaje(Math.round((100 * conCampana) / totales)) : "—"}
              nota={`${numero(totales)} en el periodo`}
            />
            <Dato titulo="Llegaron por su cuenta" valor={numero(sinAtribuir)} />
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Por plataforma</p>
          <BarrasHorizontales
            filas={(datos.por_plataforma ?? []).map((p) => ({
              etiqueta: NOMBRE[p.plataforma] ?? p.plataforma,
              valor: p.leads,
              color: COLOR[p.plataforma] ?? "#6E42FF",
              nota:
                p.leads > 0
                  ? `${numero(p.pasaron_a_persona)} pidieron una persona · ${porcentaje(
                      Math.round((100 * p.pasaron_a_persona) / p.leads),
                    )}`
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
                      <th className="pb-2 text-right font-medium">Leads</th>
                      {/* ESTA es la columna que importa, no la de leads: un
                          anuncio que trae cien curiosos vale menos que uno que
                          trae diez conversaciones de verdad. */}
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
                          </span>
                        </td>
                        <td className="py-2 text-right font-semibold text-ink">{numero(c.leads)}</td>
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
        </>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-linea bg-suave/40 p-3 text-xs leading-relaxed text-ink-2">
        <Info className="mt-0.5 h-4 w-4 flex-none text-violet" />
        <span>
          <b className="text-ink">Facebook e Instagram van juntos</b> porque WhatsApp no dice en cuál
          de las dos se vio el anuncio: manda el mismo dato para ambas. Separarlas sería inventarlo.
          <br />
          Para medir <b className="text-ink">Google</b> u otro origen, pon en el enlace del anuncio un
          mensaje ya escrito con tu código:{" "}
          <code className="rounded bg-suave px-1 font-mono text-[11px] text-ink-2">
            wa.me/TUNUMERO?text=Hola%20[cmp:google-verano]
          </code>
          . El código llega con el primer mensaje y aparece aquí.
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
