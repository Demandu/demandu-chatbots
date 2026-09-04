import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConfig, type ConfigTienda } from "./config";
import { sanearGrupos } from "./variedades";
import { recalcularPedido, type LineaPedida, type ProductoDelCatalogo } from "./recalcular";
import { textoDelPedido, type LineaCarrito } from "./pedido";
import { aWhatsapp, telefonoUtil } from "./telefono";
import { paisDesdeTelefono } from "@/lib/phoneCountry";
import { cobroPublico } from "./cobro-publico";
import { enlaceDePago } from "./direccion";
import { codigoDePedido } from "./yappy";

/**
 * Crear un pedido. UNO SOLO, para la tienda y para el chat.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO VIVÍA DENTRO DE `/api/tienda/pedido` Y SE SACÓ AQUÍ EL DÍA QUE EL BOT
 * EMPEZÓ A TOMAR PEDIDOS, por un motivo que no es de orden sino de dinero.
 *
 * Un pedido no es una fila: es recalcular los precios contra el catálogo,
 * comprobar el mínimo, exigir lo obligatorio, sacar el número correlativo,
 * congelar nombre y precio en cada línea, apuntar el evento, armar el texto que
 * lee el negocio, pegar el enlace de pago y atar la persona a su ficha del CRM.
 * Son nueve cosas y todas tienen que pasar o ninguna sirve.
 *
 * Escribir eso DOS VECES —una para el escaparate y otra para el chat— es
 * garantizar que un día se separen: se arregla un redondeo en una, y la otra
 * sigue cobrando mal durante meses sin que nadie lo note, porque los dos
 * caminos parecen funcionar. Es el tipo de error que solo descubre un cliente
 * comparando su recibo con el de un amigo.
 *
 * Así que el chat NO tiene su propio creador de pedidos. Tiene la misma puerta.
 *
 * ── LO QUE NO SE CREE DE QUIEN LLAMA ──────────────────────────────────────
 *
 * NI UN PRECIO. Llegan productos, cantidades y opciones elegidas; los precios
 * se vuelven a leer del catálogo en `recalcularPedido`. Da igual que quien
 * llame sea el escaparate público o el motor: la regla es la misma, porque el
 * día que se relaje «solo para el motor» es el día que hay un camino sin
 * revisar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type QuienPide = {
  /** Ya identificado: el chat sabe con quién habla. */
  contacto_id?: string | null;
  conversacion_id?: string | null;
  /** Para atarlo al CRM cuando no hay `contacto_id`: se busca o se crea. */
  telefono?: string | null;
  nombre?: string | null;
};

export type Encargo = {
  slug: string;
  lineas: LineaPedida[];
  respuestas?: Record<string, string>;
  /** De dónde viene: 'tienda' el escaparate, 'chat' el bot. */
  canal?: string;
  quien?: QuienPide;
};

export type PedidoHecho = {
  ok: true;
  numero: number;
  codigo: string;
  total: number;
  texto: string;
  rechazos: string[];
  pedido_id: string;
};

export type PedidoFallido = { ok: false; error: string; estado: number; rechazos?: string[] };

/** Lo que se puede saber SIN crear nada: cuánto sale y qué se cayó. */
export type Presupuesto = {
  ok: true;
  total: number;
  lineas: { nombre: string; cantidad: number; precio: number; elegidas: { grupo: string; texto: string; recargo: number }[] }[];
  rechazos: string[];
  faltan: string[];
  minimo: number;
  moneda: string;
};

/** Los canales que se aceptan. Un texto libre acabaría con veinte nombres. */
const CANALES = new Set(["tienda", "chat", "instagram", "web"]);

/**
 * La tienda, su catálogo y su configuración, en una sola lectura.
 *
 * SE EXPORTA PARA QUE LA CONVERSACIÓN DEL CHAT NO LA REPITA. Es la misma
 * tienda, el mismo catálogo y las mismas variedades saneadas: dos consultas
 * distintas para lo mismo es cómo se acaba con el chat ofreciendo un producto
 * que el creador del pedido ya no encuentra.
 */
