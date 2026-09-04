"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aplicarDescuento, quitarDescuento, type Descuento } from "@/lib/billing/descuentos";
// `anotarComoYo` pone solo quién fue: aquí SIEMPRE es una persona del equipo
// con sesión, y armar el actor a mano en cada acción es cómo se acaba con la
// mitad de la bitácora diciendo «Equipo Demandu» sin nombre.
import { anotarComoYo } from "@/lib/bitacora";

/**
 * Los tratos: días gratis, funciones regaladas y descuentos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRES COSAS DISTINTAS QUE LA GENTE LLAMA IGUAL. «Regálale un mes» significa
 * una cosa u otra según quién sea el cliente, y confundirlas cuesta dinero:
 *
 *   · NO PAGA TODAVÍA  → se le alarga la prueba. Es una fecha nuestra.
 *   · YA PAGA          → hace falta un cupón en Stripe. Alargarle la prueba no
 *                        hace NADA: Stripe le cobra igual el día que toca.
 *   · Quiere probar una función → se le regala con fecha, y caduca sola.
 *
 * TODO QUEDA EN LA BITÁCORA. Dentro de tres meses alguien va a preguntar por
 * qué este cliente tiene la tienda gratis, y la respuesta no puede ser «ni
 * idea». Se apunta qué, cuánto, por qué y quién.
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function soloDemandu() {
  const supabase = createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) redirect("/dashboard");
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

const ruta = (orgId: string) => `/superadmin/clientes/${orgId}`;

function dias(v: FormDataEntryValue | null): number {
  const n = Math.floor(Number(String(v ?? "").trim()));
  // TOPE DE UN AÑO. No por desconfianza: un dedazo de 3650 en vez de 365 no se
  // nota al escribirlo y se descubre cuando alguien mira los ingresos.
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 0;
}

/**
 * Le alarga la prueba.
 *
 * SE SUMA A LO QUE LE QUEDE, no se pisa. Si le quedaban 5 días y le regalas 30,
 * son 35 — quitarle los 5 que ya tenía sería un regalo que resta.
 *
 * Y SE AVISA SI YA PAGA: en ese caso esto no hace nada útil y el trato hay que
 * hacerlo con un descuento. Es el error más fácil de cometer en esta pantalla.
 */
export async function regalarDias(formData: FormData): Promise<void> {
  await soloDemandu();
  const orgId = String(formData.get("org_id") ?? "");
  const cuantos = dias(formData.get("dias"));
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!orgId || !cuantos) {
    redirect(`${ruta(orgId)}?error=${encodeURIComponent("Pon cuántos días.")}`);
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, estado_cobro, prueba_termina_at, stripe_subscription_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) redirect(`${ruta(orgId)}?error=${encodeURIComponent("No encuentro esa cuenta.")}`);

  if (org.estado_cobro === "activa" && org.stripe_subscription_id) {
    redirect(
      `${ruta(orgId)}?error=${encodeURIComponent(
        "Este cliente YA PAGA por Stripe: alargarle la prueba no le ahorra nada, se le cobrará igual. " +
          "Para regalarle tiempo, usa «Mes gratis» aquí abajo.",
      )}`,
    );
  }

  const desde = org.prueba_termina_at ? new Date(org.prueba_termina_at) : new Date();
  const base = desde > new Date() ? desde : new Date();
  const hasta = new Date(base.getTime() + cuantos * 86_400_000);

  await admin
    .from("organizations")
    .update({ prueba_termina_at: hasta.toISOString(), estado_cobro: "prueba" })
    .eq("id", orgId);

  await anotarComoYo({
    orgId,
    accion: `regaló ${cuantos} días de prueba`,
    detalle: { dias: cuantos, hasta: hasta.toISOString(), motivo: motivo || null },
    visibleParaElCliente: false,
  });

  revalidatePath(ruta(orgId));
  redirect(`${ruta(orgId)}?hecho=${encodeURIComponent(`Le quedan hasta el ${hasta.toLocaleDateString("es")}.`)}`);
}

/**
 * Le regala una función por un tiempo.
 *
 * CON FECHA SIEMPRE. Sin fecha, el «te lo dejo un mes a ver si te sirve» se
 * convierte en gratis de por vida en cuanto a alguien se le olvida quitarlo —
 * que es siempre. La caducidad la aplica la base al preguntar, no una tarea
 * programada que un día no corre.
 */
