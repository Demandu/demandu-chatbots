import { createClient } from "@/lib/supabase/server";
import { createTeam, deleteTeam, createMember, deleteMember } from "../actions";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const supabase = createClient();
  const [{ data: teamsData }, { data: membersData }] = await Promise.all([
    supabase.from("teams").select("*").order("created_at"),
    supabase.from("team_members").select("*").order("created_at"),
  ]);
  const teams = (teamsData ?? []) as any[];
  const members = (membersData ?? []) as any[];
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Sin equipo";

  return (
    <div className="space-y-8">
      {/* Equipos */}
      <section>
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Equipos</h3>
        <form action={createTeam} className="mb-4 flex items-end gap-3 rounded-2xl border border-[#e6e8f2] bg-white p-4">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del equipo</label>
            <input name="name" required placeholder="Ventas" className="input-l" />
          </div>
          <button className="btn-primary">Crear equipo</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-full border border-[#e6e8f2] bg-white px-3 py-1.5">
              <span className="text-sm text-ink">👥 {t.name}</span>
              <form action={deleteTeam}>
                <input type="hidden" name="id" value={t.id} />
                <button className="text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
              </form>
            </div>
          ))}
          {teams.length === 0 && <p className="text-sm text-ink-3">Aún no tienes equipos.</p>}
        </div>
      </section>

      {/* Miembros */}
      <section>
        <h3 className="mb-3 font-display text-base font-semibold text-ink">Miembros</h3>
        <form action={createMember} className="mb-4 rounded-2xl border border-[#e6e8f2] bg-white p-4">
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
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Email</label>
              <input name="email" type="email" placeholder="ana@empresa.com" className="input-l" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Teléfono</label>
              <input name="phone" placeholder="+52 55 1234 5678" className="input-l" />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary">Agregar miembro</button>
          </div>
        </form>

        <div className="overflow-hidden rounded-2xl border border-[#e6e8f2]">
          <table className="w-full text-sm">
            <thead className="bg-[#f4f5fb] text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Nombre</th>
                <th className="px-4 py-2.5 text-left font-semibold">Email</th>
                <th className="px-4 py-2.5 text-left font-semibold">Teléfono</th>
                <th className="px-4 py-2.5 text-left font-semibold">Equipo</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-[#e6e8f2] bg-white">
                  <td className="px-4 py-2.5 font-medium text-ink">{m.name}</td>
                  <td className="px-4 py-2.5 text-ink-2">{m.email || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{m.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{teamName(m.team_id)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={deleteMember}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
                    </form>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                    Aún no tienes miembros. Agrega el primero arriba 👆
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
