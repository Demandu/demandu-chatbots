import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { RespuestasAutomaticas } from "@/components/bots/RespuestasAutomaticas";
import { createClient } from "@/lib/supabase/server";
import { channelOf } from "@/lib/channels";
import { getCurrentOrgId } from "@/lib/org";
import {
  superficiesDe, nombreDeLana, esPromo, dondeDeLosOrigenes,
} from "@/lib/canales/respuestasAutomaticas";
import { modoDeRespuestaPublica } from "@/lib/canales/comentarioPublico";

export const dynamic = "force-dynamic";

/**
 * «¿QUÉ CONTESTA MI CHATBOT EN INSTAGRAM?», EN UNA PANTALLA.
 *
 * Interruptores para los sitios donde puede contestar, y una lista de
 * promociones por palabra clave. Nada de lienzos, nodos ni disparadores: eso
 * sigue existiendo en el editor para quien lo quiera, pero dejó de ser el
 * único camino para encender lo más normal del mundo.
 *
 * Lee y escribe los mismos `flows` de siempre. Las reglas de esta pantalla se
 * reconocen por su nombre; los flujos que el negocio haya hecho a mano no se
 * tocan ni se pisan.
 */
export default async function RespuestasPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const orgId = await getCurrentOrgId();

  const { data: bot } = await sb
    .from("bots")
    .select("id, name, channel")
    .eq("id", params.id)
    .maybeSingle();
  if (!bot) notFound();

  const { data: flujos } = await sb
    .from("flows")
    .select("id, name, origen, keywords, graph, respuesta_publica_modo, enabled")
    .eq("bot_id", params.id);

  const todos = (flujos ?? []) as any[];
  const canal = channelOf((bot as any).channel);

  // ── Dónde contesta Lana ───────────────────────────────────────────────────
  const sitios = superficiesDe(canal).map((s) => {
    const suyo = todos.find((f) => f.name === nombreDeLana(s.valor));
    return {
      valor: s.valor,
      label: s.label,
      desc: s.desc,
      admitePublica: !!s.admitePublica,
      encendido: !!suyo && suyo.enabled !== false,
      publica: !!suyo && modoDeRespuestaPublica(suyo) === "ia",
    };
  });

  // ── Promociones ───────────────────────────────────────────────────────────
  // Se agrupan por nombre porque «en los dos sitios» son dos filas y para el
  // negocio son UNA promoción. Agrupar por palabra clave sería casi lo mismo,
  // pero el nombre es lo que usa el borrado: mejor que la pantalla enseñe
  // exactamente lo que el borrado va a llevarse.
  const porNombre = new Map<string, any[]>();
  for (const f of todos.filter(esPromo)) {
    porNombre.set(f.name, [...(porNombre.get(f.name) ?? []), f]);
  }

  const promos = [...porNombre.entries()].map(([nombre, filas]) => {
    const nodo = (filas[0]?.graph?.nodes ?? []).find((n: any) => n?.id === "promo");
    return {
      nombre,
      palabra: String(filas[0]?.keywords?.[0] ?? ""),
      mensaje: String(nodo?.data?.text ?? ""),
      archivo: String(nodo?.data?.mediaUrl ?? ""),
      donde: dondeDeLosOrigenes(filas.map((f) => f.origen)),
      publica: filas.some((f) => modoDeRespuestaPublica(f) === "ia"),
      activa: filas.some((f) => f.enabled !== false),
    };
  });

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 text-ink sm:p-6 lg:p-8">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Respuestas automáticas</h2>
        <p className="mb-6 max-w-2xl text-sm text-ink-2">
          Enciende dónde quieres que conteste Lana y, si quieres, deja preparada una promoción:
          alguien escribe una palabra y le llega por privado lo que le prometiste.
        </p>

        <RespuestasAutomaticas botId={bot.id} orgId={orgId} sitios={sitios} promos={promos} />
      </div>
    </>
  );
}
