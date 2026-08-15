import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { createBot, deleteBot } from "./actions";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const { data } = await createClient()
    .from("bots")
    .select("*")
    .order("created_at", { ascending: false });
  const bots = (data ?? []) as any[];

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Constructor · Mis bots</span>} />
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Mis bots</h2>
            <p className="mt-1 text-muted">Diseña, prueba y publica tus flujos conversacionales.</p>
          </div>
          <form action={createBot} className="flex items-end gap-2">
            <input name="name" placeholder="Nombre del bot" className="input w-56" />
            <button className="btn-primary">
              <Plus className="h-4 w-4" /> Nuevo bot
            </button>
          </form>
        </div>

        {bots.length === 0 ? (
          <div className="card grid place-items-center p-12 text-center">
            <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-pink/20 to-violet/20 text-2xl">🤖</div>
            <h3 className="font-display text-lg font-semibold text-white">Crea tu primer bot</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-2">
              Ponle un nombre arriba y dale “Nuevo bot”. Se abrirá el Constructor con un flujo de ejemplo listo para editar.
            </p>
          </div>
        ) : (
          <div className="grid max-w-4xl grid-cols-1 gap-3.5 md:grid-cols-2">
            {bots.map((b) => (
              <div key={b.id} className="card group relative p-5 transition hover:border-pink">
                <Link href={`/bots/${b.id}`} className="block">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-semibold text-muted">Flujo</span>
                    <span
                      className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        b.status === "published" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {b.status === "published" ? "Publicado" : "Borrador"}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-white">{b.name}</h3>
                  <p className="mt-1 text-sm text-muted-2">Abrir en el Constructor →</p>
                </Link>
                <form action={deleteBot} className="absolute right-4 top-4 opacity-0 transition group-hover:opacity-100">
                  <input type="hidden" name="id" value={b.id} />
                  <button className="text-muted-2 transition hover:text-danger" title="Eliminar bot">✕</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
