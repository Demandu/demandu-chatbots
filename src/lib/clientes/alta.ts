import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Alta manual de un cliente por el equipo de Demandu o por un vendedor.
 *
 * EL CASO REAL: se cierra la venta por teléfono o por WhatsApp y hay que
 * dejarle la cuenta lista al cliente ahí mismo, sin que él tenga que
 * registrarse ni esperar un correo — que además hoy no sabemos enviar.
 */

/**
 * Alfabeto sin caracteres que se confunden al dictarlos.
 *
 * Fuera: O y 0, I y l y 1, S y 5, B y 8. Esta clave se va a leer en voz alta
 * por teléfono a alguien que la escribe a mano; una `l` que era un `1` son
 * cinco minutos de llamada y una persona convencida de que la plataforma
 * está rota.
 */
const ALFABETO = "ACDEFGHJKMNPQRTUVWXYZ2346789";

/** Clave temporal de un solo uso. Aleatoriedad criptográfica, no `Math.random`. */
export function contrasenaTemporal(largo = 10): string {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  // El sesgo del módulo aquí es despreciable y la clave dura un solo inicio
  // de sesión — pero la fuente sí tiene que ser criptográfica, porque de esta
  // clave cuelga el acceso a las conversaciones de un negocio entero.
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export type Alta =
  | { ok: true; orgId: string; userId: string; contrasena: string }
  | { ok: false; error: string };

export type DatosDeAlta = {
  empresa: string;
  contactoNombre?: string | null;
  email: string;
  telefono?: string | null;
  notas?: string | null;
  /** Quién lo dio de alta. De aquí sale después su comisión. */
  creadoPor?: string | null;
};

/**
 * Crea la cuenta del cliente y devuelve su clave temporal.
 *
 * La organización, el embudo y los estados NO se crean aquí: los crea el
 * disparador `handle_new_user` al nacer el usuario, igual que en un registro
 * normal. Duplicar ese trabajo sería tener dos caminos de alta que se
 * separarían el día que alguien cambie uno — que es exactamente cómo el alta
 * de clientes nuevos llevaba meses rota sin que nadie lo notara.
 *
 * Por eso se le pasa el nombre del negocio en `user_metadata.negocio`: el
 * disparador lo lee, nombra la organización y la marca como confirmada, así
 * el cliente no aterriza en la pantalla de bienvenida pidiéndole un dato que
 * nosotros ya sabemos.
 */
export async function crearCliente(d: DatosDeAlta): Promise<Alta> {
  const email = (d.email ?? "").trim().toLowerCase();
  const empresa = (d.empresa ?? "").trim();

  if (!empresa) return { ok: false, error: "Falta el nombre de la empresa." };
  if (!email || !email.includes("@")) return { ok: false, error: "Ese correo no es válido." };

  const admin = createAdminClient();
  const contrasena = contrasenaTemporal();

  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password: contrasena,
    // Se da por bueno el correo: lo dictó el cliente en la llamada y hoy no
    // tenemos forma de mandarle una confirmación. Sin esto no podría entrar.
    email_confirm: true,
    user_metadata: { negocio: empresa, name: (d.contactoNombre ?? "").trim() || undefined },
  });

  if (error || !creado?.user) {
    const m = error?.message ?? "";
    // El mensaje de Supabase es en inglés y no dice qué hacer.
    if (/already|registered|exists/i.test(m)) {
      return { ok: false, error: "Ya existe una cuenta con ese correo. Búscala en la lista de clientes." };
    }
    return { ok: false, error: m || "No se pudo crear la cuenta." };
  }

  const userId = creado.user.id;

  // El disparador ya creó la organización. Se busca por su membresía en vez de
  // adivinar el `slug`: si mañana cambia cómo se arma, esto sigue funcionando.
  const { data: mem } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();

  const orgId = mem?.org_id ?? null;
  if (!orgId) {
    return {
      ok: false,
      error: "Se creó el usuario pero no su organización. Avísale al equipo técnico antes de reintentar.",
    };
  }

  await admin
    .from("organizations")
    .update({
      contacto_nombre: (d.contactoNombre ?? "").trim() || null,
      contacto_email: email,
      contacto_telefono: (d.telefono ?? "").trim() || null,
      notas_internas: (d.notas ?? "").trim() || null,
      creado_por: d.creadoPor ?? null,
    })
    .eq("id", orgId);

  await admin
    .from("memberships")
    .update({ debe_cambiar_contrasena: true })
    .eq("user_id", userId);

  return { ok: true, orgId, userId, contrasena };
}

export type Reset = { ok: true; contrasena: string; email: string } | { ok: false; error: string };

/**
 * Le genera otra clave temporal al dueño de una cuenta.
 *
 * Esto NO es «ver su contraseña»: la anterior queda inservible. Quien lo haga
 * tiene que decírselo al cliente, porque a partir de este momento su clave
 * vieja ya no entra.
 */
export async function nuevaContrasenaTemporal(orgId: string): Promise<Reset> {
  const admin = createAdminClient();

  // Al dueño, no a cualquiera del equipo del cliente: restablecerle la clave a
  // un empleado suyo sin que él lo sepa no nos toca.
  const { data: mem } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .maybeSingle();

  if (!mem?.user_id) return { ok: false, error: "Esta cuenta no tiene un dueño con acceso." };

  const contrasena = contrasenaTemporal();
  const { data, error } = await admin.auth.admin.updateUserById(mem.user_id, { password: contrasena });
  if (error) return { ok: false, error: error.message };

  await admin
    .from("memberships")
    .update({ debe_cambiar_contrasena: true })
    .eq("user_id", mem.user_id);

  return { ok: true, contrasena, email: data?.user?.email ?? "" };
}
