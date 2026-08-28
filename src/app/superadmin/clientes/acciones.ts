"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { reenviarFactura } from "@/lib/billing/facturas";
import { crearCliente, nuevaContrasenaTemporal } from "@/lib/clientes/alta";
import { anotarComoYo } from "@/lib/bitacora";
import { abrirSoporte } from "@/lib/soporte";

/**
 * Cada acción vuelve a comprobar el permiso aunque el marco de /superadmin ya
 * lo haga: una acción de servidor se puede invocar por su propia dirección sin
 * pasar por ninguna pantalla.
 */
async function soyDelEquipo(): Promise<boolean> {
  const { data } = await createClient().rpc("is_platform_admin");
  return !!data;
}

/** Reenvía una factura al correo del cliente. */
export async function reenviar(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const id = String(formData.get("factura_id") ?? "");
  const org = String(formData.get("org_id") ?? "");
  if (!id) return;

  const r = await reenviarFactura(id);

  // El resultado viaja en la dirección, no en un estado del servidor: así
  // sobrevive a la recarga. Si Stripe se negó, se enseña SU mensaje —
  // inventar un «listo» es cómo alguien acaba jurándole a un cliente que le
  // mandó algo que nunca salió.
  const q = r.ok ? "enviada=1" : `error=${encodeURIComponent(r.error)}`;
  revalidatePath(`/superadmin/clientes/${org}`);
  redirect(`/superadmin/clientes/${org}?${q}`);
}

/**
 * Alta manual de un cliente.
 *
 * LA CLAVE TEMPORAL VIAJA EN LA DIRECCIÓN Y NO SE GUARDA EN NINGUNA PARTE.
 * Es fea pero es lo correcto: guardarla en la base para «poder consultarla
 * después» sería justo lo que estamos evitando. Se enseña una vez, quien dio
 * el alta se la dicta al cliente, y al recargar ya no está.
 */
export async function crear(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const { data: { user } } = await createClient().auth.getUser();

  const r = await crearCliente({
    empresa: String(formData.get("empresa") ?? ""),
    contactoNombre: String(formData.get("contacto") ?? ""),
    email: String(formData.get("email") ?? ""),
    telefono: String(formData.get("telefono") ?? ""),
    notas: String(formData.get("notas") ?? ""),
    creadoPor: user?.id ?? null,
  });

  if (!r.ok) {
    redirect(`/superadmin/clientes/nuevo?error=${encodeURIComponent(r.error)}`);
  }

  await anotarComoYo({
    orgId: r.orgId,
    accion: "dio de alta un cliente",
    detalle: { empresa: String(formData.get("empresa") ?? ""), correo: String(formData.get("email") ?? "") },
  });

  revalidatePath("/superadmin/clientes");
  redirect(`/superadmin/clientes/${r.orgId}?clave=${encodeURIComponent(r.contrasena)}`);
}

/** Le genera otra clave temporal al dueño de una cuenta. */
export async function restablecer(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const org = String(formData.get("org_id") ?? "");
  if (!org) return;

  const r = await nuevaContrasenaTemporal(org);

  // Se anota SIEMPRE, salga bien o mal, y el cliente lo ve. Cambiarle la
  // contraseña a alguien sin que quede rastro es justo lo que no puede pasar.
  await anotarComoYo({
    orgId: org,
    accion: r.ok ? "generó una contraseña temporal para el dueño" : "intentó generar una contraseña temporal",
    detalle: r.ok ? {} : { error: r.error },
    visibleParaElCliente: true,
  });

  const q = r.ok
    ? `clave=${encodeURIComponent(r.contrasena)}&reset=1`
    : `error=${encodeURIComponent(r.error)}`;

  revalidatePath(`/superadmin/clientes/${org}`);
  redirect(`/superadmin/clientes/${org}?${q}`);
}

