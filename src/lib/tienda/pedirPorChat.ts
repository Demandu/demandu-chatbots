/**
 * Pedir por el chat: el carrito que se arma hablando.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN QUE MANDA SOBRE TODO LO DEMÁS: AQUÍ NO SE COBRA NADA.
 *
 * Este archivo decide QUÉ SE PREGUNTA AHORA. No suma, no aplica recargos, no
 * calcula totales y no crea pedidos. Eso ya existe, ya está probado y ya cobra
 * a clientes reales: `recalcularPedido` vuelve a leer cada precio del catálogo
 * y `crearPedido` guarda el pedido con sus líneas y su enlace de pago.
 *
 * Se pensó lo contrario —una máquina de estados que fuera armando el precio
 * mientras conversa— y es la peor idea posible: sería una SEGUNDA calculadora
 * de dinero, con las mismas reglas escritas otra vez, que el día que alguien
 * toque una de las dos empieza a cobrar distinto según el cliente pidiera por
 * la tienda o por el chat. Y nadie se enteraría hasta que un cliente comparara.
 *
 * Así que el carrito del chat guarda LO MÍNIMO que no se puede recalcular:
 *
 *     qué producto · cuántos · qué opciones eligió · qué nota escribió
 *
 * Ni un precio. Ni un total. Nada que se pueda manipular ni que se pueda quedar
 * viejo. Cada número que el cliente ve sale del mismo sitio que le va a cobrar.
 *
 * ── POR QUÉ NO TODO PRODUCTO SE PUEDE PEDIR HABLANDO ──────────────────────
 *
 * WhatsApp no tiene formularios: tiene listas de 10 filas y botones de 3. Un
 * producto con «elige hasta 3 sabores de 20» son SEIS mensajes de ida y vuelta
 * solo para armarlo, y cada ida y vuelta es una oportunidad de que la persona
 * se aburra y no vuelva.
 *
 * `cabeEnElChat` es esa frontera. Lo que cabe se pregunta aquí; lo que no,
 * abre su página en la tienda, donde eso ya se resuelve bien. NO ES UNA
 * LIMITACIÓN QUE HAYA QUE ARREGLAR DESPUÉS: es reconocer que hay pedidos que
 * son formulario y no conversación.
 *
 * ── DÓNDE VIVE EL CARRITO ─────────────────────────────────────────────────
 *
 * En `conversations.flow_state`, que ya existe y ya sobrevive entre mensajes.
 * Una tabla `carritos` nueva habría traído su limpieza, su caducidad y su RLS
 * para guardar exactamente lo mismo que cabe en una columna que ya está ahí.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { GrupoVariedad } from "./variedades";
import type { PreguntaPedido } from "./config";

/* ── Lo que se guarda entre mensajes ───────────────────────────────────────── */

/**
 * Una línea del carrito.
 *
 * ES EXACTAMENTE LO QUE `recalcularPedido` ESPERA RECIBIR, y eso no es
 * casualidad: el carrito del chat se manda tal cual al mismo creador de pedidos
 * que usa la tienda. Si esta forma se separara de aquella, habría que traducir
 * — y una traducción de dinero es donde se pierden los centavos.
 */
export type LineaChat = {
  producto_id: string;
  cantidad: number;
  /** Solo grupo y texto. El recargo lo pone el servidor al recalcular. */
  elegidas: { grupo: string; texto: string }[];
  nota?: string;
};

/** El producto que se está armando ahora mismo, a medias. */
export type Armando = {
  producto_id: string;
  /** Qué grupo de variedades toca preguntar. */
  grupo: number;
  elegidas: { grupo: string; texto: string }[];
  nota?: string;
};

export type CarritoChat = {
  tienda_id: string;
  lineas: LineaChat[];
  /** Nulo mientras no se esté armando ningún producto. */
  armando?: Armando | null;
  /** Desde qué producto va la lista del catálogo (paginación). */
  desde?: number;
  /** Qué pregunta del formulario toca. Nulo = todavía no se llegó ahí. */
  pregunta?: number | null;
  respuestas?: Record<string, string>;
};

export function carritoVacio(tiendaId: string): CarritoChat {
  return { tienda_id: tiendaId, lineas: [], armando: null, desde: 0, pregunta: null, respuestas: {} };
}

/* ── Los topes de WhatsApp, dichos una sola vez ────────────────────────────── */

