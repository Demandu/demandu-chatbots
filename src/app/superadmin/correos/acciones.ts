"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correoDeBienvenida } from "@/lib/correo/plantillas";
import { enviarYApuntar } from "@/lib/correo/enviar";
import { anotarComoYo } from "@/lib/bitacora";

/**
 * Cada acción vuelve a comprobar el permiso aunque el marco de /superadmin ya
 * lo haga: una acción de servidor se puede invocar por su propia dirección sin
 * pasar por ninguna pantalla.
 */
async function soyDelEquipo(): Promise<boolean> {
  const { data } = await createClient().rpc("is_platform_admin");
  return !!data;
}

const PANTALLA = "/superadmin/correos";

function panel(): string {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.demandu.tech").replace(/\/+$/, "")}/dashboard`;
}

/** Los cuatro campos, tal y como vienen del formulario. */
function loEscrito(formData: FormData) {
  return {
    asunto: String(formData.get("asunto") ?? "").trim(),
    titulo: String(formData.get("titulo") ?? "").trim(),
    cuerpo: String(formData.get("cuerpo") ?? "").trim(),
    boton: String(formData.get("boton") ?? "").trim(),
  };
}

/**
 * Guardar el texto de la bienvenida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO SE VALIDA QUE ESTÉN LLENOS, Y NO ES UN OLVIDO. Un campo vacío significa
 * «usa el del código», que es una elección legítima y la forma de volver atrás
 * sin tener que acordarse del texto original. Quien lo lee al mandar
 * (`laPlantilla`) ya rellena el hueco.
 *
 * LO QUE SÍ SE HACE ES DEJARLO APUNTADO. Este texto lo va a recibir todo
 * cliente que se registre a partir de ahora; cuando alguien pregunte por qué el
 * correo dice lo que dice, la respuesta tiene que estar en la bitácora y no en
 * la memoria de quien lo cambió.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function guardarPlantilla(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const { data: { user } } = await createClient().auth.getUser();
  const campos = loEscrito(formData);

  const { error } = await createAdminClient()
    .from("correos_plantillas")
    .upsert(
      { clave: "bienvenida", ...campos, actualizado_por: user?.id ?? null, updated_at: new Date().toISOString() },
      { onConflict: "clave" },
    );

  if (error) {
    redirect(`${PANTALLA}?fallo=${encodeURIComponent(error.message)}`);
  }

  await anotarComoYo({
    accion: "cambió el texto del correo de bienvenida",
    detalle: campos,
  });

  revalidatePath(PANTALLA);
  redirect(`${PANTALLA}?guardado=1`);
}

/** Devolver los cuatro campos a vacío, que es decir «el del código». */
export async function restaurar(): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const { data: { user } } = await createClient().auth.getUser();

  await createAdminClient()
    .from("correos_plantillas")
    .upsert(
      {
        clave: "bienvenida",
        asunto: "",
        titulo: "",
        cuerpo: "",
        boton: "",
        actualizado_por: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clave" },
    );

  await anotarComoYo({ accion: "restauró el texto original del correo de bienvenida" });

  revalidatePath(PANTALLA);
  redirect(`${PANTALLA}?restaurado=1`);
}

/**
 * Mandarse el correo a uno mismo para verlo de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VA AL CORREO DE QUIEN ESTÁ SENTADO AQUÍ, Y NO HAY CAMPO PARA CAMBIARLO.
 *
 * Es la diferencia entre una prueba y una metedura de pata irreversible. Un
 * campo «mandar a:» en la pantalla que edita el correo de bienvenida es un
 * campo donde un día alguien pega —o autocompleta— la dirección de un cliente,
 * y ese cliente recibe un borrador a medio escribir. El destino sale de la
 * sesión: no se puede equivocar porque no se puede escribir.
 *
 * SE MANDA LO QUE HAY EN LA PANTALLA, NO LO GUARDADO. Verlo antes de guardar es
 * justamente para lo que sirve: si hubiera que guardar primero, el texto en
 * pruebas ya sería el que reciben los clientes nuevos.
 *
 * LA VISTA PREVIA NO SOBRA POR ESTO. La vista previa enseña el HTML; esto
 * enseña lo que hace Gmail con ese HTML, que no es lo mismo — y es donde se ve
 * si el logo carga y si el botón se pulsa con el pulgar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function mandarmePrueba(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const { data: { user } } = await createClient().auth.getUser();
  const mio = String(user?.email ?? "").trim();
  if (!mio) {
    redirect(`${PANTALLA}?fallo=${encodeURIComponent("Tu cuenta no tiene un correo al que mandarlo.")}`);
  }

  const r = await enviarYApuntar(createAdminClient(), {
    para: mio,
    correo: correoDeBienvenida({
      // Datos de mentira a propósito, para ver los huecos rellenos. Con el
      // nombre real de quien prueba no se vería si `{negocio}` funciona.
      nombre: "Darwin Bracho",
      negocio: "Ventas de zapatos",
      panel: panel(),
      plantilla: loEscrito(formData),
    }),
    etiqueta: "bienvenida_prueba",
    quien: user?.id ?? null,
  });

  redirect(r.ok ? `${PANTALLA}?probado=1` : `${PANTALLA}?fallo=${encodeURIComponent(r.error)}`);
}
