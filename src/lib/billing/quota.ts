/**
 * Cuotas del SaaS: cuánto espacio de entrenamiento tiene cada cliente
 * según su plan, más los complementos (GB extra) que haya contratado.
 */

export type Storage = {
  usedBytes: number;
  limitBytes: number;
  pct: number;
  planCode: string;
  planName: string;
  planStorageMb: number;
  extraMb: number;
  remainingBytes: number;
  full: boolean;
  nearLimit: boolean;
};

export function formatBytes(b: number): string {
  if (!b || b < 0) return "0 MB";
  const mb = b / (1024 * 1024);
  if (mb < 0.1) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** Lee el uso y el límite de una organización. */
export async function getStorage(supabase: any, orgId: string | null): Promise<Storage> {
  const empty: Storage = {
    usedBytes: 0, limitBytes: 0, pct: 0, planCode: "", planName: "—",
    planStorageMb: 0, extraMb: 0, remainingBytes: 0, full: false, nearLimit: false,
  };
  if (!orgId) return empty;

  try {
    const [{ data: org }, { data: used }, { data: limit }] = await Promise.all([
      supabase.from("organizations").select("plan, extra_storage_mb").eq("id", orgId).maybeSingle(),
      supabase.rpc("org_storage_used_bytes", { p_org: orgId }),
      supabase.rpc("org_storage_limit_bytes", { p_org: orgId }),
    ]);

    const planCode = (org?.plan as string) ?? "";
    const extraMb = Number(org?.extra_storage_mb ?? 0);

    let planName = planCode || "—";
    let planStorageMb = 0;
    if (planCode) {
      const { data: plan } = await supabase
        .from("plans")
        .select("name, storage_mb")
        .eq("code", planCode)
        .maybeSingle();
      if (plan) { planName = plan.name; planStorageMb = Number(plan.storage_mb ?? 0); }
    }

    const usedBytes = Number(used ?? 0);
    const limitBytes = Number(limit ?? 0);
    const pct = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;

    return {
      usedBytes,
      limitBytes,
      pct,
      planCode,
      planName,
      planStorageMb,
      extraMb,
      remainingBytes: Math.max(0, limitBytes - usedBytes),
      full: limitBytes > 0 && usedBytes >= limitBytes,
      nearLimit: pct >= 85,
    };
  } catch {
    return empty;
  }
}

/**
 * ¿Cabe lo que quiere guardar? Devuelve un mensaje listo para mostrar
 * si no cabe (en lenguaje simple, sin tecnicismos).
 */
export async function checkQuota(
  supabase: any,
  orgId: string | null,
  incomingBytes: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const s = await getStorage(supabase, orgId);
  if (s.limitBytes <= 0) return { ok: true }; // sin plan configurado: no bloqueamos

  if (s.usedBytes + incomingBytes > s.limitBytes) {
    return {
      ok: false,
      message:
        `Se acabó el espacio de entrenamiento de tu plan ${s.planName} ` +
        `(${formatBytes(s.usedBytes)} de ${formatBytes(s.limitBytes)}). ` +
        `Libera espacio borrando información que ya no uses, o amplía tu plan.`,
    };
  }
  return { ok: true };
}
