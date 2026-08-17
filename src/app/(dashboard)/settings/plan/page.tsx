import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org";
import { getStorage, formatBytes } from "@/lib/billing/quota";
import { Check, HardDrive, Bot, MessagesSquare } from "lucide-react";

export const dynamic = "force-dynamic";

function money(v: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `$${v}`;
  }
}

export default async function PlanPage() {
  const supabase = createClient();
  const orgId = await getCurrentOrgId();

  const [storage, { data: plans }, { count: bots }] = await Promise.all([
    getStorage(supabase, orgId),
    supabase.from("plans").select("*").eq("active", true).order("sort"),
    supabase.from("bots").select("id", { count: "exact", head: true }),
  ]);

  const list = (plans as any[]) ?? [];
  const actual = list.find((p) => p.code === storage.planCode);

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">Tu plan y consumo</h2>
        <p className="text-xs text-ink-3">
          Cuánto llevas usado de lo que incluye tu plan, y qué obtienes si lo amplías.
        </p>
      </div>

      {/* Consumo */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className={`card-l p-4 ${storage.full ? "border-danger/50" : storage.nearLimit ? "border-warning/50" : ""}`}>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet/15 text-violet">
              <HardDrive className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Entrenamiento</span>
          </div>
          <div className="font-display text-xl font-bold text-ink">{formatBytes(storage.usedBytes)}</div>
          <div className="text-xs text-ink-3">de {formatBytes(storage.limitBytes)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e6e8f2]">
            <span
              className={`block h-full rounded-full ${storage.full ? "bg-danger" : storage.nearLimit ? "bg-warning" : "bg-demandu-gradient"}`}
              style={{ width: `${Math.max(2, storage.pct)}%` }}
            />
          </div>
        </div>

        <div className="card-l p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-pink/15 text-pink">
              <Bot className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Chatbots</span>
          </div>
          <div className="font-display text-xl font-bold text-ink">{bots ?? 0}</div>
          <div className="text-xs text-ink-3">de {actual?.bots_limit ?? "—"} incluidos</div>
        </div>

        <div className="card-l p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/15 text-sky-600">
              <MessagesSquare className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">Conversaciones</span>
          </div>
          <div className="font-display text-xl font-bold text-ink">{actual?.conversations_month ?? "—"}</div>
          <div className="text-xs text-ink-3">incluidas al mes</div>
        </div>
      </div>

      {storage.extraMb > 0 && (
        <div className="mb-6 rounded-xl border border-violet/30 bg-violet/5 px-4 py-3 text-sm text-ink-2">
          Tienes contratados <b className="text-ink">{storage.extraMb} MB adicionales</b> de espacio de entrenamiento,
          sumados a los de tu plan.
        </div>
      )}

      {/* Planes */}
      <h3 className="mb-3 font-display text-base font-semibold text-ink">Planes disponibles</h3>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((p) => {
          const esActual = p.code === storage.planCode;
          return (
            <div key={p.code} className={`card-l relative p-5 ${esActual ? "border-pink ring-2 ring-pink/15" : ""}`}>
              {esActual && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-demandu-gradient px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Tu plan
                </span>
              )}
              <div className="font-display text-lg font-bold text-ink">{p.name}</div>
              <div className="mt-1 font-display text-2xl font-bold text-ink">
                {money(Number(p.price_monthly), p.currency)}
                <span className="text-sm font-medium text-ink-3"> /mes</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-ink-2">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                  <span><b className="text-ink">{p.storage_mb >= 1024 ? `${(p.storage_mb / 1024).toFixed(0)} GB` : `${p.storage_mb} MB`}</b> de entrenamiento</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                  <span><b className="text-ink">{p.bots_limit}</b> chatbot{p.bots_limit === 1 ? "" : "s"}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-success" />
                  <span><b className="text-ink">{p.conversations_month.toLocaleString("es-MX")}</b> conversaciones/mes</span>
                </li>
              </ul>
              {!esActual && (
                <a
                  href="mailto:contacto@demandu.tech?subject=Quiero%20cambiar%20de%20plan"
                  className="btn-soft mt-4 w-full justify-center"
                >
                  Quiero este plan
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Add-on */}
      <div className="card-l mt-6 p-5">
        <h3 className="font-display text-base font-semibold text-ink">¿Necesitas más espacio?</h3>
        <p className="mt-1 text-sm text-ink-2">
          Puedes contratar espacio de entrenamiento adicional sin cambiar de plan, y ampliarlo cuando quieras.
        </p>
        <a
          href="mailto:contacto@demandu.tech?subject=Quiero%20espacio%20adicional"
          className="btn-primary mt-3"
        >
          Contratar espacio extra
        </a>
        <p className="mt-3 text-[11px] text-ink-3">
          ¿Buscas liberar espacio? Revisa el <b className="text-ink-2">Entrenamiento</b> de cada chatbot y borra
          fuentes o información que ya no uses.{" "}
          <Link href="/bots" className="font-semibold text-pink hover:underline">Ir a Chatbots →</Link>
        </p>
      </div>
    </div>
  );
}