/**
 * Entra a la cuenta de un cliente para dar soporte.
 *
 * Manda al panel del CLIENTE, no a otra pantalla del superadmin: la idea es
 * ver lo que él ve. El aviso de que estás dentro de una cuenta ajena lo pinta
 * el marco del panel y no se puede quitar.
 */
export async function entrarComoSoporte(formData: FormData): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const org = String(formData.get("org_id") ?? "");
  if (!org) return;

  const r = await abrirSoporte(user.id, org);
  if (!r.ok) {
    redirect(`/superadmin/clientes/${org}?error=${encodeURIComponent(r.error)}`);
  }
  redirect("/dashboard");
}

/**
 * ELIMINAR UNA CUENTA DE CLIENTE. Definitivo.
 *
 * POR QUÉ TIENE TANTOS FRENOS. Borrar una organización arrastra en cascada 47
 * tablas: sus contactos, sus conversaciones, sus mensajes, sus chatbots, su
 * conocimiento, sus integraciones. No hay deshacer y no hay papelera. Un clic
 * de más aquí no se parece a ningún otro clic de más de la plataforma.
 *
 * Lo que SÍ sobrevive, a propósito: las facturas, los eventos de cobro y las
 * comisiones. Esos no son datos del cliente, son la contabilidad de Demandu —
 * y borrar contabilidad porque un cliente se fue es cómo se pierde un año de
 * historia sin darse cuenta. Sus claves foráneas se ponen a NULL, no en cascada.
 *
 * LOS TRES FRENOS:
 *
 *   1. Hay que escribir el nombre del negocio EXACTO. No es teatro: es lo único
 *      que distingue «quería borrar esta» de «tenía otra fila seleccionada».
 *   2. No se puede borrar una cuenta que está pagando. Primero se cancela; si
 *      se borra directamente, deja de facturarse sin que nadie lo decida.
 *   3. No puedes borrar una cuenta de la que tú eres miembro. Es el clásico de
 *      quedarte fuera de tu propia organización sin manera de volver a entrar.
 *
 * Queda apuntado en la bitácora ANTES de borrar: si se apuntara después, un
 * fallo a mitad dejaría el borrado hecho y sin rastro de quién lo pidió.
 */
export async function eliminarCliente(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const org = String(formData.get("org_id") ?? "").trim();
  const confirmacion = String(formData.get("confirmacion") ?? "").trim();
  const volverA = `/superadmin/clientes/${org}`;
  if (!org) return;

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data: cuenta } = await admin
    .from("organizations")
    .select("id, name, estado_cobro")
    .eq("id", org)
    .maybeSingle();

  if (!cuenta) redirect("/superadmin/clientes?error=" + encodeURIComponent("Esa cuenta ya no existe."));

  if (confirmacion !== cuenta.name) {
    redirect(
      volverA + "?error=" +
        encodeURIComponent(`Para eliminarla hay que escribir su nombre exacto: «${cuenta.name}».`),
    );
  }

  if (cuenta.estado_cobro === "activa") {
    redirect(
      volverA + "?error=" +
        encodeURIComponent("Esta cuenta está pagando. Cancélale la suscripción primero y luego elimínala."),
    );
  }

  const { data: { user } } = await createClient().auth.getUser();
  const { data: soyMiembro } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", org)
    .eq("user_id", user?.id ?? "")
    .is("soporte_hasta", null)
    .maybeSingle();

  if (soyMiembro) {
    redirect(
      volverA + "?error=" +
        encodeURIComponent("Perteneces a esta cuenta con tu propio usuario: si la borras, te quedas fuera."),
    );
  }

  await anotarComoYo({
    accion: "eliminó una cuenta de cliente",
    detalle: { org_id: org, negocio: cuenta.name, estado_cobro: cuenta.estado_cobro },
  });

  const { error } = await admin.from("organizations").delete().eq("id", org);
  if (error) {
    redirect(volverA + "?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/superadmin/clientes");
  redirect("/superadmin/clientes?aviso=" + encodeURIComponent(`Se eliminó «${cuenta.name}».`));
}