export async function regalarFuncion(formData: FormData): Promise<void> {
  const { userId } = await soloDemandu();
  const orgId = String(formData.get("org_id") ?? "");
  const clave = String(formData.get("clave") ?? "").trim();
  const cuantos = dias(formData.get("dias"));
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!orgId || !clave || !cuantos) {
    redirect(`${ruta(orgId)}?error=${encodeURIComponent("Elige la función y cuántos días.")}`);
  }

  const hasta = new Date(Date.now() + cuantos * 86_400_000);

  const { error } = await createAdminClient()
    .from("org_regalos")
    // RENOVAR ES CORRER LA FECHA, no acumular filas: con dos, «hasta cuándo lo
    // tiene» dejaría de tener una sola respuesta.
    .upsert(
      { org_id: orgId, tipo: "feature", clave, hasta: hasta.toISOString(), motivo: motivo || null, quien: userId },
      { onConflict: "org_id,clave" },
    );

  if (error) {
    redirect(`${ruta(orgId)}?error=${encodeURIComponent("No se pudo guardar: " + error.message)}`);
  }

  await anotarComoYo({
    orgId,
    accion: `regaló «${clave}» por ${cuantos} días`,
    detalle: { clave, dias: cuantos, hasta: hasta.toISOString(), motivo: motivo || null },
    visibleParaElCliente: false,
  });

  revalidatePath(ruta(orgId));
  redirect(`${ruta(orgId)}?hecho=${encodeURIComponent(`Lo tiene hasta el ${hasta.toLocaleDateString("es")}.`)}`);
}

/** Se lo quita antes de tiempo. */
export async function quitarRegalo(formData: FormData): Promise<void> {
  await soloDemandu();
  const orgId = String(formData.get("org_id") ?? "");
  const clave = String(formData.get("clave") ?? "");
  if (!orgId || !clave) return;

  await createAdminClient().from("org_regalos").delete().eq("org_id", orgId).eq("clave", clave);

  await anotarComoYo({
    orgId,
    accion: `quitó el regalo de «${clave}»`,
    detalle: { clave },
    visibleParaElCliente: false,
  });

  revalidatePath(ruta(orgId));
}

/**
 * Descuento o meses gratis, en Stripe.
 *
 * VA A STRIPE Y NO A NUESTRA BASE. Quien cobra es Stripe: un descuento apuntado
 * solo aquí haría que la pantalla dijera «-30%» mientras la tarjeta del cliente
 * sigue cobrando el precio entero.
 */
export async function darDescuento(formData: FormData): Promise<void> {
  await soloDemandu();
  const orgId = String(formData.get("org_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  const meses = Math.floor(Number(String(formData.get("meses") ?? "1"))) || 1;
  const porcentaje = Math.floor(Number(String(formData.get("porcentaje") ?? "0"))) || 0;
  const siempre = formData.get("siempre") !== null;
  const motivo = String(formData.get("motivo") ?? "").trim();

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, stripe_subscription_id, estado_cobro")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.stripe_subscription_id) {
    redirect(
      `${ruta(orgId)}?error=${encodeURIComponent(
        "Este cliente todavía no paga por Stripe, así que no hay a qué aplicarle el descuento. " +
          "Alárgale la prueba en su lugar.",
      )}`,
    );
  }

  const d: Descuento =
    tipo === "mes_gratis"
      ? { tipo: "mes_gratis", meses }
      : { tipo: "porcentaje", porcentaje, meses: siempre ? null : meses };

  const r = await aplicarDescuento(org.stripe_subscription_id, d);
  if (!r.ok) redirect(`${ruta(orgId)}?error=${encodeURIComponent(r.error)}`);

  await anotarComoYo({
    orgId,
    accion: "aplicó un descuento",
    detalle: { ...d, cupon: r.cuponId, explicacion: r.explicacion, motivo: motivo || null },
    visibleParaElCliente: false,
  });

  revalidatePath(ruta(orgId));
  redirect(`${ruta(orgId)}?hecho=${encodeURIComponent(r.explicacion)}`);
}

/** Le quita el descuento que tenga en Stripe. */
export async function quitarSuDescuento(formData: FormData): Promise<void> {
  await soloDemandu();
  const orgId = String(formData.get("org_id") ?? "");

  const { data: org } = await createAdminClient()
    .from("organizations")
    .select("stripe_subscription_id")
    .eq("id", orgId)
    .maybeSingle();

  if (!org?.stripe_subscription_id) return;

  const r = await quitarDescuento(org.stripe_subscription_id);
  if (!r.ok) redirect(`${ruta(orgId)}?error=${encodeURIComponent(r.error ?? "No se pudo.")}`);

  await anotarComoYo({
    orgId,
    accion: "quitó el descuento",
    detalle: {},
    visibleParaElCliente: false,
  });

  revalidatePath(ruta(orgId));
}
