"use server";

/**
 * ACCIONES EN BLOQUE — la parte que toca la base.
 *
 * La explicación de qué se decidió y por qué está en `src/lib/enBloque.ts`.
 * Aquí, tres reglas de seguridad que no se negocian:
 *
 *   1. TODO SE FILTRA POR `org_id` A MANO, además de RLS. Quien tiene dos
 *      accesos (soporte abierto en la cuenta de un cliente) ve por RLS las
 *      filas de las dos cuentas. Sin el filtro, seleccionar en una podría
 *      tocar conversaciones de la otra.
 *
 *   2. SE COMPRUEBA EL PERMISO EN EL SERVIDOR. Esconder la barra a quien no
 *      puede no es prohibir: una acción de servidor se puede llamar a mano.
 *
 *   3. SE CUENTA LO QUE LA BASE DEVOLVIÓ. Cada `update` pide la fila de vuelta
 *      (`select`) y el aviso se arma con eso. Ver `setAssignee` en la Bandeja:
 *      el reparto automático puede cambiar el responsable en el mismo instante.
 *
 * Se usa el cliente con la sesión de la persona (no la llave de servicio), así
 * que los disparadores ven a quien hizo el cambio: `asignada_por` queda con su
 * nombre y el aviso de «te asignaron un chat» le llega al agente — uno solo,
 * por el más reciente, aunque se le pasen cincuenta (`NotificationsWatcher`).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import {
  MAX_EN_BLOQUE,
  enTrozos,
  idsLimpios,
  mezclarEtiquetas,
  partesAsignar,
  partesEtiquetas,
  partesEtapa,
  partesCerrar,
  type Parte,
  type TipoSeleccion,
} from "@/lib/enBloque";

/** `partes` son claves de `enBloque.res` en `messages/*.json`: la barra las
 *  traduce al idioma de quien mira. Ver `Parte` en `src/lib/enBloque.ts`. */
export type ResultadoEnBloque = { ok: boolean; partes: Parte[] };

const no = (k: string, v?: Parte["v"]): ResultadoEnBloque => ({ ok: false, partes: [{ k, v }] });

type Sb = ReturnType<typeof createClient>;
type Conv = { id: string; contact_id: string | null; opportunity_id: string | null; status: string };

const ABIERTAS = ["open", "pending", "assigned"];

/** Quién eres, en qué cuenta, y si puedes hacer esto. */
async function preparar(
  tipo: TipoSeleccion,
  idsCrudos: unknown,
): Promise<{ sb: Sb; orgId: string; ids: string[] } | ResultadoEnBloque> {
  if (tipo !== "contactos" && tipo !== "conversaciones") return no("seleccionNoValida");
  const ids = idsLimpios(idsCrudos);
  if (!ids.length) return no("noSeleccionaste");
  if (ids.length > MAX_EN_BLOQUE) {
    return no("demasiados", { max: MAX_EN_BLOQUE });
  }
  const { permisos } = await misPermisos();
  if (!permisos.has("conversaciones")) {
    return no("sinPermiso");
  }
  const orgId = await getCurrentOrgId();
  if (!orgId) return no("sinCuenta");
  return { sb: createClient(), orgId, ids };
}

/**
 * Las conversaciones sobre las que se va a actuar.
 *
 * Desde la Bandeja: las que se marcaron (abiertas o cerradas; si alguien marca
 * una cerrada, es que quiere tocarla).
 * Desde Contactos: SOLO sus conversaciones abiertas — lo que se acordó.
 *
 * `contactIds` son los contactos de verdad de esta cuenta (desde Contactos:
 * los marcados que existen; desde la Bandeja: los dueños de las conversaciones).
 */
