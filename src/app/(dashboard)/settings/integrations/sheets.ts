"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getValidAccessTokenForOrg } from "@/lib/integrations/google";
import { listarHojas, crearHoja, type HojaDeCalculo } from "@/lib/integrations/sheets";

/**
 * Las hojas entre las que puede elegir el cliente.
 *
 * Puede volver VACÍA aunque el cliente tenga cien hojas, y no es un fallo: con
 * el permiso `drive.file` solo vemos los archivos que él nos autorizó. Por eso
 * la pantalla ofrece siempre "crear una nueva" — es el camino que funciona a la
 * primera para quien nunca nos ha dado acceso a nada.
 */
export async function misHojas(): Promise<{ hojas: HojaDeCalculo[]; sinGoogle?: boolean }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { hojas: [], sinGoogle: true };

  const token = await getValidAccessTokenForOrg(createClient(), orgId);
  if (!token) return { hojas: [], sinGoogle: true };

  return { hojas: await listarHojas(token) };
}

export async function usarHoja(hojaId: string, nombre: string): Promise<{ ok: boolean; error?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu organización." };
  if (!hojaId) return { ok: false, error: "Elige una hoja." };

  const { error } = await createClient()
    .from("sheets_config")
    .upsert(
      { org_id: orgId, hoja_id: hojaId, hoja_nombre: nombre, activo: true, ultimo_error: null, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );

  if (error) {
    console.error("[sheets] guardar:", error.message);
    return { ok: false, error: "No se pudo guardar. ¿Tienes permiso de conexiones?" };
  }
  revalidatePath("/settings/integrations");
  return { ok: true };
}

/**
 * Crea una hoja nueva ya con encabezados y la deja seleccionada.
 *
 * Es el camino recomendado: una hoja creada por nosotros nace con el permiso
 * correcto y con las columnas en el orden que escribimos, así que no hay forma
 * de que las filas caigan descuadradas.
 */
export async function nuevaHoja(titulo: string): Promise<{ ok: boolean; error?: string; nombre?: string }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No encuentro tu organización." };

  const token = await getValidAccessTokenForOrg(createClient(), orgId);
  if (!token) return { ok: false, error: "Conecta primero tu cuenta de Google, aquí arriba." };

  const nombre = (titulo ?? "").trim().slice(0, 80) || "Leads de Demandu";
  const hoja = await crearHoja(token, nombre);
  if (!hoja) return { ok: false, error: "Google no dejó crear la hoja. Inténtalo otra vez." };

  const r = await usarHoja(hoja.id, hoja.nombre);
  return r.ok ? { ok: true, nombre: hoja.nombre } : r;
}

/** Apagar. No se borra la fila: se apaga, para no perder a qué hoja iba. */
export async function apagarSheets(): Promise<{ ok: boolean }> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false };
  await createClient()
    .from("sheets_config")
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq("org_id", orgId);
  revalidatePath("/settings/integrations");
  return { ok: true };
}
