import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { LanaSays } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { addKnowledge, addKnowledgeSimple, deleteKnowledge, toggleKnowledge, updateKnowledge, importFromUrl, deleteSource } from "./actions";
import { AgregarConocimiento } from "@/components/bots/AgregarConocimiento";
import { EntrenamientoNav, PESTANAS } from "@/components/bots/EntrenamientoNav";
import { EntrenamientoResumen } from "@/components/bots/EntrenamientoResumen";
import { LoQueNoSupo, type Pregunta } from "@/components/settings/LoQueNoSupo";
import { embeddingsConfigured } from "@/lib/ai/ingest";
import { getStorage, formatBytes } from "@/lib/billing/quota";
import { getCurrentOrgId } from "@/lib/org";
import { BookOpen, Plus, Trash2, Globe, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const EJEMPLOS = [
  { t: "Horarios", c: "Abrimos de lunes a viernes de 9:00 a 19:00 y sábados de 10:00 a 14:00. Domingos cerrado." },
  { t: "Precios", c: "Pastel chico (8 porciones) $499. Mediano (16) $799. Grande (24) $1,150. Cupcakes: caja de 6 $180, de 12 $340." },
  { t: "Envíos", c: "Entregamos a domicilio en menos de 3 horas dentro de la ciudad. Costo $80, gratis en compras mayores a $800." },
  { t: "Formas de pago", c: "Aceptamos efectivo, tarjeta y transferencia. Para pedidos grandes pedimos 50% de anticipo." },
];

/**
 * El entrenamiento del chatbot, por pestañas.
 *
 * POR QUÉ SE REORGANIZÓ. Todo esto vivía en una sola pantalla larguísima: el
 * espacio del plan, el aviso de la búsqueda por significado, la importación de
 * una página web y la lista entera de lo que sabe, uno debajo de otro. Con dos
 * cosas cargadas se leía bien; con veinte era imposible encontrar nada, y
 * —peor— no se veía por dónde MÁS podía entrar información. Quien la abría
 * creía que lo único posible era escribir a mano en un cuadro de texto.
 *
 * CADA PESTAÑA ES UNA DIRECCIÓN (`?t=web`), no un estado de JavaScript: se
 * comparte, funciona el botón de atrás y sobrevive a recargar la página.
 *
 * LAS PREGUNTAS SIN RESPONDER SE MUDARON AQUÍ desde Ajustes. Estaban en el
 * sitio equivocado: cada una de esas preguntas es literalmente la instrucción
 * de qué falta por enseñarle, así que su sitio es esta pantalla, al lado del
 * cuadro donde se enseña. Se siguen viendo también en Ajustes, donde salen
 * las de TODOS los chatbots; aquí solo las de este.
 */
export default async function BotTrainingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { imported?: string; error?: string; t?: string };
}) {
  const supabase = createClient();
  let { data: bot } = await supabase.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle();
  if (!bot) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    for (let i = 0; i < 3 && !bot; i++) {
      await new Promise((r) => setTimeout(r, 120));
      ({ data: bot } = await supabase.from("bots").select("id, name, channel").eq("id", params.id).maybeSingle());
    }
  }
  if (!bot) notFound();

  // Una pestaña inventada en la dirección no puede dejar la pantalla en blanco.
  const pedida = String(searchParams?.t ?? "resumen");
  const activa = PESTANAS.some((p) => p.clave === pedida) ? pedida : "resumen";

  const { data: items } = await supabase
    .from("bot_knowledge")
    .select("*")
    .eq("bot_id", params.id)
    .order("created_at", { ascending: false });

  const list = (items as any[]) ?? [];
  // Los fragmentos son lo escrito a mano; lo que vino de una web se administra
  // por fuente en su propia pestaña, no renglón a renglón.
  const fragmentos = list.filter((k) => k.source_type === "text" || !k.source_name);
  const activos = fragmentos.filter((k) => k.enabled).length;
  const semantica = embeddingsConfigured();
  const storage = await getStorage(supabase, await getCurrentOrgId());

  // Agrupa lo que vino de una misma fuente (una web, un documento…)
  const fuentes: Record<string, { nombre: string; url: string | null; tipo: string; trozos: number }> = {};
  for (const k of list) {
    if (k.source_type === "text" || !k.source_name) continue;
    const f = (fuentes[k.source_name] ??= {
      nombre: k.source_name,
      url: k.source_url ?? null,
      tipo: k.source_type,
      trozos: 0,
    });
    f.trozos++;
  }
  const listaFuentes = Object.values(fuentes);

  // Solo las preguntas de ESTE chatbot: las de los demás distraen de lo que
  // hay que enseñarle a este.
  let preguntas: Pregunta[] = [];
  if (activa === "sin-respuesta" || activa === "resumen") {
    const { data: sinRespuesta } = await supabase.rpc("lo_que_no_supo", { p_dias: 30 });
    preguntas = ((sinRespuesta ?? []) as Pregunta[]).filter((p) => p.bot_id === params.id);
  }

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Entrenamiento</h2>
        <p className="mb-5 max-w-3xl text-sm text-ink-2">
          Todo lo que tu chatbot sabe de tu negocio: precios, horarios, servicios, políticas. Entre más le cuentes,
          mejor contesta.
        </p>

        <EntrenamientoNav botId={bot.id} activa={activa} />

        {/* Avisos de importación: se ven en cualquier pestaña, porque la acción
            que los provoca devuelve a la que estabas. */}
        {searchParams?.imported && (
          <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
            ✅ Listo: se cargaron {searchParams.imported} fragmentos de información desde la página.
          </div>
        )}
        {searchParams?.error && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {searchParams.error}
          </div>
        )}

        {/* ── Resumen ───────────────────────────────────────────────────── */}
        {activa === "resumen" && (
          <>
            <LanaSays className="mb-6" title="Lana · Cómo funciona">
              Escribe la información de tu negocio como se la explicarías a un empleado nuevo. Cuando un cliente
              pregunte algo, yo busco aquí la respuesta y contesto con <b className="text-ink">tus datos reales</b> —
              nunca me los invento. Si algo no está aquí, lo digo y ofrezco pasar la conversación a una persona.
            </LanaSays>

            <EntrenamientoResumen botId={bot.id} />

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Espacio del plan */}
              <div className={`card-l p-4 ${storage.full ? "border-danger/50" : storage.nearLimit ? "border-warning/50" : ""}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">Espacio de entrenamiento</span>
                  <span className="text-xs text-ink-2">
                    <b className="text-ink">{formatBytes(storage.usedBytes)}</b> de {formatBytes(storage.limitBytes)}
                    {storage.extraMb > 0 && <span className="text-ink-3"> · incluye {storage.extraMb} MB extra</span>}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#e6e8f2]">
                  <span
                    className={`block h-full rounded-full transition-all ${
                      storage.full ? "bg-danger" : storage.nearLimit ? "bg-warning" : "bg-demandu-gradient"
                    }`}
                    style={{ width: `${Math.max(2, storage.pct)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-ink-3">Plan {storage.planName}</span>
                  {storage.full ? (
                    <span className="font-semibold text-danger">Sin espacio — libera información o amplía tu plan.</span>
                  ) : storage.nearLimit ? (
                    <span className="font-semibold text-aviso">Te queda poco espacio ({formatBytes(storage.remainingBytes)}).</span>
                  ) : (
                    <Link href="/settings/plan" className="font-semibold text-pink hover:underline">Ver plan y ampliar espacio →</Link>
                  )}
                </div>
              </div>

              {/* Estado de la búsqueda */}
              <div className="card-l p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${semantica ? "bg-success" : "bg-warning"}`} />
                  <span className="text-sm font-semibold text-ink">
                    {semantica ? "Búsqueda por significado activa" : "Búsqueda por palabras clave"}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-ink-2">
                  {semantica
                    ? "Entiende preguntas aunque estén escritas con otras palabras: quien pregunte «cuánto sale» encuentra tus precios."
                    : "Funciona bien con poca información. Para documentos largos conviene activar la búsqueda por significado."}
                </p>
                <p className="mt-2 text-[11px] text-ink-3">
                  {fragmentos.length} fragmento{fragmentos.length === 1 ? "" : "s"} · {listaFuentes.length} fuente
                  {listaFuentes.length === 1 ? "" : "s"}
                  {preguntas.length > 0 && (
                    <>
                      {" · "}
                      <Link href={`/bots/${bot.id}/training?t=sin-respuesta`} className="font-semibold text-pink hover:underline">
                        {preguntas.length} pregunta{preguntas.length === 1 ? "" : "s"} sin responder
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Sitio web ─────────────────────────────────────────────────── */}
        {activa === "web" && (
          <div className="card-l max-w-3xl p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/15 text-sky-600">
                <Globe className="h-4 w-4" />
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Aprender de tu sitio web</h3>
            </div>
            <p className="mb-3 text-xs text-ink-3">
              Pega la dirección de una página (inicio, precios, preguntas frecuentes…) y el chatbot leerá su contenido
              automáticamente. Puedes repetirlo con varias páginas.
            </p>
            <form action={importFromUrl} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="bot_id" value={bot.id} />
              <div className="min-w-[260px] flex-1">
                <input name="url" required className="input-l" placeholder="https://tunegocio.com/precios" />
              </div>
              <button className="btn-primary"><Download className="h-4 w-4" /> Leer página</button>
            </form>

            {listaFuentes.length > 0 ? (
              <div className="mt-4 border-t border-linea pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Fuentes cargadas</p>
                <div className="space-y-1.5">
                  {listaFuentes.map((f) => (
                    <div key={f.nombre} className="flex items-center gap-2 rounded-lg bg-suave px-3 py-2">
                      <Globe className="h-3.5 w-3.5 flex-none text-ink-3" />
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">{f.nombre}</span>
                      <span className="flex-none text-[11px] text-ink-3">{f.trozos} fragmentos</span>
                      <form action={deleteSource} className="flex-none">
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <input type="hidden" name="source_name" value={f.nombre} />
                        <button className="text-ink-3 transition hover:text-danger" title="Quitar esta fuente">✕</button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 border-t border-linea pt-3 text-xs text-ink-3">
                Todavía no has cargado ninguna página. Empieza por la que más preguntas responda: precios o
                preguntas frecuentes.
              </p>
            )}
          </div>
        )}

        {/* ── Fragmentos ────────────────────────────────────────────────── */}
        {activa === "fragmentos" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <div className="card-l p-5">
                <h3 className="mb-3 font-display text-lg font-semibold text-ink">Agregar información</h3>
                <AgregarConocimiento botId={bot.id} accion={addKnowledge} />
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-ink">Lo que ya sabe</h3>
                {fragmentos.length > 0 && (
                  <span className="text-xs text-ink-3">{fragmentos.length} temas · {activos} activos</span>
                )}
              </div>

              {fragmentos.length === 0 ? (
                <div className="card-l p-6">
                  <div className="mb-1 flex items-center gap-2 text-ink">
                    <BookOpen className="h-5 w-5" />
                    <span className="font-semibold">Todavía no sabe nada de tu negocio</span>
                  </div>
                  <p className="mb-4 text-sm text-ink-2">
                    Estos son <b className="text-ink">ejemplos</b> (de una pastelería de mentiras). Agrega el que se
                    parezca a tu caso y luego edítalo con tus datos reales.
                  </p>
                  <div className="space-y-2.5">
                    {EJEMPLOS.map((e) => (
                      <form
                        action={addKnowledgeSimple}
                        key={e.t}
                        className="flex items-start gap-3 rounded-xl border border-dashed border-linea bg-tarjeta-2 p-3"
                      >
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <input type="hidden" name="title" value={e.t} />
                        <input type="hidden" name="content" value={e.c} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-ink">{e.t}</div>
                          <div className="mt-0.5 text-xs text-ink-2">{e.c}</div>
                        </div>
                        <button className="btn-soft flex-none whitespace-nowrap px-3 py-1.5 text-xs">
                          <Plus className="h-3.5 w-3.5" /> Agregar
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {fragmentos.map((k) => (
                    <div key={k.id} className={`card-l p-4 ${k.enabled ? "" : "opacity-60"}`}>
                      <details>
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-ink">{k.title}</h4>
                              {!k.enabled && (
                                <span className="rounded-md bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                                  Desactivado
                                </span>
                              )}
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{k.content}</p>
                          </div>
                          <span className="flex-none text-xs font-semibold text-pink">Editar</span>
                        </summary>

                        <form action={updateKnowledge} className="mt-3 space-y-2 border-t border-linea pt-3">
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="bot_id" value={bot.id} />
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-ink-2">Tema</label>
                            <input name="title" defaultValue={k.title} className="input-l" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-ink-2">Contenido</label>
                            <textarea name="content" defaultValue={k.content} className="input-l min-h-[110px]" />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <button className="btn-primary px-4 py-2 text-xs">Guardar cambios</button>
                            <span className="text-[11px] text-ink-3">{k.source_url ? `Origen: ${k.source_url}` : ""}</span>
                          </div>
                        </form>
                      </details>

                      <div className="mt-3 flex items-center justify-end gap-2 border-t border-linea pt-2.5">
                        <form action={toggleKnowledge}>
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="bot_id" value={bot.id} />
                          <input type="hidden" name="enabled" value={String(!!k.enabled)} />
                          <button className="btn-soft px-3 py-1.5 text-xs">{k.enabled ? "Desactivar" : "Activar"}</button>
                        </form>
                        <form action={deleteKnowledge}>
                          <input type="hidden" name="id" value={k.id} />
                          <input type="hidden" name="bot_id" value={bot.id} />
                          <button className="text-ink-3 transition hover:text-danger" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-ink-3">
                Para que el chatbot use esta información, activa la IA en la pestaña{" "}
                <Link href={`/bots/${bot.id}/ai`} className="font-semibold text-pink hover:underline">Lana IA</Link>{" "}
                y agrega un bloque de <b className="text-ink-2">Respuesta con IA</b> en tu conversación.
              </p>
            </div>
          </div>
        )}

        {/* ── Preguntas sin responder ───────────────────────────────────── */}
        {activa === "sin-respuesta" && (
          <div className="max-w-3xl">
            <LanaSays className="mb-4" title="Lana · Por qué esto importa">
              Cada una de estas preguntas es a la vez una venta que se me escapó y la instrucción exacta de qué me
              falta aprender. Están ordenadas por <b className="text-ink">cuántas veces</b> me las hicieron, no por
              fecha: lo que urge es lo que más se repite.
            </LanaSays>
            <LoQueNoSupo preguntas={preguntas} />
          </div>
        )}

        {/* ── Las que todavía no existen ────────────────────────────────── */}
        {["archivos", "sheets", "faqs"].includes(activa) && (
          <div className="card-l max-w-2xl p-6">
            <h3 className="mb-1 font-display text-base font-semibold text-ink">
              {activa === "archivos" && "Subir archivos"}
              {activa === "sheets" && "Conectar Google Sheets"}
              {activa === "faqs" && "Preguntas frecuentes"}
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-ink-2">
              {activa === "archivos" &&
                "Aquí vas a poder subir tus PDF, documentos de Word y textos —catálogos, listas de precios, políticas— y el chatbot los leerá completos."}
              {activa === "sheets" &&
                "Aquí vas a poder conectar una hoja de cálculo y traer sus filas cada cierto tiempo, sin volver a tocarla."}
              {activa === "faqs" &&
                "Aquí vas a poder escribir pares de pregunta y respuesta para lo que más te preguntan y quieres contestar palabra por palabra."}
            </p>
            <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-[12px] leading-relaxed text-ink-2">
              <b className="text-ink">Todavía no está disponible.</b> Mientras tanto, lo mismo se consigue{" "}
              {activa === "sheets" ? (
                <>
                  pegando el contenido de la hoja como{" "}
                  <Link href={`/bots/${bot.id}/training?t=fragmentos`} className="font-semibold text-pink hover:underline">
                    fragmentos
                  </Link>
                  .
                </>
              ) : (
                <>
                  copiando el texto en{" "}
                  <Link href={`/bots/${bot.id}/training?t=fragmentos`} className="font-semibold text-pink hover:underline">
                    fragmentos
                  </Link>{" "}
                  o leyendo la página desde{" "}
                  <Link href={`/bots/${bot.id}/training?t=web`} className="font-semibold text-pink hover:underline">
                    tu sitio web
                  </Link>
                  .
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
