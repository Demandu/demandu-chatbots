"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { acomodar, parNormalizado, tandaDeMesas } from "@/lib/reservas/mapa";

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

/* ── LAS ACCIONES DEVUELVEN LO QUE ESCRIBIERON ──────────────────────────────
 *
 * 12 SEP 2026. Una mesa creada NO APARECÍA hasta recargar la página. La acción
 * escribía bien y llamaba a `revalidatePath`, pero el plano guarda las mesas en
 * el estado del navegador y `useState` solo toma su valor inicial al montarse:
 * volver a pintar el servidor no lo cambia.
 *
 * Así que se devuelve la fila creada y el plano la añade. De paso desaparece
 * `revalidatePath` de todo el archivo: una vuelta al servidor por cada mesa
 * arrastrada no servía para nada. */
export type Mesa = {
  id: string; nombre: string; capacidad: number; zona: string | null;
  x: number; y: number; ancho: number; alto: number; forma: string; activa: boolean;
};

const COLUMNAS = "id, nombre, capacidad, zona, x, y, ancho, alto, forma, activa";

export type Resultado = { ok: true } | { ok: false; error: string };
export type ResultadoConMesas =
  | { ok: true; mesas: Mesa[] }
  | { ok: false; error: string };

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const numero = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());

/**
 * MUCHAS MESAS IGUALES DE UN CLIC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * «Seis mesas de dos, redondas.» Ponerlas de una en una y arrastrar cada una es
 * tedioso, y lo tedioso no se hace: un dueño que abandona a mitad deja el salón
 * incompleto, y con el salón incompleto Lana rechaza reservas que sí cabían.
 *
 * Dónde van lo decide `tandaDeMesas`, que busca hueco y NO las pone encima de
 * las que ya hay. Aquí solo se comprueba y se escribe.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function crearTanda(formData: FormData): Promise<ResultadoConMesas> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const cuantas = Math.round(numero(formData.get("cuantas")));
  const capacidad = Math.round(numero(formData.get("capacidad")));
  if (!Number.isFinite(cuantas) || cuantas < 1 || cuantas > 60) {
    return { ok: false, error: "Puedes añadir entre 1 y 60 mesas a la vez." };
  }
  if (!Number.isFinite(capacidad) || capacidad < 1 || capacidad > 40) {
    return { ok: false, error: "La capacidad tiene que estar entre 1 y 40 personas." };
  }

  const admin = createAdminClient();

  /* SE LEE EL SALÓN ANTES DE COLOCAR. Sin saber qué hay, las nuevas nacerían
   * encima de las viejas y con nombres repetidos — y el nombre repetido no es
   * cosmético: lo rechaza `unique (org_id, nombre)` y no se crea ninguna. */
  const { data: yaHay, error: errLeer } = await admin
    .from("reservas_mesas")
    .select("nombre, x, y, ancho, alto")
    .eq("org_id", orgId);
  if (errLeer) {
    console.error("[salón] no pude leer el salón antes de añadir:", errLeer.message);
    return { ok: false, error: "No pude leer tu salón. No añadí nada." };
  }

  const nuevas = tandaDeMesas({
    cuantas,
    capacidad,
    forma: (texto(formData.get("forma")) || "redonda") as any,
    zona: texto(formData.get("zona")) || null,
    yaHay: (yaHay ?? []) as any,
  });

  if (!nuevas.length) {
    return { ok: false, error: "Ya no queda espacio en el plano. Mueve algunas mesas o quita las que no uses." };
  }

  const { data, error } = await admin
    .from("reservas_mesas")
    .insert(nuevas.map((m) => ({ org_id: orgId, ...m })))
    .select(COLUMNAS);

  if (error) {
    console.error("[salón] no se pudo crear la tanda:", error.message);
    return { ok: false, error: "No se pudieron crear las mesas. Intenta de nuevo." };
  }

  return { ok: true, mesas: (data ?? []) as unknown as Mesa[] };
}