/** Filas de una lista interactiva. Meta rechaza el mensaje entero si te pasas. */
export const MAX_FILAS = 10;
/** Botones de un mensaje interactivo. */
export const MAX_BOTONES = 3;

/**
 * Cuántos grupos de variedades se aguantan hablando.
 *
 * TRES, Y ES UN NÚMERO DE NEGOCIO, NO TÉCNICO. Cada grupo es un mensaje que va
 * y otro que vuelve. Al cuarto, la persona lleva ocho mensajes para meter UNA
 * cosa al carrito — y todavía no eligió cuántas. Ahí la tienda web no es un
 * apaño: es mejor herramienta.
 */
export const MAX_GRUPOS_EN_CHAT = 3;

/**
 * Cuántas veces se puede repetir la pregunta de un grupo de «elige N».
 *
 * Con `hasta_completar` el chat pregunta una vez por cada elección: «elige 3 de
 * 20» son tres vueltas. Más de cuatro y el producto es un formulario.
 */
export const MAX_ELECCIONES_POR_GRUPO = 4;

export type Veredicto = { cabe: true } | { cabe: false; porque: string };

/**
 * ¿Este producto se puede pedir hablando, o hay que abrir su página?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE DECIDE POR EL PRODUCTO, NO POR LA TIENDA. En la misma panadería, el café
 * («¿grande o pequeño?») se pide perfecto por chat y la torta personalizada
 * («elige 3 rellenos de 18, y el mensaje de la placa») no. Obligar a toda la
 * tienda a lo mismo estropea uno de los dos casos.
 *
 * SE PECA DE PRUDENTE A PROPÓSITO. Equivocarse hacia «no cabe» manda al cliente
 * a una página que funciona; equivocarse hacia «sí cabe» lo deja atascado en
 * una conversación que no puede terminar, y de ahí no se sale solo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function cabeEnElChat(grupos: GrupoVariedad[] | null | undefined): Veredicto {
  const gs = Array.isArray(grupos) ? grupos : [];
  if (!gs.length) return { cabe: true };

  if (gs.length > MAX_GRUPOS_EN_CHAT) {
    return { cabe: false, porque: `tiene ${gs.length} preguntas y por chat caben ${MAX_GRUPOS_EN_CHAT}` };
  }

  for (const g of gs) {
    const cuantas = (g.opciones ?? []).length;
    if (!cuantas) {
      // Un grupo sin opciones es una pregunta que no se puede contestar. En la
      // tienda `sanearGrupos` ya los tira, pero aquí puede llegar crudo.
      return { cabe: false, porque: `«${g.nombre}» no tiene opciones` };
    }

    // Los modos que dejan elegir varias necesitan una fila para «Listo»: sin
    // ella el cliente elige y no hay forma de decir que ya terminó.
    const tope = g.modo === "una" ? MAX_FILAS : MAX_FILAS - 1;
    if (cuantas > tope) {
      return { cabe: false, porque: `«${g.nombre}» tiene ${cuantas} opciones y por chat caben ${tope}` };
    }

    if (g.modo === "hasta_completar" && (g.cantidad ?? 0) > MAX_ELECCIONES_POR_GRUPO) {
      return {
        cabe: false,
        porque: `«${g.nombre}» pide elegir ${g.cantidad} y por chat se aguantan ${MAX_ELECCIONES_POR_GRUPO}`,
      };
    }
  }

  return { cabe: true };
}

/* ── Qué toca preguntar ahora ──────────────────────────────────────────────── */

/** Lo mínimo que hace falta saber de un producto para conversar sobre él. */
export type ProductoChat = {
  id: string;
  nombre: string;
  precio: number;
  categoria?: string | null;
  oculto?: boolean | null;
  stock?: number | null;
  orden?: number | null;
  variedades?: GrupoVariedad[] | null;
};

