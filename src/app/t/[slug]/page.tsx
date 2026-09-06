import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/tienda/config";
import { direccionAnterior } from "@/lib/tienda/direccion-anterior";
import { enlaceDeTienda } from "@/lib/tienda/direccion";
import { sanearGrupos } from "@/lib/tienda/variedades";
import { Escaparate, type ProductoPublico } from "@/components/tienda/Escaparate";

/**
 * Una tienda, servida al público.
 *
 * SE PIDE CON LA LLAVE ANÓNIMA y las reglas de la base hacen el resto: solo
 * tiendas activas, solo productos no ocultos. Filtrar aquí «además» sería
 * duplicar la regla en dos sitios, y el día que discrepen gana la copia
 * equivocada.
 *
 * `force-dynamic` porque un precio o un agotado tiene que verse YA. Una tienda
 * que enseña el precio de ayer no es un fallo de caché: es una discusión con un
 * cliente en el mostrador.
 */
export const dynamic = "force-dynamic";

async function traerTienda(slug: string) {
  const sb = createClient();
  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,nombre,slug,activa,config")
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return tienda;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const tienda = await traerTienda(params.slug);
  if (!tienda) return { title: "Tienda no encontrada" };
  const config = leerConfig(tienda.config);
  const titulo = config.titulo || tienda.nombre;
  return {
    title: titulo,
    description: `Haz tu pedido en ${titulo}.`,
    // Lo que se ve cuando alguien comparte el enlace por WhatsApp, que es
    // exactamente como se comparten estas tiendas.
    openGraph: {
      title: titulo,
      description: `Haz tu pedido en ${titulo}.`,
      images: config.portada_url || config.logo_url ? [config.portada_url || config.logo_url!] : [],
    },
  };
}

export default async function TiendaPublicaPage({ params }: { params: { slug: string } }) {
  const tienda = await traerTienda(params.slug);

  // ¿ES UNA DIRECCIÓN VIEJA? El negocio pudo cambiarla, y lo que ya repartió
  // —el enlace de su Instagram, los enlaces de cobro en los chats— sigue
  // apuntando a la de antes. Se lleva a la nueva en vez de dar 404.
  if (!tienda) {
    const ahora = await direccionAnterior(params.slug);
    // Se manda a la dirección COMPLETA: así funciona igual se llegue desde el
    // dominio de tiendas o desde la plataforma, que enruta distinto.
    if (ahora) redirect(enlaceDeTienda(ahora));
  }

  if (!tienda || !tienda.activa) notFound();

  const sb = createClient();
  const { data: prods } = await sb
    .from("tienda_productos")
    .select("id,nombre,descripcion,categoria,precio,precio_anterior,stock,imagen_url,variedades")
    .eq("tienda_id", tienda.id)
    .order("orden", { ascending: true });

  const config = leerConfig(tienda.config);
  // Sin título propio se usa el nombre con el que se creó la tienda: una
  // cabecera en blanco hace dudar de si la página cargó bien.
  const conNombre = { ...config, titulo: config.titulo || tienda.nombre };

  // LAS OPCIONES SE SANEAN TAMBIÉN AL LEER, no solo al guardar. En la base ya
  // hay filas escritas por versiones anteriores —y las va a haber siempre, en
  // cuanto un importador o una migración pase por aquí— y una opción mal
  // formada no rompe la página: la deja muda, que es peor. Sanearlo al leer
  // arregla lo viejo sin tocar los datos y protege de lo que venga.
  const productos = ((prods ?? []) as ProductoPublico[]).map((p) => ({
    ...p,
    variedades: sanearGrupos(p.variedades),
  }));

  // EL COBRO NO SE PINTA AQUÍ. El escaparate solo toma pedidos; pagar ocurre en
  // otra página, a la que se llega por el enlace del mensaje de WhatsApp.
  return <Escaparate config={conNombre} productos={productos} slug={tienda.slug} />;
}
