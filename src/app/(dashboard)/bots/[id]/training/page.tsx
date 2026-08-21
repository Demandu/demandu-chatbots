import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { LanaSays } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { addKnowledge, addKnowledgeSimple, deleteKnowledge, toggleKnowledge, updateKnowledge, importFromUrl, deleteSource } from "./actions";
import { AgregarConocimiento } from "@/components/bots/AgregarConocimiento";
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

export default async function BotTrainingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { imported?: string; error?: string };
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

  const { data: items } = await supabase
    .from("bot_knowledge")
    .select("*")
    .eq("bot_id", params.id)
    .order("created_at", { ascending: false });

  const list = (items as any[]) ?? [];
  const activos = list.filter((k) => k.enabled).length;
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

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Entrenamiento</h2>
        <p className="mb-5 text-sm text-ink-2">
          Todo lo que tu chatbot sabe de tu negocio: precios, horarios, servicios, políticas. Entre más le cuentes,
          mejor contesta.
        </p>

        <LanaSays className="mb-6" title="Lana · Cómo funciona">
          Escribe la información de tu negocio como se la explicarías a un empleado nuevo. Cuando un cliente pregunte
          algo, yo busco aquí la respuesta y contesto con <b className="text-ink">tus datos reales</b> — nunca me los
          invento. Si algo no está aquí, lo digo y ofrezco pasar la conversación a una persona.
        </LanaSays>

        <p className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-suave px-3 py-1.5 text-[11px] text-ink-2">
          <span className={`h-1.5 w-1.5 rounded-full ${semantica ? "bg-success" : "bg-warning"}`} />
          {semantica
            ? "Búsqueda por significado activa: entiende preguntas aunque estén escritas con otras palabras."
            : "Búsqueda por palabras clave. Funciona bien con poca información; para documentos largos conviene activar la búsqueda por significado."}
        </p>

        {/* Espacio de entrenamiento del plan */}
        <div className={`card-l mb-5 p-4 ${storage.full ? "border-danger/50" : storage.nearLimit ? "border-warning/50" : ""}`}>
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
              <span className="font-semibold text-danger">
                Sin espacio — libera información o amplía tu plan.
              </span>
            ) : storage.nearLimit ? (
              <span className="font-semibold text-aviso">Te queda poco espacio ({formatBytes(storage.remainingBytes)}).</span>
            ) : (
              <Link href="/settings/plan" className="font-semibold text-pink hover:underline">Ver plan y ampliar espacio →</Link>
            )}
          </div>
        </div>

        {/* Avisos de importación */}
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

        {/* Importar desde el sitio web del cliente */}
        <div className="card-l mb-6 p-5">
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

          {listaFuentes.length > 0 && (
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
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Alta */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-ink">Agregar información</h3>
              <AgregarConocimiento botId={bot.id} accion={addKnowledge} />

              {list.length === 0 && (
                <div className="mt-5 border-t border-linea pt-4">
                  <p className="mb-2 text-xs font-semibold text-ink-2">¿No sabes por dónde empezar?</p>
                  <p className="text-[11px] text-ink-3">
                    Lo más útil suele ser: <b className="text-ink-2">horarios</b>, <b className="text-ink-2">precios</b>,{" "}
                    <b className="text-ink-2">envíos</b> y <b className="text-ink-2">formas de pago</b>. Puedes copiar
                    los ejemplos de la derecha y adaptarlos.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">Lo que ya sabe</h3>
              {list.length > 0 && <span className="text-xs text-ink-3">{list.length} temas · {activos} activos</span>}
            </div>

            {list.length === 0 ? (
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
                {list.map((k) => (
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

                      {/* Edición en línea */}
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
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-ink-3">
                              {k.source_url ? `Origen: ${k.source_url}` : ""}
                            </span>
                          </div>
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
      </div>
    </>
  );
}
