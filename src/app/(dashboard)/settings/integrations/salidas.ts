"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { EVENTOS } from "@/lib/salidas-eventos";
import { revisarDireccion } from "@/lib/salidas-url";

/**
 * Crear, cambiar y quitar salidas de eventos.
 *
 * VA CON EL CLIENTE DE ADMINISTRACIÓN porque el secreto de firma se genera
 * AQUÍ, en el servidor, y no puede venir del navegador: si el cliente pudiera
 * elegirlo, elegiría «1234» y la firma dejaría de significar nada.
 *
 * La tabla es de solo lectura para el cliente por lo mismo. Estas acciones son
 * la única puerta, y comprueban a mano lo que la base ya no comprueba: que la
 * salida sea de TU organización y que tengas permiso de configuración.
 *
 * ── TODAS CONTESTAN ALGO, Y ESO ES LA MITAD DEL ARREGLO ────────────────────
 *
 * Antes devolvían `void`: si la dirección no valía, o si a quien pulsaba le
 * faltaba el permiso, la pantalla se quedaba exactamente igual. Se pulsaba
 * «Conectar» y no pasaba nada. Para quien lo usa eso no es una validación: es
 * la plataforma rota, y lo normal es volver a pulsar hasta que algo se rompe
 * de verdad o rendirse.
 */

export type Resultado = { ok: boolean; mensaje: string };

function secretoNuevo(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return "dmd_" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Lo que se comprueba antes de tocar nada, igual en las tres acciones. */
async function puedo(): Promise<{ orgId: string } | Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, mensaje: "No encuentro tu cuenta. Vuelve a entrar." };
  const { permisos } = await misPermisos();
  if (!permisos.has("conexiones")) {
    return { ok: false, mensaje: "No tienes permiso para cambiar las conexiones." };
  }
  return { orgId };
}

/** Los eventos marcados. Ninguno = todos, que es lo que quiere quien empieza. */
function eventosDe(formData: FormData): string[] {
  const elegidos = EVENTOS.map((e) => e.clave).filter((c) => formData.get(`ev_${c}`) === "on");
  return elegidos.length === EVENTOS.length ? [] : elegidos;
}

export async function crearSalida(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const quien = await puedo();
  if ("ok" in quien) return quien;

  const nombre = String(formData.get("nombre") ?? "").trim() || "Mi CRM";
  const revision = revisarDireccion(String(formData.get("url") ?? ""));
  if (!revision.ok) return { ok: false, mensaje: revision.motivo };

  const { error } = await createAdminClient().from("salidas").insert({
    org_id: quien.orgId,
    nombre,
    url: revision.url,
    secreto: secretoNuevo(),
    eventos: eventosDe(formData),
  });
  if (error) return { ok: false, mensaje: `No se pudo guardar: ${error.message}` };

  revalidatePath("/settings/integrations");
  return { ok: true, mensaje: `Listo. A partir de ahora le mandamos los avisos a ${nombre}.` };
}

/**
 * Cambiar una salida que ya existe.
 *
 * SIN ESTO, CORREGIR UNA DIRECCIÓN ERA BORRAR Y VOLVER A CREAR — y eso cambia
 * el secreto de firma, así que el cliente tiene que ir a su CRM a cambiarlo
 * también. Una errata de una letra costaba tocar los dos sistemas.
 *
 * El secreto NO se toca aquí, justamente por eso.
 */
export async function editarSalida(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const quien = await puedo();
  if ("ok" in quien) return quien;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, mensaje: "No sé qué salida quieres cambiar." };

  const nombre = String(formData.get("nombre") ?? "").trim() || "Mi CRM";
  const revision = revisarDireccion(String(formData.get("url") ?? ""));
  if (!revision.ok) return { ok: false, mensaje: revision.motivo };

  /* SE VUELVE A INTENTAR DESDE CERO. Si la salida estaba marcada como que
   * fallaba, dejar el error viejo diría «no está recibiendo» para siempre
   * aunque la dirección nueva sea buena — y el cliente no tendría forma de
   * saber si la corrección sirvió. */
  const { data, error } = await createAdminClient().from("salidas")
    .update({
      nombre,
      url: revision.url,
      eventos: eventosDe(formData),
      activa: true,
      ultimo_error: null,
      ultimo_estado: null,
      ultimo_intento_at: null,
    })
    // El filtro por organización es la comprobación de verdad: aunque llegue
    // un id de otra cuenta, no hay ninguna fila que cambiar.
    .eq("id", id).eq("org_id", quien.orgId)
    .select("id");

  if (error) return { ok: false, mensaje: `No se pudo guardar: ${error.message}` };
  if (!data?.length) return { ok: false, mensaje: "Esa salida ya no existe." };

  revalidatePath("/settings/integrations");
  return { ok: true, mensaje: "Cambiada. El secreto de firma sigue siendo el mismo." };
}

export async function quitarSalida(_previo: Resultado, formData: FormData): Promise<Resultado> {
  const quien = await puedo();
  if ("ok" in quien) return quien;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, mensaje: "No sé qué salida quieres quitar." };

  const { error } = await createAdminClient().from("salidas")
    .delete().eq("id", id).eq("org_id", quien.orgId);
  if (error) return { ok: false, mensaje: `No se pudo quitar: ${error.message}` };

  revalidatePath("/settings/integrations");
  return { ok: true, mensaje: "Quitada. Dejamos de mandarle avisos." };
}