export type Paso =
  /** Enseñar el catálogo desde esta posición. */
  | { que: "producto"; desde: number }
  /** Preguntar un grupo de variedades del producto que se está armando. */
  | {
      que: "variedad";
      producto: ProductoChat;
      grupo: GrupoVariedad;
      indice: number;
      /** Lo ya elegido DE ESTE GRUPO, para no volver a ofrecerlo. */
      yaElegidas: string[];
      /** Si puede cerrar el grupo ya («elige las que quieras» con alguna puesta). */
      puedeTerminar: boolean;
      /** Cuántas le faltan, con `hasta_completar`. */
      faltan: number | null;
    }
  /** Cuántas unidades. */
  | { que: "cantidad"; producto: ProductoChat }
  /** ¿Algo más, o cerramos? */
  | { que: "mas" }
  /** Una pregunta del formulario de entrega. */
  | { que: "pregunta"; pregunta: PreguntaPedido; indice: number }
  /** Todo listo: enseñar el resumen y pedir el sí. */
  | { que: "confirmar" }
  /** El carrito quedó vacío y no hay nada que hacer. */
  | { que: "vacio" };

/**
 * El paso que toca, mirando solo el carrito.
 *
 * ES UNA FUNCIÓN Y NO UN CAMPO `paso` GUARDADO, y esa es la decisión de diseño
 * que más problemas evita. Un `paso` guardado se puede quedar mintiendo: se
 * borra una línea y el estado sigue diciendo «formulario», el cliente contesta
 * su dirección y no hay pedido al que ponérsela. Calculándolo cada vez, el
 * estado NO PUEDE quedar incoherente: es lo que hay en el carrito lo que dice
 * qué falta.
 */
export function siguientePaso(
  carrito: CarritoChat,
  catalogo: ProductoChat[],
  preguntas: PreguntaPedido[],
): Paso {
  const porId = new Map((catalogo ?? []).map((p) => [p.id, p]));

  // 1. ¿Hay un producto a medias? Se termina antes de nada.
  const a = carrito.armando;
  if (a) {
    const p = porId.get(a.producto_id);
    // El producto desapareció del catálogo mientras conversaban (lo ocultaron,
    // se agotó). No se puede seguir armándolo: se vuelve al catálogo.
    if (!p) return { que: "producto", desde: carrito.desde ?? 0 };

    const grupos = (p.variedades ?? []).filter((g) => g && g.nombre);
    const desde = Math.max(0, Math.floor(Number(a.grupo) || 0));

    // SE BUSCA EL PRIMERO QUE FALTE, no solo se mira el de turno. Con «elige
    // una», contestar YA cierra el grupo: quedarse mirando ese índice haría
    // falta un «siguiente» que nadie va a tocar, y mirar solo ese índice y
    // rendirse se saltaría los grupos que vienen detrás — que es como un
    // producto de tres preguntas acababa preguntando solo la primera.
    for (let i = desde; i < grupos.length; i++) {
      const g = grupos[i];
      const puestas = (a.elegidas ?? []).filter((e) => e.grupo === g.nombre);

      const completo =
        g.modo === "una"
          ? puestas.length >= 1
          : g.modo === "hasta_completar"
            ? puestas.length >= (g.cantidad ?? 0)
            : false; // «varias» solo lo cierra el cliente, tocando «Listo»

      if (completo) continue;

      return {
        que: "variedad",
        producto: p,
        grupo: g,
        indice: i,
        yaElegidas: puestas.map((e) => e.texto),
        // «Elige las que quieras» se puede cerrar SIN NINGUNA: es opcional por
        // definición, y obligar a poner una convierte un extra en un requisito.
        puedeTerminar: g.modo === "varias",
        faltan: g.modo === "hasta_completar" ? Math.max(0, (g.cantidad ?? 0) - puestas.length) : null,
      };
    }

    return { que: "cantidad", producto: p };
  }

  // 2. Sin nada a medias y sin líneas: al catálogo.
  if (!carrito.lineas?.length) return { que: "producto", desde: carrito.desde ?? 0 };

  // 3. ¿Ya dijo que quiere cerrar? `pregunta` deja de ser nulo cuando lo dice.
  const iPregunta = carrito.pregunta;
  if (iPregunta === null || iPregunta === undefined) return { que: "mas" };

  // 4. El formulario, una pregunta cada vez.
  //
  //    SE SALTAN LAS QUE YA ESTÁN CONTESTADAS y no las obligatorias vacías: así
  //    el teléfono, que el chat ya sabe porque es desde donde escriben, no se
  //    pregunta — y esa es una casilla menos entre el carrito y el pedido.
  const lista = preguntas ?? [];
  for (let i = Math.max(0, iPregunta); i < lista.length; i++) {
    const q = lista[i];
    const contestada = String(carrito.respuestas?.[q.id] ?? "").trim();
    if (!contestada) return { que: "pregunta", pregunta: q, indice: i };
  }

  return { que: "confirmar" };
}

