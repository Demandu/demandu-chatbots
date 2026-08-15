import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { disconnectIntegration } from "../actions";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const orgId = await getCurrentOrgId();
  const { data } = await createClient()
    .from("integrations")
    .select("provider, account_email, data, created_at")
    .eq("org_id", orgId ?? "")
    .eq("provider", "google_calendar")
    .maybeSingle();

  const google = data as any | null;
  const calendars = (google?.data?.calendars as any[]) ?? [];
  const err = searchParams?.error;
  const connected = searchParams?.connected === "1";

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
    </div>
  );
}
