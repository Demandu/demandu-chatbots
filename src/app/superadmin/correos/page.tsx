import { createAdminClient } from "@/lib/supabase/admin";
import { leerPlantilla } from "@/lib/correo/guardadas";
import { REMITENTE } from "@/lib/correo/enviar";
import Editor from "./Editor";
import { restaurar } from "./acciones";
import { RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * EL TEXTO DE LOS CORREOS QUE MANDA LA PLATAFORMA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AQUÍ ESTÁ EL DE BIENVENIDA Y NO ESTÁN LOS DE SUPABASE, y esa ausencia se
 * explica abajo en la propia pantalla en vez de dejar que alguien la busque.
 * Los de confirmar la cuenta y recuperar la contraseña los manda la
 * autenticación y sus plantillas se pegan en el panel de Supabase: enseñarlos
 * aquí como si se pudieran editar sería mentir sobre dónde vive cada cosa.
 *
 * ── EL REGISTRO VA EN LA MISMA PANTALLA QUE EL EDITOR ─────────────────────
 *
 * Editar un correo y comprobar que sale son la misma tarea, aunque parezcan
 * dos. Quien acaba de cambiar el texto quiere ver que el siguiente salió, y si
 * no salió, por qué. Tenerlo en otra pantalla es garantizar que nadie lo mire.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default async function CorreosPage({
  searchParams,
}: {
  searchParams: { guardado?: string; restaurado?: string; probado?: string; fallo?: string };
}) {
  // Quién puede entrar aquí lo decide el marco de Superadmin, no esta pantalla.
  const admin = createAdminClient();

  const [guardada, { data: enviados }] = await Promise.all([
    leerPlantilla(admin, "bienvenida"),
    admin
      .from("correos_enviados")
      .select("id, para, asunto, etiqueta, enviado, error, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const historial = (enviados as any[]) ?? [];
  const hayLlave = !!(process.env.POSTMARK_TOKEN ?? "").trim();

  return (
    <div className="mx-auto max-w-6xl">
      <h2 className="font-display text-2xl font-bold text-ink">Correos de la plataforma</h2>
      <p className="mb-5 mt-1 text-sm text-ink-2">
        El texto del correo de bienvenida, que recibe cada negocio nuevo unos minutos después de registrarse. Se manda
        desde <b className="text-ink">{REMITENTE}</b>.
      </p>

      {!hayLlave && (
        <div className="mb-5 rounded-xl border border-aviso/50 bg-aviso-suave px-4 py-2.5 text-sm text-ink-2">
          Falta la llave de Postmark (<code>POSTMARK_TOKEN</code>). Puedes escribir y guardar el texto, pero no saldrá
          ningún correo hasta ponerla.
        </div>
      )}
      {searchParams?.guardado && (
        <div className="mb-5 inline-flex items-center gap-2 rounded-xl border border-exito/40 bg-exito-suave px-4 py-2.5 text-sm text-exito">
          <CheckCircle2 className="h-4 w-4" /> Guardado. Los negocios que se registren a partir de ahora reciben este
          texto.
        </div>
      )}
      {searchParams?.restaurado && (
        <div className="mb-5 rounded-xl border border-exito/40 bg-exito-suave px-4 py-2.5 text-sm text-exito">
          Vuelve a usarse el texto original.
        </div>
      )}
      {searchParams?.probado && (
        <div className="mb-5 rounded-xl border border-exito/40 bg-exito-suave px-4 py-2.5 text-sm text-exito">
          Mandado a tu correo. Si en un par de minutos no está, mira en spam antes de tocar nada.
        </div>
      )}
      {searchParams?.fallo && (
        <div className="mb-5 inline-flex items-start gap-2 rounded-xl border border-alerta/40 bg-alerta-suave px-4 py-2.5 text-sm text-alerta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {/* EL MENSAJE DE POSTMARK, TAL CUAL. Su error dice si el dominio no
              está verificado, si la cuenta sigue pendiente de aprobación o si
              la dirección está en su lista de rebotes: tres arreglos distintos
              que un «no se pudo enviar» convierte en una tarde perdida. */}
          <span>{searchParams.fallo}</span>
        </div>
      )}

      <Editor guardada={guardada} />

      {/* ── Lo que ha salido ─────────────────────────────────────────────── */}
      <div className="mt-10">
        <h3 className="font-display text-lg font-bold text-ink">Últimos correos</h3>
        <p className="mb-3 mt-1 text-sm text-ink-2">
          Se apunta salga o no salga. Cuando un cliente diga «no me llegó nada», la respuesta está aquí y no en «pues
          debería».
        </p>

        {historial.length === 0 ? (
          <div className="card-l p-6 text-sm text-ink-2">Todavía no ha salido ninguno.</div>
        ) : (
          <div className="card-l overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2.5 font-semibold">Cuándo</th>
                  <th className="px-4 py-2.5 font-semibold">A quién</th>
                  <th className="px-4 py-2.5 font-semibold">Asunto</th>
                  <th className="px-4 py-2.5 font-semibold">Salió</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {historial.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">
                      {new Date(c.created_at).toLocaleString("es-PA", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{c.para}</td>
                    <td className="px-4 py-2.5 text-ink-2">{c.asunto}</td>
                    <td className="px-4 py-2.5">
                      {c.enviado ? (
                        <span className="text-exito">Sí</span>
                      ) : (
                        <span className="text-alerta" title={c.error ?? ""}>
                          No · {String(c.error ?? "sin motivo apuntado").slice(0, 90)}
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

      {/* ── Lo que NO se edita aquí ──────────────────────────────────────── */}
      <div className="mt-10 card-l p-5">
        <h3 className="font-display text-base font-bold text-ink">Los otros tres correos no están aquí</h3>
        <p className="mt-1.5 text-sm text-ink-2">
          Confirmar la cuenta, recuperar la contraseña e invitar a alguien los manda la autenticación en el momento, no
          la plataforma. Su texto se pega en el panel de Supabase, y en el repositorio están en{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[13px]">correos/</code>.
        </p>

        <form action={restaurar} className="mt-4">
          <button className="btn-soft text-sm">
            <RotateCcw className="h-4 w-4" /> Volver al texto original de la bienvenida
          </button>
        </form>
      </div>
    </div>
  );
}
