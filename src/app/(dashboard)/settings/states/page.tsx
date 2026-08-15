import { createClient } from "@/lib/supabase/server";
import { createState, deleteState } from "../actions";

export const dynamic = "force-dynamic";

export default async function StatesPage() {
  const { data } = await createClient().from("conversation_states").select("*").order("sort");
  const states = (data ?? []) as any[];

  return (
    <div>
      <form action={createState} className="mb-6 flex items-end gap-3 rounded-2xl border border-surface-border bg-surface-card p-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-muted">Nuevo estado</label>
          <input name="name" required placeholder="En negociación" className="input" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Color</label>
          <input type="color" name="color" defaultValue="#3A85FF" className="h-11 w-14 cursor-pointer rounded-lg border border-surface-border bg-surface-raised" />
        </div>
        <button className="btn-primary">Agregar estado</button>
      </form>

      <div className="flex flex-col gap-2">
        {states.map((st) => (
          <div key={st.id} className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-card px-3.5 py-2.5">
            <span className="h-3 w-3 flex-none rounded-full" style={{ background: st.color }} />
            <span className="text-sm font-medium text-white">{st.name}</span>
            {st.is_default ? (
              <span className="ml-auto rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
                Por defecto
              </span>
            ) : (
              <form action={deleteState} className="ml-auto">
                <input type="hidden" name="id" value={st.id} />
                <button className="text-muted-2 transition hover:text-danger" title="Eliminar">✕</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
