import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { LanaSays } from "@/components/Lana";
import { AiTester } from "@/components/ai/AiTester";
import { EditorDePrompt } from "@/components/EditorDePrompt";
import { createClient } from "@/lib/supabase/server";
import { AI_DEFAULTS, aiConfigured } from "@/lib/ai/answer";
import { saveAiSettings } from "./actions";
import { Sparkles, BookOpen } from "lucide-react";
import { EstadoDeAgenda } from "@/components/bots/EstadoDeAgenda";
import { loQueFaltaParaAgendar, type DiaLaboral } from "@/lib/ai/agenda";

export const dynamic = "force-dynamic";

export default async function BotAiPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { guardado?: string };
}) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("id, name, channel, ai").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, name, channel, ai").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();

  const { count: saberes } = await supabase
    .from("bot_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", params.id)
    .eq("enabled", true);

  // Las etiquetas REALES del cliente, para poder avisar en el editor si el
  // prompt pide `/etiquetar` y no hay ninguna creada — que es una de esas
  // configuraciones que fallan en silencio.
  const { data: etiquetas } = await supabase.from("tags").select("name").order("name");
  const nombresDeEtiquetas = ((etiquetas ?? []) as any[]).map((t) => t.name);

  // ── LA AGENDA, COMPROBADA AQUÍ Y NO PROMETIDA ───────────────────────────
  // Marcar «Agendar citas» y guardar no es tener agenda: hace falta Google
  // Calendar conectado, algún día abierto y la zona horaria correcta. Nada de
  // eso se ve desde esta pantalla, así que se falla en silencio — el bot no
  // encuentra huecos, o los ofrece con una hora de diferencia, y el negocio se
  // entera cuando un cliente llama preguntando por qué nadie lo atendió.
  const [{ data: integracion }, { data: org }] = await Promise.all([
    supabase
      .from("integrations")
      .select("account_email")
      .eq("provider", "google_calendar")
      .maybeSingle(),
    supabase.from("organizations").select("timezone, business_hours").limit(1).maybeSingle(),
  ]);

  const horas = ((org?.business_hours as Record<string, DiaLaboral>) ?? {}) as Record<string, DiaLaboral>;
  const agenda = loQueFaltaParaAgendar({
    herramientas: ((bot.ai as any)?.herramientas ?? []) as string[],
    conectado: Boolean(integracion),
    timezone: String(org?.timezone ?? ""),
    horas,
  });

  const DIAS: Record<string, string> = {
    mon: "lun", tue: "mar", wed: "mié", thu: "jue", fri: "vie", sat: "sáb", sun: "dom",
  };
  const abiertos = Object.entries(horas).filter(([, d]) => d?.enabled);
  const resumenHorario = abiertos.length
    ? abiertos
        .sort(
          (a, b) =>
            Object.keys(DIAS).indexOf(a[0]) - Object.keys(DIAS).indexOf(b[0]),
        )
        .map(([k, d]) => `${DIAS[k] ?? k} ${d.open ?? "?"}–${d.close ?? "?"}`)
        .join(" · ")
    : "ningún día abierto";

  const ai = { ...AI_DEFAULTS, ...(((bot as any).ai as any) ?? {}) };
  const lista = aiConfigured();
  // El interruptor de ESTE chatbot. Desde que corta de verdad, apagado
  // significa que no contesta ni gasta — hay que verlo sin buscarlo.
  const apagada = ai.enabled === false;

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Lana IA</h2>
        <p className="mb-5 text-sm text-ink-2">
          Dale personalidad a tu chatbot y deja que conteste con inteligencia cuando el guión no alcance.
        </p>

        <LanaSays className="mb-5" title="Lana · Cómo funciona">
          Un guión responde solo lo que le programaste. Con la IA encendida, cuando un cliente pregunte algo fuera del
          guión, yo busco la respuesta en tu <b className="text-ink">Entrenamiento</b> y contesto con tus datos reales.
          Si no lo sé, lo digo y ofrezco pasar con una persona — <b className="text-ink">nunca invento</b>.
        </LanaSays>

        {/* Estado */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {/* Dos cosas distintas: que la IA exista en la cuenta, y que ESTE
              chatbot la tenga encendida. Antes solo se veía la primera. */}
          <div className={`card-l flex items-center gap-3 p-4 ${lista && !apagada ? "" : "border-warning/50 bg-warning/5"}`}>
            <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${lista && !apagada ? "bg-success/15 text-exito" : "bg-warning/20 text-aviso"}`}>
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">
                {!lista ? "IA no disponible aún" : apagada ? "IA apagada en este chatbot" : "IA disponible"}
              </div>
              <div className="text-xs text-ink-3">
                {!lista
                  ? "Todavía no está activa en tu cuenta. Escríbenos y la encendemos. Mientras tanto, tu chatbot usa el mensaje de respaldo."
                  : apagada
                    ? "No va a contestar con IA ni te va a consumir nada. Enciéndela abajo, en «Responder con IA»."
                    : "Ya está lista. No tienes que contratar ni configurar nada más."}
              </div>
            </div>
          </div>

          <Link href={`/bots/${bot.id}/training`} className="card-l flex items-center gap-3 p-4 transition hover:border-pink">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-violet/15 text-violet">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">{saberes ?? 0} temas aprendidos</div>
              <div className="text-xs text-ink-3">
                {(saberes ?? 0) === 0 ? "Todavía no sabe nada — enséñale aquí →" : "Ver o editar el entrenamiento →"}
              </div>
            </div>
          </Link>
        </div>

        {/* El aviso va ARRIBA del formulario y no junto al botón: al guardar,
            la página vuelve al principio y un mensaje pegado al botón se
            quedaría fuera de pantalla — que es lo mismo que no ponerlo.
            Es HERMANO del formulario, así que lleva su propio margen: el
            `col-span` de la rejilla no le aplicaría. */}
        {searchParams?.guardado === "si" && (
          <div className="mb-5 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
            ✓ Configuración guardada.{" "}
            {ai.herramientas?.length
              ? `Tu asistente puede: ${ai.herramientas.join(", ")}.`
              : "Tu asistente solo conversa: no marcaste ninguna acción."}
          </div>
        )}
        {searchParams?.guardado === "no" && (
          <div className="mb-5 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            No se pudo guardar. Vuelve a intentarlo; si sigue pasando, avísanos.
          </div>
        )}

        <form action={saveAiSettings} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <input type="hidden" name="bot_id" value={bot.id} />

          <div className="lg:col-span-2">
            <div className="card-l p-5">
              <label className="mb-4 flex cursor-pointer items-center gap-4 rounded-xl border border-linea bg-tarjeta-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">Responder con IA</span>
                  <span className="block text-xs text-ink-3">
                    Apagado, tu chatbot solo sigue el guión y contesta el mensaje de respaldo. No consume IA.
                  </span>
                </span>
                <input type="checkbox" name="enabled" defaultChecked={ai.enabled !== false} className="h-5 w-5 flex-none accent-pink" />
              </label>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">¿Quién es tu asistente?</label>
                  {/* Un prompt de personalidad real ocupa varios párrafos. Con
                      80px se veían dos líneas y media y el texto quedaba
                      cortado a media palabra, como si se hubiera perdido. */}
                  <EditorDePrompt name="persona" defaultValue={ai.persona} etiquetas={nombresDeEtiquetas} />
                  <p className="mt-1 text-[11px] text-ink-3">
                    Ej: “Eres Sofía, asistente de Pastelería La Dulce. Ayudas con pedidos y dudas de productos.”
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Tono</label>
                  <input name="style" defaultValue={ai.style} className="input-l" />
                  <p className="mt-1 text-[11px] text-ink-3">Ej: “Cálido y cercano, usa emojis con moderación. Tutea.”</p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Si no sabe la respuesta, ¿qué dice?</label>
                  <input name="fallback" defaultValue={ai.fallback} className="input-l" />
                  <p className="mt-1 text-[11px] text-ink-3">
                    Esto es lo que evita que invente cosas. También se usa si la IA no está disponible.
                  </p>
                </div>

                <div className="rounded-xl border border-linea bg-tarjeta-2 p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="fallback_flujo"
                      defaultChecked={(ai as any).fallback_flujo !== false}
                      className="mt-1 h-4 w-4 flex-none accent-violet"
                    />
                    <span>
                      <b className="text-ink">Que conteste cuando el cliente se salga del flujo</b>
                      <span className="mt-0.5 block text-sm leading-relaxed text-ink-2">
                        La gente no habla en guiones. Con esto encendido, si alguien pregunta algo que
                        el flujo no esperaba, la IA le responde y <b className="text-ink">el flujo no se
                        pierde</b>: se queda esperando donde iba y sigue en cuanto la persona conteste
                        lo que se le pidió. Apagado, el bot dice “no entendí, elige una opción”.
                      </span>
                    </span>
                  </label>
                </div>

                {/* ── QUÉ PUEDE HACER, ADEMÁS DE HABLAR ────────────────────
                    Sin nada marcado, el asistente solo conversa — que es como
                    se comportaba antes de que existieran las herramientas.
                    Nadie que solo quería un bot que contesta nota la
                    diferencia. */}
                <div className="rounded-xl border border-violet/30 bg-violet/5 p-4">
                  <h4 className="text-sm font-bold text-ink">Qué puede hacer solo</h4>
                  <p className="mb-3 mt-0.5 text-xs text-ink-2">
                    Marca lo que quieras que tu asistente pueda hacer por su cuenta, sin que armes un
                    flujo. Si no marcas nada, solo conversa.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ["ver_horarios", "Consultar tu agenda", "Mira los huecos libres en tu Google Calendar."],
                      ["agendar_cita", "Agendar citas", "Reserva en tu calendario. Requiere lo anterior."],
                      ["etiquetar", "Etiquetar al cliente", "Solo con TUS etiquetas. Si inventa una, se rechaza."],
                      ["guardar_dato", "Guardar datos en la ficha", "Solo en los campos que hayas creado."],
                      ["pasar_a_humano", "Pasar con una persona", "Cuando se lo pidan o no pueda resolver."],
                      ["consultar_sistema", "Consultar tu sistema", "Le pregunta a la dirección que pongas abajo."],
                    ].map(([clave, titulo, pie]) => (
                      <label
                        key={clave}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-linea-2 bg-tarjeta p-2.5"
                      >
                        <input
                          type="checkbox"
                          name={`h_${clave}`}
                          defaultChecked={((ai as any).herramientas ?? []).includes(clave)}
                          className="mt-0.5 h-4 w-4 flex-none accent-violet"
                        />
                        <span>
                          <b className="text-[13px] text-ink">{titulo}</b>
                          <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{pie}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <EstadoDeAgenda
                    estado={agenda}
                    cuenta={(integracion as any)?.account_email ?? ""}
                    timezone={String(org?.timezone ?? "")}
                    resumenHorario={resumenHorario}
                  />

                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-ink-2">
                      Cuándo hacerlo (tus reglas, en tus palabras)
                    </label>
                    <textarea
                      name="criterios"
                      defaultValue={(ai as any).criterios ?? ""}
                      className="input-l min-h-[110px]"
                      placeholder={
                        "Ej: Etiqueta lead-alto si pregunta precios o menciona presupuesto.\n" +
                        "Etiqueta lead-bajo si solo pide información general.\n" +
                        "Guarda el presupuesto y la zona en cuanto los diga.\n" +
                        "Pasa con una persona si pide factura o se queja."
                      }
                    />
                    <p className="mt-1 text-[11px] text-ink-3">
                      Aquí se decide cómo calificas TÚ. Las etiquetas salen de las que creaste en
                      Configuración; los datos, de tus campos personalizados.
                    </p>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink-2">
                        Dirección de tu sistema (opcional)
                      </label>
                      <input
                        name="sistemaUrl"
                        defaultValue={(ai as any).sistemaUrl ?? ""}
                        placeholder="https://tu-sistema.com/consulta"
                        className="input-l font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink-2">¿Qué se consulta ahí?</label>
                      <input
                        name="sistemaDescripcion"
                        defaultValue={(ai as any).sistemaDescripcion ?? ""}
                        placeholder="Inventario y precios en tiempo real"
                        className="input-l"
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">
                    La dirección la pones tú y el asistente no puede cambiarla: solo decide cuándo
                    preguntar, nunca a dónde.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Largo máximo de respuesta (palabras)</label>
                  <input name="maxWords" type="number" min={20} max={300} defaultValue={ai.maxWords} className="input-l w-32" />
                  <p className="mt-1 text-[11px] text-ink-3">En chat, corto funciona mejor. 60–100 es lo ideal.</p>
                </div>
              </div>

              <button className="btn-primary mt-5">Guardar configuración</button>
            </div>
          </div>

          {/* Prueba en vivo */}
          <div className="lg:col-span-1 space-y-5">
            <AiTester botId={bot.id as string} />
            <div className="card-l p-5">
              <h3 className="mb-1 font-display text-base font-semibold text-ink">Para que conteste sola</h3>
              <p className="text-xs text-ink-2">
                Agrega el bloque <b className="text-ink">Respuesta con IA</b> en el constructor de tu conversación.
                Ahí es donde tu chatbot deja el guión y contesta con lo que aprendió de tu negocio.
              </p>
              <p className="mt-2 text-[11px] text-ink-3">
                Cuantos más temas cargues en <b className="text-ink-2">Entrenamiento</b>, mejor contesta. Si algo no
                está ahí, dirá tu mensaje de respaldo en vez de inventarlo.
              </p>
            </div>
          </div>

        </form>
      </div>
    </>
  );
}
