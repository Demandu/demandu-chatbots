"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { aCentavos, sanearGrupos } from "@/lib/tienda/variedades";
import { leerConfig, sanearPreguntas, soloDigitos, type ConfigTienda } from "@/lib/tienda/config";
import { DOMINIO_TIENDAS, aDireccion, direccionValida, enlaceLegible } from "@/lib/tienda/direccion";
import { esAmbiente, validarComercio } from "@/lib/tienda/yappy";
import { avisarDelPedido } from "@/lib/tienda/avisar";
import { momentoDelEstado, sanearAvisos, MOMENTOS, MAX_AVISO } from "@/lib/tienda/avisos";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/**
 * `tono: "aviso"` es la tercera respuesta que faltaba: LO QUE PEDISTE SE HIZO,
 * PERO ALGO DE ALREDEDOR NO. El pedido se movió y el cliente no recibió el
 * mensaje. Pintarlo en verde sería mentir y en rojo también —el negocio
 * volvería a arrastrar la tarjeta creyendo que no se guardó.
 */
export type Estado = { ok: boolean; mensaje: string; tono?: "aviso" };

/**
 * Comprueba que la tienda es de quien dice serlo.
 *
 * RLS YA LO IMPIDE, y aun así se comprueba: sin esto, un `update` contra la
 * tienda de otro no fallaría, simplemente no cambiaría nada — y la pantalla
 * diría «Guardado» sin haber guardado. Un error silencioso es peor que uno
 * ruidoso.
 */
async function tiendaDelUsuario(tiendaId: string) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return null;
  const { data } = await createClient()
    .from("tiendas")
    // `bot_id` VA AQUÍ y no en una consulta aparte: es lo que dice a qué cuenta
    // de WhatsApp pertenece la tienda, y sin él no se pueden crear sus
    // plantillas de aviso.
    .select("id,org_id,slug,config,bot_id")
    .eq("id", tiendaId)
    .maybeSingle();
  if (!data || data.org_id !== orgId) return null;
  return data as { id: string; org_id: string; slug: string; config: unknown; bot_id: string | null };
}

/* ── La dirección de la tienda ─────────────────────────────────────────────── */

/**
 * Cambiar lo que va después de la barra.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DOMINIO NO SE TOCA —es de la plataforma— PERO EL NOMBRE ES DEL NEGOCIO, y
 * alguien se va a equivocar al elegirlo. Sin esta pantalla, esa equivocación
 * dura para siempre.
 *
 * LA DIRECCIÓN VIEJA NO SE TIRA: se guarda y sigue llevando a la tienda. Está
 * pegada en biografías de Instagram, en estados de WhatsApp, y —lo que de
 * verdad importa— DENTRO DE LOS ENLACES DE COBRO que ya están en el chat de
 * cada cliente. Cambiar la dirección sin guardar la anterior mata esos cobros
 * sin un solo aviso: el cliente abre el enlace, no ve nada, y nadie se entera
 * de que ese dinero no va a entrar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function cambiarDireccion(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const nueva = aDireccion(s(fd.get("slug")));
  if (!direccionValida(nueva)) {
    return { ok: false, mensaje: "La dirección necesita al menos 3 letras o números." };
  }
  if (nueva === t.slug) {
    return { ok: true, mensaje: "Esa ya es su dirección." };
  }

  const sb = createClient();

  // ¿La tuvo otra tienda antes? Si una dirección abandonada quedara libre, otro
  // negocio podría quedarse con el tráfico —y con los cobros— del primero.
  const { data: previa } = await sb
    .from("tienda_direcciones_previas")
    .select("tienda_id")
    .eq("slug", nueva)
    .maybeSingle();

  if (previa && previa.tienda_id !== tiendaId) {
    return { ok: false, mensaje: `La dirección «${nueva}» ya estuvo en uso. Prueba con otra.` };
  }

  const { error } = await sb.from("tiendas").update({ slug: nueva }).eq("id", tiendaId);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        mensaje: `La dirección «${nueva}» ya está ocupada. Prueba con otra, por ejemplo ${nueva}-pty.`,
      };
    }
    return { ok: false, mensaje: "No se pudo cambiar la dirección." };
  }

  // LA VIEJA SE GUARDA DESPUÉS DE QUE EL CAMBIO SALIÓ BIEN. Al revés, un cambio
  // fallido dejaría apuntada como «anterior» una dirección que sigue siendo la
  // actual, y la tienda se redirigiría a sí misma.
  await sb
    .from("tienda_direcciones_previas")
    .upsert(
      { slug: t.slug, tienda_id: tiendaId, org_id: t.org_id },
      { onConflict: "slug" },
    );

  // Si vuelve a una dirección que ya tuvo, deja de ser «anterior».
  await sb.from("tienda_direcciones_previas").delete().eq("slug", nueva);

  revalidatePath(`/tienda/${tiendaId}`);
  revalidatePath("/tienda");
  return {
    ok: true,
    mensaje: `Listo. Su dirección es ${enlaceLegible(nueva)} — y la anterior sigue llevando aquí, así que los enlaces repartidos no se rompen.`,
  };
}

/**
 * Quién se encarga de los pedidos de esta tienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VA POR TIENDA Y NO POR ORGANIZACIÓN. Un cliente con dos negocios tiene dos
 * encargados, y el reparto general no sabe distinguirlos: le da el chat a quien
 * menos carga tenga, que puede ser alguien que no sabe nada de esa tienda.
 *
 * VACÍO NO ES «NADIE»: es el reparto automático de siempre. Dejarlo sin dueño
 * sería peor que cualquier elección.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function cambiarEncargado(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const quien = s(fd.get("atiende_id"));
  const sb = createClient();

  // Se comprueba que la persona sea del equipo de esta organización: un id
  // suelto en el formulario no puede asignarle los pedidos a alguien de otro
  // cliente.
  if (quien) {
    const { data: miembro } = await sb
      .from("team_members")
      .select("id")
      .eq("id", quien)
      .eq("org_id", t.org_id)
      .maybeSingle();
    if (!miembro) return { ok: false, mensaje: "Esa persona no está en tu equipo." };
  }

  const { error } = await sb
    .from("tiendas")
    .update({ atiende_id: quien || null })
    .eq("id", tiendaId);

  if (error) return { ok: false, mensaje: "No se pudo guardar el encargado." };

  revalidatePath(`/tienda/${tiendaId}`);
  return {
    ok: true,
    mensaje: quien
      ? "Guardado. Los pedidos nuevos le llegan asignados."
      : "Guardado. Los pedidos irán al reparto automático.",
  };
}

/* ── Diseño ────────────────────────────────────────────────────────────────── */

