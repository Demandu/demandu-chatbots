"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { aCentavos } from "@/lib/tienda/variedades";
import { leerPreguntasEscritas, leerGruposEscritos } from "@/lib/tienda/escritura";
import { leerConfig, soloDigitos, type ConfigTienda } from "@/lib/tienda/config";

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

  const preguntas = leerPreguntasEscritas(s(fd.get("preguntas")));

  const nueva: ConfigTienda = leerConfig({
    ...previa,
    titulo: s(fd.get("titulo")),
    logo_url: s(fd.get("logo_url")),
    portada_url: s(fd.get("portada_url")),
    banners,
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
    preguntas: preguntas.length ? preguntas : previa.preguntas,
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
    mensaje: preguntas.length
      ? "Diseño guardado."
      : "Diseño guardado. Dejaste el formulario vacío, así que se conservaron las preguntas anteriores.",
  };
}

/* ── Productos ─────────────────────────────────────────────────────────────── */

export async function guardarProducto(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const nombre = s(fd.get("nombre"));
  if (!nombre) return { ok: false, mensaje: "El producto necesita un nombre." };

  const precio = aCentavos(s(fd.get("precio")));
  const anteriorCrudo = s(fd.get("precio_anterior"));
  const precio_anterior = anteriorCrudo ? aCentavos(anteriorCrudo) : null;

  // Un «antes» que no es mayor que el precio no es una oferta: es un tachón
  // que hace desconfiar. Se descarta en vez de pintarlo.
  const anteriorValido = precio_anterior && precio_anterior > precio ? precio_anterior : null;

  const stockCrudo = s(fd.get("stock"));
  const fila = {
    org_id: t.org_id,
    tienda_id: tiendaId,
    nombre,
    descripcion: s(fd.get("descripcion")) || null,
    categoria: s(fd.get("categoria")) || null,
    precio,
    precio_anterior: anteriorValido,
    oculto: fd.get("oculto") === "on",
    // Vacío = sin control de existencias. Cero = agotado de verdad.
    stock: stockCrudo === "" ? null : Math.max(0, Math.round(Number(stockCrudo) || 0)),
    imagen_url: s(fd.get("imagen_url")) || null,
    variedades: leerGruposEscritos(s(fd.get("variedades"))),
    updated_at: new Date().toISOString(),
  };

  const sb = createClient();
  const id = s(fd.get("producto_id"));
  const { error } = id
    ? await sb.from("tienda_productos").update(fila).eq("id", id).eq("tienda_id", tiendaId)
    : await sb.from("tienda_productos").insert(fila);

  if (error) return { ok: false, mensaje: "No se pudo guardar el producto." };

  revalidatePath(`/tienda/${tiendaId}`);
  return { ok: true, mensaje: id ? "Producto actualizado." : `«${nombre}» agregado.` };
}

export async function borrarProducto(_e: Estado, fd: FormData): Promise<Estado> {
  const tiendaId = s(fd.get("tienda_id"));
  const t = await tiendaDelUsuario(tiendaId);
  if (!t) return { ok: false, mensaje: "Esa tienda no es tuya o ya no existe." };

  const id = s(fd.get("producto_id"));
  if (!id) return { ok: false, mensaje: "No sé qué producto borrar." };

  const { error } = await createClient()
    .from("tienda_productos")
    .delete()
    .eq("id", id)
    .eq("tienda_id", tiendaId);

  if (error) return { ok: false, mensaje: "No se pudo borrar." };
  revalidatePath(`/tienda/${tiendaId}`);
  return { ok: true, mensaje: "Producto borrado." };
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
      ? "Cobros con Yappy activados. El dinero entra directo a tu cuenta."
      : "Datos guardados. Yappy está desactivado: los pedidos llegan sin pago en línea.",
  };
}
