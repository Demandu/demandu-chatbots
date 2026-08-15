import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { disconnectIntegration, saveWhatsappChannel, disconnectWhatsapp } from "../actions";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { WhatsAppConnect } from "@/components/integrations/WhatsAppConnect";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const orgId = await getCurrentOrgId();
  const sb = createClient();
  const [{ data }, { data: wa }, { data: bots }] = await Promise.all([
    sb.from("integrations").select("provider, account_email, data, created_at").eq("org_id", orgId ?? "").eq("provider", "google_calendar").maybeSingle(),
    sb.from("whatsapp_channels").select("*").eq("org_id", orgId ?? "").maybeSingle(),
    sb.from("bots").select("id,name,channel").order("created_at", { ascending: false }),
  ]);

  const google = data as any | null;
  const calendars = (google?.data?.calendars as any[]) ?? [];
  const err = searchParams?.error;
  const connected = searchParams?.connected === "1";

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "demandu-chatbots.netlify.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const webhookUrl = `${proto}://${host}/api/webhooks/whatsapp`;
  const waBots = ((bots as any[]) ?? []).filter((b) => b.channel === "whatsapp");

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-white">Integraciones</h2>
        <p className="text-xs text-muted-2">
          Conecta servicios externos para potenciar tus flujos. La conexión la inicias tú y puedes revocarla cuando quieras.
        </p>
      </div>

      {connected && (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-success">
          ✅ Google Calendar se conectó correctamente.
        </div>
      )}
      {err && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {err === "missing_credentials"
            ? "Faltan las credenciales de Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) en el servidor."
            : `No se pudo conectar: ${err}`}
        </div>
      )}

      {/* Tarjeta Google Calendar */}
      <div className="rounded-2xl border border-surface-border bg-surface-card p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-white text-2xl">📅</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-white">Google Calendar</h3>
              {google ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">Conectado</span>
              ) : (
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-2">
              Permite que el nodo <b className="text-muted">Agendar cita</b> cree eventos y revise disponibilidad en tu calendario.
            </p>

            {google ? (
              <div className="mt-3">
                <p className="text-xs text-muted">
                  Cuenta: <b className="text-white">{google.account_email ?? "—"}</b>
                  {calendars.length > 0 && <> · {calendars.length} calendario(s) disponibles</>}
                </p>
                <form action={disconnectIntegration} className="mt-3">
                  <input type="hidden" name="provider" value="google_calendar" />
                  <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <a
                href="/api/integrations/google/start"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-demandu-gradient px-4 py-2 text-sm font-semibold text-white"
              >
                Conectar Google Calendar
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── WhatsApp Cloud API ── */}
      <div className="mt-4 rounded-2xl border border-surface-border bg-surface-card p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-white">
            <ChannelIcon channel="whatsapp" className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-white">WhatsApp Cloud API</h3>
              {wa ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">Conectado</span>
              ) : (
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-2">Recibe y responde mensajes de WhatsApp en vivo con tu bot y tu Bandeja.</p>

            {/* Datos del webhook para pegar en Meta */}
            <div className="mt-3 space-y-1.5 rounded-xl border border-surface-border bg-surface-raised p-3 text-xs">
              <div className="text-muted-2">En tu app de Meta → WhatsApp → Configuración → Webhook:</div>
              <div className="flex flex-wrap gap-x-2">
                <span className="text-muted-2">URL de callback:</span>
                <code className="break-all font-mono text-white">{webhookUrl}</code>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <span className="text-muted-2">Verify token:</span>
                <code className="font-mono text-white">el valor de <b>WHATSAPP_VERIFY_TOKEN</b> en Netlify</code>
              </div>
              <div className="text-muted-2">Suscríbete al campo <b className="text-muted">messages</b>.</div>
            </div>

            {wa ? (
              <div className="mt-3">
                <p className="text-xs text-muted">
                  Número: <b className="text-white">{(wa as any).display_number ?? (wa as any).phone_number_id}</b>
                  {waBots.length > 0 && (wa as any).bot_id && (
                    <> · Bot: <b className="text-white">{waBots.find((b) => b.id === (wa as any).bot_id)?.name ?? "—"}</b></>
                  )}
                </p>
                <form action={disconnectWhatsapp} className="mt-3">
                  <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <>
                <WhatsAppConnect
                  appId={process.env.NEXT_PUBLIC_META_APP_ID}
                  configId={process.env.NEXT_PUBLIC_META_CONFIG_ID}
                  bots={waBots.map((b) => ({ id: b.id, name: b.name }))}
                />

                {/* Fallback manual (avanzado) */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-[11px] font-semibold text-muted-2 hover:text-muted">Conexión manual (avanzada)</summary>
                  <form action={saveWhatsappChannel} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Phone Number ID</label>
                      <input name="phone_number_id" required className="input" placeholder="1234567890" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">WABA ID (opcional)</label>
                      <input name="waba_id" className="input" placeholder="WABA id" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Número visible (opcional)</label>
                      <input name="display_number" className="input" placeholder="+52 55…" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-muted">Bot que responderá</label>
                      <select name="bot_id" className="input">
                        <option value="">— elige un bot de WhatsApp —</option>
                        {waBots.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-muted">Access Token (permanente)</label>
                      <input name="access_token" required type="password" className="input font-mono" placeholder="EAAG…" />
                    </div>
                    <div className="sm:col-span-2">
                      <button className="btn-primary">Guardar conexión manual</button>
                    </div>
                  </form>
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