export async function guardarDiseno(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const previa = leerConfig(t.config);

  const banners = s(fd.get("banners"))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [imagen_url, enlace] = l.split("|").map((x) => x.trim());
      return { imagen_url, ...(enlace ? { enlace } : {}) };
    });

  // Llegan como JSON desde la pantalla; `leerConfig` las sanea más abajo.
  let preguntas: unknown = [];
  try {
    preguntas = JSON.parse(s(fd.get("preguntas")) || "[]");
  } catch {
    preguntas = previa.preguntas;
  }

  // Llega como JSON desde la pantalla; `leerConfig` lo sanea más abajo.
  let categorias: unknown = [];
  try {
    categorias = JSON.parse(s(fd.get("categorias")) || "[]");
  } catch {
    categorias = previa.categorias;
  }

  const nueva: ConfigTienda = leerConfig({
    ...previa,
    titulo: s(fd.get("titulo")),
    logo_url: s(fd.get("logo_url")),
    // Una casilla sin marcar NO VIAJA en el formulario: si esto fuera
    // `fd.get(...) === "on"` a secas estaría bien, pero conviene dejarlo
    // explícito — desmarcarla tiene que poder apagarla, no solo encenderla.
    logo_llena: fd.get("logo_llena") !== null,
    portada_url: s(fd.get("portada_url")),
    banners,
    categorias,
    colores: {
      principal: s(fd.get("color_principal")),
      acento: s(fd.get("color_acento")),
      fondo: s(fd.get("color_fondo")),
      texto: s(fd.get("color_texto")),
      whatsapp: s(fd.get("color_whatsapp")),
    },
    whatsapp: {
      numero: soloDigitos(s(fd.get("wa_numero"))),
      texto_boton: s(fd.get("wa_texto")),
    },
    contacto: {
      horario: s(fd.get("horario")),
      instagram: s(fd.get("instagram")),
      facebook: s(fd.get("facebook")),
      direccion: s(fd.get("direccion")),
      correo: s(fd.get("correo")),
    },
    moneda: s(fd.get("moneda")),
    // Sin preguntas la tienda no puede recoger un pedido; se conservan las que
    // había en vez de dejar el formulario vacío.
    preguntas: sanearPreguntas(preguntas).length ? preguntas : previa.preguntas,
    aclaraciones: fd.get("aclaraciones") === "on",
    minimo_pedido: aCentavos(s(fd.get("minimo"))),
    pie: s(fd.get("pie")),
  });

  const { error } = await createClient()
    .from("tiendas")
    .update({ config: nueva, updated_at: new Date().toISOString() })
    .eq("id", tiendaId);

  if (error) return { ok: false, mensaje: "No se pudo guardar. Inténtalo de nuevo." };

  revalidatePath(`/tienda/${tiendaId}`);
  return {
    ok: true,
    mensaje: sanearPreguntas(preguntas).length
      ? "Diseño guardado."
      : "Diseño guardado. Dejaste el formulario vacío, así que se conservaron las preguntas anteriores.",
  };
}

