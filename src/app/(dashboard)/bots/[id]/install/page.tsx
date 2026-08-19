import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { ConnectButton } from "@/components/builder/ConnectButton";
import { EstadoMeta } from "@/components/integrations/EstadoMeta";
import { consultarMeta, interpretarEstado } from "@/lib/integrations/metaEstado";
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
    .select("display_number, phone_number_id, waba_id, access_token")
    .eq("bot_id", params.id)
    .maybeSingle();

  // Estado real en Meta. Se consulta en el servidor: el token nunca llega al
  // navegador. Si Meta no contesta, la pantalla sigue funcionando igual.
  const diagnostico =
    channel === "whatsapp" && wa?.phone_number_id && wa?.waba_id && wa?.access_token
      ? interpretarEstado(
          await consultarMeta(wa.phone_number_id as string, wa.waba_id as string, wa.access_token as string),
        )
      : null;

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Conexión</h2>
        <p className="mb-6 max-w-2xl text-sm text-ink-2">
          {channel === "webchat"
            ? "Instala el widget en tu sitio para que este chatbot atienda a tus visitantes."
            : `Conecta ${LABEL[channel]} para que este chatbot reciba y responda mensajes en vivo.`}
        </p>

        <div className="flex max-w-2xl flex-col gap-4">
          {/* El diagnóstico va ARRIBA del botón: si algo está bloqueando los
              envíos, es lo primero que el cliente necesita ver. */}
          {diagnostico && <EstadoMeta d={diagnostico} />}

          <div className="card-l p-6">
            <ConnectButton
              channel={channel as any}
              botId={bot.id}
              connected={!!wa}
              number={(wa as any)?.display_number ?? null}
            />
          </div>
        </div>
      </div>
    </>
  );
}
