import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getUsage, getAddons } from "@/lib/billing/usage";
import { UsagePanel } from "@/components/billing/UsagePanel";
import { Check, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(v: number) {
  return `$${Number(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function espacio(mb: number) {
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}

export default async function PlanPage() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();

  const [usage, contratados, { data: plans }, { data: addons }] = await Promise.all([
    getUsage(supabase, orgId),
    getAddons(supabase, orgId),
    supabase.from("plans").select("*").eq("active", true).order("sort"),
    supabase.from("addons").select("*").eq("active", true).order("sort"),
  ]);

  const listaPlanes = ((plans as any[]) ?? []).filter((p) => p.code !== "scale");
  const empresa = ((plans as any[]) ?? []).find((p) => p.code === "scale");
  const listaAddons = (addons as any[]) ?? [];

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Tu plan y consumo</h2>
        <p className="text-xs text-ink-3">
          Todo lo que llevas usado este mes y qué obtienes si amplías. Sin sorpresas al facturar.
        </p>
      </div>

      <div className="mb-7">
        <UsagePanel usage={usage} />
      </div>

      {/* Complementos contratados */}
      {contratados.length > 0 && (
        <div className="card-l mb-7 p-5">
          <h3 className="mb-3 font-display text-base font-semibold text-ink">Complementos activos</h3>
          <div className="space-y-2">
            {contratados.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-[#f4f5fb] px-3.5 py-2.5">
                <span className="text-sm text-ink">
                  {a.name}
                  {a.quantity > 1 && <b className="text-ink"> × {a.quantity}</b>}
                </span>
                <span className="text-sm font-semibold text-ink">{usd(a.price * a.quantity)}/mes</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">Estos complementos ya están sumados a los límites de arriba.</p>
        </div>
      )}

      {/* Planes */}
      <h3 className="mb-3 font-display text-base font-semibold text-ink">Planes</h3>
      <div className="mb-7 grid gap-3.5 lg:grid-cols-3">
        {listaPlanes.map((p) => {
          const esActual = p.code === usage.planCode;
          return (
            <div
              key={p.code}
              className={`card-l relative p-5 ${esActual ? "border-pink ring-2 ring-pink/15" : p.is_featured ? "border-violet/40" : ""}`}
            >
              {esActual ? (
                <span className="absolute -top-2.5 left-4 rounded-full bg-demandu-gradient px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Tu plan
                </span>
              ) : p.is_featured ? (
                <span className="absolute -top-2.5 left-4 rounded-full bg-violet px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Más elegido
                </span>
              ) : null}

              <div className="font-display text-lg font-bold text-ink">{p.name}</div>
              <div className="mt-1 font-display text-3xl font-bold text-ink">
                {usd(p.price_monthly)}
                <span className="text-sm font-medium text-ink-3"> USD/mes</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-3">Ahorra 20% pagando anual</p>

              <ul className="mt-4 space-y-2 text-sm text-ink-2">
                {[
                  [`${Number(p.messages_month).toLocaleString("es-MX")}`, "mensajes enviados/mes"],
                  [`${Number(p.ai_messages_month).toLocaleString("es-MX")}`, "respuestas con IA/mes"],
                  [espacio(p.storage_mb), "de entrenamiento"],
                  [`${p.agents_included}`, `agente${p.agents_included === 1 ? "" : "s"} incluido${p.agents_included === 1 ? "" : "s"}`],
                  [p.bots_limit >= 999 ? "Chatbots ilimitados" : `${p.bots_limit}`, p.bots_limit >= 999 ? "" : "chatbots"],
                ].map(([a, b], i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                    <span><b className="text-ink">{a}</b> {b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 rounded-lg bg-[#f4f5fb] px-3 py-2 text-[11px] text-ink-2">
                Mensajes adicionales: <b className="text-ink">{usd(p.extra_1k_messages_price)}</b> por cada 1,000
              </div>

              {!esActual && (
                <a href={`mailto:contacto@demandu.tech?subject=Quiero%20el%20plan%20${encodeURIComponent(p.name)}`} className="btn-soft mt-4 w-full justify-center">
                  Cambiar a este plan
                </a>
              )}
            </div>
          );
        })}
      </div>

      {empresa && (
        <div className="card-l mb-7 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="font-display text-base font-semibold text-ink">{empresa.name}</div>
            <p className="text-sm text-ink-2">
              Volumen alto, canales ilimitados, {espacio(empresa.storage_mb)} de entrenamiento y condiciones a tu medida.
            </p>
          </div>
          <a href="mailto:contacto@demandu.tech?subject=Plan%20Empresa" className="btn-primary flex-none">
            Hablar con ventas
          </a>
        </div>
      )}

      {/* Complementos disponibles */}
      <h3 className="mb-3 font-display text-base font-semibold text-ink">Complementos</h3>
      <p className="mb-3 text-xs text-ink-3">
        Amplía solo lo que necesitas, sin cambiar de plan. Se suman a tus límites al instante.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listaAddons.map((a) => (
          <div key={a.code} className="card-l flex flex-col p-4">
            <div className="font-semibold text-ink">{a.name}</div>
            <p className="mt-0.5 flex-1 text-xs text-ink-2">{a.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-ink">
                {usd(a.price)}
                <span className="text-xs font-medium text-ink-3">{a.recurring ? "/mes" : " único"}</span>
              </span>
              <a
                href={`mailto:contacto@demandu.tech?subject=${encodeURIComponent("Quiero contratar: " + a.name)}`}
                className="btn-soft px-3 py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Contratar
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="card-l mt-6 p-5">
        <h3 className="font-display text-base font-semibold text-ink">Sobre el costo de WhatsApp</h3>
        <p className="mt-1 text-sm text-ink-2">
          Meta te cobra directamente a ti las plantillas y mensajes de WhatsApp, según su tarifa oficial.
          <b className="text-ink"> Demandu no le agrega ningún cargo.</b> Lo que pagas aquí es solo la plataforma.
        </p>
        <p className="mt-2 text-[11px] text-ink-3">
          ¿Quieres bajar tu consumo? Un chatbot que resuelve con botones usa menos mensajes que uno que conversa
          libremente.{" "}
          <Link href="/bots" className="font-semibold text-pink hover:underline">Revisa tus chatbots →</Link>
        </p>
      </div>
    </div>
  );
}
