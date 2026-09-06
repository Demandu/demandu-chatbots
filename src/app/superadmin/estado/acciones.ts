"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revisarServicios, guardarChequeos } from "@/lib/estado/servicios";
import { revisarMeta } from "@/lib/estado/meta";

async function soyDelEquipo(): Promise<boolean> {
  const { data } = await createClient().rpc("is_platform_admin");
  return !!data;
}

function origen(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Revisar ahora, a mano.
 *
 * La tarea programada es la que importa —enterarse de una caída a las 3 de la
 * mañana— pero cuando algo se está rompiendo nadie quiere esperar al siguiente
 * ciclo. Este botón es para ese momento.
 */
export async function revisarAhora(): Promise<void> {
  if (!(await soyDelEquipo())) return;
  await guardarChequeos(await revisarServicios(origen()));
  revalidatePath("/superadmin/estado");
}

/** Solo la parte de Meta: es la lenta y la que gasta llamadas a su API. */
export async function revisarMetaAhora(): Promise<void> {
  if (!(await soyDelEquipo())) return;
  await revisarMeta();
  revalidatePath("/superadmin/estado");
}
