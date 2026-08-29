import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { disconnectIntegration, disconnectWhatsapp } from "../actions";
import { ChannelIcon } from "@/components/inbox/ChannelBadge";
import { WhatsAppConnect } from "@/components/integrations/WhatsAppConnect";
import { GoogleCalendarLogo } from "@/components/integrations/Logos";
import { Catalogo } from "@/components/integrations/Catalogo";
import { LlavesApi, type LlaveFila } from "@/components/integrations/LlavesApi";
import { SheetsConfig, type ConfigSheets } from "@/components/integrations/SheetsConfig";
import { SalidasCrm, type SalidaFila } from "@/components/integrations/SalidasCrm";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const orgId = await getCurrentOrgId();
  const sb = createClient();
  const [{ data }, { data: wa }, { data: bots }, { data: intereses }, { data: llaves }, { data: sheets }, { data: salidas }] = await Promise.all([
    sb.from("integrations").select("provider, account_email, data, created_at").eq("org_id", orgId ?? "").eq("provider", "google_calendar").maybeSingle(),
    sb.from("whatsapp_channels").select("*").eq("org_id", orgId ?? "").maybeSingle(),
    sb.from("bots").select("id,name,channel").order("created_at", { ascending: false }),
    sb.from("interes_integraciones").select("proveedor").eq("org_id", orgId ?? ""),
    sb.from("api_keys").select("id, nombre, prefijo, created_at, ultimo_uso, revocada_at")
      .eq("org_id", orgId ?? "").order("created_at", { ascending: false }),
    sb.from("sheets_config").select("hoja_id, hoja_nombre, activo, ultimo_error")
      .eq("org_id", orgId ?? "").maybeSingle(),
    sb.from("salidas").select("*").eq("org_id", orgId ?? "").order("created_at", { ascending: false }),
  ]);

  const google = data as any | null;
  const calendars = (google?.data?.calendars as any[]) ?? [];
  const err = searchParams?.error;
  const connected = searchParams?.connected === "1";

  const waBots = ((bots as any[]) ?? []).filter((b) => b.channel === "whatsapp");

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Integraciones</h2>
        <p className="text-xs text-ink-3">
          Conecta servicios externos para potenciar tus conversaciones. La conexión la inicias tú y puedes revocarla cuando quieras.
        </p>
      </div>

      {connected && (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          ✅ Google Calendar se conectó correctamente.
        </div>
      )}
      {err && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {err === "missing_credentials"
            ? "La conexión con Google no está disponible en este momento. Escríbenos a soporte y lo habilitamos."
            : "No se pudo completar la conexión. Inténtalo de nuevo o contacta a soporte."}
        </div>
      )}

      {/* El catálogo primero: es a lo que el cliente entra a esta pantalla.
          Lo que ya está conectado se configura debajo. */}
      <div className="mb-8">
        <Catalogo pedidas={((intereses as any[]) ?? []).map((i) => i.proveedor)} />
      </div>

      <h3 className="mb-3 font-display text-base font-semibold text-ink">Lo que ya puedes conectar</h3>

      {/* Tarjeta Google Calendar */}
      <div className="rounded-2xl border border-linea bg-tarjeta p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-linea bg-tarjeta p-2">
            <GoogleCalendarLogo className="h-full w-full" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">Google Calendar</h3>
              {google ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">Conectado</span>
              ) : (
                <span className="rounded-full bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              Permite que el bloque <b className="text-ink-2">Agendar cita</b> cree eventos y revise disponibilidad en tu calendario.
            </p>

            {google ? (
              <div className="mt-3">
                <p className="text-xs text-ink-2">
                  Cuenta: <b className="text-ink">{google.account_email ?? "—"}</b>
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

      <div className="mt-4">
        <SheetsConfig config={(sheets as ConfigSheets) ?? null} googleConectado={!!google} />
      </div>

      <div className="mt-4">
        <SalidasCrm salidas={((salidas as any[]) ?? []) as SalidaFila[]} />
      </div>

      <div className="mt-4">
        <LlavesApi llaves={((llaves as any[]) ?? []) as LlaveFila[]} />
      </div>

      {/* ── WhatsApp Cloud API ── */}
      <div className="mt-4 rounded-2xl border border-linea bg-tarjeta p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-linea bg-tarjeta">
            <ChannelIcon channel="whatsapp" className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-ink">WhatsApp Cloud API</h3>
              {wa ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-exito">Conectado</span>
              ) : (
                <span className="rounded-full bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">Sin conectar</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">Recibe y responde mensajes de WhatsApp en vivo con tu chatbot y tu Bandeja. Conéctalo con un clic — nosotros configuramos todo lo demás por ti.</p>

            {wa ? (
              <div className="mt-3">
                <p className="text-xs text-ink-2">
                  Número: <b className="text-ink">{(wa as any).display_number ?? "Conectado"}</b>
                  {waBots.length > 0 && (wa as any).bot_id && (
                    <> · Bot: <b className="text-ink">{waBots.find((b) => b.id === (wa as any).bot_id)?.name ?? "—"}</b></>
                  )}
                </p>
                <form action={disconnectWhatsapp} className="mt-3">
                  <button className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/20">
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <WhatsAppConnect
                appId={process.env.NEXT_PUBLIC_META_APP_ID}
                configId={process.env.NEXT_PUBLIC_META_CONFIG_ID}
                bots={waBots.map((b) => ({ id: b.id, name: b.name }))}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
