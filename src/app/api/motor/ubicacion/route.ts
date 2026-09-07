import { esDelMotor } from "@/lib/motor/autorizado";
import { createAdminClient } from "@/lib/supabase/admin";
import { aQuePedidoVa, ubicacionDelMensaje } from "@/lib/tienda/ubicacionQueLlega";

export const dynamic = "force-dynamic";

/**
 * LLEGÓ UNA UBICACIÓN POR EL CHAT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL MOTOR NO DECIDE A QUÉ PEDIDO VA, Y ESO NO ES CEREMONIA.
 *
 * Hay dos motores que no comparten un solo archivo: WhatsApp e Instagram corren
 * en Deno, el widget en Node. Si la regla de «a qué pedido va esta ubicación»
 * viviera en el motor, habría que escribirla dos veces — y el día que se
 * separen, un canal guardaría la ubicación en el pedido de ayer y el otro en el
 * de hoy. Es el mismo motivo por el que el pedido y el calendario tampoco se
 * resuelven en el motor.
 *
 * Así que el motor hace de cartero: manda lo que llegó y recibe el texto que
 * tiene que contestar, ya escrito.
 *
 * ── SE ESCRIBE CON LA LLAVE DE SERVICIO, Y ACOTADO A MANO ─────────────────
 *
 * Aquí no hay sesión de nadie: es un servidor hablando con otro. Por eso cada
 * consulta lleva SU `org_id` y SU `contacto_id` en el `where` — lo que RLS haría
 * por nosotros si hubiera sesión, hecho a mano y a la vista. Sin esos dos
 * filtros, una ubicación podría caer en el pedido de otro cliente de otra
 * cuenta.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  if (!(await esDelMotor(req))) return Response.json({ error: "no autorizado" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    org_id?: string;
    contacto_id?: string;
    location?: unknown;
  };

  const orgId = String(b.org_id ?? "").trim();
  const contactoId = String(b.contacto_id ?? "").trim();
  if (!orgId || !contactoId) return Response.json({ error: "faltan datos" }, { status: 400 });

  const punto = ubicacionDelMensaje(b.location);
  if (!punto) return Response.json({ ok: false, mensaje: "" });

  const admin = createAdminClient();

  // Se traen los últimos y decide la función pura. Diez es de sobra: la ventana
  // son tres días, y quien tiene más de diez pedidos abiertos en tres días no
  // está mandando su ubicación, está montando un negocio.
  const { data: pedidos } = await admin
    .from("pedidos")
    .select("id,numero,estado,created_at,entrega_lat,entrega_long,envio_id")
    .eq("org_id", orgId)
    .eq("contacto_id", contactoId)
    .order("created_at", { ascending: false })
    .limit(10);

  const plan = aQuePedidoVa((pedidos ?? []) as any[]);
  if (plan.que === "nada") return Response.json({ ok: false, mensaje: plan.mensaje });

  const { error } = await admin
    .from("pedidos")
    .update({
      entrega_lat: punto.punto.lat,
      entrega_long: punto.punto.long,
      // EL NOMBRE DEL SITIO NO PISA LA DIRECCIÓN ESCRITA. Cuando la persona
      // elige un lugar del buscador de WhatsApp llega «Multiplaza»; eso está
      // bien como referencia y es malísimo como dirección de entrega, porque
      // no dice ni la torre ni el apartamento. Solo se pone si no había nada.
      ...(punto.nombre ? { entrega_nota: punto.nombre } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", plan.pedido.id)
    .eq("org_id", orgId);

  if (error) {
    // NO SE LE MIENTE AL CLIENTE. Decirle «guardada» cuando la escritura falló
    // es lo peor de los dos mundos: se queda tranquilo y el pedido sigue sin
    // poder despacharse.
    return Response.json({
      ok: false,
      mensaje: "No pude guardar tu ubicación ahora mismo. ¿Me la mandas otra vez?",
    });
  }

  await admin.from("pedido_eventos").insert({
    pedido_id: plan.pedido.id,
    que: plan.corrige ? "ubicacion_corregida" : "ubicacion_recibida",
    quien: "cliente",
    detalle: { lat: punto.punto.lat, long: punto.punto.long, nombre: punto.nombre },
  });

  return Response.json({ ok: true, mensaje: plan.mensaje, pedido: plan.pedido.numero });
}
