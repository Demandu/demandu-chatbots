import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { FlowBuilder } from "@/components/builder/FlowBuilder";
import { BotTitle } from "@/components/BotTitle";
import { sampleFlow } from "@/lib/flow/sample";
import { createClient } from "@/lib/supabase/server";
import type { Flow } from "@/lib/flow/types";

export const dynamic = "force-dynamic";

const WA_SELECT = "bot_id, display_number, phone_number_id";

export default async function BotBuilderPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // Carga en paralelo (rápido). El 404 "a veces" venía de un parpadeo de
  // sesión del lado del servidor: RLS devolvía vacío y se disparaba notFound
  // aunque el bot sí existiera. Ahora, si el bot no aparece, confirmamos la
  // sesión (refresca token) y reintentamos un par de veces antes de rendirnos.
  let [botRes, flowRes, waRes] = await Promise.all([
    supabase.from("bots").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("flows").select("*").eq("bot_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("whatsapp_channels").select(WA_SELECT).eq("bot_id", params.id).maybeSingle(),
  ]);

  if (!botRes.data) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login"); // sin sesión → login, no un 404 confuso
    for (let i = 0; i < 3 && !botRes.data; i++) {
      await new Promise((r) => setTimeout(r, 120));
      botRes = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle();
    }
    if (botRes.data) {
      [flowRes, waRes] = await Promise.all([
        supabase.from("flows").select("*").eq("bot_id", params.id).order("version", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("whatsapp_channels").select(WA_SELECT).eq("bot_id", params.id).maybeSingle(),
      ]);
    }
  }

  const bot = botRes.data;
  if (!bot) notFound();

  const flowRow = flowRes.data;
  const wa = waRes.data;

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
        number={(wa as any)?.display_number ?? null}
      />
    </>
  );
}
