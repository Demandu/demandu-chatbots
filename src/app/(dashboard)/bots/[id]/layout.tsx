import { BotNav } from "@/components/builder/BotNav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Marco de "estoy dentro de un chatbot".
 *
 * Las secciones del chatbot viven aquí y no dentro de cada pantalla, por dos
 * razones. Una: eran once líneas repetidas en once archivos, y bastaba olvidar
 * una para que esa pantalla perdiera el menú. Dos: al estar en el marco, Next
 * NO la vuelve a dibujar al cambiar de sección — solo cambia el contenido, así
 * que moverse entre pestañas se siente instantáneo.
 *
 * En móvil la columna se convierte sola en una tira horizontal (ver BotNav).
 */
export default async function BotLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const sb = createClient();
  // Solo lo justo para pintar el menú. Si el chatbot no existe o no es de esta
  // organización, RLS devuelve vacío y la columna sale sin nombre; de dar el
  // 404 se encarga cada pantalla, que es la que sabe qué necesita.
  const { data: bot } = await sb
    .from("bots")
    .select("id, name, channel")
    .eq("id", params.id)
    .maybeSingle();

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <BotNav botId={params.id} channel={(bot as any)?.channel} nombre={(bot as any)?.name} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
