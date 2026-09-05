import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { LanaSays } from "@/components/Lana";
import { AiTester } from "@/components/ai/AiTester";
import { EditorDePrompt } from "@/components/EditorDePrompt";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { AI_DEFAULTS, aiConfigured } from "@/lib/ai/answer";
import { createAdminClient } from "@/lib/supabase/admin";
import { agenteDelBot } from "@/lib/ai/agentes";
import { ACCIONES } from "@/lib/ai/acciones";
import { saveAiSettings, elegirTiendaDelAgente, usarOtroAgente } from "./actions";
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
  let { data: bot } = await supabase.from("bots").select("id, org_id, name, channel, ai, agente_id").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, org_id, name, channel, ai, agente_id").eq("id", params.id).maybeSingle());
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
    // Por id, no «una cualquiera»: la zona horaria de otro negocio aquí sale
    // como citas ofrecidas con horas de diferencia.
    supabase
      .from("organizations")
      .select("timezone, business_hours")
      .eq("id", (await getCurrentOrgId()) ?? "")
      .maybeSingle(),
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

  // ── LA CONFIGURACIÓN SALE DEL AGENTE, CON `bots.ai` DE RESPALDO ──────────
  // Es exactamente lo que lee el motor, así que lo que se ve aquí es lo que
  // contesta el bot. Leerlo de otro sitio sería la forma más fácil de que el
  // panel dijera una cosa y el chatbot hiciera otra.
  const elAgente = await agenteDelBot(createAdminClient(), bot as any);
  const ai = { ...AI_DEFAULTS, ...elAgente.ajustes };

  // ── LAS DOS ELECCIONES QUE SOLO SE ENSEÑAN SI SIRVEN ─────────────────────
  // Otros agentes de la cuenta (para que otro canal hable igual) y las tiendas
  // (para elegir con cuál trabaja). Con uno solo de cada, no hay decisión que
  // tomar y la pantalla no pregunta nada.
  const [{ data: otrosAgentes }, { data: susTiendas }] = await Promise.all([
    supabase.from("agentes").select("id, nombre").eq("org_id", (bot as any).org_id).order("nombre"),
    supabase.from("tiendas").select("id, nombre, activa").eq("org_id", (bot as any).org_id).order("nombre"),
  ]);
  const agentes = ((otrosAgentes as any[]) ?? []);
  const tiendas = ((susTiendas as any[]) ?? []);
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

        {/* ── COMPARTIR LA PERSONALIDAD ENTRE CANALES ───────────────────────
            EL ÚNICO SITIO DONDE APARECE LA PALABRA «AGENTE», y solo cuando la
            cuenta ya tiene más de uno — es decir, cuando de verdad sirve de
            algo.

            Quien tiene un chatbot no ve nada de esto: edita su personalidad
            aquí y ya. Obligar a un dueño de panadería a crear primero un
            agente, luego un chatbot y luego enlazarlos es pedirle que entienda
            nuestra arquitectura para poder vender pan.

            Quien tiene WhatsApp, Instagram y web lo agradece: escribe su forma
            de hablar una vez en lugar de tres, y cuando cambia su horario lo
            cambia en un sitio en lugar de en tres — donde el que se queda
            viejo es siempre el que nadie mira. */}
        {agentes.length > 1 && (
          <div className="mb-6 rounded-2xl border border-linea bg-tarjeta p-4">
            <h3 className="text-sm font-semibold text-ink">Personalidad de este chatbot</h3>
            <p className="mt-1 text-xs text-ink-3">
              Ahora usa <b className="text-ink-2">{elAgente.nombre ?? "la suya"}</b>. Si eliges otra, los dos
              chatbots hablarán igual y se editarán juntos: lo que cambies aquí le cambia también al otro.
            </p>
            <form action={usarOtroAgente} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="bot_id" value={bot.id} />
              <select name="agente_id" defaultValue={elAgente.agenteId ?? ""} className="input max-w-xs">
                {agentes.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
              <button className="rounded-xl border border-linea px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-suave-2">
                Usar esta personalidad
              </button>
            </form>
          </div>
        )}

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
                    {/* ── LAS NUEVE, SALIDAS DEL CATÁLOGO ──────────────────
                        Esta lista estaba escrita a mano y se había quedado con
                        SEIS. Las tres de la tienda —ver el catálogo, el estado
                        de un pedido, mandar el enlace— funcionaban perfectamente
                        y no tenían casilla en ninguna pantalla: solo se
                        activaban si el cliente adivinaba que había que escribir
                        `/ver_catalogo` en el prompt.

                        Tres funciones construidas, probadas y desplegadas que
                        nadie iba a encontrar. Leyéndolas del catálogo, una
                        herramienta nueva aparece sola. */}
                    {ACCIONES.map(({ clave, nombre, desc }) => (
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
                          <b className="text-[13px] text-ink">{nombre}</b>
                          <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* ── CON QUÉ TIENDA TRABAJA ────────────────────────────
                      Solo con VARIAS tiendas: con una no hay nada que elegir.

                      Antes no se podía elegir y se cogía la primera por orden
                      alfabético — un negocio con «Boutique» y «Zapatería»
                      servía siempre el catálogo de Boutique, y el síntoma (el
                      bot enseña productos que no son) no se parece nada a la
                      causa. */}
                  {tiendas.length > 1 && (
                    <div className="mt-3 rounded-xl border border-linea-2 bg-tarjeta p-3">
                      <label className="mb-1 block text-xs font-semibold text-ink-2">
                        ¿Con qué tienda trabaja este chatbot?
                      </label>
                      <p className="mb-2 text-[11px] leading-snug text-ink-3">
                        Es la tienda cuyo catálogo enseña y cuyos pedidos consulta. Tienes {tiendas.length}.
                      </p>
                      <form action={elegirTiendaDelAgente} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <select name="tienda_id" defaultValue={elAgente.tiendaId ?? ""} className="input max-w-xs">
                          <option value="">La que esté enlazada al chatbot</option>
                          {tiendas.map((t: any) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre}{t.activa === false ? " (apagada)" : ""}
                            </option>
                          ))}
                        </select>
                        <button className="rounded-xl border border-linea px-3 py-2 text-xs font-semibold text-ink-2 transition hover:bg-suave-2">
                          Guardar tienda
                        </button>
                      </form>
                    </div>
                  )}

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
