import { createClient } from "@/lib/supabase/server";
import { createState, updateState, deleteState } from "../actions";

export const dynamic = "force-dynamic";

export default async function StatesPage() {
  const { data } = await createClient().from("conversation_states").select("*").order("sort");
  const states = (data ?? []) as any[];

  return (
    <div>
      {/* Agregar nuevo estado */}
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

      {/* Lista editable */}
      <div className="flex flex-col gap-2">
        {states.map((st) => (
          <div key={st.id} className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-card px-3 py-2">
            <form action={updateState} className="flex flex-1 items-center gap-2.5">
              <input type="hidden" name="id" value={st.id} />
              <input
                type="color"
                name="color"
                defaultValue={st.color}
                className="h-8 w-9 flex-none cursor-pointer rounded-md border border-surface-border bg-surface-raised"
                title="Color"
              />
              <input
                name="name"
                defaultValue={st.name}
                className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-white hover:border-surface-border focus:border-pink focus:outline-none"
              />
              {st.is_default && (
                <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
                  Por defecto
                </span>
              )}
              <button className="rounded-lg border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-white">
                Guardar
              </button>
            </form>
            <form action={deleteState}>
              <input type="hidden" name="id" value={st.id} />
              <button className="px-1 text-muted-2 transition hover:text-danger" title="Eliminar">✕</button>
            </form>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-2">
        Edita el nombre o el color y pulsa <b className="text-muted">Guardar</b>. Puedes eliminar cualquier estado con la ✕.
      </p>
    </div>
  );
}
