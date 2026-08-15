import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { FlowBuilder } from "@/components/builder/FlowBuilder";
import { BotTitle } from "@/components/BotTitle";
import { sampleFlow } from "@/lib/flow/sample";
import { createClient } from "@/lib/supabase/server";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

export default async function BotBuilderPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: bot } = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle();
  if (!bot) notFound();

  const { data: flowRow } = await supabase
    .from("flows")
    .select("*")
    .eq("bot_id", params.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Estado de conexión del canal (por ahora, WhatsApp)
  const { data: wa } = await supabase
    .from("whatsapp_channels")
    .select("bot_id, display_number, phone_number_id")
    .eq("bot_id", params.id)
    .maybeSingle();

  const graph = (flowRow?.graph as any) ?? { nodes: sampleFlow.nodes, edges: sampleFlow.edges };
  const flow: Flow = {
    id: flowRow?.id ?? "new",
    name: bot.name,
    nodes: graph.nodes ?? [],
    edges: graph.edges ?? [],
  };

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <FlowBuilder
        flow={flow}
        flowId={(flowRow?.id as string) ?? null}
        initialViewport={(graph.viewport as any) ?? null}
        channel={(bot.channel as any) ?? "webchat"}
        botId={bot.id}
        connected={!!wa}
        number={(wa as any)?.display_number ?? (wa as any)?.phone_number_id ?? null}
      />
    </>
  );
}
