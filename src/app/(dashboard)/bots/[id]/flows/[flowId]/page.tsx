import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { FlowBuilder } from "@/components/builder/FlowBuilder";
import { sampleFlow } from "@/lib/flow/sample";
import { createClient } from "@/lib/supabase/server";
import { setFlowTrigger } from "../../../actions";
import { ArrowLeft } from "lucide-react";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

const WA_SELECT = "bot_id, display_number, phone_number_id";

export default async function FlowBuilderPage({ params }: { params: { id: string; flowId: string } }) {
  const supabase = createClient();

  let [{ data: bot }, { data: flowRow }, { data: wa }] = await Promise.all([
    supabase.from("bots").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("flows").select("*").eq("id", params.flowId).maybeSingle(),
    supabase.from("whatsapp_channels").select(WA_SELECT).eq("bot_id", params.id).maybeSingle(),
  ]);

  if (!bot || !flowRow) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && (!bot || !flowRow); i++) {
      await new Promise((r) => setTimeout(r, 120));
      if (!bot) ({ data: bot } = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle());
      if (!flowRow) ({ data: flowRow } = await supabase.from("flows").select("*").eq("id", params.flowId).maybeSingle());
    }
  }
  if (!bot || !flowRow) notFound();

  const graph = (flowRow.graph as any) ?? { nodes: sampleFlow.nodes, edges: sampleFlow.edges };
  const flow: Flow = {
    id: flowRow.id,
    name: flowRow.name ?? bot.name,
    nodes: graph.nodes ?? [],
    edges: graph.edges ?? [],
  };
  const triggerType = (flowRow.trigger_type as string) ?? "welcome";
  const keywords = ((flowRow.keywords as string[]) ?? []).join(", ");

  return (
    <>
      <Topbar
        crumb={
          <span className="inline-flex items-center gap-2">
            <Link href={`/bots/${bot.id}`} className="inline-flex items-center gap-1 text-muted hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> {bot.name}
            </Link>
            <span className="text-muted-2">/</span>
            <span className="font-semibold text-white">{flowRow.name}</span>
          </span>
        }
      />

      <div className="flow-light flex min-h-0 flex-1 flex-col bg-canvas">
      {/* Barra de disparador del flujo */}
      <form action={setFlowTrigger} className="flex flex-wrap items-end gap-3 border-b border-[#e6e8f2] bg-white px-6 py-2.5">
        <input type="hidden" name="id" value={flowRow.id} />
        <input type="hidden" name="bot_id" value={bot.id} />
        <div>
          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-2">Nombre del flujo</label>
          <input name="name" defaultValue={flowRow.name ?? ""} className="input h-8 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-2">Disparador</label>
          <select name="trigger_type" defaultValue={triggerType} className="input h-8 py-1 text-sm">
            <option value="welcome">Bienvenida / inicio</option>
            <option value="keyword">Palabras clave</option>
            <option value="returning">Leads que regresan</option>
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-2">Palabras clave (coma) — solo para "Palabras clave"</label>
          <input name="keywords" defaultValue={keywords} placeholder="precio, cotización, soporte" className="input h-8 py-1 text-sm" />
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted">
          <input type="checkbox" name="enabled" value="on" defaultChecked={flowRow.enabled !== false} className="h-3.5 w-3.5 accent-pink" />
          Activo
        </label>
        <button className="btn-ghost h-8 whitespace-nowrap py-1">Guardar disparador</button>
      </form>

      <FlowBuilder
        flow={flow}
        flowId={flowRow.id as string}
        initialViewport={(graph.viewport as any) ?? null}
        channel={(bot.channel as any) ?? "webchat"}
        botId={bot.id}
        connected={!!wa}
        number={(wa as any)?.display_number ?? null}
      />
      </div>
    </>
  );
}
