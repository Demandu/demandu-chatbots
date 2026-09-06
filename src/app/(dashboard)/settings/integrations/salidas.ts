"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { misPermisos } from "@/lib/permisos-server";
import { EVENTOS } from "@/lib/salidas-eventos";

/**
 * Crear y quitar salidas de eventos.
 *
 * VA CON EL CLIENTE DE ADMINISTRACIÓN porque el secreto de firma se genera
 * AQUÍ, en el servidor, y no puede venir del navegador: si el cliente pudiera
 * elegirlo, elegiría «1234» y la firma dejaría de significar nada.
 *
 * La tabla es de solo lectura para el cliente por lo mismo. Estas dos acciones
 * son la única puerta, y comprueban a mano lo que la base ya no comprueba: que
 * la salida sea de TU organización y que tengas permiso de configuración.
 */

function secretoNuevo(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return "dmd_" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function crearSalida(formData: FormData): Promise<void> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const { permisos } = await misPermisos();
  if (!permisos.has("conexiones")) return;

  const nombre = String(formData.get("nombre") ?? "").trim() || "Mi CRM";
  const url = String(formData.get("url") ?? "").trim();

  // Solo https. Un webhook por http manda los datos de los leads en claro por
  // media internet, y quien lo configura casi nunca se da cuenta.
  if (!/^https:\/\/.+/i.test(url)) {
    revalidatePath("/settings/integrations");
    return;
  }

  const elegidos = EVENTOS.map((e) => e.clave).filter((c) => formData.get(`ev_${c}`) === "on");

  await createAdminClient().from("salidas").insert({
    org_id: orgId,
    nombre,
    url,
    secreto: secretoNuevo(),
    // Ninguno marcado = todos. Quien acaba de conectar su CRM casi siempre los
    // quiere todos, y filtrar es una decisión posterior.
    eventos: elegidos.length === EVENTOS.length ? [] : elegidos,
  });

  revalidatePath("/settings/integrations");
}

export async function quitarSalida(formData: FormData): Promise<void> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return;

  const { permisos } = await misPermisos();
  if (!permisos.has("conexiones")) return;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  // El filtro por organización es la comprobación de verdad: aunque llegue un
  // id de otra cuenta, no hay ninguna fila que borrar.
  await createAdminClient().from("salidas").delete().eq("id", id).eq("org_id", orgId);

  revalidatePath("/settings/integrations");
}
