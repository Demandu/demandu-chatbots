import { createClient } from "@/lib/supabase/server";
import { createLeadGroup, deleteLeadGroup } from "../actions";

export const dynamic = "force-dynamic";

export default async function LeadGroupsPage() {
  const { data } = await createClient().from("lead_groups").select("*").order("created_at");
  const groups = (data ?? []) as any[];

  return (
    <div>
      <form action={createLeadGroup} className="mb-6 rounded-2xl border border-linea bg-tarjeta p-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre del grupo</label>
            <input name="name" required placeholder="Clientes frecuentes" className="input-l" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Color</label>
            <input type="color" name="color" defaultValue="#6E42FF" className="h-11 w-14 cursor-pointer rounded-lg border border-linea-2 bg-tarjeta" />
          </div>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Descripción (opcional)</label>
            <input name="description" placeholder="Compran cada mes" className="input-l" />
          </div>
          <button className="btn-primary">Crear grupo</button>
        </div>
      </form>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-start gap-3 rounded-xl border border-linea bg-tarjeta p-3.5">
            <span className="mt-1 h-3 w-3 flex-none rounded-full" style={{ background: g.color }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{g.name}</div>
              {g.description && <div className="text-xs text-ink-3">{g.description}</div>}
            </div>
            <form action={deleteLeadGroup}>
              <input type="hidden" name="id" value={g.id} />
              <button className="text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
            </form>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-ink-3">Aún no tienes grupos de leads. Crea el primero arriba 👆</p>
        )}
      </div>
    </div>
  );
}
