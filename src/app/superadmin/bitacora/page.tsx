import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Shield, Eye, Building2, Users, Cog } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * La bitácora.
 *
 * POR QUÉ SE VE POR ACTOR Y NO SOLO EN ORDEN DE TIEMPO: una lista cronológica
 * contesta «qué pasó a las 3». La pregunta que de verdad se hace uno es «¿qué
 * ha estado haciendo esta persona?», y esa se contesta filtrando por quién.
 *
 * Esta tabla es de SOLO AÑADIR — ni la llave de servicio puede editarla. Por
 * eso aquí no hay ningún botón de borrar: no es que falte, es que no existe.
 */

const ICONO: Record<string, any> = {
  equipo: Users,
  partner: Building2,
  cliente: Eye,
  sistema: Cog,
};

const TONO: Record<string, string> = {
  equipo: "bg-pink/15 text-pink",
  partner: "bg-violet/15 text-violet",
  cliente: "bg-sky-500/15 text-sky-600",
  sistema: "bg-suave-2 text-ink-3",
};

function cuando(v: string) {
  try {
    return new Date(v).toLocaleString("es-MX", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Los datos técnicos van al final y en pequeño: son para cuando hace falta. */
function detalleLegible(d: any): string {
  if (!d || typeof d !== "object") return "";
  const fuera: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === "" || v === undefined) continue;
    if (k === "navegador") continue; // ocupa media pantalla y casi nunca importa
    fuera.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return fuera.join(" · ");
}

export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: { actor?: string; org?: string };
}) {
  const admin = createAdminClient();

  let q = admin.from("bitacora").select("*").order("at", { ascending: false }).limit(200);
  if (searchParams?.actor) q = q.eq("actor_id", searchParams.actor);
  if (searchParams?.org) q = q.eq("org_id", searchParams.org);

  const [{ data: filas }, { data: orgs }] = await Promise.all([
    q,
    admin.from("organizations").select("id, name"),
  ]);

  const nombreDe = new Map<string, string>(((orgs as any[]) ?? []).map((o) => [o.id, o.name]));
  const lista = (filas as any[]) ?? [];
  const filtrando = !!(searchParams?.actor || searchParams?.org);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">
            <Shield className="mr-1.5 inline h-5 w-5 text-ink-3" /> Bitácora
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Quién hizo qué y sobre la cuenta de quién. Se añade, nunca se edita ni se borra —{" "}
            <b className="text-ink">ni siquiera desde aquí</b>.
          </p>
        </div>
        {filtrando && (
          <Link href="/superadmin/bitacora" className="btn-soft px-3 py-1.5 text-xs">
            Quitar el filtro
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-linea">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
            <tr>
              <th className="px-4 py-3">Cuándo</th>
              <th className="px-4 py-3">Quién</th>
              <th className="px-4 py-3">Qué hizo</th>
              <th className="px-4 py-3">Sobre</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => {
              const Icono = ICONO[f.actor_tipo] ?? Cog;
              return (
                <tr key={f.id} className="border-t border-linea bg-tarjeta align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-3">{cuando(f.at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`mb-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        TONO[f.actor_tipo] ?? TONO.sistema
                      }`}
                    >
                      <Icono className="h-3 w-3" /> {f.actor_tipo}
                    </span>
                    <div className="text-ink">{f.actor_nombre ?? "—"}</div>
                    {f.actor_email && <div className="text-[11px] text-ink-3">{f.actor_email}</div>}
                    {f.actor_id && (
                      <Link
                        href={`/superadmin/bitacora?actor=${f.actor_id}`}
                        className="text-[11px] font-semibold text-pink hover:underline"
                      >
                        ver todo lo suyo
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{f.accion}</div>
                    {detalleLegible(f.detalle) && (
                      <div className="mt-0.5 break-words text-[11px] text-ink-3">
                        {detalleLegible(f.detalle)}
                      </div>
                    )}
                    {f.visible_para_el_cliente && (
                      <div className="mt-0.5 text-[11px] text-exito">· el cliente ve esta línea</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {f.org_id ? (
                      <Link
                        href={`/superadmin/clientes/${f.org_id}`}
                        className="text-ink-2 hover:text-pink hover:underline"
                      >
                        {nombreDe.get(f.org_id) ?? "cuenta borrada"}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-3">
                  {filtrando ? "Nada con ese filtro." : "Todavía no hay nada apuntado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card-l mt-6 max-w-3xl p-5 text-sm leading-relaxed text-ink-2">
        <h3 className="mb-2 font-display text-base font-semibold text-ink">Para qué sirve esto</h3>
        <p>
          Para poder contestar <b className="text-ink">«¿quién tocó esto?»</b> el día que alguien lo niegue.
          Sin bitácora, dejar que un vendedor o un partner entre a la cuenta de un cliente sería una puerta
          sin cerradura ni mirilla.
        </p>
        <p className="mt-2">
          Las líneas marcadas en verde <b className="text-ink">las ve también el cliente</b> en su propia
          cuenta. Es a propósito: esconderle a alguien que entramos a su cuenta es lo que convierte una
          herramienta de soporte en un escándalo. La cocina interna —comisiones, altas de vendedores— no le
          incumbe y no la ve.
        </p>
        <p className="mt-2 text-xs text-ink-3">
          Se muestran las últimas 200 líneas. Anotar nunca frena una acción: si la bitácora fallara, lo que
          el usuario pidió sigue adelante y el fallo queda en el registro del servidor.
        </p>
      </div>
    </div>
  );
}