export async function tiendaYCatalogo(slug: string) {
  const sb = createAdminClient();

  const { data: tienda } = await sb
    .from("tiendas")
    .select("id,org_id,nombre,slug,activa,config")
    .eq("slug", String(slug ?? "").trim().toLowerCase())
    .maybeSingle();

  // Una tienda cerrada no recibe pedidos. Que el escaparate no se pinte no
  // basta: alguien puede tener la pestaña abierta desde antes de cerrarla, y el
  // bot puede estar a mitad de una conversación empezada antes.
  if (!tienda || !tienda.activa) return null;

  const { data: prods } = await sb
    .from("tienda_productos")
    .select("id,nombre,precio,oculto,stock,variedades,categoria,orden")
    .eq("tienda_id", tienda.id);

  const catalogo: ProductoDelCatalogo[] = ((prods ?? []) as ProductoDelCatalogo[]).map((p) => ({
    ...p,
    variedades: sanearGrupos(p.variedades),
  }));

  return { sb, tienda, catalogo, config: leerConfig(tienda.config) };
}

/**
 * Cuánto sale, sin crear nada.
 *
 * EXISTE PARA QUE EL CHAT NO TENGA SU PROPIA CALCULADORA. El cliente tiene que
 * ver el total ANTES de decir que sí, y ese número no puede salir de una suma
 * hecha en el motor: tiene que salir del mismo sitio que le va a cobrar, o el
 * día que se separen verá un número y pagará otro.
 */
export async function presupuestar(
  encargo: Pick<Encargo, "slug" | "lineas" | "respuestas">,
): Promise<Presupuesto | PedidoFallido> {
  const t = await tiendaYCatalogo(encargo.slug);
  if (!t) return { ok: false, error: "Esta tienda no está disponible.", estado: 404 };

  const { lineas, total, rechazos } = recalcularPedido(t.catalogo, encargo.lineas ?? []);
  const faltan = t.config.preguntas
    .filter((p) => p.obligatoria && !String(encargo.respuestas?.[p.id] ?? "").trim())
    .map((p) => p.etiqueta);

  return {
    ok: true,
    total,
    lineas: lineas.map((l) => ({
      nombre: l.nombre,
      cantidad: l.cantidad,
      precio: l.precio,
      elegidas: l.elegidas,
    })),
    rechazos,
    faltan,
    minimo: t.config.minimo_pedido,
    moneda: t.config.moneda,
  };
}

