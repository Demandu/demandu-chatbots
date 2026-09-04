import { esDelMotor } from "@/lib/motor/autorizado";
import { crearPedido, presupuestar } from "@/lib/tienda/crearPedido";
import { conversar } from "@/lib/tienda/conversacionDePedido";
import type { CarritoChat } from "@/lib/tienda/pedirPorChat";
import type { LineaPedida } from "@/lib/tienda/recalcular";

export const dynamic = "force-dynamic";

/**
 * El pedido del chat, por la misma puerta que el de la tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL MOTOR NO ESCRIBE EL PEDIDO ÉL MISMO, TENIENDO LA LLAVE.
 *
 * Podría: corre en Deno con la llave de servicio y sabe hacer `insert`. Y sería
 * el error más caro de todo el proyecto, porque un pedido no es una fila — es
 * recalcular precios contra el catálogo, exigir lo obligatorio, respetar el
 * mínimo, congelar el precio en cada línea y pegar el enlace de cobro. Eso está
 * escrito una vez, probado y cobrando a clientes reales.
 *
 * Escribirlo otra vez en el motor daría DOS calculadoras de dinero con las
 * mismas reglas copiadas. El día que alguien arregle un redondeo en una, la
 * otra sigue cobrando mal durante meses: los dos caminos parecen funcionar, y
 * solo lo descubre un cliente comparando su recibo con el de un amigo.
 *
 * Es el mismo motivo por el que el bloque de calendario tampoco habla con
 * Google: el cálculo vive en la web y el motor pregunta.
 *
 * ── TRES ACCIONES ─────────────────────────────────────────────────────────
 *
 * `conversar` es la que usa el bloque «Pedir por el chat»: le llega lo que la
 * persona tocó y devuelve el carrito nuevo más los mensajes que hay que
 * mandarle, ya escritos. El motor no decide nada; hace de cartero. Así la
 * conversación entera vive una sola vez aunque haya dos motores.
 *
 * `presupuesto` dice cuánto sale SIN crear nada, para quien quiera el total por
 * su cuenta — sacado del mismo sitio que le va a cobrar, no de una suma hecha
 * en el chat.
 *
 * `crear` lo guarda y devuelve el texto con el enlace de pago.
 *
 * ── LO QUE SIGUE SIN CREERSE, AUNQUE VENGA DEL MOTOR ──────────────────────
 *
 * Los precios. La regla no se relaja por quién llame: el día que haya un camino
 * «de confianza» que no recalcula, es el camino que alguien va a encontrar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {
  if (!(await esDelMotor(req))) return Response.json({ error: "no autorizado" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    accion?: string;
    carrito?: CarritoChat | null;
    respuesta?: string;
    saludo?: string | null;
    slug?: string;
    lineas?: LineaPedida[];
    respuestas?: Record<string, string>;
    contacto_id?: string | null;
    conversacion_id?: string | null;
    telefono?: string | null;
    nombre?: string | null;
  };

  const slug = String(b.slug ?? "").trim().toLowerCase();
  if (!slug) return Response.json({ error: "falta la tienda" }, { status: 400 });

  if (b.accion === "conversar") {
    const t = await conversar({
      slug,
      carrito: b.carrito ?? null,
      respuesta: b.respuesta ?? "",
      saludo: b.saludo ?? null,
      quien: {
        contacto_id: b.contacto_id ?? null,
        conversacion_id: b.conversacion_id ?? null,
        telefono: b.telefono ?? null,
        nombre: b.nombre ?? null,
      },
    });
    // SIEMPRE 200. Que la tienda esté apagada o que el carrito quede vacío no
    // es un fallo de la llamada: es una salida del flujo, y con un 400 el motor
    // solo vería «no contestó» y dejaría al cliente hablando solo.
    return Response.json(t);
  }

  if (b.accion === "presupuesto") {
    const r = await presupuestar({ slug, lineas: b.lineas ?? [], respuestas: b.respuestas ?? {} });
    // SE CONTESTA 200 AUNQUE NO CUADRE. Un presupuesto que no llega al mínimo
    // no es un error de la llamada: es información que el chat tiene que poder
    // contarle al cliente, y con un 400 el motor solo vería «falló».
    return Response.json(r);
  }

  const r = await crearPedido({
    slug,
    lineas: b.lineas ?? [],
    respuestas: b.respuestas ?? {},
    canal: "chat",
    quien: {
      contacto_id: b.contacto_id ?? null,
      conversacion_id: b.conversacion_id ?? null,
      telefono: b.telefono ?? null,
      nombre: b.nombre ?? null,
    },
  });

  if (!r.ok) return Response.json({ ok: false, error: r.error, rechazos: r.rechazos ?? [] });
  return Response.json(r);
}
