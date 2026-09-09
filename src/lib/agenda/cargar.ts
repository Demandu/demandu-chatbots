import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessTokenForOrg, listarEventos } from "@/lib/integrations/google";
import { agendaDelNegocio, type CitaEnLaVista } from "./vista";

/**
 * LO QUE ENSEÑA LA PANTALLA DE CALENDARIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CALENDARIOS SE MIRAN, Y POR QUÉ NO TODOS.
 *
 * Una cuenta de Google trae suscritos los festivos del país, los cumpleaños de
 * los contactos y los calendarios que le hayan compartido. Volcar todo eso en
 * un panel de trabajo no es «enseñar tu agenda»: es enseñar su vida privada en
 * una pantalla que abren sus empleados.
 *
 * Se miran dos cosas y nada más:
 *   · `primary` — su calendario de trabajo, donde está lo que él apuntó.
 *   · Los calendarios donde la plataforma ya ha agendado (`citas.calendario`),
 *     que son, por definición, los que él eligió para esto.
 *
 * ── NO SE PUDO MIRAR ≠ NO HAY NADA ────────────────────────────────────────
 *
 * Si Google falla se devuelve `null` en `citas` y un motivo. La pantalla dice
 * «no se pudo leer tu calendario», que señala qué arreglar. Decir «no tienes
 * citas» cuando la conexión está rota es exactamente el fallo que esta semana
 * hizo que tres pantallas le mintieran a un cliente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type LaAgenda =
  | { ok: true; citas: CitaEnLaVista[]; desde: string; hasta: string }
  | { ok: false; motivo: "sin_agenda" | "no_se_pudo_leer" };

export async function cargarAgenda(orgId: string, dias = 30): Promise<LaAgenda> {
  const admin = createAdminClient();

  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) return { ok: false, motivo: "sin_agenda" };

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(desde.getTime() + dias * 86400000);

  // Las citas de la plataforma en esa ventana. Se piden con el cliente admin
  // porque hace falta el `calendario` para saber dónde mirar, y de paso el
  // correo y el contacto para poder escribirle.
  const { data: filas, error: errCitas } = await admin
    .from("citas")
    .select("evento_id, calendario, contact_id, conversation_id, nombre, correo, estado")
    .eq("org_id", orgId)
    .gte("inicio", desde.toISOString())
    .lte("inicio", hasta.toISOString());

  // Si falla la tabla se sigue: se perdería el «quién agendó», no la agenda.
  // Enseñarla sin esa marca es peor que no enseñarla, pero mucho mejor que una
  // pantalla en blanco.
  const citas = errCitas ? [] : (filas ?? []);

  const calendarios = new Set<string>(["primary"]);
  for (const c of citas) {
    const cal = String((c as any)?.calendario ?? "").trim();
    if (cal) calendarios.add(cal);
  }

  const tandas = await Promise.all(
    [...calendarios].map((cal) =>
      listarEventos(token, cal, desde.toISOString(), hasta.toISOString()),
    ),
  );

  // TODAS fallaron = no se pudo mirar. Que falle una de tres no puede vaciar la
  // pantalla: se enseña lo que sí se pudo leer.
  if (tandas.every((t) => t === null)) return { ok: false, motivo: "no_se_pudo_leer" };

  // El mismo evento puede venir dos veces si un calendario está compartido con
  // otro. Se queda uno: dos tarjetas para una reunión se lee como un fallo.
  const vistos = new Set<string>();
  const eventos = tandas
    .flatMap((t) => t ?? [])
    .filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)));

  return {
    ok: true,
    citas: agendaDelNegocio(eventos, citas as any),
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
  };
}
