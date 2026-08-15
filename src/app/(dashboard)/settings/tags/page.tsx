import { createClient } from "@/lib/supabase/server";
import { createTag, deleteTag } from "../actions";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const { data } = await createClient().from("tags").select("*").order("created_at");
  const tags = (data ?? []) as any[];

  return (
    <div>
      <form action={createTag} className="mb-6 flex items-end gap-3 rounded-2xl border border-surface-border bg-surface-card p-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-muted">Nombre de la etiqueta</label>
          <input name="name" required placeholder="lead-caliente" className="input" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Color</label>
          <input type="color" name="color" defaultValue="#F64A97" className="h-11 w-14 cursor-pointer rounded-lg border border-surface-border bg-surface-raised" />
        </div>
        <button className="btn-primary">Crear etiqueta</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-full border border-surface-border bg-surface-card px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            <span className="text-sm text-white">{t.name}</span>
            <form action={deleteTag}>
              <input type="hidden" name="id" value={t.id} />
              <button className="text-muted-2 transition hover:text-danger" title="Eliminar">✕</button>
            </form>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="text-sm text-muted-2">Aún no tienes etiquetas. Crea la primera arriba 👆</p>
        )}
      </div>
    </div>
  );
}