/* ── Productos ─────────────────────────────────────────────────────────────── */

/** Una fila tal y como sale de la tabla: todo texto, como en las casillas. */
type FilaCruda = {
  id?: string;
  nombre?: string;
  descripcion?: string;
  categoria?: string;
  precio?: string;
  precio_anterior?: string;
  stock?: string;
  oculto?: boolean;
  imagen_url?: string;
  /** Ya no es texto con barras: son los grupos, tal y como los deja la pantalla. */
  variedades?: unknown;
};

/**
 * Guarda la tabla entera de una vez.
 *
 * SE VALIDA AQUÍ, FILA POR FILA, aunque la pantalla ya lo haga: lo que llega es
 * un texto que manda el navegador y podría venir de cualquier parte. La
 * pantalla es una comodidad; esto es la puerta.
 *
 * TODO O NADA NO ES POSIBLE contra Supabase sin una transacción, así que se
 * guarda por partes y SE CUENTA lo que entró. Si algo falla a mitad, el mensaje
 * dice cuántos se guardaron en vez de decir «error» y dejar al negocio sin
 * saber si su catálogo está a medias.
 */
export async function guardarProductos(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  let filas: FilaCruda[] = [];
  let borradas: string[] = [];
  try {
    filas = JSON.parse(s(fd.get("filas")) || "[]");
    borradas = JSON.parse(s(fd.get("borradas")) || "[]");
  } catch {
    return { ok: false, mensaje: "No se entendió la tabla. Recarga la página e inténtalo de nuevo." };
  }
  if (!Array.isArray(filas)) filas = [];
  if (!Array.isArray(borradas)) borradas = [];

  const sb = createClient();

  // BORRAR PRIMERO, y siempre acotado a esta tienda: un id de otra tienda en la
  // lista no puede llevarse por delante el producto de otro cliente.
  let borrados = 0;
  const idsABorrar = borradas.map((x) => String(x)).filter(Boolean);
  if (idsABorrar.length) {
    const { error } = await sb
      .from("tienda_productos")
      .delete()
      .in("id", idsABorrar)
      .eq("tienda_id", tiendaId);
    if (!error) borrados = idsABorrar.length;
  }

  const preparar = (f: FilaCruda, orden: number) => {
    const nombre = String(f.nombre ?? "").trim();
    const precio = aCentavos(String(f.precio ?? ""));
    const antesCrudo = String(f.precio_anterior ?? "").trim();
    const antes = antesCrudo ? aCentavos(antesCrudo) : 0;
    const stockCrudo = String(f.stock ?? "").trim();
    const stockNum = Number(stockCrudo.replace(/[^\d-]/g, ""));
    return {
      org_id: t.org_id,
      tienda_id: tiendaId,
      nombre,
      descripcion: String(f.descripcion ?? "").trim() || null,
      categoria: String(f.categoria ?? "").trim() || null,
      precio,
      // Un «antes» que no supera al precio no es una oferta: es un tachón que
      // hace desconfiar.
      precio_anterior: antes > precio ? antes : null,
      oculto: f.oculto === true,
      // Vacío = sin control de existencias. Cero = agotado de verdad.
      stock:
        stockCrudo === "" || !Number.isFinite(stockNum) ? null : Math.max(0, Math.round(stockNum)),
      imagen_url: String(f.imagen_url ?? "").trim() || null,
      // SE SANEA AQUÍ aunque la pantalla ya lo cuide: esto llega como JSON
      // desde el navegador y decide cuánto se le cobra a una persona.
      variedades: sanearGrupos(f.variedades),
      orden,
      updated_at: new Date().toISOString(),
    };
  };

  // UNA FILA SIN NOMBRE NO ES UN PRODUCTO. Se ignora en silencio en vez de
  // fallar: casi siempre es la fila en blanco que quedó al final.
  const conNombre = filas
    .map((f, i) => ({ f, orden: i }))
    .filter(({ f }) => String(f.nombre ?? "").trim());

  const nuevas = conNombre.filter(({ f }) => !String(f.id ?? "").trim());
  const existentes = conNombre.filter(({ f }) => String(f.id ?? "").trim());

  let guardados = 0;
  let fallos = 0;

  if (nuevas.length) {
    const { error } = await sb
      .from("tienda_productos")
      .insert(nuevas.map(({ f, orden }) => preparar(f, orden)));
    if (error) fallos += nuevas.length;
    else guardados += nuevas.length;
  }

  // Las que ya existen van una a una: Supabase no tiene un update en lote con
  // valores distintos por fila, y un upsert por id arrastraría columnas que
  // esta pantalla no toca.
  for (const { f, orden } of existentes) {
    const { error } = await sb
      .from("tienda_productos")
      .update(preparar(f, orden))
      .eq("id", String(f.id))
      .eq("tienda_id", tiendaId);
    if (error) fallos++;
    else guardados++;
  }

  revalidatePath(`/tienda/${tiendaId}`);

  if (fallos) {
    return {
      ok: false,
      mensaje: `Se guardaron ${guardados}, pero ${fallos} no. Revisa esas filas y vuelve a guardar.`,
    };
  }

  const partes: string[] = [];
  if (guardados) partes.push(`${guardados} producto${guardados === 1 ? "" : "s"} guardado${guardados === 1 ? "" : "s"}`);
  if (borrados) partes.push(`${borrados} borrado${borrados === 1 ? "" : "s"}`);
  return {
    ok: true,
    mensaje: partes.length ? `${partes.join(" y ")}.` : "No había nada que guardar.",
  };
}

