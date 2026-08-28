import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { miPanel } from "@/lib/equipo/comisiones";
import { VENTAS, linkWhatsApp } from "@/lib/contacto";
import { TrendingUp, Users, Wallet, Clock, LogIn } from "lucide-react";
import { entrarComoSoporteDesdeElPanel } from "./acciones";

export const dynamic = "force-dynamic";

/**
 * Lo que ve un vendedor o un partner: su cartera y lo que gana con ella.
 *
 * POR QUÉ EL MRR VA PRIMERO Y EN GRANDE. Un vendedor a comisión no trabaja
 * mirando cuántos clientes tiene, trabaja mirando cuánto le entra cada mes. Si
 * ese número está escondido detrás de tres clics, deja de mirarlo — y lo que
 * no se mira, no se empuja.
 *
 * Pero el número tiene que ser HONESTO: solo cuentan los clientes al día. Un
 * MRR que suma pruebas y pagos fallidos motiva hoy y decepciona a fin de mes,
 * que es peor que no haberlo enseñado.
 */

const usd = (v: number) =>
  `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (v: number) => `$${(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

const ETIQUETA: Record<string, { texto: string; clase: string }> = {
  activa: { texto: "Al día", clase: "bg-success/15 text-exito" },
  prueba: { texto: "En prueba", clase: "bg-violet/15 text-violet" },
  pago_fallido: { texto: "Pago fallido", clase: "bg-danger/15 text-danger" },
  cancelada: { texto: "Cancelada", clase: "bg-suave-2 text-ink-3" },
};

export default async function PanelPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login");

  const datos = await miPanel(user.id);
  if (!datos) redirect("/dashboard");

  const { miembro, clientes, mrr, comisionMensual, cobradoEsteMes, pendienteDePago } = datos;
  const enRiesgo = clientes.filter((c) => c.estado_cobro === "pago_fallido");
  const enPrueba = clientes.filter((c) => c.estado_cobro === "prueba");

  return (
    <div>
      {searchParams?.error && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink">
          {searchParams.error}
        </div>
      )}

      <h2 className="font-display text-2xl font-bold text-ink">Hola, {miembro.nombre}</h2>
      <p className="mb-5 mt-1 text-sm text-ink-2">
        {miembro.alcance === "todas"
          ? "Estás viendo todas las cuentas de la plataforma."
          : "Estos son los clientes que atiendes."}
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [TrendingUp, "Tu comisión al mes", usd(comisionMensual), "si todos siguen pagando igual"],
          [Wallet, "Te debemos ahora", usd(pendienteDePago), "comisiones aún sin pagar"],
          [Users, "Clientes al día", String(clientes.filter((c) => c.estado_cobro === "activa").length), `de ${clientes.length} en total`],
          [Clock, "MRR de tu cartera", usd0(mrr), "lo que pagan tus clientes"],
        ].map(([Icono, t, v, pie]: any) => (
          <div key={t} className="card-l p-4">
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              <Icono className="h-3.5 w-3.5" /> {t}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{v}</p>
            <p className="mt-0.5 text-[11px] text-ink-3">{pie}</p>
          </div>
        ))}
      </div>

      {/* Lo accionable primero. Un pago fallido es una comisión que se te va
          este mes, y casi siempre se arregla con una llamada. */}
      {enRiesgo.length > 0 && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <p className="font-semibold text-danger">
            {enRiesgo.length} cliente{enRiesgo.length === 1 ? "" : "s"} con el pago fallido
          </p>
          <p className="mt-0.5 text-ink-2">
            {enRiesgo.map((c) => c.name).join(", ")}. Casi siempre es una tarjeta vencida y se arregla en una
            llamada — mientras tanto, no te generan comisión.
          </p>
        </div>
      )}

      {enPrueba.length > 0 && (
        <div className="mb-5 rounded-xl border border-violet/40 bg-violet/5 px-4 py-3 text-sm">
          <p className="font-semibold text-ink">
            {enPrueba.length} en prueba: {enPrueba.map((c) => c.name).join(", ")}
          </p>
          <p className="mt-0.5 text-ink-2">
            Todavía no cuentan para tu comisión. Empiezan a contar el día que pagan.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-linea">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Paga</th>
              <th className="px-4 py-3">Te deja</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const e = ETIQUETA[c.estado_cobro] ?? { texto: c.estado_cobro ?? "—", clase: "bg-suave-2 text-ink-3" };
              const pct = miembro.comision_pct ?? (c.precio > 99 ? 20 : 15);
              return (
                <tr key={c.id} className="border-t border-linea bg-tarjeta">
                  <td className="px-4 py-3 font-semibold text-ink">{c.name}</td>
                  <td className="px-4 py-3 text-ink-3">{c.contacto_nombre || "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{usd0(c.precio)}/mes</td>
                  <td className="px-4 py-3">
                    {c.aporta > 0 ? (
                      <span className="font-semibold text-exito">
                        {usd((c.aporta * pct) / 100)}
                        <span className="ml-1 text-[11px] font-normal text-ink-3">({pct}%)</span>
                      </span>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${e.clase}`}>
                      {e.texto}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Entrar a la cuenta del cliente para ayudarle. Dura una
                        hora y caduca sola; entrar y salir quedan apuntados en
                        la bitácora, y el cliente lo ve. */}
                    <form action={entrarComoSoporteDesdeElPanel}>
                      <input type="hidden" name="org_id" value={c.id} />
                      <button className="inline-flex items-center gap-1.5 rounded-lg border border-linea-2 px-2.5 py-1.5 text-xs text-ink-2 transition hover:border-violet/50 hover:text-ink">
                        <LogIn className="h-3.5 w-3.5" /> Entrar
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!clientes.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ink-3">
                  Todavía no tienes clientes asignados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card-l mt-6 max-w-3xl p-5 text-sm leading-relaxed text-ink-2">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">Cómo se calcula lo tuyo</h3>
        <ul className="space-y-1">
          <li>· Planes de hasta <b className="text-ink">$99</b> al mes → <b className="text-ink">15%</b> cada mes que el cliente pague.</li>
          <li>· Planes de <b className="text-ink">más de $99</b> → <b className="text-ink">20%</b> cada mes.</li>
          <li>· Complementos y pagos únicos → <b className="text-ink">no pagan comisión</b>.</li>
        </ul>
        <p className="mt-3">
          <b className="text-ink">Se paga sobre lo cobrado.</b> Un cliente en prueba o con el pago fallido no
          genera comisión hasta que el cobro entra de verdad. Y una vez que una comisión queda apuntada,{" "}
          <b className="text-ink">ya no cambia</b>: lo que viste es lo que cobras.
        </p>
        <p className="mt-3 text-xs text-ink-3">
          ¿Algo no cuadra? Escríbenos por WhatsApp al{" "}
          <a href={linkWhatsApp("Hola, tengo una duda con mis comisiones.")} className="font-semibold text-pink hover:underline" target="_blank" rel="noopener noreferrer">
            {VENTAS.whatsappVisible}
          </a>.
        </p>
      </div>
    </div>
  );
}
