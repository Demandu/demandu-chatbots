"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { acomodar, parNormalizado } from "@/lib/reservas/mapa";

/**
 * EL MAPA DEL SALÓN: GUARDAR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO LLEVA `org_id`, SIEMPRE. No basta con el id de la mesa: sin el filtro de
 * la cuenta, quien conozca un id mueve o borra la mesa de otro restaurante. Es
 * el mismo candado que en el recordatorio de citas, y por la misma razón.
 *
 * Y TODA CONSULTA MIRA SU ERROR. «No se pudo guardar» y «no había nada que
 * guardar» son cosas distintas: confundirlas es lo que hizo que Google Calendar
 * dijera «conectado» tres veces sin haber escrito una fila.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Resultado = { ok: true } | { ok: false; error: string };

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());

/** Pone una mesa nueva en el salón. */
export async function crearMesa(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "La mesa necesita un nombre." };

  const capacidad = Math.round(numero(formData.get("capacidad")));
  if (!Number.isFinite(capacidad) || capacidad < 1 || capacidad > 40) {
    return { ok: false, error: "La capacidad tiene que estar entre 1 y 40 personas." };
  }

  // Se coloca con la misma función que usa el arrastre: una mesa creada fuera
  // del plano sería invisible y el dueño creería que no se guardó.
  const sitio = acomodar({
    x: numero(formData.get("x")) || 40,
    y: numero(formData.get("y")) || 40,
    ancho: numero(formData.get("ancho")) || 80,
    alto: numero(formData.get("alto")) || 80,
  });

  const { error } = await createAdminClient().from("reservas_mesas").insert({
    org_id: orgId,
    nombre,
    capacidad,
    zona: texto(formData.get("zona")) || null,
    forma: texto(formData.get("forma")) || "redonda",
    ...sitio,
  });

  if (error) {
    console.error("[salón] no se pudo crear la mesa:", error.message);
    // 23505 aquí solo puede ser el nombre repetido: es lo único único.
    if ((error as any).code === "23505") {
      return { ok: false, error: `Ya tienes una mesa llamada «${nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar la mesa. Intenta de nuevo." };
  }

  revalidatePath("/reservas");
  return { ok: true };
}

/** Mueve o redimensiona una mesa. La llama el arrastre al soltar. */
export async function moverMesa(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Falta la mesa." };

  const sitio = acomodar({
    x: numero(formData.get("x")),
    y: numero(formData.get("y")),
    ancho: numero(formData.get("ancho")) || 80,
    alto: numero(formData.get("alto")) || 80,
  });

  const { error } = await createAdminClient()
    .from("reservas_mesas")
    .update(sitio)
    .eq("id", id)
    .eq("org_id", orgId); // sin esto se mueve la mesa de otro restaurante

  if (error) {
    console.error("[salón] no se pudo mover la mesa:", error.message);
    return { ok: false, error: "No se pudo guardar la posición." };
  }

  revalidatePath("/reservas");
  return { ok: true };
}

/** Cambia los datos de una mesa. */
export async function editarMesa(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Falta la mesa." };

  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "La mesa necesita un nombre." };

  const capacidad = Math.round(numero(formData.get("capacidad")));
  if (!Number.isFinite(capacidad) || capacidad < 1 || capacidad > 40) {
    return { ok: false, error: "La capacidad tiene que estar entre 1 y 40 personas." };
  }

  const { error } = await createAdminClient()
    .from("reservas_mesas")
    .update({
      nombre,
      capacidad,
      zona: texto(formData.get("zona")) || null,
      forma: texto(formData.get("forma")) || "redonda",
      activa: texto(formData.get("activa")) !== "no",
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    console.error("[salón] no se pudo editar la mesa:", error.message);
    if ((error as any).code === "23505") {
      return { ok: false, error: `Ya tienes una mesa llamada «${nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar el cambio." };
  }

  revalidatePath("/reservas");
  return { ok: true };
}

/**
 * Quita una mesa del salón.
 *
 * NO SE BORRA SI TIENE RESERVAS POR DELANTE. Borrarla dejaría a un grupo con su
 * confirmación en el teléfono y sin mesa en el salón, y nadie se enteraría
 * hasta que llegaran. Se ofrece desactivarla, que es lo que el dueño casi
 * siempre quiere decir: «esta mesa hoy no se usa».
 */
export async function borrarMesa(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Falta la mesa." };

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { count, error: errMirar } = await admin
    .from("reserva_mesas")
    .select("reserva_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("mesa_id", id)
    .gte("fecha", hoy);

  // No se puede borrar sin saber: si la comprobación falla, se para. Borrar a
  // ciegas es justo el riesgo que esta comprobación existe para evitar.
  if (errMirar) {
    console.error("[salón] no pude mirar si la mesa tiene reservas:", errMirar.message);
    return { ok: false, error: "No pude comprobar si esa mesa tiene reservas. No la borré." };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Esa mesa tiene ${count} reserva(s) por delante. Desactívala en vez de borrarla.`,
    };
  }

  const { error } = await admin.from("reservas_mesas").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    console.error("[salón] no se pudo borrar la mesa:", error.message);
    return { ok: false, error: "No se pudo borrar la mesa." };
  }

  revalidatePath("/reservas");
  return { ok: true };
}

/**
 * CON QUÉ MESAS SE PUEDE JUNTAR ESTA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Se reemplazan TODAS las uniones de esta mesa de una vez: llega la lista
 * completa y se deja así. Ir añadiendo y quitando de a una deja huérfanas
 * cuando algo falla a mitad.
 *
 * SE GUARDA UNA SOLA FILA POR PAR, con el id menor primero (`parNormalizado`).
 * Quien lee las convierte en las dos direcciones (`conUnibles`). Guardar las dos
 * filas aquí sería duplicar el dato y abrir la puerta a que un día solo se
 * borre una.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function guardarUniones(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Falta la mesa." };

  const conQuienes = formData
    .getAll("con")
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const admin = createAdminClient();

  // Las mesas tienen que ser de esta cuenta. Sin esto se podría «unir» una mesa
  // propia con la de otro restaurante mandando un id a mano.
  const { data: suyas, error: errSuyas } = await admin
    .from("reservas_mesas")
    .select("id")
    .eq("org_id", orgId);
  if (errSuyas) {
    console.error("[salón] no pude leer las mesas:", errSuyas.message);
    return { ok: false, error: "No se pudieron guardar las uniones." };
  }
  const validas = new Set((suyas ?? []).map((m: any) => m.id));
  if (!validas.has(id)) return { ok: false, error: "Esa mesa no es de esta cuenta." };

  const pares = conQuienes
    .filter((otro) => validas.has(otro))
    .map((otro) => parNormalizado(id, otro))
    .filter(Boolean) as { mesa_a: string; mesa_b: string }[];

  const { error: errBorrar } = await admin
    .from("reservas_uniones")
    .delete()
    .eq("org_id", orgId)
    .or(`mesa_a.eq.${id},mesa_b.eq.${id}`);
  if (errBorrar) {
    console.error("[salón] no pude limpiar las uniones:", errBorrar.message);
    return { ok: false, error: "No se pudieron guardar las uniones." };
  }

  if (pares.length) {
    const { error } = await admin
      .from("reservas_uniones")
      .insert(pares.map((p) => ({ org_id: orgId, ...p })));
    if (error) {
      console.error("[salón] no pude guardar las uniones:", error.message);
      return { ok: false, error: "Se borraron las uniones anteriores pero no se guardaron las nuevas. Vuelve a intentarlo." };
    }
  }

  revalidatePath("/reservas");
  return { ok: true };
}