/* ── Cómo cambia el carrito con cada respuesta ─────────────────────────────── */

/**
 * Empieza a armar un producto.
 *
 * SI EL PRODUCTO NO CABE EN EL CHAT NO SE EMPIEZA: se devuelve el veredicto
 * para que el motor mande su página. Empezar y atascarse a la tercera pregunta
 * es la peor de las dos opciones.
 */
export function empezarProducto(
  carrito: CarritoChat,
  producto: ProductoChat,
): { carrito: CarritoChat; veredicto: Veredicto } {
  const veredicto = cabeEnElChat(producto.variedades);
  if (!veredicto.cabe) return { carrito, veredicto };

  return {
    carrito: { ...carrito, armando: { producto_id: producto.id, grupo: 0, elegidas: [], nota: "" } },
    veredicto,
  };
}

/**
 * Guarda una opción elegida.
 *
 * NO SE ACEPTA UNA OPCIÓN QUE EL GRUPO NO TENGA. El texto llega de lo que tocó
 * el cliente, pero también puede llegar de lo que escribió: sin esta puerta,
 * escribir cualquier cosa metería una opción inventada en el carrito. El
 * servidor la tiraría después —`recalcularPedido` rechaza la línea entera— y el
 * cliente vería su pedido desaparecer sin entender por qué.
 *
 * EN «ELIGE UNA», LA SEGUNDA PISA A LA PRIMERA. Es lo que espera cualquiera que
 * cambia de opinión, y sumar las dos cobraría los dos recargos.
 */
export function elegirOpcion(
  carrito: CarritoChat,
  grupo: GrupoVariedad,
  texto: string,
): CarritoChat {
  const a = carrito.armando;
  if (!a) return carrito;

  const opcion = (grupo.opciones ?? []).find((o) => o.texto === texto);
  if (!opcion) return carrito;

  const otras = (a.elegidas ?? []).filter((e) =>
    grupo.modo === "una" ? e.grupo !== grupo.nombre : true,
  );

  // Repetir la misma opción en un grupo de varias cobraría el recargo dos
  // veces. Se ignora en silencio: el cliente tocó dos veces, no pidió dos.
  const yaEsta =
    grupo.modo !== "una" &&
    otras.some((e) => e.grupo === grupo.nombre && e.texto === opcion.texto);
  if (yaEsta) return carrito;

  return {
    ...carrito,
    armando: { ...a, elegidas: [...otras, { grupo: grupo.nombre, texto: opcion.texto }] },
  };
}

/** Cierra el grupo que se está preguntando y pasa al siguiente. */
export function avanzarGrupo(carrito: CarritoChat): CarritoChat {
  const a = carrito.armando;
  if (!a) return carrito;
  return { ...carrito, armando: { ...a, grupo: (Number(a.grupo) || 0) + 1 } };
}

/** Como mucho noventa y nueve: más es un dedo pegado a la tecla. */
export const MAX_POR_LINEA = 99;

/**
 * Cuántas unidades quiere, leído de lo que escribió.
 *
 * DEVUELVE NULO SI NO SE ENTIENDE, y el motor vuelve a preguntar. Tratar «como
 * dos» como 0 borraría el producto del carrito sin decir nada; tratarlo como 1
 * le cobraría uno que quizá no quería.
 */
export function leerCantidad(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").trim().toLowerCase();
  if (!t) return null;

  // ── EL ORDEN NO ES ALFABÉTICO, ES DE MÁS ESPECÍFICO A MENOS ─────────────
  //
  // Lo descubrió una prueba: «una docena» devolvía UNO. Con un objeto, el
  // recorrido empezaba por «una», la encontraba dentro de la frase y se paraba
  // ahí — doce huevos convertidos en uno, y el negocio preparando el pedido
  // equivocado. Lo largo va primero, siempre.
  const palabras: [string, number][] = [
    ["media docena", 6], ["docena", 12],
    ["diez", 10], ["nueve", 9], ["ocho", 8], ["siete", 7], ["seis", 6],
    ["cinco", 5], ["cuatro", 4], ["tres", 3], ["dos", 2],
    ["uno", 1], ["una", 1], ["un", 1],
  ];
  // Se busca la palabra suelta, no dentro de otra: «unos cuantos» no es 1.
  for (const [p, n] of palabras) {
    if (new RegExp(`(^|\\s)${p}(\\s|$)`).test(t)) return n;
  }

  const m = /\d+/.exec(t);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.floor(n), MAX_POR_LINEA);
}

