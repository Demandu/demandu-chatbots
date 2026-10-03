import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { Tablero } from "@/components/crm/Tablero";
import { tableroVacio, type Tablero as TableroTipo } from "@/lib/crm";
import { KanbanSquare, Settings2 } from "lucide-react";
import { misPermisos } from "@/lib/permisos-server";
import { ordenarEtapas } from "@/lib/enBloque";

export const dynamic = "force-dynamic";

export default async function EmbudoPage() {
  const sb = createClient();
  const orgId = await getCurrentOrgId();

  const res = orgId ? await sb.rpc("crm_board", { p_org: orgId, p_limite: 50 }) : null;
  const tablero: TableroTipo = (res?.data as TableroTipo) ?? tableroVacio();

  /* ── LO QUE NECESITA LA BARRA DE «VARIAS A LA VEZ» ──────────────────────
   *
   * Mueve tarjetas y conversaciones, así que solo para quien puede. Esconder
   * la barra NO es prohibirla —una acción de servidor se llama a mano— y por
   * eso `enBloque.ts` vuelve a comprobar el permiso en cada acción. Esto es
   * para no ofrecer lo que después se va a negar.
   *
   * Y filtrado por cuenta A MANO: con dos accesos abiertos (soporte en la
   * cuenta de un cliente), RLS deja ver las dos.
   *
   * `outcome` viene a propósito: es lo que deja saber que una etapa CIERRA la
   * venta, para preguntar antes con el número delante. */
  const { permisos } = await misPermisos();
  const puedeEnBloque = !!orgId && permisos.has("conversaciones");
  const [mem, tg, st] = puedeEnBloque
    ? await Promise.all([
        sb.from("team_members").select("id,name").eq("org_id", orgId!).order("name"),
        sb.from("tags").select("id,name,color").eq("org_id", orgId!).order("name"),
        sb
          .from("conversation_states")
          .select("id,name,color,sort,outcome,pipeline:pipelines(name,sort)")
          .eq("org_id", orgId!)
          .order("sort"),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const vacio =
    !(tablero.columnas ?? []).length ||
    (tablero.columnas ?? []).every((c) => (c.total ?? 0) === 0);

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Embudo</span>} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Embudo</h1>
            <p className="mt-1 text-sm text-ink-2">
              Cada persona que te escribe entra aquí como una tarjeta. Arrástrala según avance la venta.
            </p>
          </div>
          <Link href="/settings/states" className="btn-soft">
            <Settings2 className="h-4 w-4" /> Etapas y embudos
          </Link>
        </div>

        {vacio && (
          <div className="mb-5 flex gap-3 rounded-2xl border border-linea-2 bg-tarjeta p-5">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-violet/12 text-violet">
              <KanbanSquare className="h-5 w-5" />
            </span>
            <div className="text-sm leading-relaxed text-ink-2">
              <b className="text-ink">Tu embudo está listo, solo le faltan clientes.</b>
              <p className="mt-1">
                No tienes que crear las tarjetas a mano: en cuanto alguien escriba a uno de tus
                chatbots, aparece aquí sola. Si la misma persona vuelve a escribir no se duplica —
                se crea una tarjeta nueva solo cuando la anterior ya se ganó o se perdió.
              </p>
            </div>
          </div>
        )}

        {orgId ? (
          <Tablero
            inicial={tablero}
            orgId={orgId}
            enBloque={
              puedeEnBloque
                ? {
                    miembros: (mem.data as any[]) ?? [],
                    etiquetas: (tg.data as any[]) ?? [],
                    etapas: ordenarEtapas((st.data as any[]) ?? []) as any,
                  }
                : null
            }
          />
        ) : (
          <p className="text-sm text-ink-2">Inicia sesión para ver tu embudo.</p>
        )}
      </div>
    </>
  );
}
