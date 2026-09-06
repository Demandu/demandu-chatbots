import "server-only";
import { tiendaYCatalogo, crearPedido } from "./crearPedido";
import { recalcularPedido } from "./recalcular";
import { comoDinero, type GrupoVariedad } from "./variedades";
import { enlaceDeTienda } from "./direccion";
import type { PreguntaPedido } from "./config";
import {
  carritoVacio,
  siguientePaso,
  empezarProducto,
  elegirOpcion,
  avanzarGrupo,
  meterAlCarrito,
  cerrarCarrito,
  seguirComprando,
  contestar,
  leerCantidad,
  loQueYaSabemos,
  filasDeVariedad,
  opcionElegida,
  cuantasCosas,
  MAX_FILAS,
  type CarritoChat,
  type ProductoChat,
} from "./pedirPorChat";

/**
 * La conversación de un pedido, de principio a fin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIVE AQUÍ Y NO EN EL MOTOR, Y ES LA DECISIÓN QUE SOSTIENE TODO ESTO.
 *
 * Hay dos motores que no comparten un solo archivo: WhatsApp e Instagram corren
 * en Deno (`supabase/functions/whatsapp`), el widget web corre en Node
 * (`src/lib/flow/webRuntime.ts`). Todo lo que se pone en los dos hay que
 * escribirlo dos veces, y todo lo que se escribe dos veces se separa.
 *
 * Con un menú o un botón, esa separación es un texto distinto. Con un PEDIDO,
 * es cobrar distinto según por dónde escribió el cliente.
 *
 * Así que los motores no saben pedir. Le mandan a esta función lo que la
 * persona tocó y reciben DOS COSAS: el carrito nuevo, que guardan tal cual sin
 * mirarlo, y los mensajes que hay que enviar, ya escritos. Un motor es un
 * cartero. La conversación entera —qué se pregunta, en qué orden, qué pasa si
 * contestan cualquier cosa, cuándo se crea el pedido— está una sola vez, en
 * Node, y se puede probar sin WhatsApp delante.
 *
 * Es el mismo camino que ya usa el bloque de calendario: el motor no habla con
 * Google, le pregunta a la plataforma.
 *
 * ── EL DINERO NO SE CALCULA AQUÍ TAMPOCO ──────────────────────────────────
 *
 * Los totales salen de `recalcularPedido` —el mismo que usa el escaparate— y el
 * pedido lo crea `crearPedido` —el mismo que usa el escaparate—. Esta función
 * decide QUÉ SE PREGUNTA; no suma ni cobra.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MensajeChat =
  | { tipo: "texto"; texto: string }
  | { tipo: "botones"; texto: string; botones: { id: string; titulo: string }[] }
  | {
      tipo: "lista";
      texto: string;
      boton: string;
      seccion: string;
      filas: { id: string; titulo: string; descripcion?: string }[];
    }
  | { tipo: "enlace"; texto: string; boton: string; url: string };

export type Turno = {
  /** Lo que el motor guarda tal cual. Nulo = la conversación de pedido terminó. */
  carrito: CarritoChat | null;
  mensajes: MensajeChat[];
  /**
   * Por dónde sale el flujo cuando esto termina.
   * `null` = todavía estamos pidiendo, el bloque sigue esperando respuesta.
   */
  salida: "ok" | "no" | null;
  pedido?: { numero: number; codigo: string; total: number; texto: string };
};

export type Entrada = {
  slug: string;
  /** Nulo la primera vez: la conversación empieza. */
  carrito: CarritoChat | null;
  /** Lo que tocó o escribió. Vacío en el primer turno. */
  respuesta?: string;
  quien?: {
    contacto_id?: string | null;
    conversacion_id?: string | null;
    telefono?: string | null;
    nombre?: string | null;
  };
  /** El saludo que el negocio escribió en el bloque. */
  saludo?: string | null;
};

/** Lo que hace falta escribir para irse. Se acepta escrito, no solo tocado. */
const PALABRAS_DE_SALIR = /^(cancelar|salir|ya no|olv[ií]dalo|nada|no quiero)\b/i;

/* ── La puerta ─────────────────────────────────────────────────────────────── */

