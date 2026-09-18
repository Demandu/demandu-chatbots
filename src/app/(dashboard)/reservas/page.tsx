import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgId } from "@/lib/org";
import { MapaDelSalon } from "@/components/reservas/MapaDelSalon";
import { Turnos, type Ajustes } from "@/components/reservas/Turnos";
import type { MesaEnElMapa, Par } from "@/lib/reservas/mapa";
import type { Turno } from "./acciones";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * RESERVAS: EL SALÓN Y SUS TURNOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SI NO SE PUEDE LEER, SE DICE. No se pinta un salón vacío: un dueño que ve su
 * plano en blanco cree que perdió su trabajo y lo vuelve a dibujar encima. Es
 * el mismo fallo que tuvo el Calendario el primer día, mirando un calendario de
 * tres y afirmando que no había nada.
 *
 * ── ESTE SISTEMA NO DEPENDE DE NADIE ──────────────────────────────────────
 *
 * Ni Google Calendar ni Calendly. Mesas, turnos y reservas viven en nuestras
 * tablas: un restaurante que no conecta nada tiene reservas completas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const AJUSTES_DE_FABRICA: Ajustes = {
  recordatorio_horas: 24,
  recordatorio_activo: true,
  grupo_grande: 12,
  max_mesas_juntas: 3,
};

export default async function Reservas({
  searchParams,
}: {
  searchParams?: { ver?: string };
}) {
  const t = await getTranslations("reservas");
  const orgId = await getCurrentOrgId();
  const cabecera = <Topbar crumb={<span className="font-semibold text-white">Reservas</span>} />;

  if (!orgId) {
    return (
      <>
        {cabecera}
        <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 text-ink sm:p-6 lg:p-8">
          <p className="text-sm text-ink-3">{t("noPudeIdentificarCuenta")}</p>
        </div>
      </>
    );
  }

  const admin = createAdminClient();
  const [
    { data: mesas, error: errMesas },
    { data: pares, error: errPares },
    { data: turnos, error: errTurnos },
    { data: ajustes, error: errAjustes },
  ] = await Promise.all([
    admin
      .from("reservas_mesas")
      .select("id, nombre, capacidad, zona, x, y, ancho, alto, forma, activa")
      .eq("org_id", orgId)
      .order("nombre"),
    admin.from("reservas_uniones").select("mesa_a, mesa_b").eq("org_id", orgId),
    admin
      .from("reservas_turnos")
      .select("id, nombre, hora, dias, duracion_min, confirma_sola, activo, orden")
      .eq("org_id", orgId)
      .order("hora"),
    admin
      .from("reservas_ajustes")
      .select("recordatorio_horas, recordatorio_activo, grupo_grande, max_mesas_juntas")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  /* «No hay ajustes guardados» NO es un error: una cuenta nueva no los tiene y
   * se usan los de fábrica. «No se pudo leer» sí lo es, y se separa. */
  const noSePudo = !!errMesas || !!errPares || !!errTurnos || !!errAjustes;
  if (noSePudo) {
    console.error(
      "[reservas] no se pudo leer:",
      errMesas?.message ?? errPares?.message ?? errTurnos?.message ?? errAjustes?.message,
    );
  }

  const ver = searchParams?.ver === "turnos" ? "turnos" : "plano";
  const laLista = (mesas ?? []) as unknown as MesaEnElMapa[];

  const pestaña = (clave: string, texto: string) => (
    <Link
      href={`/reservas?ver=${clave}`}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
        ver === clave ? "bg-[#efe9ff] text-ink" : "text-ink-3 hover:bg-suave"
      }`}
    >
      {texto}
    </Link>
  );

  return (
    <>
      {cabecera}
      {/* ── EL CONTENEDOR QUE HACE SCROLL ──────────────────────────────────
          El marco es `h-[100dvh] overflow-hidden`, así que CADA pantalla pone
          el suyo. Sin esto la página se corta por abajo y no hay forma de
          llegar a lo que sigue — pasó aquí con «Cómo trabaja Lana».
          `min-h-0` no es decorativo: sin él, un hijo flex se niega a encoger
          por debajo de su contenido y `overflow-auto` no llega a activarse. */}
      <div className="min-h-0 flex-1 space-y-5 overflow-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Reservas</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            {t("dibujaSalonDefineTus")}
          </p>
        </div>

        <div className="flex gap-1 rounded-2xl border border-linea bg-tarjeta p-1">
          {pestaña("plano", "El plano")}
          {pestaña("turnos", "Turnos y ajustes")}
        </div>

        {noSePudo ? (
          <div className="card-l p-5">
            <p className="text-sm font-medium text-[#c0392b]">{t("noSePudoLeer")}</p>
            <p className="mt-1 text-sm text-ink-2">
              No es que esté vacío: no se pudo consultar. Recarga la página; si sigue igual,
              escríbenos antes de volver a dibujarlo.
            </p>
          </div>
        ) : ver === "turnos" ? (
          <Turnos
            turnos={(turnos ?? []) as unknown as Turno[]}
            ajustes={{ ...AJUSTES_DE_FABRICA, ...(ajustes ?? {}) } as Ajustes}
            hayMesas={laLista.some((m) => m.activa !== false)}
          />
        ) : (
          <MapaDelSalon mesas={laLista} pares={(pares ?? []) as unknown as Par[]} />
        )}
      </div>
    </>
  );
}