/**
 * Mete al carrito lo que se estaba armando.
 *
 * LAS LÍNEAS IGUALES SE JUNTAN. Pedir dos veces «pizza mediana con piña» tiene
 * que quedar como «2 ×», no como dos renglones iguales: en la cocina, dos
 * renglones se preparan de dos tandas distintas y una de las dos se enfría.
 *
 * PERO SOLO SI SON IGUALES DE VERDAD, opciones y nota incluidas. «Con piña» y
 * «sin piña» son dos cosas distintas aunque sean el mismo producto.
 */
export function meterAlCarrito(carrito: CarritoChat, cantidad: number): CarritoChat {
  const a = carrito.armando;
  if (!a) return carrito;

  const cuantas = Math.min(Math.max(1, Math.floor(Number(cantidad) || 0)), MAX_POR_LINEA);
  const nota = String(a.nota ?? "").trim();
  const mia = huella(a.producto_id, a.elegidas, nota);

  const lineas = [...(carrito.lineas ?? [])];
  const i = lineas.findIndex((l) => huella(l.producto_id, l.elegidas, l.nota ?? "") === mia);

  if (i >= 0) {
    lineas[i] = { ...lineas[i], cantidad: Math.min(lineas[i].cantidad + cuantas, MAX_POR_LINEA) };
  } else {
    lineas.push({
      producto_id: a.producto_id,
      cantidad: cuantas,
      elegidas: a.elegidas ?? [],
      ...(nota ? { nota } : {}),
    });
  }

  return { ...carrito, lineas, armando: null };
}

/**
 * Qué hace que dos líneas sean la misma.
 *
 * LAS OPCIONES SE ORDENAN ANTES DE COMPARAR: elegir «piña, jamón» y «jamón,
 * piña» es la misma pizza, y sin ordenar saldrían dos renglones.
 */
export function huella(
  productoId: string,
  elegidas: { grupo: string; texto: string }[],
  nota: string,
): string {
  const partes = (elegidas ?? []).map((e) => `${e.grupo}=${e.texto}`).sort();
  return [productoId, partes.join("|"), String(nota ?? "").trim()].join("::");
}

/** Deja de armar el producto a medias y vuelve al catálogo. */
export function cancelarLoQueArmaba(carrito: CarritoChat): CarritoChat {
  return { ...carrito, armando: null };
}

/** El cliente dice que ya no quiere nada más: empieza el formulario. */
export function cerrarCarrito(carrito: CarritoChat): CarritoChat {
  return { ...carrito, armando: null, pregunta: 0 };
}

/** Vuelve a abrirlo para seguir comprando. */
export function seguirComprando(carrito: CarritoChat): CarritoChat {
  return { ...carrito, pregunta: null };
}

/**
 * Guarda lo que contestó a una pregunta del formulario.
 *
 * SE RECORTA A 500, que es lo que aguanta el pedido guardado. Un texto más
 * largo no se pierde en silencio en la base: se corta aquí, donde todavía se
 * puede ver al probar.
 */
export function contestar(carrito: CarritoChat, pregunta: PreguntaPedido, texto: string): CarritoChat {
  const valor = String(texto ?? "").trim().slice(0, 500);
  const respuestas = { ...(carrito.respuestas ?? {}) };

  if (valor) respuestas[pregunta.id] = valor;
  else if (pregunta.obligatoria) return carrito; // vacía y obligatoria: se vuelve a preguntar

  return { ...carrito, respuestas, pregunta: (Number(carrito.pregunta) || 0) + 1 };
}

