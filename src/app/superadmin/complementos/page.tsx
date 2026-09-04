import { createAdminClient } from "@/lib/supabase/admin";
import { stripeConfigured } from "@/lib/billing/stripe";
import { guardarComplemento, resincronizar } from "./actions";
import { RefreshCw, CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(v: number) {
  return `$${Number(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
}

/**
 * El catálogo de complementos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES DE ESTA PANTALLA, un complemento solo se podía crear escribiendo el
 * `insert` a mano en la base — que es como entró el de la tienda. Y como nunca
 * se sincronizaban con Stripe, el cobro les armaba el precio al vuelo: cada
 * compra creaba un producto nuevo, y no había forma de ver cuánto factura un
 * complemento ni de subirle el precio en un solo sitio.
 *
 * LA COLUMNA DE ESTADO ES LO MÁS IMPORTANTE DE LA TABLA. Un complemento que no
 * llegó a Stripe se vende igual —hay respaldo— pero sin quedar colgado de su
 * producto real. Que se vea de un vistazo cuál está sincronizado y cuál no es lo
 * que evita descubrirlo al cerrar el mes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default async function ComplementosPage({
  searchParams,
}: {
  searchParams: { guardado?: string; error?: string; aviso?: string };
}) {
  // Quién entra aquí lo decide el marco de Superadmin, no esta pantalla.
  const admin = createAdminClient();
  const { data } = await admin.from("addons").select("*").order("sort").order("name");
  const complementos = (data as any[]) ?? [];
  const stripeOn = stripeConfigured();

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 text-ink sm:p-6 lg:p-8">
      <h2 className="font-display text-2xl font-bold text-ink">Complementos</h2>
      <p className="mb-5 mt-1 text-sm text-ink-2">
        Lo que el cliente puede añadir a su plan. Al guardar se crea o se actualiza en Stripe
        automáticamente, igual que los planes.
      </p>

      {!stripeOn && (
        <div className="mb-5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-ink-2">
          Stripe no está configurado en este entorno. Puedes guardar complementos, pero no se
          registrarán allá hasta que se conecte.
        </div>
      )}
      {searchParams?.guardado && (
        <div className="mb-5 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          ✅ Guardado y sincronizado con Stripe.
        </div>
      )}
      {searchParams?.error && (
        <div className="mb-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-ink">
          {searchParams.error}
        </div>
      )}
      {searchParams?.aviso && (
        <div className="mb-5 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm text-ink-2">
          Se guardó, pero Stripe falló: {searchParams.aviso}. Se puede reintentar desde la lista.
        </div>
      )}

      {/* ── Lo que ya existe ─────────────────────────────────────────────── */}
      <div className="card-l mb-7 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-linea bg-suave text-left text-xs text-ink-3">
            <tr>
              <th className="p-3">Complemento</th>
              <th className="p-3">Código</th>
              <th className="p-3">Precio</th>
              <th className="p-3">En Stripe</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {complementos.map((a) => (
              <tr key={a.code} className="border-b border-linea last:border-0">
                <td className="p-3">
                  <div className="font-semibold text-ink">{a.name}</div>
                  <div className="text-xs text-ink-3">
                    {a.recurring ? "mensual" : "una sola vez"} · por {a.unit ?? "unidad"}
                    {!a.active && " · apagado"}
                  </div>
                </td>
                <td className="p-3 font-mono text-xs text-ink-2">{a.code}</td>
                <td className="p-3 text-ink">{usd(a.price)}</td>
                <td className="p-3">
                  {!a.active ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                      <CircleSlash className="h-3.5 w-3.5" /> apagado
                    </span>
                  ) : a.stripe_price_id ? (
                    <span className="inline-flex items-center gap-1 text-xs text-exito">
                      <CheckCircle2 className="h-3.5 w-3.5" /> sincronizado
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-aviso"
                      title={a.stripe_error ?? "Todavía no se ha creado allá"}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> sin sincronizar
                    </span>
                  )}
                  {a.stripe_error && (
                    <div className="mt-0.5 max-w-xs text-[11px] text-ink-3">{a.stripe_error}</div>
                  )}
                </td>
                <td className="p-3 text-right">
                  {a.active && !a.stripe_price_id && (
                    <form action={resincronizar}>
                      <input type="hidden" name="code" value={a.code} />
                      <button className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
                        <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {!complementos.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-sm text-ink-3">
                  Todavía no hay complementos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Crear o cambiar ──────────────────────────────────────────────── */}
      <div className="card-l p-5">
        <h3 className="font-display text-base font-semibold text-ink">Crear o cambiar uno</h3>
        <p className="mt-1 text-xs text-ink-3">
          Si escribes un código que ya existe, se actualiza ese. El código no se puede cambiar
          después: es lo que guarda cada compra en sus metadatos.
        </p>

        <form action={guardarComplemento} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-2">
            Nombre
            <input name="name" required placeholder="Tienda en WhatsApp" className="input-l mt-1" />
          </label>
          <label className="text-xs font-semibold text-ink-2">
            Código
            <input name="code" placeholder="tienda (se genera del nombre si lo dejas vacío)" className="input-l mt-1" />
          </label>

          <label className="text-xs font-semibold text-ink-2 sm:col-span-2">
            Descripción
            <input name="description" placeholder="Lo que se ve en la lista y en el recibo" className="input-l mt-1" />
          </label>

          <label className="text-xs font-semibold text-ink-2">
            Precio (USD)
            <input name="price" required inputMode="decimal" placeholder="59" className="input-l mt-1" />
          </label>
          <label className="text-xs font-semibold text-ink-2">
            Unidad
            <input name="unit" placeholder="tienda, agente, 1000_mensajes…" className="input-l mt-1" />
          </label>

          <label className="text-xs font-semibold text-ink-2">
            Orden en la lista
            <input name="sort" inputMode="numeric" placeholder="50" className="input-l mt-1" />
          </label>

          <div className="flex flex-wrap items-end gap-4 text-xs text-ink-2">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" name="recurring" defaultChecked /> Se cobra cada mes
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" name="active" defaultChecked /> Está a la venta
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" name="is_quote" /> Es a cotizar
            </label>
          </div>

          <div className="sm:col-span-2">
            <button className="btn-primary">Guardar y registrar en Stripe</button>
          </div>
        </form>
      </div>
    </div>
  );
}