/** Pone una mesa nueva en el salón. */
export async function crearMesa(formData: FormData): Promise<ResultadoConMesas> {
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

  const { data, error } = await createAdminClient()
    .from("reservas_mesas")
    .insert({
      org_id: orgId,
      nombre,
      capacidad,
      zona: texto(formData.get("zona")) || null,
      forma: texto(formData.get("forma")) || "redonda",
      ...sitio,
    })
    .select(COLUMNAS);

  if (error) {
    console.error("[salón] no se pudo crear la mesa:", error.message);
    // 23505 aquí solo puede ser el nombre repetido: es lo único único.
    if ((error as any).code === "23505") {
      return { ok: false, error: `Ya tienes una mesa llamada «${nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar la mesa. Intenta de nuevo." };
  }

  return { ok: true, mesas: (data ?? []) as unknown as Mesa[] };
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

  return { ok: true };
}

/** Cambia los datos de una mesa. */
export async function editarMesa(formData: FormData): Promise<ResultadoConMesas> {
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

  const { data, error } = await createAdminClient()
    .from("reservas_mesas")
    .update({
      nombre,
      capacidad,
      zona: texto(formData.get("zona")) || null,
      forma: texto(formData.get("forma")) || "redonda",
      // La casilla no manda nada cuando está desmarcada, así que «no vino» es
      // «desactivada». Leerlo al revés desactivaría mesas al guardar.
      activa: texto(formData.get("activa")) === "si",
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select(COLUMNAS);

  if (error) {
    console.error("[salón] no se pudo editar la mesa:", error.message);
    if ((error as any).code === "23505") {
      return { ok: false, error: `Ya tienes una mesa llamada «${nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar el cambio." };
  }

  return { ok: true, mesas: (data ?? []) as unknown as Mesa[] };
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

  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════════
 * LOS TURNOS Y LOS AJUSTES.
 *
 * El salón sin turnos es un dibujo: no hay «a qué hora» donde meter a nadie.
 * ════════════════════════════════════════════════════════════════════════════ */

export type Turno = {
  id: string; nombre: string; hora: string; dias: number[];
  duracion_min: number; confirma_sola: boolean; activo: boolean; orden: number;
};

const COL_TURNO = "id, nombre, hora, dias, duracion_min, confirma_sola, activo, orden";

export type ResultadoConTurnos =
  | { ok: true; turnos: Turno[] }
  | { ok: false; error: string };

/** Los días marcados en el formulario. 0 = domingo. */
function diasDelFormulario(formData: FormData): number[] {
  return [...new Set(
    formData.getAll("dias")
      .map((v) => Number(String(v ?? "").trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  )].sort();
}

/** "19:00" o "7:00 PM" → "19:00". `null` si no se entiende. */
function horaValida(v: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Lo que comprueban por igual crear y editar.
 *
 * ── UN TURNO SIN DÍAS NO SE GUARDA ────────────────────────────────────────
 *
 * La lógica trata «ningún día marcado» como «este turno no existe ningún día»,
 * a propósito. Pero dejar GUARDARLO así es distinto: el dueño vería su turno en
 * la lista, con su hora, y ninguna reserva entraría nunca por él. Un turno que
 * se ve y no funciona es peor que uno que no se pudo guardar.
 */
function revisarTurno(formData: FormData):
  | { ok: true; nombre: string; hora: string; dias: number[]; duracion: number; confirmaSola: boolean; activo: boolean }
  | { ok: false; error: string } {
  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "El turno necesita un nombre. Por ejemplo: «Primer turno»." };

  const hora = horaValida(texto(formData.get("hora")));
  if (!hora) return { ok: false, error: "Pon una hora válida, como 19:00." };

  const dias = diasDelFormulario(formData);
  if (!dias.length) return { ok: false, error: "Marca al menos un día, o este turno no aceptaría reservas nunca." };

  const duracion = Math.round(numero(formData.get("duracion_min")) || 120);
  if (!Number.isFinite(duracion) || duracion < 15 || duracion > 480) {
    return { ok: false, error: "La duración tiene que estar entre 15 minutos y 8 horas." };
  }

  return {
    ok: true, nombre, hora, dias, duracion,
    confirmaSola: texto(formData.get("confirma_sola")) === "si",
    activo: texto(formData.get("activo")) === "si",
  };
}

export async function crearTurno(formData: FormData): Promise<ResultadoConTurnos> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const v = revisarTurno(formData);
  if (!v.ok) return v;

  const { data, error } = await createAdminClient()
    .from("reservas_turnos")
    .insert({
      org_id: orgId,
      nombre: v.nombre, hora: v.hora, dias: v.dias,
      duracion_min: v.duracion, confirma_sola: v.confirmaSola, activo: v.activo,
    })
    .select(COL_TURNO);

  if (error) {
    console.error("[turnos] no se pudo crear:", error.message);
    if ((error as any).code === "23505") {
      return { ok: false, error: `Ya tienes un turno llamado «${v.nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar el turno." };
  }
  return { ok: true, turnos: (data ?? []) as unknown as Turno[] };
}

export async function editarTurno(formData: FormData): Promise<ResultadoConTurnos> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Falta el turno." };

  const v = revisarTurno(formData);
  if (!v.ok) return v;

  const { data, error } = await createAdminClient()
    .from("reservas_turnos")
    .update({
      nombre: v.nombre, hora: v.hora, dias: v.dias,
      duracion_min: v.duracion, confirma_sola: v.confirmaSola, activo: v.activo,
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select(COL_TURNO);

  if (error) {
    console.error("[turnos] no se pudo editar:", error.message);
    if ((error as any).code === "23505") {
      return { ok: false, error: `Ya tienes un turno llamado «${v.nombre}».` };
    }
    return { ok: false, error: "No se pudo guardar el cambio." };
  }
  return { ok: true, turnos: (data ?? []) as unknown as Turno[] };
}

/**
 * Borra un turno.
 *
 * NO SE BORRA SI TIENE RESERVAS POR DELANTE — y aquí la base ya ayuda:
 * `reservas.turno_id` tiene `on delete restrict`, así que aunque este código
 * fallara, Postgres se niega. Esta comprobación existe para dar un motivo que
 * se entienda en vez de un error de llave foránea.
 */
export async function borrarTurno(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const id = texto(formData.get("id"));
  if (!id) return { ok: false, error: "Falta el turno." };

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { count, error: errMirar } = await admin
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("turno_id", id)
    .gte("fecha", hoy);

  if (errMirar) {
    console.error("[turnos] no pude mirar si tiene reservas:", errMirar.message);
    return { ok: false, error: "No pude comprobar si ese turno tiene reservas. No lo borré." };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Ese turno tiene ${count} reserva(s) por delante. Apágalo en vez de borrarlo: las reservas que ya hay siguen en pie y no entran nuevas.`,
    };
  }

  const { error } = await admin.from("reservas_turnos").delete().eq("id", id).eq("org_id", orgId);
  if (error) {
    console.error("[turnos] no se pudo borrar:", error.message);
    return { ok: false, error: "No se pudo borrar el turno." };
  }
  return { ok: true };
}

/** Los ajustes del complemento: recordatorio, grupo grande, mesas juntas. */
export async function guardarAjustes(formData: FormData): Promise<Resultado> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: "No pude identificar tu cuenta." };

  const horas = Math.round(numero(formData.get("recordatorio_horas")) || 24);
  if (!Number.isFinite(horas) || horas < 1 || horas > 72) {
    return { ok: false, error: "El recordatorio puede salir entre 1 y 72 horas antes." };
  }
  const grupoGrande = Math.round(numero(formData.get("grupo_grande")) || 12);
  if (!Number.isFinite(grupoGrande) || grupoGrande < 2 || grupoGrande > 100) {
    return { ok: false, error: "El tope de grupo grande tiene que estar entre 2 y 100." };
  }
  const juntas = Math.round(numero(formData.get("max_mesas_juntas")) || 3);
  if (!Number.isFinite(juntas) || juntas < 1 || juntas > 4) {
    return { ok: false, error: "Se pueden juntar entre 1 y 4 mesas." };
  }

  const { error } = await createAdminClient()
    .from("reservas_ajustes")
    .upsert(
      {
        org_id: orgId,
        recordatorio_horas: horas,
        recordatorio_activo: texto(formData.get("recordatorio_activo")) === "si",
        grupo_grande: grupoGrande,
        max_mesas_juntas: juntas,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );

  if (error) {
    console.error("[reservas] no se pudieron guardar los ajustes:", error.message);
    return { ok: false, error: "No se pudieron guardar los ajustes." };
  }
  return { ok: true };
}
