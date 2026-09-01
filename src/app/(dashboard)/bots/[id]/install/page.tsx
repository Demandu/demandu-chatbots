import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
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

/**
 * Lo que hay que decirle al cliente cuando vuelve de Meta.
 *
 * «Conectado» no es la única respuesta posible y fingir que sí sería lo peor:
 * `sin_suscribir` significa que la cuenta quedó guardada pero NO va a llegar
 * ni un mensaje. Un cliente que ve «listo» y se queda esperando mensajes
 * tarda días en darse cuenta y llega enfadado, con razón.
 */
const AVISO_IG: Record<string, { tono: "bien" | "mal" | "ojo"; texto: string }> = {
  conectado: { tono: "bien", texto: "Instagram quedó conectado. Escríbele un mensaje directo a tu cuenta para probarlo." },
  cancelado: { tono: "ojo", texto: "No se conectó nada: cancelaste el permiso en Meta. Puedes intentarlo otra vez cuando quieras." },
  sin_suscribir: {
    tono: "mal",
    texto: "La cuenta quedó guardada, pero Meta no aceptó activar los avisos, así que todavía NO van a llegar mensajes. Vuelve a intentarlo o escríbenos.",
  },
};
const ERROR_IG: Record<string, string> = {
  sin_cuentas:
    "Instagram no devolvió ninguna cuenta. Casi siempre es porque la cuenta no es profesional: en la app de Instagram, ve a Configuración → Tipo de cuenta y cámbiala a empresa o creador.",
  cuenta_ya_conectada: "Esa cuenta de Instagram ya está conectada a otra organización de la plataforma.",
  estado_invalido: "El enlace caducó o se abrió desde otro sitio. Vuelve a darle a Conectar.",
  // ESTOS DOS SON PROBLEMAS NUESTROS, NO DEL CLIENTE, y por eso dicen lo mismo
  // y no dicen cómo se arreglan.
  //
  // La primera versión de `sin_dominio` nombraba una variable de entorno del
  // servidor. Un cliente que vende zapatos vio en su pantalla el nombre de una
  // variable y la palabra «Invalid redirect_uri»: no puede hacer nada con eso
  // salvo asustarse y pensar que rompió algo. El detalle técnico va al registro
  // del servidor, que es donde lo vamos a leer nosotros.
  sin_dominio:
    "No pudimos abrir la conexión con Instagram. Es un ajuste pendiente de nuestro lado, no de tu cuenta. Ya nos avisó el sistema; inténtalo de nuevo en un rato o escríbenos.",
  sin_configurar:
    "No pudimos abrir la conexión con Instagram. Es un ajuste pendiente de nuestro lado, no de tu cuenta. Ya nos avisó el sistema; inténtalo de nuevo en un rato o escríbenos.",
  fallo_al_conectar: "Meta no completó la conexión. Vuelve a intentarlo en un momento.",
};

export default async function BotInstallPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const s = (k: string) => {
    const v = searchParams?.[k];
    return typeof v === "string" ? v : "";
  };
  const avisoIg = AVISO_IG[s("ig")] ?? null;
  const errorIg = ERROR_IG[s("error")] ?? null;

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

  const { data: ig } = await supabase
    .from("instagram_channels")
    .select("username, page_name, ig_user_id")
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
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Conexión</h2>
        <p className="mb-6 max-w-2xl text-sm text-ink-2">
          {channel === "webchat"
            ? "Instala el widget en tu sitio para que este chatbot atienda a tus visitantes."
            : `Conecta ${LABEL[channel]} para que este chatbot reciba y responda mensajes en vivo.`}
        </p>

        <div className="flex max-w-2xl flex-col gap-4">
          {/* Lo que pasó al volver de Meta va ARRIBA DEL TODO. Sobre todo el
              caso incómodo: cuenta guardada pero avisos sin activar, que se ve
              igual que «conectado» y no lo es. */}
          {avisoIg && (
            <div
              className={`rounded-2xl border p-4 text-sm leading-relaxed ${
                avisoIg.tono === "bien"
                  ? "border-success/40 bg-success/10 text-ink-2"
                  : avisoIg.tono === "mal"
                    ? "border-danger/40 bg-danger/10 text-ink-2"
                    : "border-linea bg-suave/50 text-ink-2"
              }`}
            >
              {avisoIg.texto}
            </div>
          )}
          {errorIg && (
            <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm leading-relaxed text-ink-2">
              {errorIg}
            </div>
          )}

          {/* El diagnóstico va ARRIBA del botón: si algo está bloqueando los
              envíos, es lo primero que el cliente necesita ver. */}
          {diagnostico && <EstadoMeta d={diagnostico} />}

          {channel === "instagram" && ig && (
            <div className="rounded-2xl border border-success/40 bg-success/5 p-4 text-sm text-ink-2">
              Conectado a{" "}
              <b className="text-ink">{(ig as any).username ? `@${(ig as any).username}` : "tu cuenta"}</b>
              {(ig as any).page_name ? <> · página <b className="text-ink">{(ig as any).page_name}</b></> : null}
            </div>
          )}

          <div className="card-l p-6">
            <ConnectButton
              channel={channel as any}
              botId={bot.id}
              connected={channel === "instagram" ? !!ig : !!wa}
              number={(wa as any)?.display_number ?? null}
            />
          </div>
        </div>
      </div>
    </>
  );
}
