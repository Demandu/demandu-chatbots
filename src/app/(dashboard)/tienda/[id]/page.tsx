import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Bot, ExternalLink } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { leerConfig, loQueFaltaParaVender } from "@/lib/tienda/config";
import { DOMINIO_TIENDAS, enlaceDeTienda } from "@/lib/tienda/direccion";
import { TiendaNav, esPestana } from "@/components/tienda/TiendaNav";
import { Productos, type Producto } from "@/components/tienda/Productos";
import { EditorDiseno } from "@/components/tienda/EditorDiseno";
import { Cobros } from "@/components/tienda/Cobros";
import { Pedidos, type PedidoEnLista } from "@/components/tienda/Pedidos";
import { guardarDiseno, guardarProductos, vaciarCatalogo, guardarCobros, cambiarEstadoPedido } from "./actions";

export const dynamic = "force-dynamic";

export default async function TiendaDetallePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { t?: string };
}) {
  const sb = createClient();
  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,nombre,slug,activa,bot_id,config")
    .eq("id", params.id)
    .maybeSingle();

  if (!tienda) notFound();

  const activa = esPestana(searchParams.t);
  const config = leerConfig(tienda.config);
  // El nombre de la tienda sirve de título mientras nadie ponga uno propio: es
  // mejor que una cabecera en blanco en el escaparate.
  const configConNombre = { ...config, titulo: config.titulo || tienda.nombre };
  const falta = loQueFaltaParaVender(configConNombre);

  const [{ data: prods }, { data: bot }, { data: cobros }] = await Promise.all([
    sb
      .from("tienda_productos")
      .select("id,nombre,descripcion,categoria,precio,precio_anterior,oculto,stock,imagen_url,variedades")
      .eq("tienda_id", params.id)
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true }),
    tienda.bot_id
      ? sb.from("bots").select("id,name").eq("id", tienda.bot_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // EL SECRETO NO SE PIDE. No se puede filtrar lo que nunca se leyó, así que
    // ni siquiera se trae para comprobar si existe: eso se pregunta contando.
    sb
      .from("tienda_cobros")
      .select("comercio,activo")
      .eq("tienda_id", params.id)
      .eq("proveedor", "yappy")
      .maybeSingle(),
  ]);

  const { count: conSecreto } = await sb
    .from("tienda_cobros")
    .select("id", { count: "exact", head: true })
    .eq("tienda_id", params.id)
    .eq("proveedor", "yappy")
    .neq("secreto", "");

  // Los pedidos, con sus líneas de una sola consulta: uno por pedido serían
  // cincuenta viajes en una tienda con movimiento.
  const { data: pedidosCrudos } =
    activa === "pedidos"
      ? await sb
          .from("pedidos")
          .select("id,numero,estado,total,created_at,respuestas,pedido_lineas(nombre,cantidad,precio,elegidas,nota,orden)")
          .eq("tienda_id", params.id)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };

  const pedidos: PedidoEnLista[] = ((pedidosCrudos ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    numero: Number(p.numero),
    estado: p.estado as PedidoEnLista["estado"],
    total: Number(p.total),
    created_at: String(p.created_at),
    respuestas: (p.respuestas ?? []) as PedidoEnLista["respuestas"],
    lineas: (((p.pedido_lineas ?? []) as Record<string, unknown>[]) ?? [])
      .sort((a, b) => Number(a.orden) - Number(b.orden))
      .map((l) => ({
        nombre: String(l.nombre),
        cantidad: Number(l.cantidad),
        precio: Number(l.precio),
        elegidas: (l.elegidas ?? []) as { grupo: string; texto: string }[],
        nota: (l.nota as string) ?? null,
      })),
  }));

  // Las categorías que de verdad tienen productos, en el orden del catálogo.
  const categoriasEnUso = [
    ...new Set(
      ((prods ?? []) as { categoria: string | null }[])
        .map((p) => (p.categoria ?? "").trim())
        .filter(Boolean),
    ),
  ];

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
        <Link
          href="/tienda"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-2 transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Todas las tiendas
        </Link>

        <h1 className="font-display text-2xl font-bold text-ink">{tienda.nombre}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {DOMINIO_TIENDAS}/<b className="text-ink">{tienda.slug}</b>
          {" · "}
          {tienda.activa ? "abierta al público" : "cerrada"}
          {bot ? ` · los pedidos entran a ${bot.name || "un chatbot sin nombre"}` : ""}
        </p>

        {/* VER LA TIENDA COMO LA VE UN CLIENTE. Sin esto, la única forma de
            comprobar el trabajo es teclear la dirección a mano — y quien no lo
            haga publica a ciegas. */}
        <a
          href={enlaceDeTienda(tienda.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet transition hover:opacity-80"
        >
          Ver la tienda <ExternalLink className="h-3.5 w-3.5" />
        </a>

        {/* LO QUE LE FALTA PARA VENDER, ARRIBA Y SIEMPRE VISIBLE. El fallo más
            caro de una tienda es el que no se ve: se ve perfecta, el cliente
            llena el carrito, pulsa y no pasa nada. */}
        {falta.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <AlertTriangle className="h-5 w-5 flex-none text-warning" />
            <p className="text-sm leading-relaxed text-ink-2">
              <b className="text-ink">Esta tienda todavía no puede recibir pedidos.</b> Le falta{" "}
              {falta.join(", ")}. Se pone en <b className="text-ink">Diseño</b>.
            </p>
          </div>
        )}

        {!tienda.bot_id && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-linea-2 bg-tarjeta p-3">
            <Bot className="h-4 w-4 flex-none text-ink-2" />
            <p className="text-sm text-ink-2">
              Sin chatbot asignado, los pedidos llegan a WhatsApp pero no entran a Conversaciones
              como conversación con su ficha.
            </p>
          </div>
        )}

        <div className="mt-6">
          <TiendaNav tiendaId={params.id} activa={activa} />

          {activa === "pedidos" && (
            <Pedidos
              tiendaId={params.id}
              pedidos={pedidos}
              moneda={config.moneda}
              cambiarEstado={cambiarEstadoPedido}
            />
          )}

          {activa === "productos" && (
            <Productos
              tiendaId={params.id}
              productos={(prods ?? []) as Producto[]}
              moneda={config.moneda}
              guardar={guardarProductos}
              vaciar={vaciarCatalogo}
            />
          )}

          {activa === "diseno" && (
            <EditorDiseno
              tiendaId={params.id}
              slug={tienda.slug}
              config={configConNombre}
              categoriasEnUso={categoriasEnUso}
              accion={guardarDiseno}
            />
          )}

          {activa === "cobros" && (
            <Cobros
              tiendaId={params.id}
              comercio={cobros?.comercio ?? ""}
              tieneSecreto={(conSecreto ?? 0) > 0}
              activo={Boolean(cobros?.activo)}
              accion={guardarCobros}
            />
          )}
        </div>
      </div>
    </>
  );
}
