import Link from "next/link";
import { Lock, ArrowUpRight } from "lucide-react";
import { feature, type ClaveFeature } from "@/lib/planes/features";

/**
 * La función que existe, se ve, y todavía no es tuya.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SE ENSEÑA, NO SE ESCONDE. Esconder lo que no está en el plan parece más
 * limpio y vende cero: nadie sube a un plan cuyas ventajas no ha visto nunca.
 * Aquí se dice qué hace, qué se pierde sin ella, y los DOS caminos para
 * tenerla — subir de plan o comprar el complemento.
 *
 * SE DICE QUÉ SE PIERDE, NO SOLO QUÉ SE GANA. «Respuestas con IA» no mueve a
 * nadie; «la pregunta que no está en tu flujo se queda sin respuesta hasta que
 * alguien de tu equipo la vea» sí, porque eso le pasa hoy.
 *
 * ── ESTO NO FRENA NADA ────────────────────────────────────────────────────
 *
 * Es una pantalla. El freno de verdad vive donde se gasta el dinero —antes de
 * llamar al modelo, dentro de la acción del servidor— porque una pantalla
 * apagada no impide llamar la acción por debajo. Si esto fuera el único
 * candado, no habría candado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function FuncionBloqueada({ clave }: { clave: ClaveFeature }) {
  const f = feature(clave);
  if (!f) return null;

  return (
    <div className="card-l p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-suave text-ink-3">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-ink">
            {f.nombre} no está en tu plan
          </h3>
          <p className="mt-1 max-w-xl text-sm text-ink-2">{f.que}</p>

          {/* Lo que le pasa HOY por no tenerla. Es la parte que convence. */}
          <p className="mt-2 max-w-xl rounded-xl border border-linea bg-suave px-3 py-2 text-[13px] text-ink-2">
            {f.sinElla}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Link href="/settings/plan" className="btn-primary inline-flex items-center gap-1.5">
              Ver cómo activarla <ArrowUpRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-ink-3">
              Incluida desde el plan {f.desdeElPlan}, o como complemento sin cambiar de plan.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
