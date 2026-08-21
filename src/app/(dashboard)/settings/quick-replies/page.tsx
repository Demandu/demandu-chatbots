import { createClient } from "@/lib/supabase/server";
import { QuickRepliesManager } from "@/components/settings/QuickRepliesManager";
import { guardarRespuesta, borrarRespuesta } from "./actions";

export const dynamic = "force-dynamic";

export default async function RespuestasRapidasPage() {
  const { data } = await createClient()
    .from("quick_replies")
    .select("id, shortcut, title, body, category, sort, uses")
    .order("sort")
    .order("created_at");

  return (
    <div>
      <div className="mb-5">
        <p className="text-xs text-ink-3">
          Mensajes que escribes una vez y reutilizas siempre. En el chat, toca el rayo ⚡ o escribe{" "}
          <b className="text-ink-2">/</b> y elige la que necesites.
        </p>
      </div>

      <QuickRepliesManager
        iniciales={(data as any[]) ?? []}
        guardar={guardarRespuesta}
        borrar={borrarRespuesta}
      />
    </div>
  );
}
