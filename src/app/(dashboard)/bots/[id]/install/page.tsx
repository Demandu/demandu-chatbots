import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { ConnectButton } from "@/components/builder/ConnectButton";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  webchat: "tu sitio web",
};

export default async function BotInstallPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("*").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();

  const channel = (bot.channel as string) ?? "webchat";
  const { data: wa } = await supabase
    .from("whatsapp_channels")
    .select("display_number, phone_number_id")
    .eq("bot_id", params.id)
    .maybeSingle();

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="flex-1 overflow-auto p-8">
        <BotNav botId={bot.id} />
        <h2 className="mb-1 font-display text-2xl font-bold text-white">Conexión</h2>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          {channel === "webchat"
            ? "Instala el widget en tu sitio para que este bot atienda a tus visitantes."
            : `Conecta ${LABEL[channel]} para que este bot reciba y responda mensajes en vivo.`}
        </p>

        <div className="max-w-2xl card p-6">
          <ConnectButton
            channel={channel as any}
            botId={bot.id}
            connected={!!wa}
            number={(wa as any)?.display_number ?? null}
          />
        </div>
      </div>
    </>
  );
}
