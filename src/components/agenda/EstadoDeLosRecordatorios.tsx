import { BellRing, Clock, TriangleAlert, MessageSquareOff } from "lucide-react";
import type { Recordatorios } from "@/lib/whatsapp/comoVanLasPlantillas";

/**
 * «¿Van a recibir mis pacientes el recordatorio?»
 *
 * Es la única pregunta que el negocio se hace, y hasta ahora no había dónde
 * responderla: la plataforma mandaba la plantilla a Meta en silencio y nadie
 * —ni el cliente ni nosotros— volvía a mirar si la habían aprobado.
 *
 * El texto no dice «plantilla» en ningún caso. Ver `comoVanLasPlantillas.ts`.
 */
export function EstadoDeLosRecordatorios({ estado }: { estado: Recordatorios }) {
  const pinta = {
    listo: { icono: BellRing, caja: "border-success/40 bg-success/10", tinte: "text-exito" },
    revisando: { icono: Clock, caja: "border-linea bg-suave", tinte: "text-ink-3" },
    preparando: { icono: Clock, caja: "border-linea bg-suave", tinte: "text-ink-3" },
    rechazado: { icono: TriangleAlert, caja: "border-warning/40 bg-warning/10", tinte: "text-warning" },
    sin_whatsapp: { icono: MessageSquareOff, caja: "border-linea bg-suave", tinte: "text-ink-3" },
  }[estado.como];

  const Icono = pinta.icono;

  return (
    <div className={`mb-4 rounded-xl border p-4 ${pinta.caja}`}>
      <div className="flex items-start gap-2.5">
        <Icono className={`mt-0.5 h-4 w-4 flex-none ${pinta.tinte}`} />
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-ink">{estado.titulo}</h4>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{estado.detalle}</p>
          {estado.queHacer && (
            <p className="mt-1.5 text-xs font-semibold text-ink-2">{estado.queHacer}</p>
          )}
        </div>
      </div>
    </div>
  );
}