async function resolver(
  sb: Sb,
  orgId: string,
  tipo: TipoSeleccion,
  ids: string[],
): Promise<{ convs: Conv[]; contactIds: string[] }> {
  const convs: Conv[] = [];
  const contactos = new Set<string>();

  if (tipo === "conversaciones") {
    for (const trozo of enTrozos(ids)) {
      const { data, error } = await sb
        .from("conversations")
        .select("id, contact_id, opportunity_id, status")
        .eq("org_id", orgId)
        .in("id", trozo);
      if (error) throw new Error(`no pude leer las conversaciones: ${error.message}`);
      for (const c of (data ?? []) as Conv[]) {
        convs.push(c);
        if (c.contact_id) contactos.add(c.contact_id);
      }
    }
    return { convs, contactIds: Array.from(contactos) };
  }

  for (const trozo of enTrozos(ids)) {
    const { data, error } = await sb.from("contacts").select("id").eq("org_id", orgId).in("id", trozo);
    if (error) throw new Error(`no pude leer los contactos: ${error.message}`);
    for (const c of (data ?? []) as { id: string }[]) contactos.add(c.id);
  }
  const contactIds = Array.from(contactos);
  for (const trozo of enTrozos(contactIds)) {
    const { data, error } = await sb
      .from("conversations")
      .select("id, contact_id, opportunity_id, status")
      .eq("org_id", orgId)
      .eq("prueba", false)
      .in("status", ABIERTAS)
      .in("contact_id", trozo);
    if (error) throw new Error(`no pude leer sus conversaciones: ${error.message}`);
    convs.push(...((data ?? []) as Conv[]));
  }
  return { convs, contactIds };
}

/**
 * Las tarjetas del Embudo que acompañan a la selección.
 *
 * Desde la Bandeja: la tarjeta de cada conversación marcada (`opportunity_id`),
 * igual que hace `setState` con una sola.
 * Desde Contactos: la tarjeta ABIERTA de cada contacto — por la regla 1 del
 * embudo hay como mucho una.
 */
async function tarjetasDe(
  sb: Sb,
  orgId: string,
  tipo: TipoSeleccion,
  convs: Conv[],
  contactIds: string[],
): Promise<{ id: string; contact_id: string | null }[]> {
  const out = new Map<string, { id: string; contact_id: string | null }>();
  if (tipo === "conversaciones") {
    const ids = Array.from(new Set(convs.map((c) => c.opportunity_id).filter((x): x is string => !!x)));
    for (const trozo of enTrozos(ids)) {
      const { data, error } = await sb.from("opportunities").select("id, contact_id").eq("org_id", orgId).in("id", trozo);
      if (error) throw new Error(`no pude leer las tarjetas: ${error.message}`);
      for (const o of (data ?? []) as any[]) out.set(o.id, o);
    }
  } else {
    for (const trozo of enTrozos(contactIds)) {
      const { data, error } = await sb
        .from("opportunities")
        .select("id, contact_id")
        .eq("org_id", orgId)
        .eq("status", "abierta")
        .in("contact_id", trozo);
      if (error) throw new Error(`no pude leer las tarjetas: ${error.message}`);
      for (const o of (data ?? []) as any[]) out.set(o.id, o);
    }
  }
  return Array.from(out.values());
}

/** Contactos de la selección que no tienen ni conversación ni tarjeta. */
function sinNada(contactIds: string[], convs: Conv[], tarjetas: { contact_id: string | null }[]): number {
  const con = new Set<string>();
  for (const c of convs) if (c.contact_id) con.add(c.contact_id);
  for (const t of tarjetas) if (t.contact_id) con.add(t.contact_id);
  return contactIds.filter((id) => !con.has(id)).length;
}

function refrescar() {
  revalidatePath("/contacts");
  revalidatePath("/inbox");
  revalidatePath("/crm");
}

function fallo(donde: string, e: unknown): ResultadoEnBloque {
  console.error(`[en bloque] ${donde}:`, e instanceof Error ? e.message : e);
  return no("fallo");
}

// ─── Asignar ────────────────────────────────────────────────────────────────