export async function conversar(entrada: Entrada): Promise<Turno> {
  const t = await tiendaYCatalogo(entrada.slug);
  if (!t) {
    // Tienda apagada o borrada a mitad de una conversación. No es culpa del
    // cliente y no se le puede dejar hablando solo: sale por «no hay tienda» y
    // el flujo del negocio suele llevar de ahí a una persona.
    return { carrito: null, mensajes: [], salida: "no" };
  }

  const { tienda, catalogo, config } = t;
  const moneda = config.moneda;

  // LO OCULTO NO SE OFRECE Y LO AGOTADO TAMPOCO. Es la misma regla del bloque
  // de catálogo: ofrecer por chat algo que no se puede comprar es una
  // conversación que termina en disculpa.
  const visibles: ProductoChat[] = (catalogo as unknown as ProductoChat[])
    .filter((p) => !p.oculto)
    .filter((p) => p.stock === null || p.stock === undefined || Number(p.stock) > 0)
    .sort(
      (a, b) =>
        (Number(a.orden) || 0) - (Number(b.orden) || 0) ||
        String(a.nombre).localeCompare(String(b.nombre)),
    );

  if (!visibles.length) return { carrito: null, mensajes: [], salida: "no" };

  const preguntas = config.preguntas;
  const dicho = String(entrada.respuesta ?? "").trim();

  /* ── Primer turno: se abre el carrito y se enseña el catálogo ───────────── */
  if (!entrada.carrito) {
    const nuevo: CarritoChat = {
      ...carritoVacio(tienda.id),
      // Lo que ya sabemos no se pregunta. El teléfono, sobre todo: es la casilla
      // que más se equivoca en cualquier formulario y la única que en el chat
      // sobra, porque la persona está escribiendo desde él.
      respuestas: loQueYaSabemos(preguntas, {
        telefono: entrada.quien?.telefono ?? null,
        nombre: entrada.quien?.nombre ?? null,
      }),
    };
    const saludo = String(entrada.saludo ?? "").trim() || "¿Qué te gustaría pedir?";
    return { carrito: nuevo, mensajes: [listaDeProductos(nuevo, saludo)], salida: null };
  }

  let carrito = entrada.carrito;

  // SALIRSE SE PUEDE EN CUALQUIER MOMENTO Y SIEMPRE. Un carrito del que no se
  // puede salir es una conversación secuestrada: quien escribe «cancelar» y
  // recibe otra vez el menú, bloquea el número.
  if (PALABRAS_DE_SALIR.test(dicho)) {
    return {
      carrito: null,
      mensajes: [{ tipo: "texto", texto: "Listo, cancelé el pedido. Aquí estoy si quieres retomarlo." }],
      salida: "no",
    };
  }

  const paso = siguientePaso(carrito, visibles, preguntas);

  /* ── Se interpreta lo que dijo, según lo que se le había preguntado ─────── */
  switch (paso.que) {
    case "producto": {
      const mas = /^mas-(\d+)$/.exec(dicho);
      if (mas) {
        carrito = { ...carrito, desde: Number(mas[1]) };
        return { carrito, mensajes: [listaDeProductos(carrito, "Sigo:")], salida: null };
      }

      if (dicho === "ir-pagar" && carrito.lineas.length) {
        carrito = cerrarCarrito(carrito);
        break;
      }

      const p = productoDeLaRespuesta(dicho, visibles);
      if (!p) {
        // Escribió en vez de tocar. SE BUSCA POR NOMBRE ANTES DE RENDIRSE:
        // «quiero una margarita» es un pedido perfectamente claro, y contestar
        // con el menú otra vez es lo que hace que la gente se vaya.
        return {
          carrito,
          mensajes: [listaDeProductos(carrito, "No encontré eso. Esto es lo que tenemos:")],
          salida: null,
        };
      }

      const { carrito: c2, veredicto } = empezarProducto(carrito, p);
      if (!veredicto.cabe) {
        // NO SE INTENTA Y SE FALLA A LA MITAD: se manda a su página, que ya
        // resuelve bien lo que aquí no cabe. El enlace abre el producto, no la
        // portada — dejar a alguien buscándolo a mano es donde se pierde.
        return {
          carrito,
          mensajes: [
            {
              tipo: "enlace",
              texto:
                `«${p.nombre}» tiene varias opciones para elegir y se arma mejor en la tienda. ` +
                `Ábrelo aquí, agrégalo y vuelve cuando quieras 👇`,
              boton: "Abrir producto",
              url: `${enlaceDeTienda(tienda.slug)}?p=${encodeURIComponent(p.id)}`,
            },
          ],
          salida: null,
        };
      }
      carrito = c2;
      break;
    }

    case "variedad": {
      const { listo, texto } = opcionElegida(dicho);

      if (listo) {
        carrito = avanzarGrupo(carrito);
        break;
      }

      const elegido = texto ?? emparejarOpcion(dicho, paso.grupo);
      if (!elegido) {
        return { carrito, mensajes: [preguntaDeVariedad(paso, moneda)], salida: null };
      }

      const antes = carrito;
      carrito = elegirOpcion(carrito, paso.grupo, elegido);
      // No cambió nada: era una opción que este grupo no tiene, o repetida.
      if (carrito === antes) {
        return { carrito, mensajes: [preguntaDeVariedad(paso, moneda)], salida: null };
      }
      break;
    }

    case "cantidad": {
      const n = leerCantidad(dicho);
      if (n === null) {
        return { carrito, mensajes: [preguntaDeCantidad(paso.producto, moneda)], salida: null };
      }
      // NO SE VENDE MÁS DE LO QUE HAY. `recalcularPedido` lo rechazaría después
      // y el cliente vería su producto desaparecer sin entender por qué; aquí
      // se le puede decir cuántos quedan.
      const hay = paso.producto.stock;
      if (hay !== null && hay !== undefined && n > Number(hay)) {
        return {
          carrito,
          mensajes: [
            { tipo: "texto", texto: `De «${paso.producto.nombre}» solo quedan ${hay}. ¿Cuántos te pongo?` },
          ],
          salida: null,
        };
      }
      carrito = meterAlCarrito(carrito, n);
      break;
    }

    case "mas": {
      if (dicho === "mas-si") {
        carrito = { ...carrito, desde: 0 };
        return { carrito, mensajes: [listaDeProductos(carrito, "¿Qué más te pongo?")], salida: null };
      }
      if (dicho === "mas-no") {
        carrito = cerrarCarrito(carrito);
        break;
      }
      return { carrito, mensajes: [await preguntaDeAlgoMas(carrito)], salida: null };
    }

    case "pregunta": {
      const q = paso.pregunta;
      // En una lista, el id de la fila ES la opción: así no hay que guardar en
      // ninguna parte qué se le ofreció ni preocuparse de que caduque.
      const valor = q.opciones?.length ? (opcionElegida(dicho).texto ?? dicho) : dicho;
      const antes = carrito;
      carrito = contestar(carrito, q, valor);
      if (carrito === antes) {
        return {
          carrito,
          mensajes: [
            { tipo: "texto", texto: `Necesito ${q.etiqueta.replace(/\s*\*+\s*$/, "")} para poder seguir.` },
            preguntaDelFormulario(q),
          ],
          salida: null,
        };
      }
      break;
    }

    case "confirmar": {
      if (dicho === "conf-no") {
        carrito = seguirComprando(carrito);
        return { carrito, mensajes: [listaDeProductos(carrito, "¿Qué más te pongo?")], salida: null };
      }
      if (dicho !== "conf-si") {
        return { carrito, mensajes: [await resumenParaConfirmar(carrito)], salida: null };
      }

      const hecho = await crearPedido({
        slug: tienda.slug,
        lineas: carrito.lineas,
        respuestas: carrito.respuestas ?? {},
        canal: "chat",
        quien: entrada.quien,
      });

      if (!hecho.ok) {
        // ALGO CAMBIÓ MIENTRAS HABLABAN: subió un precio, se agotó, se ocultó.
        // Se le dice qué pasó y se le devuelve el carrito; volver a empezar de
        // cero por un producto agotado es perder el pedido entero.
        return {
          carrito,
          mensajes: [
            { tipo: "texto", texto: `No pude cerrar el pedido: ${hecho.error}` },
            await preguntaDeAlgoMas(seguirComprando(carrito)),
          ],
          salida: null,
        };
      }

      return {
        carrito: null,
        mensajes: [{ tipo: "texto", texto: hecho.texto }],
        salida: "ok",
        pedido: { numero: hecho.numero, codigo: hecho.codigo, total: hecho.total, texto: hecho.texto },
      };
    }

    case "vacio":
      return { carrito: null, mensajes: [], salida: "no" };
  }

  /* ── Y se pregunta lo siguiente ─────────────────────────────────────────── */
  return { carrito, mensajes: [await pintar(carrito)], salida: null };

  /* ── Cómo se pinta cada paso ───────────────────────────────────────────── */

  async function pintar(c: CarritoChat): Promise<MensajeChat> {
    const p = siguientePaso(c, visibles, preguntas);
    switch (p.que) {
      case "producto":
        return listaDeProductos(c, "¿Qué te gustaría pedir?");
      case "variedad":
        return preguntaDeVariedad(p, moneda);
      case "cantidad":
        return preguntaDeCantidad(p.producto, moneda);
      case "mas":
        return preguntaDeAlgoMas(c);
      case "pregunta":
        return preguntaDelFormulario(p.pregunta);
      case "confirmar":
        return resumenParaConfirmar(c);
      case "vacio":
        return { tipo: "texto", texto: "Se quedó vacío el pedido." };
    }
  }

  /**
   * El catálogo, en filas.
   *
   * LAS DIEZ FILAS SE REPARTEN, no se llenan de productos. Meta rechaza la
   * lista entera si te pasas de diez, así que «Ver más» y «Terminar mi pedido»
   * se reservan ANTES de meter productos: al revés, la fila de terminar sería
   * la primera en caerse y el cliente se quedaría con un carrito lleno sin
   * forma de cerrarlo.
   */
  function listaDeProductos(c: CarritoChat, texto: string): MensajeChat {
    const desde = Math.max(0, Math.floor(Number(c.desde) || 0));
    const tiene = cuantasCosas(c);

    let hueco = MAX_FILAS;
    if (tiene > 0) hueco -= 1; // «Terminar mi pedido»
    const quedan = visibles.length - desde;
    const hayMas = quedan > hueco;
    if (hayMas) hueco -= 1; // «Ver más»

    const filas = visibles.slice(desde, desde + hueco).map((p) => ({
      // TÍTULO A 24 Y DESCRIPCIÓN A 72: pasarse rechaza el mensaje entero, y el
      // error de Meta no dice cuál de los dos campos fue.
      id: `prod-${p.id}`.slice(0, 200),
      titulo: String(p.nombre).slice(0, 24),
      descripcion: [
        comoDinero(p.precio, moneda),
        (p.variedades ?? []).length ? "con opciones" : "",
        p.categoria ? String(p.categoria) : "",
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 72),
    }));

    if (hayMas) {
      filas.push({
        id: `mas-${desde + hueco}`,
        titulo: "Ver más productos",
        descripcion: `Quedan ${visibles.length - desde - hueco}`.slice(0, 72),
      });
    }
    if (tiene > 0) {
      filas.push({
        id: "ir-pagar",
        titulo: "Terminar mi pedido",
        descripcion: `Llevas ${tiene} ${tiene === 1 ? "cosa" : "cosas"}`.slice(0, 72),
      });
    }

    return {
      tipo: "lista",
      texto,
      boton: "Ver productos",
      seccion: String(tienda.nombre ?? "Productos").slice(0, 24),
      filas,
    };
  }

  function preguntaDeVariedad(
    p: Extract<ReturnType<typeof siguientePaso>, { que: "variedad" }>,
    m: string,
  ): MensajeChat {
    const filas = filasDeVariedad(p.grupo, p.yaElegidas, m, p.puedeTerminar);

    const cabecera =
      p.faltan !== null && p.faltan > 0
        ? `${p.producto.nombre} — elige ${p.faltan} ${p.faltan === 1 ? "opción" : "opciones"} de ${p.grupo.nombre}`
        : p.grupo.modo === "varias"
          ? `${p.producto.nombre} — ¿quieres agregar ${p.grupo.nombre}?`
          : `${p.producto.nombre} — elige ${p.grupo.nombre}`;

    // CON TRES O MENOS, BOTONES. Se ven de un vistazo y se tocan sin abrir
    // nada; una lista para dos opciones son dos toques donde bastaba uno.
    if (filas.length <= 3) {
      return {
        tipo: "botones",
        texto: cabecera,
        botones: filas.map((f) => ({ id: f.id, titulo: f.titulo.slice(0, 20) })),
      };
    }

    return { tipo: "lista", texto: cabecera, boton: "Elegir", seccion: p.grupo.nombre.slice(0, 24), filas };
  }

  function preguntaDeCantidad(p: ProductoChat, m: string): MensajeChat {
    return {
      tipo: "botones",
      texto: `${p.nombre} — ${comoDinero(p.precio, m)}\n¿Cuántos te pongo? (o escríbeme el número)`,
      botones: [
        { id: "1", titulo: "1" },
        { id: "2", titulo: "2" },
        { id: "3", titulo: "3" },
      ],
    };
  }

  /**
   * «¿Algo más?», con el subtotal.
   *
   * EL SUBTOTAL SALE DE `recalcularPedido`, el mismo que va a cobrar. Sumarlo
   * aquí sería tener dos calculadoras, y el día que se separen el cliente ve un
   * número mientras conversa y paga otro al final.
   */
  async function preguntaDeAlgoMas(c: CarritoChat): Promise<MensajeChat> {
    const { total } = recalcularPedido(catalogo, c.lineas);
    const cuantas = cuantasCosas(c);
    return {
      tipo: "botones",
      texto:
        `Llevas ${cuantas} ${cuantas === 1 ? "cosa" : "cosas"} — ${comoDinero(total, moneda)}\n` +
        `¿Quieres agregar algo más?`,
      botones: [
        { id: "mas-si", titulo: "Agregar más" },
        { id: "mas-no", titulo: "Terminar pedido" },
        { id: "cancelar", titulo: "Cancelar" },
      ],
    };
  }

  function preguntaDelFormulario(q: PreguntaPedido): MensajeChat {
    const etiqueta = q.etiqueta.replace(/\s*\*+\s*$/, "").trim();

    if (q.opciones?.length) {
      return {
        tipo: "lista",
        texto: etiqueta,
        boton: "Elegir",
        seccion: etiqueta.slice(0, 24),
        filas: q.opciones.slice(0, MAX_FILAS).map((o) => ({
          id: `op-${o}`.slice(0, 200),
          titulo: o.slice(0, 24),
        })),
      };
    }

    return {
      tipo: "texto",
      texto: q.ayuda ? `${etiqueta}\n_${q.ayuda}_` : etiqueta,
    };
  }

  /**
   * El resumen antes del sí.
   *
   * SE ENSEÑA ENTERO Y CON EL TOTAL DE VERDAD. Es lo último que ve antes de que
   * exista un pedido cobrable: un total que aparece después de confirmar es
   * exactamente lo que hace que la gente no vuelva a pedir por aquí.
   */
  async function resumenParaConfirmar(c: CarritoChat): Promise<MensajeChat> {
    const { lineas, total } = recalcularPedido(catalogo, c.lineas);

    const renglones = lineas.map((l) => {
      const detalle = l.elegidas.map((e) => e.texto).join(", ");
      return `• ${l.cantidad} × ${l.nombre}${detalle ? ` (${detalle})` : ""} — ${comoDinero(
        l.precio * l.cantidad,
        moneda,
      )}`;
    });

    const datos = preguntas
      .map((q) => ({ etiqueta: q.etiqueta.replace(/\s*\*+\s*$/, ""), valor: c.respuestas?.[q.id] ?? "" }))
      .filter((r) => r.valor);

    return {
      tipo: "botones",
      texto: [
        "*Este es tu pedido:*",
        ...renglones,
        "",
        `*Total: ${comoDinero(total, moneda)}*`,
        ...(datos.length ? ["", ...datos.map((d) => `${d.etiqueta}: ${d.valor}`)] : []),
        "",
        "¿Lo confirmo?",
      ].join("\n"),
      botones: [
        { id: "conf-si", titulo: "Sí, confirmar" },
        { id: "conf-no", titulo: "Agregar algo" },
        { id: "cancelar", titulo: "Cancelar" },
      ],
    };
  }
}

