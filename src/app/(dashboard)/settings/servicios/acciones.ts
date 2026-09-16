"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { MIN_MINUTOS, MAX_MINUTOS } from "@/lib/duracionDeLaCita";

const RUTA = "/settings/servicios";

const texto = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Minutos que el negocio escribió, o `null` si lo que puso no sirve. */
function minutos(v: FormDataEntryValue | null): number | null {
  const n = Math.round(Number(String(v ?? "").replace(",", ".")));
  if (!Number.isFinite(n) || n < MIN_MINUTOS || n > MAX_MINUTOS) return null;
  return n;
}

/** Los buffers son opcionales y 0 es un valor legítimo, no «vacío». */
function buffer(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(String(v ?? "0").replace(",", ".")));
  return Number.isFinite(n) && n >= 0 && n <= 240 ? n : 0;
}

/**
 * El precio se guarda en CENTAVOS, siempre.
 *
 * Guardar «1250.50» como número con decimales es cómo se pierden centavos en
 * los redondeos del reporte de fin de mes. Se escribe en pesos porque es lo que
 * el negocio entiende, y se guarda en enteros porque es lo que no miente.
 */
function centavos(v: FormDataEntryValue | null): number | null {
  const t = String(v ?? "").replace(/[^\d.,]/g, "").replace(",", ".").trim();
  if (!t) return null;
  const n = Math.round(Number(t) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const volver = (error?: string) =>
  redirect(error ? `${RUTA}?error=${encodeURIComponent(error)}` : `${RUTA}?ok=1`);

export async function guardarServicio(formData: FormData) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return volver("Tu sesión caducó. Vuelve a entrar.");

  const nombre = texto(formData.get("nombre"));
  if (!nombre) return volver("Ponle un nombre al servicio.");

  const dur = minutos(formData.get("duracion_min"));
  if (dur === null) {
    return volver(
      `La duración tiene que estar entre ${MIN_MINUTOS} minutos y ${MAX_MINUTOS} (un día entero).`,
    );
  }

  const fila = {
    org_id: orgId,
    nombre,
    descripcion: texto(formData.get("descripcion")) || null,
    duracion_min: dur,
    buffer_antes_min: buffer(formData.get("buffer_antes_min")),
    buffer_despues_min: buffer(formData.get("buffer_despues_min")),
    precio_centavos: centavos(formData.get("precio")),
    moneda: texto(formData.get("moneda")).toUpperCase().slice(0, 3) || null,
    updated_at: new Date().toISOString(),
  };

  const id = texto(formData.get("id"));
  const sb = createClient();
  const { error } = id
    ? await sb.from("servicios").update(fila).eq("id", id).eq("org_id", orgId)
    : await sb.from("servicios").insert(fila);

  if (error) {
    // 23505 = el índice único de (cuenta, nombre). Es un error de dedo
    // frecuente y decirlo en cristiano evita que lo intente cinco veces.
    const repetido = (error as any)?.code === "23505";
    console.error("[servicios] no se pudo guardar:", error.message);
    return volver(
      repetido
        ? `Ya tienes un servicio que se llama «${nombre}». Ponle otro nombre o edita el que existe.`
        : "No se pudo guardar el servicio. Inténtalo otra vez.",
    );
  }

  revalidatePath(RUTA);
  volver();
}

/**
 * Encender o apagar un servicio.
 *
 * ── APAGAR, NO BORRAR ──────────────────────────────────────────────────────
 *
 * Es la acción principal a propósito. Un servicio que ya tiene citas hechas no
 * debería desaparecer del panel solo porque este mes no se ofrece: apagarlo lo
 * saca de lo que el chatbot ofrece y lo deja donde estaba.
 */
export async function alternarServicio(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const id = texto(formData.get("id"));
  if (!orgId || !id) return;
  await createClient()
    .from("servicios")
    .update({ activo: texto(formData.get("activo")) !== "true", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);
  revalidatePath(RUTA);
}

/**
 * Borrar un servicio NO borra su historia.
 *
 * `citas.servicio_id` es `on delete set null`, y la cita se quedó con el
 * NOMBRE, la DURACIÓN y el PRECIO copiados el día que se agendó (migración
 * 0126). Así que «cuánto facturó María en agosto» sigue dando lo mismo aunque
 * el servicio ya no exista — que es exactamente por lo que se congelan.
 */
export async function borrarServicio(formData: FormData) {
  const orgId = await getCurrentOrgId();
  const id = texto(formData.get("id"));
  if (!orgId || !id) return;
  const { error } = await createClient().from("servicios").delete().eq("id", id).eq("org_id", orgId);
  if (error) console.error("[servicios] no se pudo borrar:", error.message);
  revalidatePath(RUTA);
}
