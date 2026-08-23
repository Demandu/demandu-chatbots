import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getUsage, getAddons } from "@/lib/billing/usage";
import { UsagePanel } from "@/components/billing/UsagePanel";
import { AddonCart } from "@/components/billing/AddonCart";
import { stripeConfigured } from "@/lib/billing/stripe";
import { BotonPlan } from "@/components/billing/BotonPlan";
import { PortalPago } from "@/components/billing/PortalPago";
import { CancelarPlan } from "@/components/billing/CancelarPlan";
import { VENTAS, linkWhatsApp, linkCorreo } from "@/lib/contacto";
import { Check, TriangleAlert, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(v: number) {
  return `$${Number(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function espacio(mb: number) {
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`;
}

export default async function PlanPage({ searchParams }: { searchParams: { pago?: string } }) {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();

  const [usage, contratados, { data: plans }, { data: addons }, { data: cobro }] = await Promise.all([
    getUsage(supabase, orgId),
    getAddons(supabase, orgId),
    // Los planes públicos MÁS el plan a la medida de esta cuenta, si tiene uno.
    // El `or` es lo que hace visible un plan hecho a mano para este cliente.
    supabase.from("plans").select("*").eq("active", true)
      .or(`org_id.is.null,org_id.eq.${orgId ?? "00000000-0000-0000-0000-000000000000"}`)
      .order("sort"),
    supabase.from("addons").select("*").eq("active", true).order("sort"),
    orgId ? supabase.rpc("estado_de_cobro", { p_org_id: orgId }) : Promise.resolve({ data: null }),
  ]);

  const todos = (plans as any[]) ?? [];
  // El plan a la medida se muestra aparte y primero: es el que le hicimos a él.
  const aMedida = todos.filter((p) => p.org_id === orgId);
  const listaPlanes = todos.filter((p) => !p.org_id && p.code !== "scale");
  const empresa = todos.find((p) => p.code === "scale" && !p.org_id);
  const listaAddons = (addons as any[]) ?? [];

  const estado = ((cobro as any[]) ?? [])[0] ?? null;
  const pagosActivos = stripeConfigured();

  return (
    <div>
      {searchParams?.pago === "ok" && (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          ✅ ¡Listo! Tu compra se registró. Tus nuevos límites ya están activos.
        </div>
      )}
      {searchParams?.pago === "cancelado" && (
        <div className="mb-4 rounded-xl border border-linea bg-suave px-4 py-2.5 text-sm text-ink-2">
          Cancelaste el pago. No se te cobró nada.
        </div>
      )}

      <div className="mb-5">
        <p className="text-xs text-ink-3">
          Todo lo que llevas usado este mes y qué obtienes si amplías. Sin sorpresas al facturar.
        </p>
      </div>

      {/* El estado de la cuenta va ARRIBA DEL TODO. Si a alguien le falló el
          pago, es lo primero que tiene que ver al entrar aquí — no algo que
          descubra cuando su bot deje de contestar. */}
      {estado?.estado === "prueba" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet/40 bg-violet/5 p-4">
          <p className="text-sm text-ink">
            <Sparkles className="mr-1.5 inline h-4 w-4 text-violet" />
            Estás en tu prueba gratuita.{" "}
            <b className="text-ink">
              {estado.dias_restantes > 0
                ? `Te quedan ${estado.dias_restantes} día${estado.dias_restantes === 1 ? "" : "s"}.`
                : "Termina hoy."}
            </b>{" "}
            <span className="text-ink-2">No te hemos pedido tarjeta ni te hemos cobrado nada.</span>
          </p>
        </div>
      )}

      {estado?.estado === "pago_fallido" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <p className="text-sm text-ink">
            <TriangleAlert className="mr-1.5 inline h-4 w-4 text-danger" />
            <b>No pudimos cobrar tu tarjeta.</b>{" "}
            {estado.dias_restantes > 0
              ? `Tu cuenta sigue funcionando ${estado.dias_restantes} día${estado.dias_restantes === 1 ? "" : "s"} más.`
              : "Tu cuenta ya no puede enviar mensajes."}{" "}
            <span className="text-ink-2">Casi siempre es una tarjeta vencida: se arregla en un minuto.</span>
          </p>
          <PortalPago etiqueta="Actualizar mi tarjeta" />
        </div>
      )}

      {estado?.estado === "cancelada" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-linea bg-suave p-4">
          <p className="text-sm text-ink">
            Tu suscripción está cancelada. Puedes volver cuando quieras — tus chatbots y
            conversaciones siguen aquí.
          </p>
        </div>
      )}

      {estado?.estado === "activa" && (
        <div className="mb-5 rounded-2xl border border-linea bg-tarjeta p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {estado.cancela_al_terminar ? (
              // Canceló, pero su mes sigue corriendo. Hay que decírselo claro
              // y dejarle el camino de vuelta a un clic: buena parte de las
              // cancelaciones son un enojo de un martes.
              <p className="text-sm text-ink">
                Cancelaste tu plan. Sigue funcionando hasta el{" "}
                <b>
                  {estado.periodo_termina_at
                    ? new Date(estado.periodo_termina_at).toLocaleDateString("es-MX", {
                        day: "numeric", month: "long", year: "numeric",
                      })
                    : "final del periodo"}
                </b>{" "}
                y después no se te vuelve a cobrar.
              </p>
            ) : (
              <p className="text-sm text-ink-2">
                Tu plan está al día
                {estado.periodo_termina_at && (
                  <> · se renueva el{" "}
                    <b className="text-ink">
                      {new Date(estado.periodo_termina_at).toLocaleDateString("es-MX", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </b>
                  </>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {!estado.cancela_al_terminar && <PortalPago />}
              <CancelarPlan
                cancelaAlTerminar={!!estado.cancela_al_terminar}
                hasta={estado.periodo_termina_at ?? null}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mb-7">
        <UsagePanel usage={usage} />
      </div>

      {/* Complementos contratados */}
      {contratados.length > 0 && (
        <div className="card-l mb-7 p-5">
          <h3 className="mb-3 font-display text-base font-semibold text-ink">Complementos activos</h3>
          <div className="space-y-2">
            {contratados.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-suave px-3.5 py-2.5">
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

      {/* El plan a la medida, si se le armó uno. Va antes que los públicos:
          es el que se negoció con él, no una opción más de la lista. */}
      {aMedida.map((p) => (
        <div key={p.code} className="card-l mb-7 border-pink p-5 ring-2 ring-pink/15">
          <span className="rounded-full bg-demandu-gradient px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Tu plan a la medida
          </span>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-display text-lg font-bold text-ink">{p.name}</div>
              <div className="mt-1 font-display text-3xl font-bold text-ink">
                {usd(p.price_monthly)}
                <span className="text-sm font-medium text-ink-3"> USD/mes</span>
              </div>
              <p className="mt-2 text-sm text-ink-2">
                {Number(p.messages_month).toLocaleString("es-MX")} mensajes al mes ·{" "}
                {espacio(p.storage_mb)} de entrenamiento ·{" "}
                {p.agents_included} agente{p.agents_included === 1 ? "" : "s"} ·{" "}
                {p.bots_limit >= 999 ? "chatbots ilimitados" : `${p.bots_limit} chatbots`}
              </p>
              {p.notes && <p className="mt-1.5 text-xs text-ink-3">{p.notes}</p>}
            </div>
            <div className="w-full sm:w-56">
              {p.code === usage.planCode && estado?.estado === "activa" ? (
                <p className="text-sm font-semibold text-exito">Es tu plan actual ✅</p>
              ) : (
                <BotonPlan code={p.code} etiqueta="Contratar mi plan" variante="principal" disponible={pagosActivos} />
              )}
            </div>
          </div>
        </div>
      ))}

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
                  [`${Number(p.messages_month).toLocaleString("es-MX")}`, "mensajes al mes"],
                  ["Respuestas con IA", "incluidas"],
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

              <div className="mt-4 rounded-lg bg-suave px-3 py-2 text-[11px] text-ink-2">
                Mensajes adicionales: <b className="text-ink">{usd(p.extra_1k_messages_price)}</b> por cada 1,000
              </div>

              {!esActual && (
                <BotonPlan
                  code={p.code}
                  etiqueta={estado?.estado === "prueba" ? "Contratar este plan" : "Cambiar a este plan"}
                  variante={p.is_featured ? "principal" : "suave"}
                  disponible={pagosActivos}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Un plan a la medida NO se arma solo: se habla con el equipo y nosotros
          se lo dejamos preparado. Por eso aquí no hay formulario, hay un
          teléfono y un correo. */}
      {empresa && (
        <div className="card-l mb-7 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="font-display text-base font-semibold text-ink">
              ¿Necesitas algo distinto?
            </div>
            <p className="mt-0.5 text-sm text-ink-2">
              Volumen alto, canales ilimitados, {espacio(empresa.storage_mb)} de entrenamiento o
              condiciones a tu medida. Lo armamos contigo y te lo dejamos listo aquí para contratar.
            </p>
            <p className="mt-1.5 text-xs text-ink-3">
              WhatsApp <b className="text-ink-2">{VENTAS.whatsappVisible}</b> · {VENTAS.correo}
            </p>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            <a
              href={linkWhatsApp("Hola, quiero un plan a la medida para mi negocio en Demandu.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Hablar por WhatsApp
            </a>
            <a href={linkCorreo("Quiero un plan a la medida")} className="btn-soft">
              Escribir un correo
            </a>
          </div>
        </div>
      )}

      {/* Complementos con carrito */}
      <h3 className="mb-1 font-display text-base font-semibold text-ink">Amplía tu plan</h3>
      <p className="mb-4 text-xs text-ink-3">
        Elige lo que necesites, revisa tu carrito a la derecha y paga. Se activa al instante.
      </p>
      <div className="mb-7">
        <AddonCart
          addons={listaAddons.map((a) => ({
            code: a.code, name: a.name, description: a.description,
            price: Number(a.price), recurring: !!a.recurring, unit: a.unit,
            isQuote: !!a.is_quote,
          }))}
          pagosActivos={stripeConfigured()}
        />
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
