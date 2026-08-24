import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarFacturas, estadoDeFactura } from "@/lib/billing/facturas";
import { reenviar, restablecer, entrarComoSoporte } from "../acciones";
import { ArrowLeft, FileText, ExternalLink, Send, TriangleAlert, Check, KeyRound, Mail, Phone, User, LifeBuoy } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * La ficha de un cliente: quién es, qué paga, sus facturas y su consumo.
 *
 * Las facturas se leen de Stripe en vivo. Si Stripe falla, el resto de la
 * ficha se sigue viendo — el estado de la cuenta y el consumo no dependen de
 * que Stripe conteste, y son justo lo que hace falta cuando alguien llama con
 * un problema.
 */

const usd = (v: number, m = "USD") =>
  `${v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m}`;

function fecha(v: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "—";
  }
}

const MOTIVO: Record<string, string> = {
  subscription_create: "Alta del plan",
  subscription_cycle: "Renovación mensual",
  subscription_update: "Cambio de plan",
  subscription_threshold: "Consumo alcanzado",
  manual: "Emitida a mano",
  upcoming: "Próxima",
};

export default async function FichaCliente({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { enviada?: string; error?: string; clave?: string; reset?: string };
}) {
  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, name, plan, estado_cobro, created_at, periodo_termina_at, prueba_termina_at, gracia_termina_at, cancela_al_terminar, cancelada_at, motivo_cancelacion, stripe_customer_id, stripe_subscription_id, tope_ia, datos_borrados_at, contacto_nombre, contacto_email, contacto_telefono, notas_internas",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!org) notFound();

  const [{ data: consumo }, facturas, { data: personas }] = await Promise.all([
    admin.rpc("consumo_de_clientes"),
    listarFacturas(org.stripe_customer_id),
    admin.from("memberships").select("role").eq("org_id", params.id),
  ]);

  const mio = ((consumo as any[]) ?? []).find((c) => c.org_id === params.id) ?? null;

  return (
    <div>
      <Link
        href="/superadmin/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Todos los clientes
      </Link>

      <h2 className="font-display text-2xl font-bold text-ink">{org.name ?? "—"}</h2>
      <p className="mb-5 mt-1 text-sm text-ink-3">
        Cliente desde {fecha(org.created_at)} · {((personas as any[]) ?? []).length} persona
        {((personas as any[]) ?? []).length === 1 ? "" : "s"} con acceso
      </p>

      {searchParams?.enviada && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm text-exito">
          <Check className="h-4 w-4 flex-none" /> Stripe reenvió la factura al correo del cliente.
        </div>
      )}
      {searchParams?.error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 flex-none" />
          <span>
            No se pudo enviar. Stripe dijo: <b>{searchParams.error}</b>
          </span>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Plan", mio?.plan_nombre ?? org.plan ?? "—"],
          ["Estado del cobro", org.estado_cobro ?? "—"],
          [
            "Mensajes del mes",
            mio
              ? `${Number(mio.mensajes_usados ?? 0).toLocaleString("es-MX")} / ${Number(mio.mensajes_limite ?? 0).toLocaleString("es-MX")}`
              : "—",
          ],
          ["Respuestas de IA", mio ? Number(mio.ia_usada ?? 0).toLocaleString("es-MX") : "—"],
        ].map(([t, v]) => (
          <div key={t} className="card-l p-4">
            <p className="text-xs text-ink-3">{t}</p>
            <p className="mt-1 font-display text-lg font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      {org.cancela_al_terminar && (
        <div className="mb-6 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-ink-2">
          <b className="text-ink">Este cliente canceló.</b> Su plan sigue funcionando hasta el{" "}
          {fecha(org.periodo_termina_at)} y después no se le vuelve a cobrar.
          {org.motivo_cancelacion && <> Motivo que dio: «{org.motivo_cancelacion}».</>}
        </div>
      )}

      {/* LA CLAVE TEMPORAL SE ENSEÑA UNA VEZ Y NO SE GUARDA. Llega en la
          dirección desde la acción que la generó, así que al recargar
          desaparece — que es exactamente lo que tiene que pasar. */}
      {searchParams?.clave && (
        <div className="mb-6 rounded-xl border border-violet/40 bg-violet/5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-violet" />
            <h3 className="font-display text-base font-semibold text-ink">
              {searchParams.reset ? "Nueva contraseña temporal" : "Contraseña temporal"}
            </h3>
          </div>
          <p className="mb-3 text-sm text-ink-2">
            Dictale esto al cliente <b className="text-ink">ahora</b>. Al recargar esta página ya no vas a poder
            verla, y no queda guardada en ninguna parte.
            {searchParams.reset && " Su contraseña anterior ya no funciona."}
          </p>
          <p className="select-all rounded-lg bg-tarjeta px-4 py-3 font-mono text-2xl font-bold tracking-[0.2em] text-ink">
            {searchParams.clave}
          </p>
          <p className="mt-2 text-[11px] text-ink-3">
            Entra con {org.contacto_email ?? "su correo"} y esta contraseña. La plataforma le va a pedir que
            elija la suya antes de dejarlo pasar.
          </p>
        </div>
      )}

      <div className="card-l mb-6 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-ink">Contacto</h3>
          <div className="flex flex-wrap gap-2">
            {/* ENTRAR A UNA CUENTA AJENA NO ES UN BOTÓN CUALQUIERA. Va en rojo
                y dice cuánto dura, para que nadie lo pulse por inercia
                creyendo que abre una pantalla más del superadmin. */}
            <form action={entrarComoSoporte}>
              <input type="hidden" name="org_id" value={org.id} />
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20">
                <LifeBuoy className="h-3.5 w-3.5" /> Entrar como soporte (1 h)
              </button>
            </form>
            <form action={restablecer}>
              <input type="hidden" name="org_id" value={org.id} />
              <button className="btn-soft inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                <KeyRound className="h-3.5 w-3.5" /> Generar contraseña temporal
              </button>
            </form>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            [User, "Persona", org.contacto_nombre],
            [Mail, "Correo", org.contacto_email],
            [Phone, "Teléfono", org.contacto_telefono],
          ].map(([Icono, etiqueta, valor]: any) => (
            <div key={etiqueta} className="flex items-start gap-2">
              <Icono className="mt-0.5 h-3.5 w-3.5 flex-none text-ink-3" />
              <div className="min-w-0">
                <p className="text-[11px] text-ink-3">{etiqueta}</p>
                <p className="truncate text-sm text-ink">{valor || "—"}</p>
              </div>
            </div>
          ))}
        </div>
        {org.notas_internas && (
          <div className="mt-4 rounded-lg bg-suave px-3.5 py-2.5">
            <p className="mb-0.5 text-[11px] font-semibold text-ink-3">Notas internas · el cliente no las ve</p>
            <p className="whitespace-pre-wrap text-sm text-ink-2">{org.notas_internas}</p>
          </div>
        )}
      </div>

      <h3 className="mb-1 font-display text-lg font-semibold text-ink">Facturas</h3>
      <p className="mb-3 max-w-3xl text-xs text-ink-3">
        Salen de Stripe en vivo. El cliente ya las recibe por correo en cada cobro y las tiene todas en su
        portal de pago — el botón de reenviar es para cuando alguien llama diciendo que no le llegó.
      </p>

      {!org.stripe_customer_id ? (
        <div className="rounded-xl border border-linea bg-suave px-4 py-6 text-center text-sm text-ink-3">
          Este cliente todavía no tiene una ficha de pago en Stripe. Se crea sola en su primer cobro.
        </div>
      ) : !facturas.ok ? (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          No se pudieron leer las facturas: {facturas.error}
        </div>
      ) : !facturas.datos.length ? (
        <div className="rounded-xl border border-linea bg-suave px-4 py-6 text-center text-sm text-ink-3">
          Todavía no se le ha emitido ninguna factura.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-linea">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-suave text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {facturas.datos.map((f) => (
                <tr key={f.id} className="border-t border-linea bg-tarjeta">
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{f.numero ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-2">{fecha(f.fecha)}</td>
                  <td className="px-4 py-3 text-ink-3">{MOTIVO[f.motivo ?? ""] ?? f.motivo ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{usd(f.total, f.moneda)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        f.estado === "paid"
                          ? "bg-success/15 text-exito"
                          : f.estado === "open"
                            ? "bg-warning/20 text-aviso"
                            : "bg-suave-2 text-ink-3"
                      }`}
                    >
                      {estadoDeFactura(f.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {f.pdf && (
                        <a
                          href={f.pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                        >
                          <FileText className="h-3.5 w-3.5" /> PDF
                        </a>
                      )}
                      {f.enlace && (
                        <a
                          href={f.enlace}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver
                        </a>
                      )}
                      <form action={reenviar}>
                        <input type="hidden" name="factura_id" value={f.id} />
                        <input type="hidden" name="org_id" value={org.id} />
                        <button className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
                          <Send className="h-3.5 w-3.5" /> Reenviar
                        </button>
                      </form>
                    </div>
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