/**
 * Vaciar el catálogo entero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO SE DESHACE. No hay papelera ni copia: los productos y sus opciones se
 * van, y con noventa y seis a la vez eso es una tarde de trabajo perdida.
 *
 * POR ESO PIDE ESCRIBIR «BORRAR», y se comprueba AQUÍ además de en la pantalla.
 * Un botón de confirmar se pulsa sin leer —todos lo hacemos— pero nadie teclea
 * seis letras por accidente. Es el único freno que de verdad para una mano
 * rápida, y cuesta tres segundos a quien sí quería hacerlo.
 *
 * SE ACOTA A ESTA TIENDA SIEMPRE. Un `delete` sin `tienda_id` en un sistema
 * multi-inquilino no borra un catálogo: borra todos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function vaciarCatalogo(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  if (s(fd.get("confirmacion")).toUpperCase() !== "BORRAR") {
    return { ok: false, mensaje: "Para vaciar el catálogo hay que escribir BORRAR." };
  }

  const sb = createClient();

  // Se cuenta ANTES para poder decir cuántos se fueron. Un «listo» a secas deja
  // a cualquiera con la duda de si borró lo que creía.
  const { count } = await sb
    .from("tienda_productos")
    .select("id", { count: "exact", head: true })
    .eq("tienda_id", tiendaId);

  const { error } = await sb.from("tienda_productos").delete().eq("tienda_id", tiendaId);
  if (error) return { ok: false, mensaje: "No se pudo vaciar el catálogo. Inténtalo de nuevo." };

  revalidatePath(`/tienda/${tiendaId}`);
  const n = count ?? 0;
  return {
    ok: true,
    mensaje: n === 0 ? "El catálogo ya estaba vacío." : `Catálogo vaciado: ${n} producto${n === 1 ? "" : "s"} borrado${n === 1 ? "" : "s"}.`,
  };
}

/* ── Pedidos ───────────────────────────────────────────────────────────────── */

const ESTADOS = ["recibido", "confirmado", "preparando", "en_camino", "entregado", "cancelado"];

/**
 * Mover un pedido de estado.
 *
 * CADA CAMBIO DEJA RASTRO en `pedido_eventos`. El día que un pedido aparezca
 * entregado sin haberse entregado, o cancelado sin que nadie sepa quién, la
 * única forma de averiguarlo es que esté anotado. Es el mismo criterio que ya
 * salvó el diagnóstico de los webhooks de Meta.
 */
