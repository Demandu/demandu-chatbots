import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { updateBusinessHours } from "../actions";

export const dynamic = "force-dynamic";

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const TIMEZONES = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
];

export default async function HoursPage() {
  const orgId = await getCurrentOrgId();
  const { data: org } = await createClient()
    .from("organizations")
    .select("business_hours, timezone")
    .eq("id", orgId ?? "")
    .maybeSingle();

  const bh = (org?.business_hours as any) ?? {};
  const tz = (org?.timezone as string) ?? "America/Mexico_City";

  return (
    <form action={updateBusinessHours} className="max-w-xl">
      <div className="mb-5 card p-4">
        <label className="mb-1.5 block text-xs font-semibold text-muted">Zona horaria</label>
        <select name="timezone" defaultValue={tz} className="input">
          {TIMEZONES.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
      </div>

      <div className="card divide-y divide-surface-border">
        {DAYS.map((d) => {
          const day = bh?.[d.key] ?? { enabled: false, open: "09:00", close: "18:00" };
          return (
            <div key={d.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex w-32 items-center gap-2.5 text-sm font-medium text-white">
                <input type="checkbox" name={`${d.key}_enabled`} defaultChecked={!!day.enabled} className="accent-pink" />
                {d.label}
              </label>
              <div className="flex items-center gap-2 text-sm text-muted">
                <input type="time" name={`${d.key}_open`} defaultValue={day.open ?? "09:00"} className="rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-white focus:outline-none" />
                <span>a</span>
                <input type="time" name={`${d.key}_close`} defaultValue={day.close ?? "18:00"} className="rounded-lg border border-surface-border bg-surface-raised px-2.5 py-1.5 text-white focus:outline-none" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button className="btn-primary">Guardar horario</button>
        <p className="text-xs text-muted-2">El nodo “Asignar chat” usará este horario cuando actives “solo horario laboral”.</p>
      </div>
    </form>
  );
}
