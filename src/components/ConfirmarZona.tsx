"use client";

import { useEffect, useState } from "react";
import { comoSeLee, zonaValida } from "@/lib/zonaHoraria";
import { confirmarZona } from "@/app/(dashboard)/settings/zonaActions";

/**
 * «TUS CITAS SE OFRECEN EN HORA DE PANAMÁ. ¿ES CORRECTO?»
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE AVISO EXISTE. Porque la zona horaria era `not null default
 * 'America/Mexico_City'` y un negocio de Panamá ofreció TODAS sus citas una
 * hora corridas sin que nadie lo viera. La pantalla de Configuración existía
 * desde hacía meses; el problema es que enseñaba una respuesta plausible y
 * nadie tenía motivo para ir a mirarla.
 *
 * ── SE DETECTA EN EL NAVEGADOR, NO SE PREGUNTA ────────────────────────────
 *
 * `Intl` da la zona IANA exacta de quien está configurando. Gratis, sin
 * preguntar nada, y acierta con el de Cancún y el de Tijuana — cosa que
 * preguntar «¿en qué país estás?» no hace, porque México tiene cuatro husos.
 *
 * Es un componente de cliente por eso: esa lectura solo existe en el navegador.
 * El servidor no puede saberlo, y adivinarlo desde la IP sería volver a la
 * respuesta plausible.
 *
 * ── SE ENSEÑA LA HORA, NO EL IDENTIFICADOR ────────────────────────────────
 *
 * Nadie sabe qué es `America/Panama`. Pedirle a alguien que confirme eso es
 * pedirle que confirme una cadena de texto. Enseñarle «Panamá — ahí son las
 * 13:40» es enseñarle algo que puede comparar con su reloj y contestar en un
 * segundo.
 *
 * ── Y SE PREGUNTA UNA SOLA VEZ ────────────────────────────────────────────
 *
 * En cuanto dice que sí, desaparece para siempre. Un aviso que sigue saliendo
 * después de atenderlo pasa a ser parte del decorado y deja de leerse — y
 * entonces tampoco sirve para el siguiente problema.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ConfirmarZona({
  guardada,
  confirmada,
}: {
  guardada: string | null;
  confirmada: boolean;
}) {
  const [delNavegador, setDelNavegador] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    try {
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zonaValida(z)) setDelNavegador(z);
    } catch {
      // Un navegador que no sabe decirlo no es un error: se sigue con lo
      // guardado, y si tampoco hay, el aviso pide ir a Configuración.
    }
  }, []);

  if (confirmada || listo) return null;

  // La del navegador manda sobre la guardada: quien está mirando esta pantalla
  // está EN su negocio, y su reloj es el dato más fiable que hay.
  const sugerida = delNavegador ?? guardada;
  const cambia = !!delNavegador && !!guardada && delNavegador !== guardada;

  return (
    <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <h4 className="text-sm font-bold text-ink">¿En qué hora están tus citas?</h4>

      {sugerida ? (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            Tus horarios se ofrecen en <b className="text-ink">{comoSeLee(sugerida)}</b>.
            {cambia && (
              <span className="mt-1 block text-warning">
                Ojo: tenías guardada <b>{comoSeLee(guardada)}</b>, y no es la de este equipo.
              </span>
            )}
            <span className="mt-1 block text-ink-3">
              Si no es la tuya, todas tus citas saldrán corridas y tus clientes llegarán a la hora
              equivocada. Míralo una vez y no te lo vuelvo a preguntar.
            </span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={async () => {
                setGuardando(true);
                const r = await confirmarZona(sugerida);
                // SOLO SE ESCONDE SI DE VERDAD SE GUARDÓ. Esconderlo sin más
                // dejaría al negocio creyendo que lo confirmó, con la zona
                // equivocada puesta y sin ningún aviso que se lo recuerde.
                if (r?.ok) setListo(true);
                else setGuardando(false);
              }}
              className="rounded-lg bg-violet px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {guardando ? "Guardando…" : "Sí, es correcta"}
            </button>
            <a
              href="/settings/hours"
              className="rounded-lg border border-linea-2 px-3 py-2 text-xs font-semibold text-ink-2"
            >
              No, cambiarla
            </a>
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          No pude saber en qué zona horaria estás, así que{" "}
          <b className="text-ink">tu asistente no va a ofrecer horarios</b> hasta que la pongas —
          antes de arriesgarse a citarle a alguien a la hora equivocada.{" "}
          <a href="/settings/hours" className="font-semibold text-pink hover:underline">
            Ponerla ahora
          </a>
        </p>
      )}
    </div>
  );
}
