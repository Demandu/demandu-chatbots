"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";

/**
 * Guardar el nombre del negocio que el cliente acaba de escribir.
 *
 * Marca `nombre_confirmado` en el mismo update: es lo que hace que la pantalla
 * no vuelva a salir. Si se guardara solo el nombre, el cliente quedaría
 * atrapado escribiéndolo una y otra vez.
 */
export async function confirmarNombre(formData: FormData) {
  const nombre = String(formData.get("negocio") ?? "").trim().slice(0, 80);
  if (!nombre) return;

  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/login");

  await createClient()
    .from("organizations")
    .update({ name: nombre, nombre_confirmado: true })
    .eq("id", orgId);

  // El nombre sale en el marco de TODAS las pantallas, no solo en el panel.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Crear el negocio de quien NO TIENE NINGUNO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PASÓ CON UN CLIENTE DE VERDAD. Se le eliminó la cuenta desde superadmin —una
 * decisión legítima— y la organización desapareció, pero la PERSONA siguió
 * existiendo con su usuario intacto y cero membresías. Al volver a entrar
 * aterrizaba en un panel vacío: sin chatbots, sin conversaciones, sin poder
 * crear nada y sin una sola frase que explicara por qué.
 *
 * EL ALTA NO SE ESCRIBE AQUÍ. Son ocho inserciones que tienen que ir juntas y
 * ya están escritas una vez, en `provisionar_negocio` (0107), que es la misma
 * que usa el disparador de alta. Copiarlas a TypeScript sería tener DOS altas
 * distintas — y así fue exactamente como los cuatro atributos base se perdieron
 * en la 0011 y estuvieron meses sin crearse.
 *
 * La base comprueba quién eres: que haya sesión, que no tengas ya un negocio y
 * que no seas del equipo de Demandu. Sin esa segunda comprobación esto sería
 * una forma de fabricarse organizaciones a voluntad.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function crearMiNegocio(formData: FormData) {
  const nombre = String(formData.get("negocio") ?? "").trim().slice(0, 80);
  if (!nombre) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("crear_mi_negocio", { p_nombre: nombre });
  if (error) {
    // Quien YA tiene negocio llega aquí solo si abrió dos pestañas: la base lo
    // rechaza y lo correcto es mandarlo a su panel, no enseñarle un error.
    console.error("[bienvenida] no pude crear el negocio:", error.message);
    redirect("/dashboard?aviso=" + encodeURIComponent("No pudimos crear tu negocio. Vuelve a intentarlo o escríbenos."));
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
