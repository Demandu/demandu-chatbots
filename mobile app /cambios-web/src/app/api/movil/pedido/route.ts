import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cambiarEstadoPedido } from "@/app/(dashboard)/tienda/[id]/actions";

export const dynamic = "force-dynamic";

/**
 * Mover un pedido desde la app del teléfono.
 *
 * NO REPITE LA LÓGICA DEL PANEL: llama a la misma acción que usa la pantalla
 * de la tienda (`cambiarEstadoPedido`), que valida que el pedido esté cobrado,
 * apunta el evento y le avisa al cliente por WhatsApp. Si el día de mañana
 * cambia una regla ahí, la app la hereda sola.
 *
 * Entra con el token de la app en `Authorization: Bearer …` (ver
 * `lib/supabase/server.ts`). Cuerpo: { tienda_id, pedido_id, estado }.
 * `estado` puede ser uno de los pasos del pedido o "cobrado_por_fuera".
 */
export async function POST(req: Request) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, mensaje: "Inicia sesión." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    tienda_id?: string;
    pedido_id?: string;
    estado?: string;
  };

  if (!b.tienda_id || !b.pedido_id || !b.estado) {
    return NextResponse.json({ ok: false, mensaje: "Faltan datos del pedido." }, { status: 400 });
  }

  const fd = new FormData();
  fd.set("tienda_id", String(b.tienda_id));
  fd.set("pedido_id", String(b.pedido_id));
  fd.set("estado", String(b.estado));

  const r = await cambiarEstadoPedido({ ok: true, mensaje: "" } as any, fd);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
