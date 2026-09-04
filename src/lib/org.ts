import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { membresiaActiva, type Membresia } from "@/lib/membresia";

/**
 * En qué cuenta estás y con qué rol. El único sitio donde se decide.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE TRAEN TODAS LAS MEMBRESÍAS Y SE ELIGE AQUÍ, EN UN SOLO SITIO. Antes había
 * dos consultas sueltas —una para la organización, otra para los permisos—, cada
 * una con un `.limit(1)` sin orden. Con dos filas (dueño de la propia + soporte
 * en la de un cliente) cada una podía caer en una fila distinta: cuenta del
 * cliente con permisos de dueño. La regla vive en `membresia.ts`, probada.
 *
 * VA ENVUELTO EN `cache()` DE REACT, y no es un detalle: averiguar quién eres
 * cuesta DOS viajes a Supabase (la sesión y luego sus membresías), y varias
 * pantallas lo preguntaban tres veces en el mismo render — seis viajes en fila
 * antes de poder dibujar nada. Ahora, además, la organización y los permisos
 * salen del MISMO viaje y del MISMO objeto: no pueden discrepar.
 *
 * No es una caché entre peticiones: cada visita vuelve a comprobar la sesión,
 * así que no hay riesgo de servirle a alguien la organización de otro.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const membresiaDeLaSesion = cache(async function membresiaDeLaSesion(): Promise<Membresia | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, permisos, soporte_hasta, created_at")
    .eq("user_id", user.id);

  return membresiaActiva((data ?? []) as Membresia[]);
});

/** Devuelve el org_id de la cuenta en la que estás ahora (o null). */
export const getCurrentOrgId = cache(async function getCurrentOrgId(): Promise<string | null> {
  return (await membresiaDeLaSesion())?.org_id ?? null;
});

/**
 * ¿Hay que preguntarle al cliente cómo se llama su negocio?
 *
 * Solo pasa con quien entró por Apple o Facebook: sale a la pantalla del
 * proveedor y vuelve por otra ruta, así que nunca pasó por el formulario donde
 * se pregunta. Su organización nació con un nombre sacado del correo —de
 * `the_alexmolina@icloud.com` sale un negocio llamado "the_alexmolina"— y eso
 * es lo primero que ve al entrar y lo que aparece en su chat.
 *
 * La marca la pone la base al crear la cuenta (`nombre_confirmado`), no se
 * adivina aquí: si intentáramos deducirlo del texto acabaríamos molestando a
 * quien de verdad se llama así.
 *
 * También va con `cache()`: el marco lo pregunta en cada navegación y sin esto
 * sería un viaje extra a Supabase por pantalla.
 */
export const faltaNombreDelNegocio = cache(async function faltaNombreDelNegocio(): Promise<boolean> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return false;
  const { data } = await createClient()
    .from("organizations")
    .select("nombre_confirmado")
    .eq("id", orgId)
    .maybeSingle();
  // Ante la duda, NO molestar: si la consulta falla o la columna todavía no
  // existe, es mejor dejar pasar al cliente que encerrarlo en una pantalla.
  return data?.nombre_confirmado === false;
});