export async function asignarEnBloque(
  tipo: TipoSeleccion,
  idsCrudos: string[],
  memberId: string,
): Promise<ResultadoEnBloque> {
  const p = await preparar(tipo, idsCrudos);
  if ("ok" in p) return p;
  const { sb, orgId, ids } = p;
  try {
    const { data: miembro, error: eMiembro } = await sb
      .from("team_members")
      .select("id, name")
      .eq("org_id", orgId)
      .eq("id", String(memberId ?? ""))
      .maybeSingle();
    if (eMiembro) throw new Error(`no pude leer el equipo: ${eMiembro.message}`);
    if (!miembro) return no("noEnEquipo");
    const agente = (miembro as any).name || "—";

    const { convs, contactIds } = await resolver(sb, orgId, tipo, ids);
    const tarjetas = await tarjetasDe(sb, orgId, tipo, convs, contactIds);

    let quedaron = 0;
    /* POR `conversaciones_asignar` Y NO POR UN UPDATE (0142): quien solo ve
     * sus chats deja de ver el que pasa, y PostgREST, al pedir la fila de
     * vuelta, haría fallar el cambio entero por RLS. La función ya filtra por
     * cuenta, permiso y visibilidad. */
    for (const trozo of enTrozos(convs.map((c) => c.id))) {
      const { data, error } = await sb.rpc("conversaciones_asignar", {
        p_ids: trozo,
        p_member: (miembro as any).id,
      });
      if (error) throw new Error(error.message);
      quedaron += ((data ?? []) as any[]).filter((r) => r.assignee_member_id === (miembro as any).id).length;
    }

    let tarjetasHechas = 0;
    for (const trozo of enTrozos(tarjetas.map((t) => t.id))) {
      const { data, error } = await sb
        .from("opportunities")
        .update({ assignee_member_id: (miembro as any).id })
        .eq("org_id", orgId)
        .in("id", trozo)
        .select("id");
      if (error) throw new Error(error.message);
      tarjetasHechas += (data ?? []).length;
    }

    refrescar();
    return {
      ok: quedaron > 0 || tarjetasHechas > 0,
      partes: partesAsignar({
        agente,
        conversaciones: quedaron,
        tarjetas: tarjetasHechas,
        sinNada: tipo === "contactos" ? sinNada(contactIds, convs, tarjetas) : 0,
        noQuedaron: convs.length - quedaron,
      }),
    };
  } catch (e) {
    return fallo("asignar", e);
  }
}

// ─── Etiquetas ──────────────────────────────────────────────────────────────

export async function etiquetasEnBloque(
  tipo: TipoSeleccion,
  idsCrudos: string[],
  ponerCrudo: string[],
  quitarCrudo: string[],
): Promise<ResultadoEnBloque> {
  const p = await preparar(tipo, idsCrudos);
  if ("ok" in p) return p;
  const { sb, orgId, ids } = p;
  try {
    /* SOLO ETIQUETAS QUE EXISTEN EN CONFIGURACIÓN. La regla de reparto por
     * etiqueta y los filtros comparan por nombre exacto: una etiqueta escrita
     * a mano con otra mayúscula sería una etiqueta fantasma que nada reconoce. */
    const { data: tagsOrg, error: eTags } = await sb.from("tags").select("name").eq("org_id", orgId);
    if (eTags) throw new Error(eTags.message);
    const validas = new Set(((tagsOrg ?? []) as any[]).map((t) => t.name as string));
    const poner = Array.from(new Set((ponerCrudo ?? []).map(String))).filter((t) => validas.has(t));
    const quitar = Array.from(new Set((quitarCrudo ?? []).map(String))).filter((t) => validas.has(t));
    if (!poner.length && !quitar.length) return no("eligeEtiqueta");

    // Desde la Bandeja se etiqueta al CONTACTO de cada conversación.
    let contactIds: string[];
    if (tipo === "conversaciones") {
      contactIds = (await resolver(sb, orgId, tipo, ids)).contactIds;
    } else {
      contactIds = ids;
    }

    const fichas: { id: string; tags: string[] | null }[] = [];
    for (const trozo of enTrozos(contactIds)) {
      const { data, error } = await sb.from("contacts").select("id, tags").eq("org_id", orgId).in("id", trozo);
      if (error) throw new Error(error.message);
      fichas.push(...((data ?? []) as any[]));
    }

    const porCambiar = fichas
      .map((f) => ({ id: f.id, tags: mezclarEtiquetas(f.tags, poner, quitar) }))
      .filter((f): f is { id: string; tags: string[] } => f.tags !== null);

    /* UNA ESCRITURA POR CONTACTO, de ocho en ocho. Cada uno acaba con su
     * propia lista, así que no cabe un único `update`. Va en paralelo
     * limitado para no tardar un minuto con 300, ni tumbar la base con 300 a
     * la vez (cada escritura dispara la calificación del lead). */
    let cambiados = 0;
    let fallaron = 0;
    for (const grupo of enTrozos(porCambiar, 8)) {
      const res = await Promise.all(
        grupo.map((f) =>
          sb.from("contacts").update({ tags: f.tags }).eq("org_id", orgId).eq("id", f.id).select("id"),
        ),
      );
      for (const r of res) {
        if (r.error || !(r.data ?? []).length) {
          fallaron++;
          if (r.error) console.error("[en bloque] etiqueta no guardada:", r.error.message);
        } else cambiados++;
      }
    }

    refrescar();
    return {
      ok: fallaron === 0,
      partes: partesEtiquetas({ cambiados, yaEstaban: fichas.length - porCambiar.length, fallaron, poner, quitar }),
    };
  } catch (e) {
    return fallo("etiquetas", e);
  }
}

