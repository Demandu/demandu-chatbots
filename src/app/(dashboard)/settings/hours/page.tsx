import { ZONA_POR_PREFIJO, comoSeLee } from "@/lib/zonaHoraria";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { updateBusinessHours } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";

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

/* ── SALE DEL MAPA DE PREFIJOS, NO DE UNA LISTA A MANO ────────────────────
 *
 * La lista escrita aquí tenía ocho zonas y NO INCLUÍA PANAMÁ — ni Costa Rica,
 * ni Guatemala, ni El Salvador, ni Honduras, ni Nicaragua. O sea: en una
 * plataforma para Latinoamérica, media Centroamérica no podía elegir su propia
 * hora aunque supiera que la tenía mal.
 *
 * Saliendo del mismo mapa que usa la detección por teléfono, añadir un país es
 * un sitio y no dos, y no se pueden separar.
 */
const TIMEZONES = [
  ...new Set([
    ...Object.values(ZONA_POR_PREFIJO),
    // Las que no se deducen de un prefijo pero se eligen a mano: Estados
    // Unidos tiene seis husos y por eso no se adivina, pero sí se elige.
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
  ]),
].sort();

export default async function HoursPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const orgId = await getCurrentOrgId();
  const saved = searchParams?.saved === "1";
  const { data: org } = await createClient()
    .from("organizations")
    .select("business_hours, timezone")
    .eq("id", orgId ?? "")
    .maybeSingle();

  const bh = (org?.business_hours as any) ?? {};
  /* ── SIN ZONA, EL SELECTOR NO PRESELECCIONA NINGUNA ──────────────────────
   *
   * Aquí había `?? "America/Mexico_City"`, y era la trampa más fina de todas:
   * el selector enseñaba México como si el negocio lo hubiera elegido, y al
   * guardar el horario laboral —que es a lo que se viene a esta pantalla— se
   * guardaba esa zona Y se marcaba como confirmada.
   *
   * O sea: un negocio de Panamá «confirmaba» México sin haber tocado el
   * selector. Pasó de verdad, y con la cuenta de Demandu.
   *
   * Vacío obliga a elegir, que es lo correcto cuando no se sabe. */
  const tz = (org?.timezone as string) ?? "";

  return (
    <form action={updateBusinessHours} className="max-w-xl">
      {saved && (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          ✓ Horario laboral guardado.
        </div>
      )}
      <div className="mb-5 card-l p-4">
        <label className="mb-1.5 block text-xs font-semibold text-ink-2">Zona horaria</label>
        <select name="timezone" defaultValue={tz} required className="input-l">
          {/* La opción vacía solo existe mientras no haya zona: obliga a elegir
              una en vez de dejar que se guarde la primera de la lista. */}
          {!tz && <option value="">Elige tu zona horaria…</option>}
          {TIMEZONES.map((z) => (
            <option key={z} value={z}>{comoSeLee(z) || z}</option>
          ))}
        </select>
      </div>

      <div className="card-l divide-y divide-linea">
        {DAYS.map((d) => {
          const day = bh?.[d.key] ?? { enabled: false, open: "09:00", close: "18:00" };
          return (
            <div key={d.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex w-32 items-center gap-2.5 text-sm font-medium text-ink">
                <input type="checkbox" name={`${d.key}_enabled`} defaultChecked={!!day.enabled} className="accent-pink" />
                {d.label}
              </label>
              <div className="flex items-center gap-2 text-sm text-ink-2">
                <input type="time" name={`${d.key}_open`} defaultValue={day.open ?? "09:00"} className="rounded-lg border border-linea-2 bg-tarjeta px-2.5 py-1.5 text-ink focus:outline-none" />
                <span>a</span>
                <input type="time" name={`${d.key}_close`} defaultValue={day.close ?? "18:00"} className="rounded-lg border border-linea-2 bg-tarjeta px-2.5 py-1.5 text-ink focus:outline-none" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <SubmitButton>Guardar horario</SubmitButton>
        <p className="text-xs text-ink-3">El bloque “Asignar chat” usará este horario cuando actives “solo horario laboral”.</p>
      </div>
    </form>
  );
}
