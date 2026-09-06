import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * La bitácora: quién hizo qué, cuándo y sobre la cuenta de quién.
 *
 * PARA QUÉ EXISTE DE VERDAD. No es para cumplir con nadie: es para poder
 * contestar «¿quién tocó esto?» el día que alguien lo niegue. Sin ella, el
 * acceso de soporte a la cuenta de un cliente —que es lo que viene después—
 * sería una puerta sin cerradura ni mirilla.
 *
 * DOS REGLAS:
 *
 * 1. **Solo se añade.** La tabla no tiene UPDATE ni DELETE para nadie, ni
 *    para la llave de servicio. Una bitácora editable no prueba nada.
 *
 * 2. **Anotar nunca rompe la acción.** Si el apunte falla, la acción del
 *    usuario sigue adelante y el fallo va al registro del servidor. Que
 *    alguien no pueda cancelar su plan porque la bitácora tuvo un mal día
 *    sería absurdo.
 */

export type Actor = {
  id?: string | null;
  nombre?: string | null;
  email?: string | null;
  tipo: "cliente" | "equipo" | "partner" | "sistema";
};

export type Apunte = {
  actor: Actor;
  /** Sobre qué cuenta de cliente. Nulo si la acción no es de un cliente. */
  orgId?: string | null;
  /** Verbo en pasado y en cristiano: "creó un cliente", "entró a la cuenta". */
  accion: string;
  detalle?: Record<string, any>;
  /** ¿El cliente puede ver esta línea en su propia cuenta? */
  visibleParaElCliente?: boolean;
};

/** Datos del navegador que ayudan a reconstruir qué pasó. */
function contexto(): Record<string, string> {
  try {
    const h = headers();
    return {
      // La IP se guarda porque en una disputa es la única forma de distinguir
      // «entró desde la oficina» de «entró alguien con su contraseña».
      ip: h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
      navegador: (h.get("user-agent") ?? "").slice(0, 200),
    };
  } catch {
    return {};
  }
}

/** Deja constancia. Nunca lanza. */
export async function anotar(a: Apunte): Promise<void> {
  try {
    await createAdminClient().from("bitacora").insert({
      actor_id: a.actor.id ?? null,
      actor_nombre: a.actor.nombre ?? null,
      actor_email: a.actor.email ?? null,
      actor_tipo: a.actor.tipo,
      org_id: a.orgId ?? null,
      accion: a.accion,
      detalle: { ...(a.detalle ?? {}), ...contexto() },
      visible_para_el_cliente: !!a.visibleParaElCliente,
    });
  } catch (e) {
    // A propósito no se relanza. La bitácora acompaña a la acción, no la manda.
    console.error("[bitacora]", (e as any)?.message ?? e);
  }
}

/**
 * Quién es quien está haciendo la acción, mirado desde el servidor.
 *
 * Se resuelve aquí y no se recibe por parámetro: si el llamador pudiera decir
 * quién es, la bitácora registraría lo que cada uno diga de sí mismo, que es
 * exactamente lo contrario de lo que hace falta.
 */
export async function actorActual(): Promise<Actor> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return { tipo: "sistema" };

    const { data: miembro } = await createAdminClient()
      .from("equipo_demandu")
      .select("nombre, tipo")
      .eq("user_id", user.id)
      .maybeSingle();

    if (miembro) {
      return {
        id: user.id,
        nombre: miembro.nombre,
        email: user.email ?? null,
        tipo: miembro.tipo === "partner" ? "partner" : "equipo",
      };
    }

    return {
      id: user.id,
      nombre: (user.user_metadata as any)?.name ?? null,
      email: user.email ?? null,
      tipo: "cliente",
    };
  } catch {
    return { tipo: "sistema" };
  }
}

/** Atajo para lo más común: anotar con el actor resuelto solo. */
export async function anotarComoYo(a: Omit<Apunte, "actor">): Promise<void> {
  await anotar({ ...a, actor: await actorActual() });
}
