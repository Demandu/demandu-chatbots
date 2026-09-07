import { createAdminClient } from "@/lib/supabase/admin";
import { llamadaDeTareaProgramada } from "@/lib/cron";
import { correoDeBienvenida } from "@/lib/correo/plantillas";
import { enviarYApuntar } from "@/lib/correo/enviar";

export const dynamic = "force-dynamic";

/**
 * EL CORREO DE BIENVENIDA, POR TAREA PROGRAMADA Y NO AL REGISTRARSE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO EVIDENTE SERÍA MANDARLO EN EL MOMENTO DEL ALTA. No se puede, y por una
 * razón concreta: **el alta ocurre dentro de la base**. Un negocio nace en
 * `provisionar_negocio`, que la llama un disparador de Postgres cuando aparece
 * el usuario — y eso pasa igual si entró por Facebook, por Apple, por el
 * formulario o por una invitación. Postgres no manda correos.
 *
 * Se podría enganchar en la pantalla de bienvenida… pero por ahí no pasan
 * todos: quien se registra escribiendo el nombre de su negocio va directo al
 * panel. Enganchar en dos sitios distintos es garantizar que un día uno de los
 * dos deje de mandarlo, y nadie se entera — porque nadie echa de menos un
 * correo que no sabe que existe.
 *
 * Una tarea que mira «quién nació y todavía no lo recibió» los coge a TODOS,
 * venga cada uno por donde venga, hoy y con las puertas que se añadan mañana.
 *
 * ── EL PRECIO ES EL RETRASO, Y ES ACEPTABLE ───────────────────────────────
 *
 * Llega minutos después de registrarse en vez de al instante. Para un correo
 * que dice «conecta tu WhatsApp cuando puedas», eso no cambia nada. Para el de
 * confirmar la cuenta sí lo cambiaría todo — y por eso ése lo manda Supabase en
 * el momento y no pasa por aquí.
 *
 * ── LA MARCA SE PONE ANTES DE MANDAR ──────────────────────────────────────
 *
 * Si se pusiera después, dos ejecuciones solapadas —o un reintento tras un
 * fallo a mitad— le mandarían dos bienvenidas a la misma persona. Se prefiere
 * perder un correo a mandarlo dos veces: lo primero no se nota, lo segundo sí.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cuántos por vuelta. Un tope evita que un pico deje la tarea corriendo diez minutos. */
const POR_VUELTA = 25;

export async function POST(req: Request) {
  if (!(await llamadaDeTareaProgramada(req, "correo_bienvenida"))) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: nuevas, error } = await admin
    .from("organizations")
    .select("id, name, contacto_nombre, contacto_email")
    .is("bienvenida_enviada_at", null)
    // SIN CORREO NO HAY A QUIÉN ESCRIBIRLE. Se quedan fuera de la consulta en
    // vez de intentarlo y fallar: así no llenan la bitácora de errores todos
    // los días con algo que no se puede arreglar solo.
    .not("contacto_email", "is", null)
    .order("created_at", { ascending: true })
    .limit(POR_VUELTA);

  if (error) {
    console.error("[bienvenida] no pude leer las cuentas nuevas:", error.message);
    return Response.json({ error: "no se pudo leer" }, { status: 500 });
  }

  const panel = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.demandu.tech").replace(/\/+$/, "")}/dashboard`;

  let mandados = 0;
  let fallidos = 0;

  for (const org of (nuevas ?? []) as any[]) {
    // La marca PRIMERO. Ver la cabecera: mejor perder uno que mandar dos.
    const { error: errMarca } = await admin
      .from("organizations")
      .update({ bienvenida_enviada_at: new Date().toISOString() })
      .eq("id", org.id)
      .is("bienvenida_enviada_at", null);

    // Si no se pudo marcar, NO se manda. Otra ejecución la cogerá.
    if (errMarca) continue;

    const r = await enviarYApuntar(admin, {
      para: String(org.contacto_email),
      correo: correoDeBienvenida({
        nombre: org.contacto_nombre,
        negocio: org.name,
        panel,
      }),
      etiqueta: "bienvenida",
      orgId: String(org.id),
    });

    if (r.ok) mandados++;
    else fallidos++;
  }

  return Response.json({ ok: true, mandados, fallidos });
}
