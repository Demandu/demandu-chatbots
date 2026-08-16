import { createClient } from "@/lib/supabase/server";
import { createState, updateState, deleteState } from "../actions";

export const dynamic = "force-dynamic";

export default async function StatesPage() {
  const { data } = await createClient().from("conversation_states").select("*").order("sort");
  const states = (data ?? []) as any[];

  return (
    <div>
      {/* Agregar nuevo estado */}
      <form action={createState} className="mb-6 flex items-end gap-3 rounded-2xl border border-[#e6e8f2] bg-white p-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nuevo estado</label>
          <input name="name" required placeholder="En negociación" className="input-l" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Color</label>
          <input type="color" name="color" defaultValue="#3A85FF" className="h-11 w-14 cursor-pointer rounded-lg border border-[#e2e4f0] bg-white" />
        </div>
        <button className="btn-primary">Agregar estado</button>
      </form>

      {/* Lista editable */}
      <div className="flex flex-col gap-2">
        {states.map((st) => (
          <div key={st.id} className="flex items-center gap-2 rounded-xl border border-[#e6e8f2] bg-white px-3 py-2">
            <form action={updateState} className="flex flex-1 items-center gap-2.5">
              <input type="hidden" name="id" value={st.id} />
              <input
                type="color"
                name="color"
                defaultValue={st.color}
                className="h-8 w-9 flex-none cursor-pointer rounded-md border border-[#e2e4f0] bg-white"
                title="Color"
              />
              <input
                name="name"
                defaultValue={st.name}
                className="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-medium text-ink hover:border-[#e2e4f0] focus:border-pink focus:outline-none"
              />
              {st.is_default && (
                <span className="rounded-md bg-[#f1f2f9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                  Por defecto
                </span>
              )}
              <button className="btn-soft px-3 py-1.5 text-xs">
                Guardar
              </button>
            </form>
            <form action={deleteState}>
              <input type="hidden" name="id" value={st.id} />
              <button className="px-1 text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
            </form>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-3">
        Edita el nombre o el color y pulsa <b className="text-ink-2">Guardar</b>. Puedes eliminar cualquier estado con la ✕.
      </p>
    </div>
  );
}
