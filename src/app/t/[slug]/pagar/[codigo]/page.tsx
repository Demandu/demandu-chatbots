import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConfig } from "@/lib/tienda/config";
import { cobroPublico } from "@/lib/tienda/cobro-publico";
import { comoDinero } from "@/lib/tienda/variedades";
import { estadoDelCobro } from "@/lib/tienda/cobro";
import { PaginaDePago } from "@/components/tienda/PaginaDePago";

/**
 * Pagar un pedido, desde el enlace del mensaje.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EN LA DIRECCIÓN SOLO VIAJA EL CÓDIGO DEL PEDIDO. El importe, los productos y
 * el teléfono se leen aquí de la base.
 *
 * La tienda anterior mandaba `?c=ESEQ&name=pawsathome&amount=25`: el importe
 * viajaba en un sitio que quien recibe el mensaje puede editar antes de abrirlo.
 * No hay ninguna razón para copiar eso — un código que no se puede falsificar
 * apunta a un pedido que ya tiene su precio.
 *
 * SE LEE CON `service_role` PORQUE `pedidos` NO TIENE PERMISO ANÓNIMO, y así
 * debe seguir: los pedidos de una tienda no pueden listarse desde fuera. Aquí
 * se busca UNO, por su código y dentro de su tienda, y solo se enseña lo que ya
 * venía en el mensaje de WhatsApp que abrió esta página.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pagar tu pedido",
  // Un enlace de pago no tiene por qué aparecer en un buscador.
  robots: { index: false, follow: false },
};

export default async function PagarPedidoPage({
  params,
}: {
  params: { slug: string; codigo: string };
}) {
  const codigo = String(params.codigo ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,15}$/.test(codigo)) notFound();

  const sb = createAdminClient();

  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,nombre,slug,activa,config")
    .eq("slug", params.slug.toLowerCase())
    .maybeSingle();

  if (!tienda || !tienda.activa) notFound();

  const { data: pedido } = await sb
    .from("pedidos")
    .select("numero,total,pago,pago_iniciado_en,estado,pedido_lineas(nombre,cantidad,precio,elegidas,orden)")
    .eq("codigo", codigo)
    .eq("tienda_id", tienda.id)
    .maybeSingle();

  if (!pedido) notFound();

  const config = leerConfig(tienda.config);
  const titulo = config.titulo || tienda.nombre;
  const c = config.colores;
  const cobro = await cobroPublico(tienda.id);
  const estado = estadoDelCobro(String(pedido.pago), pedido.pago_iniciado_en as string | null);

  const lineas = ((pedido.pedido_lineas ?? []) as Record<string, unknown>[])
    .sort((a, b) => Number(a.orden) - Number(b.orden))
    .map((l) => ({
      nombre: String(l.nombre),
      cantidad: Number(l.cantidad),
      precio: Number(l.precio),
      elegidas: (l.elegidas ?? []) as { texto: string }[],
    }));

  return (
    <div style={{ backgroundColor: c.fondo, color: c.texto, minHeight: "100vh" }}>
      <header style={{ backgroundColor: c.principal }} className="px-4 py-5 text-center">
        {config.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.logo_url}
            alt={titulo}
            className="mx-auto mb-2 h-16 w-16 rounded-full object-cover"
          />
        )}
        <p className="text-lg font-bold text-white">{titulo}</p>
        <p className="text-sm text-white/80">Pedido #{pedido.numero}</p>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-5">
        {/* YA PAGADO: NO SE VUELVE A COBRAR. Un enlace que alguien reabre una
            semana después no puede pasarle la factura por segunda vez. */}
        {estado === "pagado" ? (
          <div className="grid gap-3 text-center">
            <p
              className="rounded-2xl py-3 font-bold text-white"
              style={{ backgroundColor: "#16a34a" }}
            >
              Este pedido ya está pagado ✅
            </p>
            <p className="text-sm opacity-70">
              {comoDinero(Number(pedido.total), config.moneda)} · nada más que hacer.
            </p>
          </div>
        ) : !cobro.yappy ? (
          <div className="grid gap-3 text-center">
            <p className="rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(0,0,0,.15)" }}>
              <b>{titulo}</b> no está cobrando en línea ahora mismo.
            </p>
            <p className="text-sm opacity-70">
              Tu pedido está registrado. Escríbeles por WhatsApp para acordar el pago.
            </p>
          </div>
        ) : (
          <PaginaDePago
            slug={tienda.slug}
            codigo={codigo}
            numero={Number(pedido.numero)}
            tienda={titulo}
            total={Number(pedido.total)}
            moneda={config.moneda}
            lineas={lineas}
            colores={c}
            cdnYappy={cobro.cdn}
            whatsapp={config.whatsapp.numero}
          />
        )}
      </main>

      <footer className="px-4 pb-8 text-center text-xs opacity-60">
        El cobro lo hace {titulo} con su propia cuenta de Yappy.
      </footer>
    </div>
  );
}
