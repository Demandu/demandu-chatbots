import { createClient } from "@/lib/supabase/server";
import { guardarColorBurbuja } from "../actions";
import { BubblePicker } from "@/components/inbox/BubblePicker";

export const dynamic = "force-dynamic";

export default async function ChatAparienciaPage() {
  const { data } = await createClient().from("organizations").select("id, branding").limit(1).maybeSingle();
  const branding = ((data as any)?.branding ?? {}) as { bubble_out?: string };

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Apariencia del chat</h2>
        <p className="text-xs text-ink-3">
          Elige el color de las burbujas de los mensajes que envías. Solo cambia cómo lo ve tu equipo
          en Conversaciones — el cliente sigue viendo su WhatsApp normal.
        </p>
      </div>

      <BubblePicker action={guardarColorBurbuja} value={branding.bubble_out ?? "#e7ddff"} />
    </div>
  );
}
