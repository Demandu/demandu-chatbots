import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { codigoValido } from "@/lib/tienda/yappy";

/**
 * El enlace corto de un cobro: `store.demandu.tech/r/<CÓDIGO>`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXISTE POR LOS BOTONES DE LAS PLANTILLAS DE META. Un botón de plantilla lleva
 * una dirección fija con UN hueco al final, y ese hueco tiene que valer para
 * todas las tiendas de todos los clientes. `/<tienda>/pagar/<código>` no cabe
 * en un solo hueco; el código sí, y ya sabe a qué tienda pertenece.
 *
 * Y ADEMÁS SOBREVIVE AL CAMBIO DE DIRECCIÓN. Un enlace con la tienda dentro se
 * queda apuntando a la dirección vieja el día que el negocio cambie la suya, y
 * estos son justamente los mensajes que llevan dinero dentro. Aquí la tienda se
 * busca en el momento, así que el enlace vale para siempre.
 *
 * NO ENSEÑA NADA: solo redirige. Quien no traiga un código de verdad se lleva
 * un 404 igual que si hubiera escrito cualquier cosa — esta dirección no puede
 * servir para averiguar si un código existe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EnlaceCortoDeCobro({
  params,
}: {
  params: { codigo: string };
}) {
  const codigo = String(params.codigo ?? "").trim().toUpperCase();
  if (!codigoValido(codigo)) notFound();

  const { data: pedido } = await createAdminClient()
    .from("pedidos")
    .select("codigo,tienda:tiendas(slug,activa)")
    .eq("codigo", codigo)
    .maybeSingle();

  const tienda = (pedido as { tienda?: { slug?: string; activa?: boolean } } | null)?.tienda;
  if (!tienda?.slug || !tienda.activa) notFound();

  redirect(`/${tienda.slug}/pagar/${codigo}`);
}