/**
 * Deja puesto lo que el chat ya sabe sin preguntarlo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL TELÉFONO NO SE PREGUNTA: LA PERSONA ESTÁ ESCRIBIENDO DESDE ÉL.
 *
 * Es la casilla que más se equivoca en cualquier formulario —se teclea mal, se
 * pone el del trabajo, se olvida el código de país— y en el chat es la única
 * que no hace falta preguntar. Además es la que ata el pedido con su ficha en
 * el CRM: cuando el cliente lo escribe distinto, se crean dos personas.
 *
 * EL NOMBRE TAMBIÉN, si WhatsApp lo trae. Y se puede corregir después, porque
 * el nombre del perfil de WhatsApp a veces es un apodo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function loQueYaSabemos(
  preguntas: PreguntaPedido[],
  datos: { telefono?: string | null; nombre?: string | null },
): Record<string, string> {
  const puestas: Record<string, string> = {};
  const tel = String(datos.telefono ?? "").replace(/\D/g, "");
  const nombre = String(datos.nombre ?? "").trim();

  for (const p of preguntas ?? []) {
    const etiqueta = p.etiqueta.toLowerCase();
    if (tel && p.tipo === "telefono") puestas[p.id] = tel;
    else if (tel && /tel[eé]fono|celular|whatsapp|n[uú]mero de contacto/.test(etiqueta)) {
      puestas[p.id] = tel;
    } else if (nombre && /^nombre( completo)?$/.test(etiqueta.replace(/[*:]/g, "").trim())) {
      puestas[p.id] = nombre;
    }
  }

  return puestas;
}

/* ── Lo que se le enseña ───────────────────────────────────────────────────── */

/**
 * El resumen del carrito, sin precios.
 *
 * SIN PRECIOS A PROPÓSITO. Los pone el motor con los que devuelve el
 * recalculador, que son los que se van a cobrar. Si esta función los pintara,
 * habría dos sitios diciendo cuánto cuesta algo — y el día que se separen, el
 * cliente ve un número y paga otro.
 */
export function lineasParaLeer(
  carrito: CarritoChat,
  catalogo: ProductoChat[],
): { nombre: string; cantidad: number; detalle: string }[] {
  const porId = new Map((catalogo ?? []).map((p) => [p.id, p]));
  return (carrito.lineas ?? []).map((l) => {
    const p = porId.get(l.producto_id);
    return {
      nombre: p?.nombre ?? "Producto",
      cantidad: l.cantidad,
      detalle: (l.elegidas ?? []).map((e) => e.texto).join(", "),
    };
  });
}

/** Cuántas cosas lleva, para el «tienes 3 cosas en el carrito». */
export function cuantasCosas(carrito: CarritoChat): number {
  return (carrito.lineas ?? []).reduce((s, l) => s + (Math.floor(Number(l.cantidad)) || 0), 0);
}

/**
 * Las filas de una lista de variedades, listas para WhatsApp.
 *
 * LOS TÍTULOS SE RECORTAN A 24 Y LAS DESCRIPCIONES A 72. Meta no avisa: rechaza
 * el mensaje entero con un error que no dice cuál de los dos campos fue.
 *
 * EL RECARGO VA EN LA DESCRIPCIÓN, SIEMPRE QUE LO HAYA. Enterarse de que el
 * salmón costaba dos cincuenta más al ver el total es la forma más rápida de
 * que un pedido se caiga en el último paso.
 */
export function filasDeVariedad(
  grupo: GrupoVariedad,
  yaElegidas: string[],
  moneda: string,
  puedeTerminar: boolean,
): { id: string; titulo: string; descripcion?: string }[] {
  const puestas = new Set(yaElegidas ?? []);

  const filas = (grupo.opciones ?? [])
    // Lo ya elegido no se vuelve a ofrecer en los grupos de varias: volver a
    // tocarlo no haría nada y parecería que la lista está rota.
    .filter((o) => (grupo.modo === "una" ? true : !puestas.has(o.texto)))
    .slice(0, puedeTerminar ? MAX_FILAS - 1 : MAX_FILAS)
    .map((o) => ({
      id: `op-${o.texto}`.slice(0, 200),
      titulo: o.texto.slice(0, 24),
      ...(o.recargo > 0
        ? { descripcion: `+${moneda}${(o.recargo / 100).toFixed(2)}`.slice(0, 72) }
        : {}),
    }));

  if (puedeTerminar) {
    filas.push({ id: "op-listo", titulo: "Listo, así está bien" });
  }

  return filas;
}

/** ¿Qué opción tocó? Devuelve su texto, o `null` si tocó «Listo». */
export function opcionElegida(id: string): { listo: boolean; texto: string | null } {
  const t = String(id ?? "").trim();
  if (t === "op-listo") return { listo: true, texto: null };
  const m = /^op-([\s\S]+)$/.exec(t);
  return { listo: false, texto: m ? m[1] : null };
}
