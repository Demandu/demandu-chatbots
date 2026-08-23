import { createAdminClient } from "@/lib/supabase/admin";
import { Trash2, MessageSquareOff } from "lucide-react";

export const dynamic = "force-dynamic";

function usd(v: any) {
  return `$${Number(v ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

/**
 * Quién se fue, cuándo y por qué.
 *
 * QUÉ HAY AQUÍ Y QUÉ NO. Datos DEL CLIENTE: su negocio, su plan, cuánto pagaba,
 * cuánto duró, por qué se fue. NUNCA datos DE SUS CLIENTES — los teléfonos de
 * los leads de una tienda no explican su baja, y conservarlos después de haberle
 * prometido que se borran sería exactamente la mentira que todo este trabajo
 * existe para evitar.
 *
 * Los números de arriba son los que de verdad se miran: cuánto MRR se fue y
 * cuánto duraban. El resto es contexto.
 */
export default async function BajasPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("bajas")
    .select("*")
    .order("cancelacion_at", { ascending: false })
    .limit(200);

  const bajas = (data as any[]) ?? [];

  const esteMes = bajas.filter(
    (b) => new Date(b.cancelacion_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const mrrPerdido = esteMes.reduce((s, b) => s + Number(b.precio_mensual ?? 0), 0);
  const conMeses = bajas.filter((b) => Number.isFinite(Number(b.meses_activo)));
  const duracionMedia = conMeses.length
    ? Math.round(conMeses.reduce((s, b) => s + Number(b.meses_activo), 0) / conMeses.length)
    : null;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-ink">Bajas</h2>
      <p className="mb-5 mt-1 text-sm text-ink-2">
        Clientes que cancelaron. Aquí no se guarda nada de los clientes de ellos.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Bajas este mes", String(esteMes.length)],
          ["MRR que se fue este mes", usd(mrrPerdido)],
          ["Duraban en promedio", duracionMedia === null ? "—" : `${duracionMedia} ${duracionMedia === 1 ? "mes" : "meses"}`],
        ].map(([t, v]) => (
          <div key={t} className="card-l p-4">
            <p className="text-xs text-ink-3">{t}</p>
            <p className="mt-1 font-display text-2xl font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      {bajas.length === 0 ? (
        <div className="card-l grid place-items-center p-12 text-center">
          <p className="text-sm text-ink-2">Todavía no se ha ido nadie.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Duró</th>
                <th className="px-4 py-3">Se fue</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Datos</th>
              </tr>
            </thead>
            <tbody>
              {bajas.map((b) => (
                <tr key={b.id} className="border-t border-linea bg-tarjeta align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{b.negocio ?? "—"}</div>
                    <div className="text-xs text-ink-3">{b.correo_facturacion ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {b.plan_code ?? "—"}
                    {b.precio_mensual ? <span className="text-ink-3"> · {usd(b.precio_mensual)}/mes</span> : null}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {b.meses_activo === null || b.meses_activo === undefined
                      ? "—"
                      : `${b.meses_activo} ${b.meses_activo === 1 ? "mes" : "meses"}`}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {new Date(b.cancelacion_at).toLocaleDateString("es-MX", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs text-ink-2">{b.motivo || <span className="text-ink-3">No dijo</span>}</div>
                    {b.comentario && <div className="mt-0.5 max-w-xs text-xs text-ink-3">{b.comentario}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {b.borro_datos ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                        <Trash2 className="h-3 w-3" /> Borrados
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-suave px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-3">
                        <MessageSquareOff className="h-3 w-3" /> Se conservan
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
