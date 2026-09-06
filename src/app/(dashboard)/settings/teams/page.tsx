import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/permisos-server";
import { Personas, type Persona } from "@/components/settings/Personas";
import { createTeam, deleteTeam, createMember } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Equipos y personas.
 *
 * UNA SOLA LISTA DE PERSONAS, no dos. Antes esta pantalla mostraba "miembros"
 * (agentes que reciben chats) y los accesos a la plataforma vivían en ningún
 * sitio: se podía crear a alguien que recibiera conversaciones y no pudiera
 * entrar a verlas. Ahora cada persona es una fila con las dos cosas.
 *
 * `exigir("equipo")` NO ES DECORACIÓN: la barra lateral esconde lo que no te
 * toca, pero cualquiera puede escribir la dirección a mano. Sin esta línea, los
 * permisos serían una sugerencia.
 */
export default async function TeamsPage() {
  await exigir("equipo");

  const supabase = createClient();
  const [{ data: teamsData }, { data: personasData }] = await Promise.all([
    supabase.from("teams").select("id,name").order("created_at"),
    supabase.rpc("personas_de_la_org"),
  ]);

  const teams = (teamsData ?? []) as { id: string; name: string }[];
  const personas = (personasData ?? []) as Persona[];

  return (
    <div className="space-y-8">
      {/* ── Equipos ──────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Equipos</h3>
        <p className="mb-3 text-sm text-ink-3">
          Sirven para repartir las conversaciones por área: Ventas, Soporte, Cobranza.
        </p>
        <form
          action={createTeam}
          className="mb-4 flex items-end gap-3 rounded-2xl border border-linea bg-tarjeta p-4"
        >
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del equipo</label>
            <input name="name" required placeholder="Ventas" className="input-l" />
          </div>
          <button className="btn-primary">Crear equipo</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-full border border-linea bg-tarjeta px-3 py-1.5"
            >
              <span className="text-sm text-ink">👥 {t.name}</span>
              <form action={deleteTeam}>
                <input type="hidden" name="id" value={t.id} />
                <button className="text-ink-3 transition hover:text-danger" title="Eliminar">
                  ✕
                </button>
              </form>
            </div>
          ))}
          {teams.length === 0 && <p className="text-sm text-ink-3">Aún no tienes equipos.</p>}
        </div>
      </section>

      {/* ── Personas ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-1 font-display text-base font-semibold text-ink">Personas</h3>
        <p className="mb-3 text-sm text-ink-3">
          Quién recibe conversaciones y quién puede entrar a la plataforma. Agregar a alguien aquí
          lo pone en el reparto; el acceso a la plataforma se le da aparte, invitándolo por correo.
        </p>

        <form action={createMember} className="mb-5 rounded-2xl border border-linea bg-tarjeta p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre</label>
              <input name="name" required placeholder="Ana Torres" className="input-l" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Equipo</label>
              <select name="team_id" className="input-l">
                <option value="">Sin equipo</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Correo</label>
              <input name="email" type="email" placeholder="ana@empresa.com" className="input-l" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Teléfono</label>
              <input name="phone" placeholder="+52 55 1234 5678" className="input-l" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary">Agregar persona</button>
          </div>
        </form>

        <Personas personas={personas} equipos={teams} />
      </section>
    </div>
  );
}
