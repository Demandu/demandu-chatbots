import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { createClient } from "@/lib/supabase/server";
import { channelOf } from "@/lib/channels";
import { ConstructorPlantilla } from "@/components/templates/ConstructorPlantilla";

export const dynamic = "force-dynamic";

export default async function CrearPlantillaPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: bot } = await sb.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle();
  if (!bot) notFound();
  // Las plantillas son cosa de WhatsApp: en los demás canales no existen.
  if (channelOf(bot.channel) !== "whatsapp") redirect(`/bots/${bot.id}`);

  const { data: wa } = await sb.from("whatsapp_channels").select("bot_id").eq("bot_id", params.id).maybeSingle();

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        <Link href={`/bots/${bot.id}/templates`} className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 transition hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a las plantillas
        </Link>

        <div className="mb-5">
          <h2 className="font-display text-2xl font-bold text-ink">Nueva plantilla</h2>
          <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-2">
            Una plantilla es el único mensaje que WhatsApp deja mandar a alguien que lleva más de
            24 horas sin escribirte. Meta las revisa antes de dejarte usarlas — aquí la armas y la
            mandas a revisión sin salir de Demandu.
          </p>
        </div>

        <ConstructorPlantilla botId={bot.id} conectado={!!wa} />
      </div>
    </>
  );
}
