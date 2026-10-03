import { createAdminClient } from "@/lib/supabase/admin";
import {
  cuentasPorCorreo, negociosParaLaLista, enviosDeBienvenida, duenoDeCadaNegocio,
} from "@/lib/correo/paraLaLista";
import { listaDeNegocios, cuantosFaltan, type FilaDeNegocio } from "@/lib/correo/estadoDeLosNegocios";
import { reenviarCorreo } from "./reenvio";
import { Send, CheckCircle2, AlertTriangle, CircleDashed, Users } from "lucide-react";

/**
 * A QUIÉN LE FALTA SU CORREO, DE UN GOLPE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex lo pidió como «un desplegable para elegir al cliente». Un desplegable
 * resolvería la mitad: ya no habría que acordarse de la dirección, pero
 * seguirías abriendo uno por uno para ver a quién le falta algo.
 *
 * Así que es una LISTA CON EL ESTADO, y el orden lo pone la urgencia: primero
 * lo que falló, luego lo que nunca salió, y al final lo que ya está. Quien abre
 * esta pantalla no viene a buscar un negocio concreto —viene a ver qué falta—.
 *
 * NO HAY CAMPO «MANDAR A:», Y NO ES UN OLVIDO. El botón manda el id del negocio
 * y el de su dueño; la dirección la lee el servidor de la base. Un campo donde
 * se escribe el destino es un campo donde un día se pega el equivocado.
 *
 * Y EL BOTÓN SE APAGA UN RATO DESPUÉS DE MANDARLO. El 3 oct dos clientes
 * recibieron la bienvenida dos y tres veces en ocho segundos. El freno de
 * verdad está en la acción del servidor; esto es para que no se intente.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PINTA: Record<
  FilaDeNegocio["bienvenida"],
  { texto: string; clase: string; icono: React.ReactNode }
> = {
  fallo: {
    texto: "No le llegó",
    clase: "border-alerta/40 bg-alerta-suave text-alerta",
    icono: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  nunca: {
    texto: "Nunca se mandó",
    clase: "border-aviso/50 bg-aviso-suave text-ink-2",
    icono: <CircleDashed className="h-3.5 w-3.5" />,
  },
  sin_correo: {
    texto: "Sin correo",
    clase: "border-linea bg-suave text-ink-3",
    icono: <CircleDashed className="h-3.5 w-3.5" />,
  },
  recibida: {
    texto: "Recibida",
    clase: "border-exito/40 bg-exito-suave text-exito",
    icono: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
};

const CUENTA: Record<FilaDeNegocio["cuenta"], string> = {
  confirmada: "",
  sin_confirmar: "La cuenta de ese correo no está confirmada",
  invitada_sin_aceptar: "Invitación sin aceptar",
  sin_cuenta: "Ese correo no tiene cuenta en la plataforma",
};

export default async function ListaDeNegocios() {
  const admin = createAdminClient();

  let filas: FilaDeNegocio[] = [];
  let duenos = new Map<string, string>();
  let fallo: string | null = null;

  try {
    // Las cuatro consultas van juntas: una lista que tarda cuatro viajes en
    // serie es una lista que nadie abre.
    const [negocios, envios, cuentas, porDueno] = await Promise.all([
      negociosParaLaLista(admin),
      enviosDeBienvenida(admin),
      cuentasPorCorreo(admin),
      duenoDeCadaNegocio(admin),
    ]);
    filas = listaDeNegocios(negocios, envios, cuentas);
    duenos = porDueno;
  } catch (e: any) {
    // SI ESTO FALLA, QUE SE VEA. Una lista vacía por un error se lee como
    // «no falta nada», que es la mentira más cara que puede decir esta pantalla.
    fallo = String(e?.message ?? e);
  }

  if (fallo) {
    return (
      <div className="card-l mb-10 p-5">
        <h3 className="font-display text-lg font-bold text-ink">Los correos de cada negocio</h3>
        <p className="mt-3 flex items-start gap-2 text-sm text-alerta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          No pude leer el estado de los negocios, así que esta lista no dice nada: {fallo}
        </p>
      </div>
    );
  }

  const n = cuantosFaltan(filas);

  return (
    <div className="card-l mb-10 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold text-ink">Los correos de cada negocio</h3>
          <p className="mt-1 text-sm text-ink-2">
            Quién tiene su bienvenida y quién no. Primero lo que falta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-aviso/50 bg-aviso-suave px-2.5 py-1.5 font-semibold text-ink-2">
            {n.pendientes} sin recibirla
          </span>
          <span className="rounded-lg border border-exito/40 bg-exito-suave px-2.5 py-1.5 font-semibold text-exito">
            {n.recibidas} al día
          </span>
          {n.sinConfirmar > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-linea bg-suave px-2.5 py-1.5 font-semibold text-ink-2">
              <Users className="h-3.5 w-3.5" /> {n.sinConfirmar} sin confirmar su cuenta
            </span>
          )}
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-ink-2">Todavía no hay ningún negocio.</p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => {
            const pinta = PINTA[f.bienvenida];
            const dueno = duenos.get(f.id);
            const aviso = CUENTA[f.cuenta];
            return (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-xl border border-linea p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{f.nombre}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${pinta.clase}`}
                    >
                      {pinta.icono} {pinta.texto}
                    </span>
                    {f.veces > 1 && (
                      <span className="rounded-md border border-aviso/50 bg-aviso-suave px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">
                        se mandó {f.veces} veces
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
                    {f.correo || "sin correo de contacto"}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-ink-2">{f.nota}</p>
                  {f.error && (
                    <p className="mt-0.5 break-words text-[11px] leading-snug text-alerta">{f.error}</p>
                  )}
                  {aviso && <p className="mt-0.5 text-[11px] text-ink-3">{aviso}</p>}
                </div>

                {f.sePuede && dueno ? (
                  <form action={reenviarCorreo} className="shrink-0">
                    <input type="hidden" name="persona" value={dueno} />
                    <input type="hidden" name="tipo" value="bienvenida" />
                    <input type="hidden" name="negocio" value={f.id} />
                    <button className="btn-soft text-sm">
                      <Send className="h-4 w-4" />{" "}
                      {f.bienvenida === "recibida" ? "Mandar otra vez" : "Mandar la bienvenida"}
                    </button>
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-ink-3">
                    {!f.sePuede ? "Ahora no" : "Este negocio no tiene a nadie dentro"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
