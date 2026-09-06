import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { anotar, type Actor } from "@/lib/bitacora";

/**
 * Entrar a la cuenta de un cliente para darle soporte.
 *
 * ES LA FUNCIÓN MÁS PELIGROSA DE LA PLATAFORMA y conviene tratarla como tal:
 * abre a propósito un agujero en el aislamiento del que depende todo lo demás.
 * Cuatro cosas la mantienen honesta:
 *
 * 1. **Caduca sola.** Se crea una membresía con fecha de vencimiento y la
 *    caducidad se comprueba EN LA BASE, dentro de `auth_org_ids()`. No hay
 *    forma de que quede una puerta abierta porque a alguien se le olvidó
 *    cerrarla, ni de saltársela con una consulta a mano.
 *
 * 2. **Con los permisos del miembro, no con los del dueño.** Entra con lo que
 *    su ficha dice que puede ver. Un vendedor que solo tiene «conversaciones»
 *    no ve la facturación del cliente.
 *
 * 3. **Un partner necesita que el cliente lo haya aceptado.** El equipo de
 *    Demandu es el proveedor y está en el contrato; una agencia externa no.
 *
 * 4. **Queda apuntado y el cliente lo ve.** Entrar y salir dejan línea en la
 *    bitácora, marcada como visible para el cliente.
 */

/** Cuánto dura un acceso. Suficiente para resolver algo, poco para olvidarlo. */
const MINUTOS = 60;

export type Apertura =
  | { ok: true; hasta: string }
  | { ok: false; error: string };

export async function abrirSoporte(userId: string, orgId: string): Promise<Apertura> {
  const admin = createAdminClient();

  const [{ data: miembro }, { data: esAdmin }] = await Promise.all([
    admin.from("equipo_demandu").select("*").eq("user_id", userId).eq("activo", true).maybeSingle(),
    admin.rpc("is_platform_admin_de", { p_user: userId }),
  ]);

  if (!miembro && !esAdmin) return { ok: false, error: "No eres del equipo de Demandu." };

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, atendido_por, soporte_partner_ok, datos_borrados_at")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) return { ok: false, error: "Esa cuenta no existe." };
  if (org.datos_borrados_at) {
    return { ok: false, error: "Esa cuenta pidió el borrado de sus datos. No se entra." };
  }

  // Quién puede entrar a qué.
  if (miembro && !esAdmin) {
    const suyo = org.atendido_por === miembro.id;

    if (miembro.tipo === "partner") {
      if (!suyo) return { ok: false, error: "Ese cliente no es tuyo." };
      if (!org.soporte_partner_ok) {
        return {
          ok: false,
          error:
            "Este cliente todavía no autorizó a su partner a entrar. Tiene que activarlo él desde su " +
            "Configuración; nadie puede activarlo por él.",
        };
      }
    } else if (miembro.alcance !== "todas" && !suyo) {
      return { ok: false, error: "Ese cliente no está en tu cartera." };
    }
  }

  // ¿YA PERTENECE A ESTA CUENTA POR DERECHO PROPIO?
  //
  // Este caso parece raro y es el primero que iba a ocurrir: el dueño de
  // Demandu es dueño de su propia organización, y esa es justo la cuenta que
  // tiene a mano para probar el botón.
  //
  // Sin esta comprobación, abrir soporte sobre una cuenta donde ya eres
  // miembro PISA tu membresía real: el `upsert` la convertiría en un acceso
  // temporal de solo lectura, y al salir —que borra la fila— te quedarías
  // fuera de tu propia organización para siempre. Un clic curioso a cambio de
  // perder la cuenta.
  const { data: yaEsta } = await admin
    .from("memberships")
    .select("role, soporte_hasta")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (yaEsta && yaEsta.soporte_hasta === null) {
    return {
      ok: false,
      error:
        "Ya perteneces a esta cuenta con tu propio usuario, así que no necesitas entrar como soporte: " +
        "ábrela normal desde el panel.",
    };
  }

  // UNA CUENTA A LA VEZ. Entrar a la de otro cliente sin salir de la anterior
  // dejaba DOS accesos abiertos, y con dos el aviso rojo «estás dentro de la
  // cuenta de X» desaparecía —lo pinta una consulta que espera una sola fila—.
  // Sin aviso no hay botón de salir: el acceso al primer cliente seguía vivo,
  // invisible, hasta caducar solo una hora después.
  //
  // Se cierra el anterior aquí, y la base lo impide además con un índice único
  // (migración 0084) por si algún día se llama a esto desde otro sitio.
  await admin
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .not("soporte_hasta", "is", null)
    .neq("org_id", orgId);

  const hasta = new Date(Date.now() + MINUTOS * 60_000).toISOString();

  // Se entra como 'viewer' y encima se aplican los permisos de su ficha. Se
  // parte de lo MÍNIMO a propósito: si un día la ficha llega vacía o rota, el
  // fallo es «no ve casi nada», no «lo ve todo».
  const { error } = await admin.from("memberships").upsert(
    {
      org_id: orgId,
      user_id: userId,
      role: "viewer",
      permisos: miembro?.permisos ?? {},
      soporte_hasta: hasta,
      soporte_de: miembro?.id ?? null,
    },
    { onConflict: "org_id,user_id" },
  );

  if (error) return { ok: false, error: error.message };

  const actor: Actor = {
    id: userId,
    nombre: miembro?.nombre ?? "Equipo Demandu",
    email: miembro?.email ?? null,
    tipo: miembro?.tipo === "partner" ? "partner" : "equipo",
  };

  await anotar({
    actor,
    orgId,
    accion: "entró a la cuenta para dar soporte",
    detalle: { hasta, minutos: MINUTOS, permisos: miembro?.permisos ?? {} },
    visibleParaElCliente: true,
  });

  return { ok: true, hasta };
}

