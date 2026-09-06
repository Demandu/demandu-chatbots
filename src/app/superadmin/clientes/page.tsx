import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChevronRight, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Todos los clientes de la plataforma, con lo que paga cada uno.
 *
 * QUÉ SIGNIFICA "INGRESO" AQUÍ, PARA QUE NADIE SE ENGAÑE: es lo que las
 * cuentas ACTIVAS deberían pagar este mes — su plan más sus complementos. No
 * es lo cobrado. Una cuenta en prueba suma cero aunque tenga plan asignado, y
 * una con el pago fallido tampoco cuenta hasta que se resuelva.
 *
 * Lo cobrado de verdad está en las facturas de cada cliente, que es de donde
 * hay que sacar las comisiones el día que existan: pagar comisión sobre un
 * cobro que rebotó es dinero que no vuelve.
 */

const usd = (v: number) =>
  `$${v.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const ETIQUETA: Record<string, { texto: string; clase: string }> = {
  activa: { texto: "Al día", clase: "bg-success/15 text-exito" },
  prueba: { texto: "En prueba", clase: "bg-violet/15 text-violet" },
  pago_fallido: { texto: "Pago fallido", clase: "bg-danger/15 text-danger" },
  cancelada: { texto: "Cancelada", clase: "bg-suave-2 text-ink-3" },
};

function fecha(v: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export default async function ClientesPage() {
  const admin = createAdminClient();

  // Tres consultas fijas, no una por cliente. Con cien clientes esto sigue
  // siendo tres viajes; hacerlo dentro del bucle serían trescientos.
  const [{ data: orgs }, { data: planes }, { data: addons }] = await Promise.all([
    admin
      .from("organizations")
      .select(
        "id, name, plan, estado_cobro, created_at, periodo_termina_at, prueba_termina_at, cancela_al_terminar, cancelada_at, stripe_customer_id, datos_borrados_at, contacto_nombre, contacto_email, contacto_telefono",
      )
      .order("created_at", { ascending: false }),
    admin.from("plans").select("code, name, price_monthly"),
    admin.from("org_addons").select("org_id, quantity, addon_code, addons(price)").eq("active", true),
  ]);

  const precioDe = new Map<string, { nombre: string; precio: number }>(
    ((planes as any[]) ?? []).map((p) => [p.code, { nombre: p.name, precio: Number(p.price_monthly ?? 0) }]),
  );

  const addonsPorOrg = new Map<string, number>();
  for (const a of ((addons as any[]) ?? [])) {
    const suma = Number(a.quantity ?? 1) * Number(a.addons?.price ?? 0);
    addonsPorOrg.set(a.org_id, (addonsPorOrg.get(a.org_id) ?? 0) + suma);
  }

  const filas = ((orgs as any[]) ?? [])
    // Una cuenta con los datos borrados ya no es un cliente: se fue y pidió
    // que no quedara nada. Sigue en la base de bajas, no aquí.
    .filter((o) => !o.datos_borrados_at)
    .map((o) => {
      const plan = precioDe.get(o.plan) ?? { nombre: o.plan ?? "sin plan", precio: 0 };
      const extra = addonsPorOrg.get(o.id) ?? 0;
      const cuenta = o.estado_cobro === "activa";
      return {
        ...o,
        planNombre: plan.nombre,
        mensual: plan.precio + extra,
        extra,
        // Solo suma al total si de verdad está pagando.
        aporta: cuenta ? plan.precio + extra : 0,
      };
    })
    .sort((a, b) => b.aporta - a.aporta || Date.parse(b.created_at) - Date.parse(a.created_at));

  const mrr = filas.reduce((s, f) => s + f.aporta, 0);
  const activas = filas.filter((f) => f.estado_cobro === "activa").length;
  const enPrueba = filas.filter((f) => f.estado_cobro === "prueba").length;
  const conProblema = filas.filter((f) => f.estado_cobro === "pago_fallido").length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Clientes</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Todas las cuentas de la plataforma. Entra en una para ver sus facturas, su consumo y el estado de
            su cuenta de Meta.
          </p>
        </div>
        <Link href="/superadmin/clientes/nuevo" className="btn-primary inline-flex items-center gap-1.5 px-4">
          <UserPlus className="h-4 w-4" /> Dar de alta un cliente
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          ["Ingreso mensual de cuentas al día", usd(mrr)],
          ["Cuentas al día", String(activas)],
          ["En prueba", String(enPrueba)],
          ["Con el pago fallido", String(conProblema)],
        ].map(([t, v]) => (
          <div key={t} className="card-l p-4">
            <p className="text-xs text-ink-3">{t}</p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linea">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Al mes</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Cliente desde</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => {
              const e = ETIQUETA[c.estado_cobro] ?? { texto: c.estado_cobro ?? "—", clase: "bg-suave-2 text-ink-3" };
              return (
                <tr key={c.id} className="border-t border-linea bg-tarjeta">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{c.name ?? "—"}</div>
                    {!c.stripe_customer_id && (
                      <div className="text-xs text-ink-3">todavía sin cliente en Stripe</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink-2">{c.contacto_nombre || "—"}</div>
                    <div className="text-xs text-ink-3">
                      {c.contacto_email || ""}
                      {c.contacto_telefono ? ` · ${c.contacto_telefono}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{c.planNombre}</td>
                  <td className="px-4 py-3 text-ink-2">
                    {usd(c.mensual)}
                    {c.extra > 0 && (
                      <div className="text-xs text-ink-3">incluye {usd(c.extra)} de complementos</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${e.clase}`}>
                      {e.texto}
                    </span>
                    {/* Canceló pero su mes sigue corriendo: se ve "Al día" y
                        es correcto, pero se va. Sin esta línea, una baja
                        pactada se descubre el día que desaparece. */}
                    {c.cancela_al_terminar && (
                      <div className="mt-0.5 text-[11px] text-aviso">se va el {fecha(c.periodo_termina_at)}</div>
                    )}
                    {c.estado_cobro === "prueba" && (
                      <div className="mt-0.5 text-[11px] text-ink-3">hasta {fecha(c.prueba_termina_at)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-3">{fecha(c.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/superadmin/clientes/${c.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-pink hover:underline"
                    >
                      Abrir ficha <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!filas.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-3">
                  Todavía no hay clientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-3">
        <b className="text-ink-2">«Ingreso mensual» es lo comprometido, no lo cobrado.</b> Suma el plan y los
        complementos de las cuentas al día. Las que están en prueba o con el pago fallido suman cero hasta que
        se resuelva. Lo cobrado de verdad está en las facturas de cada ficha.
      </p>
    </div>
  );
}
