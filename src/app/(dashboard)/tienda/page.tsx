import Link from "next/link";
import { Store, ExternalLink } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { NuevaTienda } from "@/components/tienda/NuevaTienda";
import { DOMINIO_TIENDAS } from "@/lib/tienda/direccion";
import { crearTienda } from "./actions";

export const dynamic = "force-dynamic";

export default async function TiendaPage() {
  const sb = createClient();

  // RLS ya recorta a la organización del usuario: no hace falta filtrar aquí,
  // y filtrar de más solo abre la puerta a que un día no coincidan.
  const [{ data: tiendas }, { data: bots }] = await Promise.all([
    sb.from("tiendas").select("id,nombre,slug,activa,bot_id,created_at").order("created_at", { ascending: false }),
    sb.from("bots").select("id,name").order("created_at", { ascending: false }),
  ]);

  const lista = (tiendas ?? []) as {
    id: string;
    nombre: string;
    slug: string;
    activa: boolean;
    bot_id: string | null;
  }[];

  // Cuántos productos tiene cada una. Se pregunta de una sola vez para todas,
  // no una consulta por tienda: con veinte tiendas serían veinte viajes.
  const ids = lista.map((t) => t.id);
  const { data: prods } = ids.length
    ? await sb.from("tienda_productos").select("tienda_id").in("tienda_id", ids)
    : { data: [] as { tienda_id: string }[] };
  const cuantos = new Map<string, number>();
  for (const p of (prods ?? []) as { tienda_id: string }[]) {
    cuantos.set(p.tienda_id, (cuantos.get(p.tienda_id) ?? 0) + 1);
  }

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Tienda</span>} />
      <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        <h1 className="font-display text-2xl font-bold text-ink">Tienda en línea</h1>
        <p className="mb-6 mt-1 text-sm text-ink-2">
          Tu catálogo con enlace propio. El cliente arma su pedido y te llega por WhatsApp, dentro
          de Conversaciones — no a un correo que nadie mira.
        </p>

        <div className="mb-6">
          <NuevaTienda accion={crearTienda} bots={(bots ?? []) as { id: string; name: string | null }[]} />
        </div>

        {lista.length === 0 ? (
          <div className="flex gap-3 rounded-2xl border border-linea-2 bg-tarjeta p-5">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-violet/12 text-violet">
              <Store className="h-5 w-5" />
            </span>
            <div className="text-sm leading-relaxed text-ink-2">
              <b className="text-ink">Todavía no tienes ninguna tienda.</b>
              <p className="mt-1">
                Crea la primera aquí arriba. Después le pones tu logo, tus colores y tus banners, y
                cargas los productos — o los traes de la hoja de cálculo que ya usas.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((t) => (
              <Link
                key={t.id}
                href={`/tienda/${t.id}`}
                className="card p-4 transition hover:border-pink/35"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{t.nombre}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-2">
                      {DOMINIO_TIENDAS}/{t.slug}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      t.activa
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-surface-border text-ink-2"
                    }`}
                  >
                    {t.activa ? "Abierta" : "Cerrada"}
                  </span>
                </div>
                <p className="mt-3 text-xs text-ink-2">
                  {(cuantos.get(t.id) ?? 0) === 0
                    ? "Sin productos todavía"
                    : `${cuantos.get(t.id)} producto${cuantos.get(t.id) === 1 ? "" : "s"}`}
                  {!t.bot_id && " · sin chatbot asignado"}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet">
                  Abrir <ExternalLink className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