// ─── Etapa del embudo ───────────────────────────────────────────────────────

export async function etapaEnBloque(
  tipo: TipoSeleccion,
  idsCrudos: string[],
  stageId: string,
): Promise<ResultadoEnBloque> {
  const p = await preparar(tipo, idsCrudos);
  if ("ok" in p) return p;
  const { sb, orgId, ids } = p;
  try {
    const { data: etapa, error: eEtapa } = await sb
      .from("conversation_states")
      .select("id, name, pipeline_id")
      .eq("org_id", orgId)
      .eq("id", String(stageId ?? ""))
      .maybeSingle();
    if (eEtapa) throw new Error(`no pude leer la etapa: ${eEtapa.message}`);
    if (!etapa) return no("etapaNoExiste");

    const { convs, contactIds } = await resolver(sb, orgId, tipo, ids);
    const tarjetas = await tarjetasDe(sb, orgId, tipo, convs, contactIds);

    let convsHechas = 0;
    for (const trozo of enTrozos(convs.map((c) => c.id))) {
      const { data, error } = await sb
        .from("conversations")
        .update({ state_id: (etapa as any).id })
        .eq("org_id", orgId)
        .in("id", trozo)
        .select("id");
      if (error) throw new Error(error.message);
      convsHechas += (data ?? []).length;
    }

    /* LA TARJETA SE VA CON SU EMBUDO. Si la etapa es de otro embudo y solo se
     * cambiara `stage_id`, la tarjeta quedaría en un tablero cuya columna no
     * existe ahí: no saldría en ninguno. El estado (ganada/perdida/abierta) lo
     * deriva solo el disparador `crm_estado_desde_etapa`. */
    const cambio: Record<string, string> = { stage_id: (etapa as any).id };
    if ((etapa as any).pipeline_id) cambio.pipeline_id = (etapa as any).pipeline_id;
    let tarjetasHechas = 0;
    for (const trozo of enTrozos(tarjetas.map((t) => t.id))) {
      const { data, error } = await sb
        .from("opportunities")
        .update(cambio)
        .eq("org_id", orgId)
        .in("id", trozo)
        .select("id");
      if (error) throw new Error(error.message);
      tarjetasHechas += (data ?? []).length;
    }

    refrescar();
    return {
      ok: convsHechas > 0 || tarjetasHechas > 0,
      partes: partesEtapa({
        etapa: (etapa as any).name,
        conversaciones: convsHechas,
        tarjetas: tarjetasHechas,
        sinNada: tipo === "contactos" ? sinNada(contactIds, convs, tarjetas) : 0,
      }),
    };
  } catch (e) {
    return fallo("etapa", e);
  }
}

// ─── Cerrar conversaciones ──────────────────────────────────────────────────

export async function cerrarEnBloque(tipo: TipoSeleccion, idsCrudos: string[]): Promise<ResultadoEnBloque> {
  const p = await preparar(tipo, idsCrudos);
  if ("ok" in p) return p;
  const { sb, orgId, ids } = p;
  try {
    const { convs, contactIds } = await resolver(sb, orgId, tipo, ids);
    const abiertas = convs.filter((c) => c.status !== "closed");

    let cerradas = 0;
    for (const trozo of enTrozos(abiertas.map((c) => c.id))) {
      const { data, error } = await sb
        .from("conversations")
        .update({ status: "closed" })
        .eq("org_id", orgId)
        .in("id", trozo)
        .select("id, status");
      if (error) throw new Error(error.message);
      cerradas += ((data ?? []) as any[]).filter((r) => r.status === "closed").length;
    }

    const conConv = new Set(convs.map((c) => c.contact_id).filter(Boolean) as string[]);
    refrescar();
    return {
      ok: true,
      partes: partesCerrar({
        cerradas,
        yaCerradas: convs.length - abiertas.length,
        sinNada: tipo === "contactos" ? contactIds.filter((id) => !conConv.has(id)).length : 0,
      }),
    };
  } catch (e) {
    return fallo("cerrar", e);
  }
}
