"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cerrarSoporte } from "@/lib/soporte";

/**
 * «Volver a la plataforma», desde la trastienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ANTES ERA UN ENLACE A `/dashboard` Y DEJABA A QUIEN DA SOPORTE DENTRO DE LA
 * CUENTA DEL CLIENTE.
 *
 * No era un fallo del enlace: mientras hay un acceso de soporte vivo, `/dashboard`
 * ES la cuenta del cliente. Lo decide `membresiaActiva()` y está bien que lo
 * decida —entrar a una cuenta significa entrar—, pero desde el panel interno
 * nadie espera eso: el botón dice «volver a la plataforma» y se entiende «volver
 * a lo mío». El dueño acababa en la cuenta de otro negocio una y otra vez sin
 * entender por qué.
 *
 * Así que volver a la plataforma CIERRA el acceso de soporte. Es lo que de
 * verdad quiere decir salir de la trastienda, y cerrar nunca hace daño: si
 * todavía hacía falta, se vuelve a entrar desde la ficha del cliente con un clic
 * y queda apuntado otra vez en la bitácora, que es justo lo que debe pasar.
 *
 * Sin sesión de soporte abierta no hace nada y te lleva a tu panel, igual que el
 * enlace de siempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function volverAMiCuenta(): Promise<void> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login");

  await cerrarSoporte(user.id);

  // El marco entero se vuelve a pintar: el aviso rojo, el nombre del negocio y
  // el menú salen de la membresía, y acaba de cambiar cuál manda.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
