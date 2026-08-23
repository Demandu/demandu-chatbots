import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConfigured } from "@/lib/billing/stripe";
import { createCustomPlan, resyncPlan, archivePlan } from "./actions";
import { Plus, RefreshCw, CheckCircle2, AlertTriangle, Archive } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(v: number) {
  return `$${Number(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

export default async function AdminPlanesPage({
  searchParams,
}: {
  searchParams: { creado?: string; error?: string; aviso?: string };
}) {
  // Quién puede entrar aquí lo decide el marco de Superadmin, no esta pantalla.
  // Con permisos elevados para poder listar todas las organizaciones
  const admin = createAdminClient();
  const [{ data: orgs }, { data: custom }, { data: publicos }] = await Promise.all([
    admin.from("organizations").select("id, name, plan").order("name"),
    admin.from("plans").select("*").eq("is_custom", true).order("sort").order("name"),
    // Los tres planes de siempre. También hay que registrarlos en Stripe, y
    // hasta ahora no había forma de hacerlo desde aquí: solo aparecían los
    // planes a la medida, así que los públicos se quedaban sin precio en
    // Stripe y el botón de contratar del cliente no funcionaba nunca.
    admin.from("plans").select("*").eq("is_custom", false).order("sort"),
  ]);

  const organizaciones = (orgs as any[]) ?? [];
  const planes = (custom as any[]) ?? [];
  const planesPublicos = (publicos as any[]) ?? [];
  const orgName = (id: string) => organizaciones.find((o) => o.id === id)?.name ?? "—";
  const stripeOn = stripeConfigured();

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="font-display text-2xl font-bold text-ink">Planes a la medida</h2>
        <p className="mb-5 mt-1 text-sm text-ink-2">
          Crea un plan personalizado para un cliente. Se registra en Stripe automáticamente para poder cobrarlo.
        </p>

        {!stripeOn && (
          <div className="mb-5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-ink-2">
            Stripe no está configurado todavía. Puedes crear planes, pero no se registrarán para cobro hasta activarlo.
          </div>
        )}
        {searchParams?.creado && (
          <div className="mb-5 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
            ✅ Plan creado y registrado en Stripe. Ya se puede cobrar.
          </div>
        )}
        {searchParams?.aviso && (
          <div className="mb-5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-ink-2">
            El plan se guardó, pero Stripe falló: {searchParams.aviso}. Usa <b className="text-ink">Reintentar</b> abajo.
          </div>
        )}
        {searchParams?.error && (
          <div className="mb-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {searchParams.error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Alta */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-ink">Nuevo plan</h3>
              <form action={createCustomPlan} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Cliente</label>
                  <select name="org_id" required className="input-l">
                    <option value="">— elige el cliente —</option>
                    {organizaciones.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre del plan</label>
                  <input name="name" required className="input-l" placeholder="Plan Corporativo Acme" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Precio USD/mes</label>
                    <input name="price_monthly" type="number" min={1} step="1" required className="input-l" placeholder="349" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Mensajes/mes</label>
                    <input name="messages_month" type="number" min={0} className="input-l" placeholder="30000" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Chatbots</label>
                    <input name="bots_limit" type="number" min={0} className="input-l" placeholder="10" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Agentes</label>
                    <input name="agents_included" type="number" min={0} className="input-l" placeholder="10" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Entrenamiento (MB)</label>
                    <input name="storage_mb" type="number" min={0} className="input-l" placeholder="10240" />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">1,000 msgs extra ($)</label>
                    <input name="extra_1k_messages_price" type="number" min={0} step="1" className="input-l" placeholder="15" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Peso de la IA</label>
                  <input name="ai_message_weight" type="number" min={1} max={10} defaultValue={3} className="input-l w-24" />
                  <p className="mt-1 text-[11px] text-ink-3">Cuántos mensajes consume una respuesta con IA.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Canales</label>
                  <input name="channels" className="input-l" placeholder="whatsapp, instagram, webchat" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Integraciones</label>
                  <input name="integrations" className="input-l" placeholder="hubspot, shopify" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Notas internas</label>
                  <textarea name="notes" className="input-l min-h-[60px]" placeholder="Condiciones acordadas con el cliente…" />
                </div>
                <button className="btn-primary w-full"><Plus className="h-4 w-4" /> Crear y registrar en Stripe</button>
              </form>
            </div>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2">
            {/* ── Los planes de siempre ──────────────────────────────────────
                Sin registrarlos en Stripe, el botón "Contratar" del cliente no
                puede funcionar: Stripe necesita un Precio suyo al que cobrar. */}
            <h3 className="mb-1 font-display text-lg font-semibold text-ink">Planes públicos</h3>
            <p className="mb-3 text-xs text-ink-3">
              Los que ve cualquier cliente. Tienen que estar registrados en Stripe para poder cobrarlos.
            </p>

            <div className="mb-8 space-y-2">
              {planesPublicos.map((p) => {
                const seCotiza = Number(p.price_monthly) <= 0;
                return (
                  <div key={p.code} className="card-l flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-semibold text-ink">{p.name}</span>
                        {seCotiza ? (
                          <span className="rounded-md bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                            Se cotiza
                          </span>
                        ) : p.stripe_price_id ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">
                            <CheckCircle2 className="h-3 w-3" /> En Stripe
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-aviso">
                            <AlertTriangle className="h-3 w-3" /> Sin registrar
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        {seCotiza ? "A la medida, se habla con ventas" : `${usd(p.price_monthly)}/mes`}
                        {" · "}
                        {Number(p.messages_month).toLocaleString("es-MX")} mensajes · {p.agents_included} agentes
                      </div>
                      {p.stripe_error && (
                        <div className="mt-1 text-[11px] text-danger">Stripe: {p.stripe_error}</div>
                      )}
                    </div>

                    {/* Un plan sin precio no se puede registrar: no hay nada que
                        cobrar. Se negocia y se crea como plan a la medida. */}
                    {!seCotiza && (
                      <form action={resyncPlan} className="flex-none">
                        <input type="hidden" name="code" value={p.code} />
                        <button className="btn-soft px-3 py-1.5 text-xs" disabled={!stripeOn}>
                          <RefreshCw className="h-3.5 w-3.5" />
                          {p.stripe_price_id ? "Actualizar en Stripe" : "Registrar en Stripe"}
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>

            <h3 className="mb-3 font-display text-lg font-semibold text-ink">Planes creados</h3>
            {planes.length === 0 ? (
              <div className="card-l grid place-items-center p-12 text-center">
                <p className="text-sm text-ink-2">Aún no hay planes a la medida. Crea el primero a la izquierda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {planes.map((p) => (
                  <div key={p.code} className={`card-l p-4 ${p.active ? "" : "opacity-60"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display font-semibold text-ink">{p.name}</span>
                          {!p.active && (
                            <span className="rounded-md bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                              Archivado
                            </span>
                          )}
                          {p.stripe_price_id ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">
                              <CheckCircle2 className="h-3 w-3" /> En Stripe
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-warning/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-aviso">
                              <AlertTriangle className="h-3 w-3" /> Sin registrar
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-3">
                          Cliente: <b className="text-ink-2">{orgName(p.org_id)}</b> · {usd(p.price_monthly)}/mes ·{" "}
                          {Number(p.messages_month).toLocaleString("es-MX")} mensajes · {p.agents_included} agentes
                        </div>
                        {p.stripe_error && (
                          <div className="mt-1 text-[11px] text-danger">Stripe: {p.stripe_error}</div>
                        )}
                        {p.notes && <div className="mt-1 text-[11px] text-ink-3">{p.notes}</div>}
                      </div>

                      <div className="flex flex-none items-center gap-2">
                        <form action={resyncPlan}>
                          <input type="hidden" name="code" value={p.code} />
                          <button className="btn-soft px-3 py-1.5 text-xs">
                            <RefreshCw className="h-3.5 w-3.5" /> {p.stripe_price_id ? "Actualizar" : "Reintentar"}
                          </button>
                        </form>
                        {p.active && (
                          <form action={archivePlan}>
                            <input type="hidden" name="code" value={p.code} />
                            <button className="text-ink-3 transition hover:text-danger" title="Archivar plan">
                              <Archive className="h-4 w-4" />
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-4 text-xs text-ink-3">
              Al cambiar el precio de un plan, Stripe crea un precio nuevo y archiva el anterior — es como funciona
              Stripe y lo maneja el sistema solo. Los clientes que ya estaban suscritos conservan su precio anterior
              hasta que se les mueva de plan.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