/* ── Ayudas ────────────────────────────────────────────────────────────────── */

/**
 * Qué producto eligió: el que tocó, o el que nombró escribiendo.
 *
 * SE ACEPTA ESCRITO A PROPÓSITO. Mucha gente contesta «quiero una margarita»
 * en vez de abrir la lista, y responderle con el menú otra vez es la forma más
 * rápida de que abandone. Solo vale si hay UN candidato: con dos, adivinar
 * cuál quería sería meterle en el carrito algo que no pidió.
 */
export function productoDeLaRespuesta(dicho: string, productos: ProductoChat[]): ProductoChat | null {
  const m = /^prod-([\s\S]+)$/.exec(String(dicho ?? "").trim());
  if (m) return productos.find((p) => p.id === m[1]) ?? null;

  const t = normalizar(dicho);
  if (t.length < 3) return null;

  const exactos = productos.filter((p) => normalizar(p.nombre) === t);
  if (exactos.length === 1) return exactos[0];

  const parecidos = productos.filter((p) => normalizar(p.nombre).includes(t));
  return parecidos.length === 1 ? parecidos[0] : null;
}

/** Lo mismo con las opciones de un grupo: tocada o escrita. */
export function emparejarOpcion(dicho: string, grupo: GrupoVariedad): string | null {
  const t = normalizar(dicho);
  if (!t) return null;
  const exacta = (grupo.opciones ?? []).find((o) => normalizar(o.texto) === t);
  if (exacta) return exacta.texto;
  const parecidas = (grupo.opciones ?? []).filter((o) => normalizar(o.texto).includes(t));
  return parecidas.length === 1 ? parecidas[0].texto : null;
}

/** Sin acentos, sin mayúsculas y sin espacios de sobra: como lo escribe la gente. */
function normalizar(v: string | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Para que quien lea el turno sepa si el bloque sigue conduciendo la charla. */
export function siguePidiendo(t: Turno): boolean {
  return t.salida === null;
}
