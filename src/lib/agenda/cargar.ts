import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessTokenForOrg, listarEventos } from "@/lib/integrations/google";
import { zonaDelNegocio } from "@/lib/agenda";
import { agendaDelNegocio, type CitaEnLaVista } from "./vista";

/**
 * LO QUE ENSEÑA LA PANTALLA DE CALENDARIO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CALENDARIOS SE MIRAN.
 *
 * Los que el negocio haya elegido (`organizations.calendarios_visibles`). Sin
 * elección: el principal, más aquellos donde la plataforma ya agendó.
 *
 * NUNCA todos por defecto. La primera versión sí lo hacía, y el primer día puso
 * en pantalla «Ultrasonido estructural Darwin Bracho» y un cumpleaños — en una
 * pantalla que abre el vendedor. El calendario de trabajo de cualquiera lleva
 * médicos y colegios, porque un calendario es de una persona antes que de una
 * empresa. Ver la migración 0115.
 *
 * ── NO SE PUDO MIRAR ≠ NO HAY NADA ────────────────────────────────────────
 *
 * Si no se puede leer la conexión o Google no contesta, se dice. Decir «no
 * tienes citas» con la conexión rota manda al negocio a buscar un problema que
 * no existe — y es el fallo que esta misma pantalla ya tuvo una vez, mirando un
 * calendario de tres y afirmando que no había nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CalendarioSuyo = { id: string; nombre: string; visible: boolean };

export type LaAgenda = {
  ok: boolean;
  motivo?: "sin_agenda" | "no_se_pudo_leer";
  citas: CitaEnLaVista[];
  calendarios: CalendarioSuyo[];
  zona: string;
};

const VACIA = (motivo: LaAgenda["motivo"], zona = "UTC"): LaAgenda => ({
  ok: false, motivo, citas: [], calendarios: [], zona,
});

export async function cargarAgenda(
  orgId: string,
  desde: Date,
  hasta: Date,
): Promise<LaAgenda> {
  const admin = createAdminClient();
  const zona = (await zonaDelNegocio(orgId)) || "UTC";

  const token = await getValidAccessTokenForOrg(admin, orgId);
  if (!token) return VACIA("sin_agenda", zona);

  const [{ data: conexion, error: errConexion }, { data: org, error: errOrg }] = await Promise.all([
    admin.from("integrations").select("data").eq("org_id", orgId).eq("provider", "google_calendar").maybeSingle(),
    admin.from("organizations").select("calendarios_visibles").eq("id", orgId).maybeSingle(),
  ]);
  // Sin saber cuáles son suyos no se puede enseñar media agenda y afirmar que
  // eso es todo. Ver la cabecera.
  if (errConexion || errOrg) return VACIA("no_se_pudo_leer", zona);

  const suyos = (((conexion?.data as any)?.calendars ?? []) as any[])
    .filter((c) => c?.accessRole === "owner" && String(c?.id ?? "").trim())
    .map((c) => ({ id: String(c.id), nombre: String(c?.summary ?? c.id) }));

  const { data: filas, error: errCitas } = await admin
    .from("citas")
    .select("evento_id, calendario, contact_id, conversation_id, nombre, correo, estado")
    .eq("org_id", orgId)
    .gte("inicio", desde.toISOString())
    .lte("inicio", hasta.toISOString());

  // Si falla la tabla se sigue: se pierde el «quién agendó», no la agenda.
  const citas = errCitas ? [] : (filas ?? []);
  const dondeSeAgenda = new Set<string>();
  for (const c of citas) {
    const cal = String((c as any)?.calendario ?? "").trim();
    if (cal) dondeSeAgenda.add(cal);
  }

  const elegidos = (org?.calendarios_visibles ?? null) as string[] | null;
  const visible = (id: string) =>
    elegidos ? elegidos.includes(id) : id === "primary" || dondeSeAgenda.has(id);

  // El principal puede llamarse por su correo y no «primary», así que un
  // negocio sin elección vería vacío. Se marca el que Google dice que es el
  // principal, que es el dato bueno.
  const idPrimario = (((conexion?.data as any)?.calendars ?? []) as any[])
    .find((c) => c?.primary)?.id;

  const calendarios: CalendarioSuyo[] = suyos.map((c) => ({
    ...c,
    visible: elegidos ? elegidos.includes(c.id) : c.id === idPrimario || dondeSeAgenda.has(c.id),
  }));

  const aMirar = new Set(calendarios.filter((c) => c.visible).map((c) => c.id));
  // Donde ya se agenda se mira siempre: si hay una cita apuntada ahí, esa
  // reunión existe aunque el calendario ya no salga en la lista.
  for (const c of dondeSeAgenda) aMirar.add(c);
  if (aMirar.size === 0) aMirar.add("primary");
  void visible;

  const tandas = await Promise.all(
    [...aMirar].map((cal) => listarEventos(token, cal, desde.toISOString(), hasta.toISOString())),
  );
  if (tandas.every((t) => t === null)) return { ...VACIA("no_se_pudo_leer", zona), calendarios };

  // El mismo evento puede venir dos veces si un calendario está compartido con
  // otro. Dos tarjetas para una reunión se lee como un fallo.
  const vistos = new Set<string>();
  const eventos = tandas
    .flatMap((t) => t ?? [])
    .filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)));

  return { ok: true, citas: agendaDelNegocio(eventos, citas as any), calendarios, zona };
}
