"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anotarComoYo } from "@/lib/bitacora";
import { correoDeBienvenida } from "@/lib/correo/plantillas";
import { leerPlantilla } from "@/lib/correo/guardadas";
import { enviarYApuntar } from "@/lib/correo/enviar";
import { personaDe, negociosDe } from "@/lib/correo/buscarPersona";
import {
  opcionesDeSupabase,
  opcionDeBienvenida,
  esTipoDeReenvio,
  etiquetaDeReenvio,
  mensajeDeExito,
  falloEnHumano,
  NOMBRES,
} from "@/lib/correo/reenviar";

/**
 * REENVIAR UN CORREO A ALGUIEN QUE DICE QUE NO LE LLEGÓ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DESTINO NO SE ESCRIBE: SALE DE LA BASE. El formulario manda el `id` de la
 * persona (y el del negocio, para la bienvenida); la dirección la lee el
 * servidor. Un campo «mandar a:» sería un sitio donde un día se pega la
 * dirección equivocada, y un correo con un enlace de acceso que le llega a
 * otro es una cuenta abierta para un extraño.
 *
 * SE VUELVE A DECIDIR AQUÍ SI SE PUEDE. Que la pantalla no pinte el botón no
 * impide mandar el formulario a mano.
 *
 * LOS TRES DE SUPABASE LOS MANDA SUPABASE, con sus plantillas y su SMTP de
 * Google — los mismos que salen al registrarse. Aquí solo se le pide que los
 * mande otra vez. NO se genera ningún enlace a mano: se decidió (3 oct) no
 * tener un «copiar enlace», porque ese enlace abre la cuenta de la persona.
 *
 * TODO QUEDA APUNTADO DOS VECES: en `correos_enviados` (lo ve la tabla de
 * «Últimos correos», salga o no) y en la bitácora (quién lo pidió).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PANTALLA = "/superadmin/correos";

async function soyDelEquipo(): Promise<boolean> {
  const { data } = await createClient().rpc("is_platform_admin");
  return !!data;
}

/** El mismo sitio desde el que se pulsa: un enlace de una vista previa vuelve a la vista previa. */
function dominioActual(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "platform.demandu.tech";
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

function volver(correo: string, extra: Record<string, string>): never {
  const q = new URLSearchParams({ buscar: correo, ...extra });
  revalidatePath(PANTALLA);
  redirect(`${PANTALLA}?${q.toString()}#reenviar`);
}

export async function reenviarCorreo(formData: FormData): Promise<void> {
  if (!(await soyDelEquipo())) return;

  const userId = String(formData.get("persona") ?? "").trim();
  const tipo = formData.get("tipo");
  const orgId = String(formData.get("negocio") ?? "").trim();
  if (!userId || !esTipoDeReenvio(tipo)) redirect(PANTALLA);

  const admin = createAdminClient();
  const { data: { user: yo } } = await createClient().auth.getUser();

  const { data: hallado, error: errUsuario } = await admin.auth.admin.getUserById(userId);
  const persona = hallado?.user;
  if (errUsuario || !persona?.email) {
    redirect(`${PANTALLA}?fallo=${encodeURIComponent("No encontré a esa persona. Búscala otra vez.")}`);
  }
  const correo = persona.email!;

  // ── La bienvenida: la manda la plataforma, al contacto del negocio ─────
  if (tipo === "bienvenida") {
    const negocio = (await negociosDe(admin, userId)).find((n) => n.id === orgId);
    if (!negocio) volver(correo, { noSalio: "Ese negocio no es de esta persona." });
    const opcion = opcionDeBienvenida(negocio!);
    if (!opcion.vale) volver(correo, { noSalio: opcion.nota });

    // LA MARCA, POR SI LA TAREA TODAVÍA NO SE LA HABÍA MANDADO. Sin esto, la
    // tarea de cada cinco minutos le mandaría otra igual detrás de ésta.
    await admin
      .from("organizations")
      .update({ bienvenida_enviada_at: new Date().toISOString() })
      .eq("id", negocio!.id)
      .is("bienvenida_enviada_at", null);

    const panel = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.demandu.tech").replace(/\/+$/, "")}/dashboard`;
    const para = String(negocio!.contacto_email);
    const r = await enviarYApuntar(admin, {
      para,
      correo: correoDeBienvenida({
        nombre: negocio!.contacto_nombre,
        negocio: negocio!.name,
        panel,
        plantilla: await leerPlantilla(admin, "bienvenida"),
      }),
      etiqueta: etiquetaDeReenvio("bienvenida"),
      orgId: negocio!.id,
      quien: yo?.id ?? null,
    });

    await anotarComoYo({
      orgId: negocio!.id,
      accion: r.ok ? "reenvió el correo de bienvenida" : "intentó reenviar el correo de bienvenida",
      detalle: { para, ...(r.ok ? {} : { error: r.error }) },
    });

    volver(correo, r.ok ? { reenviado: mensajeDeExito("bienvenida", para) } : { noSalio: r.error });
  }

  // ── Los tres de Supabase ───────────────────────────────────────────────
  const opcion = opcionesDeSupabase(personaDe(persona), new Date()).find((o) => o.tipo === tipo);
  if (!opcion?.vale) volver(correo, { noSalio: opcion?.nota ?? "Ese correo no se le puede reenviar." });

  const dominio = dominioActual();
  let error: string | null = null;

  if (tipo === "confirmar") {
    // Va a `/login`: abrir el enlace confirma la cuenta en Supabase, y lo que
    // le queda a la persona es entrar con la contraseña que ya eligió.
    const { error: e } = await admin.auth.resend({
      type: "signup",
      email: correo,
      options: { emailRedirectTo: `${dominio}/auth/callback?next=/login` },
    });
    error = e?.message ?? null;
  } else if (tipo === "invitacion") {
    // La misma llamada y el mismo destino que la pantalla de Equipo. A una
    // invitación sin aceptar, Supabase se la vuelve a mandar.
    const { error: e } = await admin.auth.admin.inviteUserByEmail(correo, {
      redirectTo: `${dominio}/auth/callback?next=/crear-contrasena`,
    });
    error = e?.message ?? null;
  } else if (tipo === "contrasena") {
    // El cliente de administración usa el flujo implícito: el enlace trae la
    // sesión consigo y sirve en cualquier navegador — igual que el que se pide
    // desde «¿Olvidaste tu contraseña?», que va al mismo sitio.
    const { error: e } = await admin.auth.resetPasswordForEmail(correo, {
      redirectTo: `${dominio}/auth/callback?next=${encodeURIComponent("/crear-contrasena?motivo=recuperar")}`,
    });
    error = e?.message ?? null;
  }

  const motivo = error ? falloEnHumano(error) : null;

  try {
    await admin.from("correos_enviados").insert({
      org_id: null,
      para: correo,
      asunto: `${NOMBRES[tipo as keyof typeof NOMBRES]} (reenviado, lo manda Supabase)`,
      etiqueta: etiquetaDeReenvio(tipo as any),
      enviado: !error,
      proveedor_id: null,
      error: motivo,
      enviado_por: yo?.id ?? null,
    });
  } catch (e) {
    console.error("[reenvio] salió pero no pude apuntarlo:", e);
  }

  await anotarComoYo({
    accion: error
      ? `intentó reenviar «${NOMBRES[tipo as keyof typeof NOMBRES]}»`
      : `reenvió «${NOMBRES[tipo as keyof typeof NOMBRES]}»`,
    detalle: { para: correo, ...(error ? { error } : {}) },
  });

  volver(correo, motivo ? { noSalio: motivo } : { reenviado: mensajeDeExito(tipo as any, correo) });
}
