import { createAdminClient } from "@/lib/supabase/admin";
import { PERMISOS } from "@/lib/permisos";
import {
  crearMiembro, guardarMiembro, asignarCliente, calcularComisiones, marcarPagadas,
} from "./acciones";
import { KeyRound, TriangleAlert, Calculator, Banknote, UserPlus, Building2, Users } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Equipo de ventas y partners.
 *
 * LA DISTINCIÓN QUE SOSTIENE ESTA PANTALLA: un vendedor es de Demandu, un
 * partner es otra empresa. Comparten la maquinaria de comisiones pero no la
 * confianza — por eso a un partner ni siquiera se le ofrece la opción de ver
 * la cartera entera. No es una casilla que se pueda marcar por error: la base
 * lo rechaza con un CHECK.
 */

const usd = (v: number) =>
  `$${(v ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const usd0 = (v: number) => `$${(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: { clave?: string; quien?: string; error?: string };
}) {
  const admin = createAdminClient();

  const [{ data: equipo }, { data: orgs }, { data: planes }, { data: comisiones }] = await Promise.all([
    admin.from("equipo_demandu").select("*").order("creado_at"),
    admin
      .from("organizations")
      .select("id, name, plan, estado_cobro, atendido_por")
      .is("datos_borrados_at", null)
      .order("name"),
    admin.from("plans").select("code, price_monthly"),
    admin.from("comisiones").select("miembro_id, monto, estado, periodo"),
  ]);

  const miembros = (equipo as any[]) ?? [];
  const clientes = (orgs as any[]) ?? [];
  const precioDe = new Map<string, number>(
    ((planes as any[]) ?? []).map((p) => [p.code, Number(p.price_monthly ?? 0)]),
  );
  const cs = (comisiones as any[]) ?? [];

  const resumen = (id: string) => {
    const mios = clientes.filter((c) => c.atendido_por === id);
    const mrr = mios
      .filter((c) => c.estado_cobro === "activa")
      .reduce((s, c) => s + (precioDe.get(c.plan) ?? 0), 0);
    const suyas = cs.filter((c) => c.miembro_id === id && c.estado !== "anulada");
    return {
      clientes: mios.length,
      mrr,
      pendiente: suyas.filter((c) => c.estado === "pendiente").reduce((s, c) => s + Number(c.monto ?? 0), 0),
      pagado: suyas.filter((c) => c.estado === "pagada").reduce((s, c) => s + Number(c.monto ?? 0), 0),
    };
  };

  const sinAsignar = clientes.filter((c) => !c.atendido_por);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Equipo y partners</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Vendedores de Demandu y agencias externas, su cartera y lo que hay que pagarles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={calcularComisiones}>
            <button className="btn-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Calculator className="h-3.5 w-3.5" /> Calcular comisiones
            </button>
          </form>
        </div>
      </div>

      {searchParams?.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" /> {searchParams.error}
        </div>
      )}

      {searchParams?.clave && (
        <div className="mb-6 rounded-xl border border-violet/40 bg-violet/5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-violet" />
            <h3 className="font-display text-base font-semibold text-ink">
              Contraseña temporal de {searchParams.quien ?? "la nueva persona"}
            </h3>
          </div>
          <p className="mb-3 text-sm text-ink-2">
            Dísela <b className="text-ink">ahora</b>. Al recargar ya no se puede ver, y no queda guardada.
          </p>
          <p className="select-all rounded-lg bg-tarjeta px-4 py-3 font-mono text-2xl font-bold tracking-[0.2em] text-ink">
            {searchParams.clave}
          </p>
        </div>
      )}

      {/* ── La escala, escrita donde se decide ─────────────────────────── */}
      <div className="card-l mb-6 p-5 text-sm leading-relaxed text-ink-2">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">Cómo se paga</h3>
        <ul className="space-y-1">
          <li>· Planes de hasta <b className="text-ink">$99</b> al mes → <b className="text-ink">15%</b> mensual, mientras el cliente siga pagando.</li>
          <li>· Planes de <b className="text-ink">más de $99</b> al mes → <b className="text-ink">20%</b> mensual.</li>
          <li>· Complementos y pagos únicos (taller, configuración de Meta, bolsitas) → <b className="text-ink">sin comisión</b>.</li>
        </ul>
        <p className="mt-3">
          <b className="text-ink">Se comisiona lo cobrado, no lo facturado.</b> La comisión nace de una factura
          pagada de Stripe: si un cobro rebota, no genera nada. Y una vez apuntada{" "}
          <b className="text-ink">no se recalcula</b> — si mañana cambia la escala, cambia de mañana en
          adelante. Que a alguien le cambie en silencio lo que ya cobró es como se pierde a un vendedor.
        </p>
      </div>

      {/* ── Alta ───────────────────────────────────────────────────────── */}
      <details className="card-l mb-6 p-5">
        <summary className="cursor-pointer font-display text-base font-semibold text-ink">
          <UserPlus className="mr-1.5 inline h-4 w-4" /> Dar de alta a alguien
        </summary>

        <form action={crearMiembro} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Nombre *</label>
              <input name="nombre" required className="input-l w-full" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Correo *</label>
              <input name="email" type="email" required className="input-l w-full" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Qué es</label>
              <select name="tipo" className="input-l w-full">
                <option value="vendedor">Vendedor de Demandu</option>
                <option value="partner">Partner (agencia externa)</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Qué cuentas ve</label>
              <select name="alcance" className="input-l w-full">
                <option value="asignadas">Solo las suyas</option>
                <option value="todas">Todas (solo vendedores)</option>
              </select>
              <p className="mt-1 text-[11px] text-ink-3">
                A un partner se le fuerza a «solo las suyas» aunque elijas otra cosa.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Comisión especial (%)</label>
              <input name="comision_pct" inputMode="decimal" className="input-l w-full" placeholder="usa la escala" />
              <p className="mt-1 text-[11px] text-ink-3">Vacío = 15% / 20% según el plan.</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-ink-2">
              Qué puede ver dentro de la cuenta de un cliente
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISOS.map((p) => (
                <label
                  key={p.clave}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                    p.riesgo ? "border-warning/40 bg-warning/5" : "border-linea bg-suave"
                  }`}
                >
                  <input type="checkbox" name={`permiso_${p.clave}`} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-ink">{p.nombre}</span>
                    <span className="block text-[11px] leading-snug text-ink-3">{p.descripcion}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              Lo marcado en ámbar conviene pensarlo dos veces. «Plan y facturación» deja cambiarle el plan a un
              cliente; «Eliminar información» no se puede deshacer.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-2">Notas</label>
            <textarea name="notas" rows={2} className="input-l w-full" />
          </div>

          <button className="btn-primary px-5">Crear acceso</button>
        </form>
      </details>

      {/* ── La gente ───────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {miembros.map((m) => {
          const r = resumen(m.id);
          const mios = clientes.filter((c) => c.atendido_por === m.id);
          return (
            <div key={m.id} className={`card-l p-5 ${!m.activo ? "opacity-60" : ""}`}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-base font-semibold text-ink">
                    {m.tipo === "partner" ? (
                      <Building2 className="mr-1.5 inline h-4 w-4 text-violet" />
                    ) : (
                      <Users className="mr-1.5 inline h-4 w-4 text-pink" />
                    )}
                    {m.nombre}
                    {!m.activo && <span className="ml-2 text-xs font-normal text-ink-3">· inactivo</span>}
                  </p>
                  <p className="text-xs text-ink-3">
                    {m.email} · {m.tipo === "partner" ? "Partner externo" : "Vendedor"} ·{" "}
                    {m.alcance === "todas" ? "ve todas las cuentas" : "ve solo las suyas"}
                    {m.comision_pct != null && ` · comisión fija ${m.comision_pct}%`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 text-right">
                  {[
                    ["Clientes", String(r.clientes)],
                    ["MRR de su cartera", usd0(r.mrr)],
                    ["Le debemos", usd(r.pendiente)],
                    ["Ya cobrado", usd(r.pagado)],
                  ].map(([t, v]) => (
                    <div key={t}>
                      <p className="text-[11px] text-ink-3">{t}</p>
                      <p className="font-display text-base font-bold text-ink">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <form action={guardarMiembro} className="rounded-xl border border-linea bg-suave p-4">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="tipo" value={m.tipo} />

                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-ink-2">Qué cuentas ve</label>
                      <select
                        name="alcance"
                        defaultValue={m.alcance}
                        disabled={m.tipo === "partner"}
                        className="input-l w-full text-xs disabled:opacity-50"
                      >
                        <option value="asignadas">Solo las suyas</option>
                        <option value="todas">Todas</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-ink-2">Comisión (%)</label>
                      <input
                        name="comision_pct"
                        defaultValue={m.comision_pct ?? ""}
                        placeholder="escala"
                        inputMode="decimal"
                        className="input-l w-full text-xs"
                      />
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {PERMISOS.map((p) => (
                      <label key={p.clave} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                        <input
                          type="checkbox"
                          name={`permiso_${p.clave}`}
                          defaultChecked={!!m.permisos?.[p.clave]}
                        />
                        {p.nombre}
                      </label>
                    ))}
                  </div>

                  <label className="mb-3 flex items-center gap-1.5 text-xs text-ink-2">
                    <input type="checkbox" name="activo" defaultChecked={m.activo} /> Activo
                  </label>

                  <textarea
                    name="notas"
                    rows={2}
                    defaultValue={m.notas ?? ""}
                    placeholder="Notas"
                    className="input-l mb-3 w-full text-xs"
                  />

                  <button className="btn-soft px-4 py-1.5 text-xs">Guardar</button>
                </form>

                <div className="rounded-xl border border-linea bg-suave p-4">
                  <p className="mb-2 text-[11px] font-semibold text-ink-2">Su cartera</p>
                  {mios.length ? (
                    <ul className="mb-3 space-y-1 text-xs text-ink-2">
                      {mios.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{c.name}</span>
                          <span className="flex-none text-ink-3">
                            {usd0(precioDe.get(c.plan) ?? 0)}
                            {c.estado_cobro !== "activa" && ` · ${c.estado_cobro}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-ink-3">Todavía no tiene clientes asignados.</p>
                  )}

                  {sinAsignar.length > 0 && (
                    <form action={asignarCliente} className="mb-3 flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="miembro_id" value={m.id} />
                      <select name="org_id" className="input-l flex-1 px-2 py-1 text-xs">
                        {sinAsignar.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button className="btn-soft px-2.5 py-1 text-xs">Asignarle</button>
                    </form>
                  )}

                  {r.pendiente > 0 && (
                    <form action={marcarPagadas} className="flex flex-wrap items-center gap-1.5 border-t border-linea pt-3">
                      <input type="hidden" name="miembro_id" value={m.id} />
                      <input
                        name="referencia"
                        placeholder="Referencia del pago (Deel, transferencia…)"
                        className="input-l flex-1 px-2 py-1 text-xs"
                      />
                      <button className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
                        <Banknote className="h-3.5 w-3.5" /> Marcar {usd(r.pendiente)} como pagado
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {!miembros.length && (
          <div className="rounded-xl border border-linea bg-suave px-4 py-8 text-center text-sm text-ink-3">
            Todavía no hay nadie. Da de alta a tu primer vendedor arriba.
          </div>
        )}
      </div>
    </div>
  );
}
