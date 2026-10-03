import { createAdminClient } from "@/lib/supabase/admin";
import { buscarUsuarioPorCorreo, personaDe, negociosDe } from "@/lib/correo/buscarPersona";
import { opcionesDeSupabase, opcionDeBienvenida, nombreDeProveedor, type Opcion } from "@/lib/correo/reenviar";
import { reenviarCorreo } from "./reenvio";
import { Search, Send, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * «NO ME LLEGÓ EL CORREO»: buscar a la persona y reenviárselo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIMERO SE ENSEÑA CÓMO ESTÁ, LUEGO LOS BOTONES. Antes de reenviar nada, lo
 * que contesta la mitad de las quejas es ver que ya confirmó, o que le llegó
 * hace dos minutos y lo tiene en spam.
 *
 * LA BÚSQUEDA VA POR LA DIRECCIÓN (`?buscar=`), NO POR UN FORMULARIO QUE
 * MANDE. Buscar no puede mandar nada: los botones de reenviar son otros
 * formularios, cada uno con el `id` de la persona y nada que escribir.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function fecha(t: string | null): string {
  if (!t) return "nunca";
  return new Date(t).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });
}

function Boton({ persona, opcion, negocio }: { persona: string; opcion: Opcion; negocio?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-linea p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{opcion.nombre}</p>
        <p className="text-xs text-ink-2">{opcion.nota}</p>
      </div>
      {opcion.vale ? (
        <form action={reenviarCorreo} className="shrink-0">
          <input type="hidden" name="persona" value={persona} />
          <input type="hidden" name="tipo" value={opcion.tipo} />
          {negocio && <input type="hidden" name="negocio" value={negocio} />}
          <button className="btn-soft text-sm">
            <Send className="h-4 w-4" /> Reenviar
          </button>
        </form>
      ) : (
        <span className="shrink-0 text-xs text-ink-3">No aplica</span>
      )}
    </div>
  );
}

export default async function Reenviar({
  buscar,
  reenviado,
  fallo,
}: {
  buscar?: string;
  reenviado?: string;
  fallo?: string;
}) {
  const correo = String(buscar ?? "").trim();
  let resultado: React.ReactNode = null;

  if (correo) {
    const admin = createAdminClient();
    try {
      const usuario = await buscarUsuarioPorCorreo(admin, correo);
      if (!usuario) {
        resultado = (
          <p className="mt-4 text-sm text-ink-2">
            No hay ninguna cuenta con <b className="text-ink">{correo}</b>. Revisa que esté bien escrito: si nunca
            terminó de registrarse con esa dirección, no hay nada que reenviarle — que se registre otra vez.
          </p>
        );
      } else {
        const p = personaDe(usuario);
        const opciones = opcionesDeSupabase(p, new Date());
        const negocios = await negociosDe(admin, usuario.id);

        resultado = (
          <div className="mt-5 space-y-5">
            <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <p className="text-ink-2">
                Cuenta: <b className="text-ink">{usuario.email}</b>
              </p>
              <p className="text-ink-2">
                Entra con: <b className="text-ink">{p.proveedores.map(nombreDeProveedor).join(", ") || "correo"}</b>
              </p>
              <p className="text-ink-2">
                Confirmada:{" "}
                {p.confirmadoEl ? (
                  <b className="text-exito">sí, {fecha(p.confirmadoEl)}</b>
                ) : (
                  <b className="text-alerta">no</b>
                )}
              </p>
              {p.invitadoEl && (
                <p className="text-ink-2">
                  Invitada el: <b className="text-ink">{fecha(p.invitadoEl)}</b>
                </p>
              )}
              <p className="text-ink-2">
                Último de confirmar o invitar: <b className="text-ink">{fecha(p.confirmacionEnviadaEl)}</b>
              </p>
              <p className="text-ink-2">
                Último de contraseña: <b className="text-ink">{fecha(p.recuperacionEnviadaEl)}</b>
              </p>
            </div>

            <div className="space-y-2">
              {opciones.map((o) => (
                <Boton key={o.tipo} persona={usuario.id} opcion={o} />
              ))}
            </div>

            {negocios.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Sus negocios</p>
                {negocios.map((n) => {
                  const o = opcionDeBienvenida(n);
                  return (
                    <Boton
                      key={n.id}
                      persona={usuario.id}
                      negocio={n.id}
                      opcion={{
                        ...o,
                        nombre: `Bienvenida · ${n.name}`,
                        nota: `${o.nota} ${n.bienvenida_enviada_at ? `Primer intento: ${fecha(n.bienvenida_enviada_at)}.` : "Todavía no se le había mandado."}`,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      }
    } catch (e: any) {
      resultado = (
        <p className="mt-4 text-sm text-alerta">No pude buscar en las cuentas: {String(e?.message ?? e)}</p>
      );
    }
  }

  return (
    <div id="reenviar" className="card-l mb-10 p-5">
      <h3 className="font-display text-lg font-bold text-ink">Reenviar un correo</h3>
      <p className="mb-4 mt-1 text-sm text-ink-2">
        Para cuando alguien dice «no me llegó». Busca su correo, mira cómo está su cuenta y reenvía solo lo que le
        falta.
      </p>

      {reenviado && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-exito/40 bg-exito-suave px-4 py-2.5 text-sm text-exito">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> <span>{reenviado}</span>
        </div>
      )}
      {fallo && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-alerta/40 bg-alerta-suave px-4 py-2.5 text-sm text-alerta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{fallo}</span>
        </div>
      )}

      <form method="get" action="/superadmin/correos#reenviar" className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          name="buscar"
          defaultValue={correo}
          required
          placeholder="correo@delcliente.com"
          className="input-l flex-1"
          autoComplete="off"
        />
        <button className="btn-primary text-sm">
          <Search className="h-4 w-4" /> Buscar
        </button>
      </form>

      {resultado}
    </div>
  );
}
