import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, Palette, CreditCard, Bot } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TiendaDetallePage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,nombre,slug,activa,bot_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!tienda) notFound();

  const { count } = await sb
    .from("tienda_productos")
    .select("id", { count: "exact", head: true })
    .eq("tienda_id", params.id);

  const { data: bot } = tienda.bot_id
    ? await sb.from("bots").select("id,name").eq("id", tienda.bot_id).maybeSingle()
    : { data: null };

  return (
    <>
      <Topbar
        crumb={
          <span className="flex items-center gap-2">
            <Link href="/tienda" className="text-muted transition hover:text-white">
              Tienda
            </Link>
            <span className="text-muted-2">/</span>
            <span className="font-semibold text-white">{tienda.nombre}</span>
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        <Link href="/tienda" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 transition hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Todas las tiendas
        </Link>

        <h1 className="font-display text-2xl font-bold text-ink">{tienda.nombre}</h1>
        <p className="mt-1 text-sm text-ink-2">
          eshop.demandu.tech/<b className="text-ink">{tienda.slug}</b>
          {" · "}
          {tienda.activa ? "abierta al público" : "cerrada"}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card p-4">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet/12 text-violet">
              <Package className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink">Productos</p>
            <p className="mt-1 text-sm text-ink-2">
              {count ?? 0} cargados. Aquí se cargan uno a uno o se traen de tu hoja de cálculo, con
              sus variedades y recargos tal y como los escribes hoy.
            </p>
          </div>

          <div className="card p-4">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-pink/12 text-pink">
              <Palette className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink">Diseño</p>
            <p className="mt-1 text-sm text-ink-2">
              Logo, banners, colores de fondo y botones, horario y redes. Lo que hoy vive en la
              pestaña de configuración de la hoja.
            </p>
          </div>

          <div className="card p-4">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400/12 text-emerald-300">
              <CreditCard className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink">Cobros</p>
            <p className="mt-1 text-sm text-ink-2">
              Yappy con tu propia cuenta de comercio: el dinero entra directo a tu banco, sin pasar
              por Demandu.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-linea-2 bg-tarjeta p-4">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-surface-raised text-ink-2">
            <Bot className="h-5 w-5" />
          </span>
          <p className="text-sm text-ink-2">
            {bot ? (
              <>
                Los pedidos entran a <b className="text-ink">{bot.name || "un chatbot sin nombre"}</b> y
                aparecen en Conversaciones.
              </>
            ) : (
              <>
                Esta tienda todavía no tiene chatbot asignado, así que los pedidos no llegarían a
                ninguna parte. Se asigna al terminar de montarla.
              </>
            )}
          </p>
        </div>

        <p className="mt-6 text-xs text-ink-2">
          Estas tres secciones se están construyendo ahora mismo. La tienda ya existe y su dirección
          está reservada: nadie más puede quedarse con ella.
        </p>
      </div>
    </>
  );
}
