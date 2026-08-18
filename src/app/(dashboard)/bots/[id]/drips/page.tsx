import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { BotTitle } from "@/components/BotTitle";
import { BotNav } from "@/components/builder/BotNav";
import { LanaSays } from "@/components/Lana";
import { createClient } from "@/lib/supabase/server";
import { channelOf } from "@/lib/channels";
import { createDrip, toggleDrip, deleteDrip, addDripStep, deleteDripStep } from "./actions";
import { Timer, Plus, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

const TRIGGER_LABEL: Record<string, string> = {
  new_contact: "Cuando llega un contacto nuevo",
  tag_added: "Cuando el contacto tiene una etiqueta",
  manual: "Solo manual",
};

const UNIT_LABEL: Record<string, string> = {
  minutes: "minuto(s)",
  hours: "hora(s)",
  days: "día(s)",
};

function whenLabel(pos: number, v: number, u: string) {
  if (pos === 1) return v === 0 ? "De inmediato" : `${v} ${UNIT_LABEL[u]} después de entrar`;
  return `${v} ${UNIT_LABEL[u]} después del mensaje anterior`;
}

export default async function BotDripsPage({ params }: { params: { id: string } }) {
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
  if (channelOf(bot.channel) !== "whatsapp") redirect(`/bots/${bot.id}`);

  const [{ data: drips }, { data: steps }, { data: templates }, { data: wa }, { data: tags }] = await Promise.all([
    supabase.from("drips").select("*").eq("bot_id", params.id).order("created_at"),
    supabase.from("drip_steps").select("*").order("position"),
    supabase.from("whatsapp_templates").select("name, language, status").eq("bot_id", params.id).eq("status", "APPROVED"),
    supabase.from("whatsapp_channels").select("bot_id").eq("bot_id", params.id).maybeSingle(),
    supabase.from("tags").select("name").order("name"),
  ]);

  const list = (drips as any[]) ?? [];
  const allSteps = (steps as any[]) ?? [];
  const approved = (templates as any[]) ?? [];
  const connected = !!wa;
  const tagList = ((tags as any[]) ?? []).map((t) => t.name);

  // Suscriptores y envíos por drip
  const ids = list.map((d) => d.id);
  let subsByDrip: Record<string, number> = {};
  let sentByDrip: Record<string, { sent: number; read: number }> = {};
  if (ids.length) {
    const [{ data: subs }, { data: sends }] = await Promise.all([
      supabase.from("drip_subscriptions").select("drip_id, status").in("drip_id", ids),
      supabase.from("drip_sends").select("drip_id, status").in("drip_id", ids),
    ]);
    for (const s of (subs as any[]) ?? []) subsByDrip[s.drip_id] = (subsByDrip[s.drip_id] ?? 0) + 1;
    for (const s of (sends as any[]) ?? []) {
      const acc = (sentByDrip[s.drip_id] ??= { sent: 0, read: 0 });
      if (["sent", "delivered", "read", "replied"].includes(s.status)) acc.sent++;
      if (["read", "replied"].includes(s.status)) acc.read++;
    }
  }

  return (
    <>
      <Topbar crumb={<BotTitle botId={bot.id} initialName={bot.name} />} />
      <div className="min-h-full flex-1 overflow-auto bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <BotNav botId={bot.id} channel={bot.channel} />

        <h2 className="mb-1 font-display text-2xl font-bold text-ink">Seguimientos automáticos</h2>
        <p className="mb-5 text-sm text-ink-2">
          Una secuencia de mensajes que se envían solos con el tiempo. Ideal para no perder al cliente que no contestó.
        </p>

        <LanaSays className="mb-6" title="Lana · Cómo funciona">
          Imagina que alguien te escribe y no compra. Con un seguimiento le mandas un mensaje al{" "}
          <b className="text-ink">día 1</b>, otro al <b className="text-ink">día 3</b> y otro al{" "}
          <b className="text-ink">día 7</b>, automáticamente. Yo me encargo de enviarlos a su hora. Como pasa fuera del
          chat, WhatsApp exige usar <b className="text-ink">plantillas aprobadas</b> — las creas en la pestaña Plantillas.
        </LanaSays>

        {!connected && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Conecta WhatsApp para este chatbot en la pestaña{" "}
            <Link href={`/bots/${bot.id}/install`} className="font-semibold text-ink underline">Conexión</Link>.
          </div>
        )}
        {connected && approved.length === 0 && (
          <div className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm text-ink-2">
            Aún no tienes plantillas aprobadas. Ve a{" "}
            <Link href={`/bots/${bot.id}/templates`} className="font-semibold text-ink underline">Plantillas</Link> y
            sincronízalas con Meta para poder armar los mensajes del seguimiento.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Crear */}
          <div className="lg:col-span-1">
            <div className="card-l p-5">
              <h3 className="mb-3 font-display text-lg font-semibold text-ink">Nuevo seguimiento</h3>
              <form action={createDrip} className="space-y-3">
                <input type="hidden" name="bot_id" value={bot.id} />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Nombre</label>
                  <input name="name" required className="input-l" placeholder="Recuperar cliente que no compró" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">¿A quién se le envía?</label>
                  <select name="trigger_type" className="input-l" defaultValue="new_contact">
                    <option value="new_contact">A cada contacto nuevo de WhatsApp</option>
                    <option value="tag_added">A quien tenga cierta etiqueta</option>
                    <option value="manual">Solo a quien yo agregue (manual)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink-2">Etiqueta (si aplica)</label>
                  <input name="tag_name" list="tag-options" className="input-l" placeholder="interesado" />
                  <datalist id="tag-options">
                    {tagList.map((t) => <option key={t} value={t} />)}
                  </datalist>
                  <p className="mt-1 text-[11px] text-ink-3">Solo se usa con la opción de etiqueta.</p>
                </div>
                <button className="btn-primary w-full"><Plus className="h-4 w-4" /> Crear seguimiento</button>
              </form>
            </div>
          </div>

          {/* Lista */}
          <div className="lg:col-span-2">
            {list.length === 0 ? (
              <div className="card-l grid place-items-center p-12 text-center">
                <Timer className="mb-2 h-8 w-8 text-ink-3" />
                <p className="text-sm text-ink-2">Aún no tienes seguimientos. Crea el primero con el panel de la izquierda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {list.map((d) => {
                  const mySteps = allSteps.filter((s) => s.drip_id === d.id);
                  const stats = sentByDrip[d.id] ?? { sent: 0, read: 0 };
                  return (
                    <div key={d.id} className="card-l p-5">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-lg font-semibold text-ink">{d.name}</h3>
                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${d.enabled ? "bg-success/15 text-[#0f9d63]" : "bg-[#f1f2f9] text-ink-3"}`}>
                              {d.enabled ? "Activo" : "Pausado"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-3">
                            {TRIGGER_LABEL[d.trigger_type] ?? d.trigger_type}
                            {d.trigger_type === "tag_added" && d.tag_name ? `: “${d.tag_name}”` : ""}
                            {" · "}{subsByDrip[d.id] ?? 0} en la secuencia · {stats.sent} enviados · {stats.read} leídos
                          </p>
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          <form action={toggleDrip}>
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="bot_id" value={bot.id} />
                            <input type="hidden" name="enabled" value={String(!!d.enabled)} />
                            <button className="btn-soft px-3 py-1.5 text-xs">{d.enabled ? "Pausar" : "Activar"}</button>
                          </form>
                          <form action={deleteDrip}>
                            <input type="hidden" name="id" value={d.id} />
                            <input type="hidden" name="bot_id" value={bot.id} />
                            <button className="text-ink-3 transition hover:text-danger" title="Eliminar seguimiento">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </form>
                        </div>
                      </div>

                      {/* Pasos */}
                      {mySteps.length === 0 ? (
                        <p className="mb-3 rounded-xl border border-dashed border-[#d7d9e8] px-3 py-3 text-xs text-ink-3">
                          Este seguimiento aún no tiene mensajes. Agrega el primero abajo 👇
                        </p>
                      ) : (
                        <ol className="mb-3 space-y-2">
                          {mySteps.map((s) => (
                            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-[#e6e8f2] bg-[#f9fafd] px-3 py-2.5">
                              <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-demandu-gradient text-[11px] font-bold text-white">
                                {s.position}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-ink">{s.template_name}</div>
                                <div className="text-[11px] text-ink-3">{whenLabel(s.position, s.delay_value, s.delay_unit)}</div>
                              </div>
                              <form action={deleteDripStep}>
                                <input type="hidden" name="id" value={s.id} />
                                <input type="hidden" name="bot_id" value={bot.id} />
                                <button className="text-ink-3 transition hover:text-danger" title="Quitar mensaje">✕</button>
                              </form>
                            </li>
                          ))}
                        </ol>
                      )}

                      {/* Agregar paso */}
                      <form action={addDripStep} className="flex flex-wrap items-end gap-2 border-t border-[#e6e8f2] pt-3">
                        <input type="hidden" name="bot_id" value={bot.id} />
                        <input type="hidden" name="drip_id" value={d.id} />
                        <div className="min-w-[180px] flex-1">
                          <label className="mb-1 block text-[11px] font-semibold text-ink-2">Mensaje (plantilla)</label>
                          <select name="template" required className="input-l" disabled={!approved.length}>
                            <option value="">— elige una plantilla —</option>
                            {approved.map((t) => (
                              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                                {t.name} ({t.language})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20">
                          <label className="mb-1 block text-[11px] font-semibold text-ink-2">Esperar</label>
                          <input name="delay_value" type="number" min={0} defaultValue={mySteps.length === 0 ? 0 : 1} className="input-l" />
                        </div>
                        <div className="w-28">
                          <label className="mb-1 block text-[11px] font-semibold text-ink-2">Unidad</label>
                          <select name="delay_unit" defaultValue="days" className="input-l">
                            <option value="minutes">minutos</option>
                            <option value="hours">horas</option>
                            <option value="days">días</option>
                          </select>
                        </div>
                        <button className="btn-soft" disabled={!approved.length}>
                          <Plus className="h-4 w-4" /> Agregar mensaje
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