/** Sale de la cuenta. Borra la membresía temporal, no la deja caducar. */
export async function cerrarSoporte(userId: string): Promise<{ orgId: string | null }> {
  const admin = createAdminClient();

  const { data: sesion } = await admin
    .from("memberships")
    .select("org_id, soporte_de")
    .eq("user_id", userId)
    .not("soporte_hasta", "is", null)
    .maybeSingle();

  if (!sesion) return { orgId: null };

  await admin
    .from("memberships")
    .delete()
    .eq("user_id", userId)
    .not("soporte_hasta", "is", null);

  const { data: miembro } = await admin
    .from("equipo_demandu")
    .select("nombre, email, tipo")
    .eq("user_id", userId)
    .maybeSingle();

  await anotar({
    actor: {
      id: userId,
      nombre: miembro?.nombre ?? "Equipo Demandu",
      email: miembro?.email ?? null,
      tipo: miembro?.tipo === "partner" ? "partner" : "equipo",
    },
    orgId: sesion.org_id,
    accion: "salió de la cuenta",
    detalle: {},
    visibleParaElCliente: true,
  });

  return { orgId: sesion.org_id };
}

/**
 * ¿Esta persona está ahora mismo dentro de la cuenta de un cliente?
 *
 * Lo usa el marco del panel para pintar el aviso. Devuelve null para un
 * usuario normal, que es el caso de casi todas las cargas.
 */
export async function sesionDeSoporte(
  userId: string,
): Promise<{ orgId: string; negocio: string; hasta: string } | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("memberships")
      .select("org_id, soporte_hasta, organizations(name)")
      .eq("user_id", userId)
      .not("soporte_hasta", "is", null)
      .gt("soporte_hasta", new Date().toISOString())
      .maybeSingle();

    if (!data) return null;
    return {
      orgId: data.org_id as string,
      negocio: (data as any)?.organizations?.name ?? "este cliente",
      hasta: data.soporte_hasta as string,
    };
  } catch {
    return null;
  }
}
