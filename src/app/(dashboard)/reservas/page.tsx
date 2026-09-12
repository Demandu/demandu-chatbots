import { Topbar } from "@/components/Topbar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { MapaDelSalon } from "@/components/reservas/MapaDelSalon";
import type { MesaEnElMapa, Par } from "@/lib/reservas/mapa";

export const dynamic = "force-dynamic";

/**
 * EL SALÓN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SI NO SE PUEDE LEER, SE DICE. No se pinta un salón vacío: un dueño que ve su
 * plano en blanco cree que perdió su trabajo y lo vuelve a dibujar encima. Es
 * el mismo fallo que tuvo el Calendario el primer día, mirando un calendario de
 * tres y afirmando que no había nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default async function Reservas() {
  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return (
      <>
        <Topbar crumb={<span className="font-semibold text-white">Reservas</span>} />
        <div className="p-5"><p className="text-sm text-ink-3">No pude identificar tu cuenta.</p></div>
      </>
    );
  }

  const admin = createAdminClient();
  const [{ data: mesas, error: errMesas }, { data: pares, error: errPares }] = await Promise.all([
    admin
      .from("reservas_mesas")
      .select("id, nombre, capacidad, zona, x, y, ancho, alto, forma, activa")
      .eq("org_id", orgId)
      .order("nombre"),
    admin.from("reservas_uniones").select("mesa_a, mesa_b").eq("org_id", orgId),
  ]);

  const noSePudo = !!errMesas || !!errPares;
  if (noSePudo) {
    console.error("[salón] no se pudo leer:", errMesas?.message ?? errPares?.message);
  }

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Reservas</span>} />
      <div className="space-y-5 p-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">El plano de tu salón</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Dibuja tus mesas como están de verdad. Con esto, tu asistente sabe cuántas personas
            caben en cada una y cuáles se pueden juntar, y no acepta una reserva que no cabe.
          </p>
        </div>

        {noSePudo ? (
          <div className="card-l p-5">
            <p className="text-sm font-medium text-[#c0392b]">No se pudo leer tu salón.</p>
            <p className="mt-1 text-sm text-ink-2">
              No es que esté vacío: no se pudo consultar. Recarga la página; si sigue igual,
              escríbenos antes de volver a dibujarlo.
            </p>
          </div>
        ) : (
          <MapaDelSalon
            mesas={(mesas ?? []) as unknown as MesaEnElMapa[]}
            pares={(pares ?? []) as unknown as Par[]}
          />
        )}
      </div>
    </>
  );
}
