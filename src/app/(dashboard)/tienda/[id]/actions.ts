"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { aCentavos, sanearGrupos } from "@/lib/tienda/variedades";
import { leerConfig, sanearPreguntas, soloDigitos, type ConfigTienda } from "@/lib/tienda/config";
import { DOMINIO_TIENDAS, aDireccion, direccionValida, enlaceLegible } from "@/lib/tienda/direccion";
import { esAmbiente, validarComercio } from "@/lib/tienda/yappy";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export type Estado = { ok: boolean; mensaje: string };

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
    .select("id,org_id,slug,config")
    .eq("id", tiendaId)
    .maybeSingle();
  if (!data || data.org_id !== orgId) return null;
  return data as { id: string; org_id: string; slug: string; config: unknown };
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
  if (!ESTADOS.includes(estado)) return { ok: false, mensaje: "Ese estado no existe." };

  const sb = createClient();

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
  });

  revalidatePath(`/tienda/${tiendaId}`);
  return { ok: true, mensaje: "" };
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
  const { data: fila } = await sb
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