export async function crearPedido(encargo: Encargo): Promise<PedidoHecho | PedidoFallido> {
  const t = await tiendaYCatalogo(encargo.slug);
  if (!t) return { ok: false, error: "Esta tienda no está disponible.", estado: 404 };

  const { sb, tienda, catalogo, config } = t;

  const { lineas, total, rechazos } = recalcularPedido(catalogo, encargo.lineas ?? []);
  if (!lineas.length) {
    return { ok: false, error: rechazos[0] ?? "El pedido quedó vacío.", estado: 400, rechazos };
  }

  if (config.minimo_pedido > 0 && total < config.minimo_pedido) {
    return { ok: false, error: "El pedido no llega al mínimo.", estado: 400 };
  }

  // Las respuestas se guardan CON SU ETIQUETA, no solo con el id: si mañana el
  // negocio renombra una pregunta, el pedido viejo tiene que seguir
  // explicándose solo.
  const respuestas = config.preguntas
    .map((p) => ({
      id: p.id,
      etiqueta: p.etiqueta,
      valor: String(encargo.respuestas?.[p.id] ?? "").trim().slice(0, 500),
    }))
    .filter((r) => r.valor);

  const faltan = config.preguntas
    .filter((p) => p.obligatoria && !respuestas.some((r) => r.id === p.id))
    .map((p) => p.etiqueta);
  if (faltan.length) {
    return { ok: false, error: `Falta ${faltan.join(", ")}.`, estado: 400 };
  }

  const { data: numero, error: errNumero } = await sb.rpc("siguiente_numero_pedido", {
    p_tienda: tienda.id,
  });
  if (errNumero || !numero) {
    return { ok: false, error: "No se pudo registrar el pedido.", estado: 500 };
  }

  // EL CÓDIGO CORTO SE PONE SIEMPRE, se vaya a cobrar en línea o no: es lo que
  // se dicta por teléfono y lo que usará cualquier pasarela que se enchufe
  // después. Ponerlo solo cuando hace falta obliga a inventarlo más tarde,
  // cuando el pedido ya está en manos de otro sistema.
  const canal = CANALES.has(String(encargo.canal ?? "")) ? String(encargo.canal) : "tienda";

  let pedido: { id: string; numero: number; codigo: string } | null = null;
  for (let intento = 0; intento < 3 && !pedido; intento++) {
    const codigo = codigoDePedido();
    const { data } = await sb
      .from("pedidos")
      .insert({
        org_id: tienda.org_id,
        tienda_id: tienda.id,
        numero,
        total,
        canal,
        respuestas,
        codigo,
        // EL CHAT YA SABE CON QUIÉN HABLA, y se ata desde el primer momento. En
        // el escaparate esto va nulo y se resuelve abajo por el teléfono.
        ...(encargo.quien?.contacto_id ? { contacto_id: encargo.quien.contacto_id } : {}),
        ...(encargo.quien?.conversacion_id ? { conversacion_id: encargo.quien.conversacion_id } : {}),
      })
      .select("id,numero,codigo")
      .single();
    if (data) pedido = data as { id: string; numero: number; codigo: string };
  }

  if (!pedido) return { ok: false, error: "No se pudo registrar el pedido.", estado: 500 };

  const ped = pedido;

  await sb.from("pedido_lineas").insert(
    lineas.map((l, i) => ({
      pedido_id: ped.id,
      producto_id: l.producto_id,
      nombre: l.nombre,
      precio: l.precio,
      cantidad: l.cantidad,
      elegidas: l.elegidas,
      nota: l.nota || null,
      orden: i,
    })),
  );

  await sb.from("pedido_eventos").insert({
    pedido_id: ped.id,
    que: "recibido",
    quien: canal,
    detalle: { total, lineas: lineas.length, rechazos },
  });

  // EL TEXTO LO ARMA EL SERVIDOR, con los precios de verdad. Si lo armara el
  // navegador, el mensaje podría decir un total y el pedido guardado otro — y
  // entonces nadie sabría cuál de los dos se cobra.
  const paraTexto: LineaCarrito[] = lineas.map((l, i) => ({
    clave: String(i),
    producto_id: l.producto_id,
    nombre: l.nombre,
    // `textoDelPedido` suma los recargos al precio base; aquí el precio ya los
    // trae, así que las elegidas van sin recargo para no contarlos dos veces.
    precio: l.precio,
    cantidad: l.cantidad,
    elegidas: l.elegidas.map((e) => ({ ...e, recargo: 0 })),
    nota: l.nota,
  }));

  // EL COBRO VIAJA EN EL MENSAJE, no en el carrito. Así el negocio recibe el
  // pedido aunque el cliente nunca llegue a pagar, y puede reenviarle el enlace
  // mañana: «aún me debes esto, aquí está».
  const cobro = await cobroPublico(tienda.id);

  const texto = [
    `*Pedido #${ped.numero}*`,
    textoDelPedido({
      tienda: config.titulo || tienda.nombre,
      lineas: paraTexto,
      respuestas: Object.fromEntries(respuestas.map((r) => [r.id, r.valor])),
      preguntas: config.preguntas,
      moneda: config.moneda,
    }),
    ...(cobro.yappy
      ? ["", "Dale clic para pagar con Yappy:", enlaceDePago(tienda.slug, ped.codigo)]
      : []),
    // EL CÓDIGO VIAJA SIEMPRE, cobre la tienda o no. Es lo que reconoce el
    // mensaje al llegar a la Bandeja y lo que ata la conversación con el
    // pedido.
    "",
    `Código: ${ped.codigo}`,
  ].join("\n");

  await enlazarContacto();

  return {
    ok: true,
    numero: ped.numero,
    codigo: ped.codigo,
    total,
    texto,
    rechazos,
    pedido_id: ped.id,
  };

  /**
   * Atar el pedido a la persona que lo hizo.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * ES LA PIEZA QUE HACE QUE ESTO SEA UN CRM Y NO UNA LISTA DE PEDIDOS. Sin
   * `contacto_id`, «cuántas veces compró», «cuánto gasta» y «qué le gusta» no
   * se pueden calcular — y lo peor es que NO SE PUEDEN RECUPERAR DESPUÉS.
   *
   * DESDE EL CHAT ESTO YA VIENE RESUELTO: el motor sabe con quién habla. Desde
   * el escaparate hay que adivinarlo por el teléfono que escribieron, con el
   * mismo formato con el que el motor guarda a quien escribe — así, quien pide
   * en la tienda y luego manda el mensaje es UNA persona y no dos fichas.
   *
   * TODO ESTO ES «SI SE PUEDE». Un pedido sin contacto sigue siendo un pedido
   * que hay que preparar: fallar aquí no puede tumbar la venta.
   * ───────────────────────────────────────────────────────────────────────────
   */
  async function enlazarContacto() {
    if (encargo.quien?.contacto_id) return;
    try {
      const preguntaTel = config.preguntas.find((p) => p.tipo === "telefono");
      const escrito = preguntaTel
        ? (respuestas.find((r) => r.id === preguntaTel.id)?.valor ?? "")
        : "";
      const crudo = escrito || String(encargo.quien?.telefono ?? "");

      const tel = aWhatsapp(crudo, config.whatsapp.numero);
      if (!telefonoUtil(tel)) return;

      const { data: existe } = await sb
        .from("contacts")
        .select("id,name")
        .eq("org_id", tienda.org_id)
        .eq("channel", "whatsapp")
        .eq("external_id", tel)
        .maybeSingle();

      // El nombre solo se pone si la ficha no tenía: lo que el negocio escribió
      // a mano vale más que lo que el cliente tecleó de prisa en un formulario.
      const nombre = nombreDelPedido() || String(encargo.quien?.nombre ?? "").trim().slice(0, 120);

      let contactoId = existe?.id ?? null;
      if (contactoId) {
        if (nombre && !existe?.name) {
          await sb.from("contacts").update({ name: nombre }).eq("id", contactoId);
        }
      } else {
        const { data: creado } = await sb
          .from("contacts")
          .insert({
            org_id: tienda.org_id,
            channel: "whatsapp",
            external_id: tel,
            phone: tel,
            country: paisDesdeTelefono(tel),
            ...(nombre ? { name: nombre } : {}),
          })
          .select("id")
          .single();
        contactoId = creado?.id ?? null;
      }

      if (contactoId) await sb.from("pedidos").update({ contacto_id: contactoId }).eq("id", ped.id);
    } catch {
      /* un pedido sin contacto sigue siendo un pedido */
    }
  }

  /** El nombre que puso en el formulario, si hay una pregunta que lo pida. */
  function nombreDelPedido(): string {
    const limpia = (t: string) =>
      t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const p = (config as ConfigTienda).preguntas.find(
      (q) => q.tipo !== "lista" && limpia(q.etiqueta).includes("nombre"),
    );
    if (!p) return "";
    return (respuestas.find((r) => r.id === p.id)?.valor ?? "").trim().slice(0, 120);
  }
}
