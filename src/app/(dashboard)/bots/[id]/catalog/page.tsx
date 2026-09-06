import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { LanaSays } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { channelOf } from "@/lib/channels";
import { createProduct, deleteProduct, toggleProduct, setCatalogId } from "./actions";
import { ShoppingBag, Plus, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

function money(v: number | null, currency: string) {
  if (v === null || v === undefined) return "—";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency || "MXN" }).format(v);
  } catch {
    return `${v} ${currency}`;
  }
}

export default async function BotCatalogPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();
  if (channelOf(bot.channel) !== "whatsapp") redirect(`/bots/${bot.id}`);

  const [{ data: products }, { data: wa }] = await Promise.all([
    supabase.from("products").select("*").eq("bot_id", params.id).order("created_at", { ascending: false }),
    supabase.from("whatsapp_channels").select("bot_id, catalog_id").eq("bot_id", params.id).maybeSingle(),
  ]);

  const list = (products as any[]) ?? [];
  const connected = !!wa;
  const catalogId = (wa as any)?.catalog_id ?? "";
  const visibles = list.filter((p) => p.available).length;

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Catálogo de productos</h2>
        <p className="mb-5 text-sm text-ink-2">
          Tus productos, para que el chatbot los muestre y tus clientes compren sin salir de WhatsApp.
        </p>

        <LanaSays className="mb-6" title="Lana · Cómo funciona">
          Da de alta aquí tus productos con foto y precio. Luego, en una conversación automática, usa el bloque{" "}
          <b className="text-ink">Mostrar producto / catálogo</b> y el cliente los verá dentro del chat. Si además
          tienes un catálogo en Meta Commerce, pega su ID abajo para conectarlo.
        </LanaSays>

        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Conecta WhatsApp para este chatbot en la pestaña{" "}
            <Link href={`/bots/${bot.id}/install`} className="font-semibold text-ink underline">Conexión</Link>.
          </div>
        )}

        {/* Catálogo de Meta (opcional) */}
        <div className="card-l mb-6 p-5">
          <h3 className="mb-1 font-display text-base font-semibold text-ink">Catálogo de Meta Commerce (opcional)</h3>
          <p className="mb-3 text-xs text-ink-3">
            Si ya tienes un catálogo creado en tu Business Manager, pega aquí su ID para poder mostrarlo en el chat.
          </p>
          <form action={setCatalogId} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="bot_id" value={bot.id} />
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs font-semibold text-ink-2">ID del catálogo</label>
              <input name="catalog_id" defaultValue={catalogId} className="input-l" placeholder="Ej. 123456789012345" />
            </div>
            <button className="btn-soft" disabled={!connected}>Guardar</button>
          </form>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Alta de producto */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-ink">Nuevo producto</h3>
              <form action={createProduct} className="space-y-3">
                <input type="hidden" name="bot_id" value={bot.id} />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre</label>
                  <input name="name" required className="input-l" placeholder="Kit Skincare" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Descripción</label>
                  <textarea name="description" className="input-l min-h-[60px]" placeholder="Limpieza + serum + bloqueador" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Precio</label>
                    <input name="price" inputMode="decimal" className="input-l" placeholder="499.00" />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">Moneda</label>
                    <select name="currency" defaultValue="MXN" className="input-l">
                      {["MXN", "USD", "COP", "PEN", "CLP", "ARS", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Código / SKU (opcional)</label>
                  <input name="sku" className="input-l" placeholder="sku-001" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Foto (enlace, opcional)</label>
                  <input name="image_url" className="input-l" placeholder="https://…" />
                </div>
                <button className="btn-primary w-full"><Plus className="h-4 w-4" /> Agregar producto</button>
              </form>
            </div>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Tus productos</h3>
              {list.length > 0 && (
                <span className="text-xs text-ink-3">{list.length} en total · {visibles} visibles</span>
              )}
            </div>

            {list.length === 0 ? (
              <div className="card-l grid place-items-center p-12 text-center">
                <ShoppingBag className="mb-2 h-8 w-8 text-ink-3" />
                <p className="text-sm text-ink-2">Aún no tienes productos. Agrega el primero con el panel de la izquierda.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((p) => (
                  <div key={p.id} className={`card-l overflow-hidden p-4 ${p.available ? "" : "opacity-60"}`}>
                    <div className="flex gap-3">
                      {p.image_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={p.image_url} alt={p.name} className="h-16 w-16 flex-none rounded-xl border border-linea object-cover" />
                      ) : (
                        <div className="grid h-16 w-16 flex-none place-items-center rounded-xl bg-suave text-ink-3">
                          <ShoppingBag className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-ink">{p.name}</div>
                        <div className="text-sm font-bold text-pink">{money(p.price, p.currency)}</div>
                        {p.sku && <div className="text-[11px] text-ink-3">SKU: {p.sku}</div>}
                      </div>
                    </div>
                    {p.description && <p className="mt-2 line-clamp-2 text-xs text-ink-2">{p.description}</p>}
                    <div className="mt-3 flex items-center justify-between border-t border-linea pt-2.5">
                      <form action={toggleProduct}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <input type="hidden" name="available" value={String(!!p.available)} />
                        <button className="text-xs font-semibold text-ink-2 transition hover:text-ink">
                          {p.available ? "Ocultar del chat" : "Mostrar en el chat"}
                        </button>
                      </form>
                      <form action={deleteProduct}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <button className="text-ink-3 transition hover:text-danger" title="Eliminar producto">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
