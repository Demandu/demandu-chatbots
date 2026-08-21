import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { LanaSays } from "@/components/Lana";
import { WidgetPreview } from "@/components/builder/WidgetPreview";
import { createClient } from "@/lib/supabase/server";
import { channelOf } from "@/lib/channels";
import { saveWidget } from "./actions";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  color: "#6E42FF",
  position: "right",
  title: "¿Podemos ayudarte?",
  subtitle: "Normalmente respondemos al instante",
  launcher: "Chatea con nosotros",
  greeting: "",
};

export default async function BotAppearancePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("id, name, channel, widget").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, name, channel, widget").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();
  if (channelOf(bot.channel) !== "webchat") redirect(`/bots/${bot.id}`);

  const w = { ...DEFAULTS, ...(((bot as any).widget as any) ?? {}) };

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Apariencia</h2>
        <p className="mb-5 text-sm text-ink-2">
          Cómo se ve la burbuja de chat en tu página: colores, textos y de qué lado aparece.
        </p>

        <LanaSays className="mb-6" title="Lana · Tip">
          Usa el color de tu marca para que el chat se sienta parte de tu sitio. Los cambios se aplican al instante
          en tu página — <b className="text-ink">no hace falta reinstalar el código</b>.
        </LanaSays>

        <form action={saveWidget} id="widget-form">
          <WidgetPreview
            botId={bot.id}
            initial={{
              color: w.color,
              position: w.position,
              title: w.title,
              subtitle: w.subtitle,
              launcher: w.launcher,
              greeting: w.greeting,
            }}
          />
          <div className="mt-5">
            <button className="btn-primary">Guardar apariencia</button>
          </div>
        </form>
      </div>
    </>
  );
}
