"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contrasenaTemporal } from "@/lib/clientes/alta";
import { PERMISOS } from "@/lib/permisos";
import { devengarComisiones } from "@/lib/equipo/comisiones";

async function soyDelEquipo(): Promise<boolean> {
  const { data } = await createClient().rpc("is_platform_admin");
  return !!data;
}

/**
 * Da de alta a un vendedor o a un partner.
 *
 * Se le crea usuario con contraseña temporal, igual que a un cliente: la
 * contraseña se ve UNA vez y él la cambia al entrar. Que sea de nuestro equipo
 * no cambia la regla — al revés, un vendedor tiene acceso a la cartera y a las
 * cuentas de clientes, así que importa más todavía que su clave sea suya.
 */
export async function crearMiembro(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const tipo = String(formData.get("tipo") ?? "vendedor");
  // UN PARTNER NUNCA VE TODAS LAS CUENTAS. La base lo impide con un CHECK,
  // pero se fuerza también aquí para que el error no sea una excepción fea
  // sino una decisión explícita y legible.
  const alcance = tipo === "partner" ? "asignadas" : String(formData.get("alcance") ?? "asignadas");

  if (!nombre || !email.includes("@")) {
    redirect("/superadmin/equipo?error=" + encodeURIComponent("Hacen falta un nombre y un correo válido."));
  }

  const admin = createAdminClient();
  const clave = contrasenaTemporal();

  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password: clave,
    email_confirm: true,
    user_metadata: { name: nombre },
  });

  if (error || !creado?.user) {
    const m = /already|registered|exists/i.test(error?.message ?? "")
      ? "Ya existe una cuenta con ese correo."
      : error?.message ?? "No se pudo crear el acceso.";
    redirect("/superadmin/equipo?error=" + encodeURIComponent(m));
  }

  const permisos: Record<string, boolean> = {};
  for (const p of PERMISOS) permisos[p.clave] = formData.get(`permiso_${p.clave}`) === "on";

  const { error: e2 } = await admin.from("equipo_demandu").insert({
    user_id: creado.user.id,
    nombre,
    email,
    tipo,
    alcance,
    permisos,
    comision_pct: formData.get("comision_pct") ? Number(formData.get("comision_pct")) : null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  });

  if (e2) {
    // Si la ficha no se pudo crear, el usuario suelto no sirve para nada y
    // además ocuparía el correo. Se deshace para poder reintentar limpio.
    await admin.auth.admin.deleteUser(creado.user.id).catch(() => {});
    redirect("/superadmin/equipo?error=" + encodeURIComponent(e2.message));
  }

  // Al alta de un miembro NO se le pone la bandera de cambio obligatorio en
  // `memberships`: un vendedor no pertenece a ninguna organización cliente, no
  // tiene fila ahí. Cambia su clave desde su propio panel.
  revalidatePath("/superadmin/equipo");
  redirect(`/superadmin/equipo?clave=${encodeURIComponent(clave)}&quien=${encodeURIComponent(nombre)}`);
}

/** Cambia alcance, porcentaje, permisos o si sigue activo. */
export async function guardarMiembro(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const id = String(formData.get("id") ?? "");
  const tipo = String(formData.get("tipo") ?? "vendedor");
  if (!id) return;

  const permisos: Record<string, boolean> = {};
  for (const p of PERMISOS) permisos[p.clave] = formData.get(`permiso_${p.clave}`) === "on";

  const pct = String(formData.get("comision_pct") ?? "").trim();

  await createAdminClient()
    .from("equipo_demandu")
    .update({
      alcance: tipo === "partner" ? "asignadas" : String(formData.get("alcance") ?? "asignadas"),
      permisos,
      comision_pct: pct === "" ? null : Number(pct),
      activo: formData.get("activo") === "on",
      notas: String(formData.get("notas") ?? "").trim() || null,
    })
    .eq("id", id);

  revalidatePath("/superadmin/equipo");
}

/** Asigna (o quita) un cliente a un miembro del equipo. */
export async function asignarCliente(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const orgId = String(formData.get("org_id") ?? "");
  const miembro = String(formData.get("miembro_id") ?? "");
  if (!orgId) return;

  await createAdminClient()
    .from("organizations")
    .update({ atendido_por: miembro || null })
    .eq("id", orgId);

  revalidatePath("/superadmin/equipo");
  revalidatePath("/superadmin/clientes");
}

/** Recorre las facturas cobradas y apunta lo que falte. */
export async function calcularComisiones(): Promise<void> {
  if (!(await soyDelEquipo())) return;
  await devengarComisiones();
  revalidatePath("/superadmin/equipo");
}

/** Marca como pagadas las comisiones pendientes de un miembro. */
export async function marcarPagadas(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const miembro = String(formData.get("miembro_id") ?? "");
  const referencia = String(formData.get("referencia") ?? "").trim() || null;
  if (!miembro) return;

  // Solo las pendientes. Volver a marcar una ya pagada le cambiaría la fecha
  // y la referencia, y esa fila es el comprobante de un pago que ya ocurrió.
  await createAdminClient()
    .from("comisiones")
    .update({ estado: "pagada", pagada_at: new Date().toISOString(), referencia })
    .eq("miembro_id", miembro)
    .eq("estado", "pendiente");

  revalidatePath("/superadmin/equipo");
}
