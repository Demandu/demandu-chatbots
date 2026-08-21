import { createClient } from "@/lib/supabase/server";
import { createTag, deleteTag } from "../actions";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const { data } = await createClient().from("tags").select("*").order("created_at");
  const tags = (data ?? []) as any[];

  return (
    <div>
      <form action={createTag} className="mb-6 flex items-end gap-3 rounded-2xl border border-linea bg-tarjeta p-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre de la etiqueta</label>
          <input name="name" required placeholder="lead-caliente" className="input-l" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-2">Color</label>
          <input type="color" name="color" defaultValue="#F64A97" className="h-11 w-14 cursor-pointer rounded-lg border border-linea-2 bg-tarjeta" />
        </div>
        <button className="btn-primary">Crear etiqueta</button>
      </form>

      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-full border border-linea bg-tarjeta px-3 py-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
            <span className="text-sm text-ink">{t.name}</span>
            <form action={deleteTag}>
              <input type="hidden" name="id" value={t.id} />
              <button className="text-ink-3 transition hover:text-danger" title="Eliminar">✕</button>
            </form>
          </div>
        ))}
        {tags.length === 0 && (
          <p className="text-sm text-ink-3">Aún no tienes etiquetas. Crea la primera arriba 👆</p>
        )}
      </div>
    </div>
  );
}