export async function cambiarEstadoPedido(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const pedidoId = s(fd.get("pedido_id"));
  const estado = s(fd.get("estado"));
  if (!pedidoId) return { ok: false, mensaje: "No sé qué pedido mover." };

  const sb = createClient();

  // ── COBRADO POR FUERA ─────────────────────────────────────────────────────
  //
  // No mueve el pedido: marca el cobro. Viene del mismo formulario porque en el
  // tablero ocupa el sitio del botón de avanzar — cuando no se puede avanzar,
  // esto es lo único que hay que hacer.
  //
  // ES UNA SALIDA, NO UN ATAJO. Aquí siempre se cobra antes de preparar y
  // siempre por Yappy; pero si Yappy falló y el negocio cobró por
  // transferencia, tiene que poder seguir. Queda apuntado en la bitácora con
  // quién y cuándo, y la referencia lo dice en la propia tarjeta: dentro de un
  // mes nadie va a poder confundirlo con un cobro de Yappy.
  if (estado === "cobrado_por_fuera") {
    const { data: antes } = await sb
      .from("pedidos")
      .select("pago")
      .eq("id", pedidoId)
      .eq("tienda_id", tiendaId)
      .maybeSingle();

    if (!antes) return { ok: false, mensaje: "Ese pedido no es de esta tienda." };
    if (antes.pago === "pagado") return { ok: true, mensaje: "Ese pedido ya estaba cobrado." };

    const { error } = await sb
      .from("pedidos")
      .update({
        pago: "pagado",
        pagado_en: new Date().toISOString(),
        pago_referencia: "Cobrado por fuera",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedidoId)
      .eq("tienda_id", tiendaId);

    if (error) return { ok: false, mensaje: "No se pudo marcar como cobrado." };

    await sb.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      que: "pago_por_fuera",
      quien: "panel",
      detalle: { antes: antes.pago },
    });

    revalidatePath(`/tienda/${tiendaId}`);
    return {
      ok: true,
      tono: "aviso",
      mensaje: "Marcado como cobrado por fuera. Queda apuntado que no entró por Yappy.",
    };
  }

  if (!ESTADOS.includes(estado)) return { ok: false, mensaje: "Ese estado no existe." };

  // EL ESTADO DE ANTES SE MIRA PRIMERO, y no por curiosidad: arrastrar una
  // tarjeta al sitio donde ya estaba no es un cambio, y no puede volver a
  // avisar al cliente ni ensuciar la bitácora.
  const { data: antes } = await sb
    .from("pedidos")
    .select("estado,pago")
    .eq("id", pedidoId)
    .eq("tienda_id", tiendaId)
    .maybeSingle();

  if (!antes) return { ok: false, mensaje: "Ese pedido no es de esta tienda." };
  if (antes.estado === estado) return { ok: true, mensaje: "" };

  // ── NO SE PREPARA LO QUE NO ESTÁ COBRADO ──────────────────────────────────
  //
  // La comprobación va AQUÍ y no solo en la pantalla: la pantalla es una
  // comodidad, esto es la puerta. Un formulario armado a mano no puede saltarse
  // la regla del negocio.
  //
  // CANCELAR SIEMPRE SE PUEDE. Es justo lo que hay que hacer con un pedido que
  // no se cobró, y bloquearlo dejaría esos pedidos atrapados para siempre.
  if (estado !== "cancelado" && antes.pago !== "pagado") {
    return {
      ok: false,
      mensaje:
        "Este pedido todavía no está cobrado. Reenvíale el enlace de pago, o márcalo como cobrado si ya te pagó por otra vía.",
    };
  }

  // Acotado a la tienda además de por id: un id de otra tienda no puede mover
  // el pedido de otro cliente.
  const { error } = await sb
    .from("pedidos")
    .update({ estado, updated_at: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("tienda_id", tiendaId);

  if (error) return { ok: false, mensaje: "No se pudo cambiar el estado." };

  await sb.from("pedido_eventos").insert({
    pedido_id: pedidoId,
    que: `estado:${estado}`,
    quien: "panel",
    detalle: { antes: antes.estado },
  });

  revalidatePath(`/tienda/${tiendaId}`);

  // ── Y el cliente se entera ────────────────────────────────────────────────
  //
  // DESPUÉS DE GUARDAR Y DESPUÉS DE REVALIDAR, a propósito. El pedido ya está
  // movido: si el aviso falla —Meta caído, token caducado, fuera de las 24 h—
  // el negocio conserva su cambio y solo lee por qué el cliente no recibió
  // nada. Al revés, un fallo de WhatsApp bloquearía el tablero.
  const momento = momentoDelEstado(estado);
  if (!momento) return { ok: true, mensaje: "" };

  // Mismo motivo: avisar al cliente sale por WhatsApp y hace falta el token
  // del canal. Es el mismo camino que ya usa el IPN de Yappy.
  const aviso = await avisarDelPedido(createAdminClient(), pedidoId, momento);
  if (aviso.enviado) return { ok: true, mensaje: "Listo. Le avisamos al cliente por WhatsApp." };

  // Sin motivo = el aviso estaba apagado o ya se había mandado. No es un fallo
  // y no hay nada que contarle a nadie.
  return aviso.motivo
    ? { ok: true, tono: "aviso", mensaje: `Movido, pero el cliente no recibió el aviso: ${aviso.motivo}` }
    : { ok: true, mensaje: "" };
}

/**
 * Los textos que recibe el cliente en cada paso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE GUARDAN DENTRO DE `config` Y SE MEZCLAN CON LO QUE YA HABÍA. Escribir la
 * configuración entera desde este formulario borraría los colores y las
 * preguntas, que se editan en otra pantalla: el negocio guardaría un texto y se
 * le quedaría la tienda en blanco.
 *
 * UN TEXTO VACÍO NO APAGA NADA. Apagar es la casilla; dejar el texto en blanco
 * devuelve el de fábrica. Si un campo vacío significara silencio, cualquiera lo
 * borraría sin querer y el cliente dejaría de recibir avisos sin que nadie
 * pudiera ver por qué.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function guardarAvisos(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const previa = leerConfig(t.config);

  const momentos: Record<string, { activo: boolean; texto: string }> = {};
  for (const m of MOMENTOS) {
    momentos[m.clave] = {
      activo: fd.get(`activo_${m.clave}`) === "on",
      // Se recorta aquí además de en el saneo: lo que llega es texto del
      // navegador y podría venir de cualquier parte.
      texto: s(fd.get(`texto_${m.clave}`)).slice(0, MAX_AVISO),
    };
  }

  const avisos = sanearAvisos({ activo: fd.get("avisos_activo") === "on", momentos });

  const { error } = await createClient()
    .from("tiendas")
    .update({
      config: { ...previa, avisos },
      updated_at: new Date().toISOString(),
    })
    .eq("id", tiendaId);

  if (error) return { ok: false, mensaje: "No se pudieron guardar los avisos." };

  revalidatePath(`/tienda/${tiendaId}`);
  return {
    ok: true,
    mensaje: avisos.activo
      ? "Guardado. A partir de ahora el cliente se entera solo."
      : "Guardado. Los avisos quedan apagados: el cliente no recibirá nada.",
  };
}

/**
 * Ponerle la misma etiqueta a un montón de gente de golpe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES EL PUENTE ENTRE EL PANEL Y LOS ENVÍOS, y por eso no se inventó un objeto
 * «grupo» nuevo. Las etiquetas YA existen en la ficha del contacto, en la
 * Bandeja, en el buscador y en el selector de audiencia de las difusiones. Un
 * concepto paralelo que solo entiende esta pantalla sería una lista que nadie
 * más puede usar — y la gracia es justamente poder usarla.
 *
 * LA ETIQUETA SE CREA SI NO EXISTE, para que aparezca luego en los selectores
 * de toda la plataforma. Una etiqueta que solo vive dentro del array de un
 * contacto es invisible en todas las demás pantallas.
 *
 * SE AÑADE, NUNCA SE REEMPLAZA: quien ya tenía «Mayorista» lo conserva. Y no se
 * duplica, que llenaría la ficha de la misma palabra repetida.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function etiquetarContactos(_e: Estado, fd: FormData): Promise<Estado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "No encuentro tu organización." };

  const etiqueta = s(fd.get("etiqueta")).slice(0, 40);
  if (!etiqueta) return { ok: false, mensaje: "Escribe el nombre de la etiqueta." };

  let ids: string[] = [];
  try {
    ids = JSON.parse(s(fd.get("ids")) || "[]");
  } catch {
    ids = [];
  }
  ids = [...new Set(ids.map((x) => String(x)).filter(Boolean))].slice(0, 2000);
  if (!ids.length) return { ok: false, mensaje: "No hay a quién etiquetar." };

  const sb = createClient();

  // Que exista en el catálogo, para que se pueda elegir desde cualquier otra
  // pantalla. Si ya existe, esto no hace nada.
  const { data: yaEsta } = await sb
    .from("tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", etiqueta)
    .maybeSingle();
  if (!yaEsta) await sb.from("tags").insert({ org_id: orgId, name: etiqueta });

  // SE LEEN LAS QUE YA TIENEN. Escribir el array a pelo borraría el resto de
  // etiquetas de esa persona, y eso no se puede deshacer.
  const { data: gente } = await sb
    .from("contacts")
    .select("id,tags")
    .eq("org_id", orgId)
    .in("id", ids);

  let puestas = 0;
  for (const c of (gente ?? []) as { id: string; tags: string[] | null }[]) {
    const actuales = Array.isArray(c.tags) ? c.tags : [];
    if (actuales.includes(etiqueta)) continue;
    const { error } = await sb
      .from("contacts")
      .update({ tags: [...actuales, etiqueta] })
      .eq("id", c.id);
    if (!error) puestas++;
  }

  const yaLaTenian = (gente?.length ?? 0) - puestas;
  return {
    ok: true,
    mensaje:
      puestas === 0
        ? `Ya todos tenían «${etiqueta}».`
        : `Listo: «${etiqueta}» en ${puestas} contacto${puestas === 1 ? "" : "s"}` +
          (yaLaTenian > 0 ? ` (${yaLaTenian} ya la tenían).` : "."),
  };
}

/* ── Cobros ────────────────────────────────────────────────────────────────── */

/**
 * Las llaves de Yappy de cada negocio.
 *
 * VAN EN SU PROPIA TABLA Y NO EN `config`. La configuración de la tienda la
 * puede leer CUALQUIERA —es lo que pinta el escaparate público, y para eso hay
 * un permiso de lectura anónima— así que meter ahí un secreto de comercio sería
 * publicarlo. `tienda_cobros` no tiene ese permiso: solo la organización dueña.
 */
export async function guardarCobros(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const comercio = s(fd.get("yappy_comercio"));
  const secreto = s(fd.get("yappy_secreto"));
  const activo = fd.get("yappy_activo") === "on";
  const ambiente = esAmbiente(s(fd.get("yappy_ambiente")));

  // EL DOMINIO NO SE LO PREGUNTAMOS AL NEGOCIO: es el nuestro, siempre, y
  // escribirlo mal en el panel de Yappy es la forma número uno de que un pago
  // real llegue y se rechace. Se guarda para poder mostrarlo y para firmar.
  const dominio = `https://${DOMINIO_TIENDAS}`;

  if (activo && !comercio) {
    return { ok: false, mensaje: "Para cobrar con Yappy hace falta tu número de comercio." };
  }

  const sb = createClient();
  const { data: existe } = await sb
    .from("tienda_cobros")
    .select("id")
    .eq("tienda_id", tiendaId)
    .eq("proveedor", "yappy")
    .maybeSingle();

  // UN SECRETO EN BLANCO NO BORRA EL QUE HAY. La pantalla nunca lo muestra —no
  // se puede enseñar lo que no se debe filtrar— así que guardar el formulario
  // sin tocarlo dejaría al negocio sin cobrar, sin avisar y sin saber por qué.
  const fila: Record<string, unknown> = {
    org_id: t.org_id,
    tienda_id: tiendaId,
    proveedor: "yappy",
    comercio,
    activo,
    dominio,
    ambiente,
    updated_at: new Date().toISOString(),
  };
  if (secreto) fila.secreto = secreto;

  const { error } = existe
    ? await sb.from("tienda_cobros").update(fila).eq("id", existe.id)
    : await sb.from("tienda_cobros").insert({ ...fila, secreto: secreto || "" });

  if (error) return { ok: false, mensaje: "No se pudieron guardar los datos de cobro." };

  revalidatePath(`/tienda/${tiendaId}`);
  return {
    ok: true,
    mensaje: activo
      ? "Cobros con Yappy activados. Pulsa «Probar conexión» antes de vender."
      : "Datos guardados. Yappy está desactivado: los pedidos llegan sin pago en línea.",
  };
}

/**
 * Probar la conexión con Yappy SIN COBRARLE A NADIE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES EL PASO QUE FALTABA. Hasta ahora la única forma de saber si el número de
 * comercio y el secreto estaban bien era esperar a que un cliente real llegara
 * al final y ver si el pago salía. Eso se paga con la venta de ese cliente.
 *
 * Esta llamada es la que Yappy hace de todos modos antes de cada cobro
 * (`validate/merchant`): si contesta con un token, la configuración sirve.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function probarYappy(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const sb = createClient();
  // EL SECRETO SE LEE CON LA LLAVE DE SERVICIO. Dejó de ser legible con la
  // sesión: cualquier miembro de la cuenta lo sacaba desde la consola del
  // navegador. Aquí hace falta de verdad —es con lo que se firma la prueba
  // contra Yappy— y quién puede llegar hasta aquí ya lo decidió `tiendaDelUsuario`.
  const { data: fila } = await createAdminClient()
    .from("tienda_cobros")
    .select("id,comercio,secreto,dominio,ambiente")
    .eq("tienda_id", tiendaId)
    .eq("proveedor", "yappy")
    .maybeSingle();

  if (!fila?.comercio) {
    return { ok: false, mensaje: "Guarda primero tu número de comercio." };
  }
  if (!fila?.secreto) {
    return { ok: false, mensaje: "Guarda primero tu secreto de comercio." };
  }

  const dominio = fila.dominio || `https://${DOMINIO_TIENDAS}`;
  const r = await validarComercio({
    comercio: fila.comercio,
    secreto: fila.secreto,
    dominio,
    ambiente: esAmbiente(fila.ambiente),
  });

  // EL MENSAJE DE YAPPY SE ENSEÑA TAL CUAL. Traducirlo a «hubo un error» borra
  // la única pista que hay —«dominio no registrado», «comercio inactivo»— y
  // deja al negocio probando a ciegas.
  if (!r.ok) {
    return {
      ok: false,
      mensaje: `Yappy no aceptó la configuración: ${r.mensaje} · Comprueba que en tu panel de Yappy el dominio registrado sea exactamente ${dominio}`,
    };
  }

  await sb.from("tienda_cobros").update({ validado_en: new Date().toISOString() }).eq("id", fila.id);
  revalidatePath(`/tienda/${tiendaId}`);
  return {
    ok: true,
    mensaje:
      esAmbiente(fila.ambiente) === "prueba"
        ? "Conexión correcta con el Yappy de PRUEBAS. Cambia a producción cuando quieras cobrar de verdad."
        : "Conexión correcta. Ya puedes cobrar con Yappy.",
  };
}

/**
 * Crea en el WhatsApp del cliente las plantillas con las que se avisa fuera de
 * las 24 horas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES UN BOTÓN Y NO ALGO AUTOMÁTICO A PROPÓSITO. Meta tarda de minutos a un día
 * en aprobar, y una tienda recién encendida empieza a vender antes de eso. Un
 * proceso invisible que a veces funciona y a veces no es peor que uno manual:
 * el negocio tiene que poder ver en qué va y volver a intentarlo.
 *
 * Mientras no estén aprobadas no se rompe nada: dentro de las 24 h los avisos
 * salen como texto libre igual que siempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function crearPlantillasDeAviso(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  if (!t.bot_id) {
    return {
      ok: false,
      mensaje: "Primero vincula esta tienda con un chatbot que tenga WhatsApp conectado.",
    };
  }

  const { crearPlantillasDePedido } = await import("@/lib/tienda/altaDePlantillas");
  // CON LA LLAVE DE SERVICIO: esto habla con Meta y necesita el token del
  // canal, que ya no es legible con la sesión de nadie. Quién puede llegar
  // aquí lo decidió esta acción más arriba; el alcance no cambia.
  const r = await crearPlantillasDePedido(createAdminClient(), t.bot_id);

  if (!r.ok) {
    return { ok: false, mensaje: r.error ?? "No se pudo crear ninguna plantilla." };
  }

  const fallaron = r.resultados.filter((x) => !x.ok);
  revalidatePath(`/tienda/${tiendaId}`);

  if (fallaron.length) {
    // SE DICE CUÁLES FALLARON Y POR QUÉ. «Algunas fallaron» obliga a adivinar, y
    // aquí adivinar significa volver a pulsar hasta que Meta te limite.
    return {
      ok: true,
      tono: "aviso",
      mensaje:
        `Se crearon ${r.resultados.length - fallaron.length} de ${r.resultados.length}. ` +
        `No salieron: ${fallaron.map((x) => `${x.etiqueta} (${x.error})`).join("; ")}`,
    };
  }

  const yaEstaban = r.resultados.filter((x) => x.yaEstaba).length;
  return {
    ok: true,
    mensaje:
      yaEstaban === r.resultados.length
        ? "Ya estaban todas creadas en tu WhatsApp."
        : `Listo: ${r.resultados.length} plantillas enviadas a Meta. La aprobación tarda de unos minutos a un día.`,
  };
}
