import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Crown, ArrowLeft, LogOut, LifeBuoy } from "lucide-react";
import { cerrarSesion } from "../salir";
import { sesionDeSoporte } from "@/lib/soporte";
import { volverAMiCuenta } from "./volver";

export const dynamic = "force-dynamic";

/**
 * Superadmin: el panel interno de Demandu.
 *
 * POR QUÉ VIVE FUERA DE LA PLATAFORMA DE CLIENTES. Antes la pantalla de planes
 * a la medida colgaba de Configuración, dentro de la app del cliente. Estaba
 * protegida, sí — pero estructuralmente era un error: compartía el menú, la
 * barra y el marco del cliente. Un descuido en cualquiera de esas piezas
 * compartidas —un enlace que se cuela, un guard que se mueve— y un cliente
 * acaba viendo la trastienda de su proveedor.
 *
 * Aquí no hay nada compartido con la app del cliente: otro marco, otra barra,
 * y el permiso se comprueba UNA VEZ en este layout, así que toda pantalla que
 * se cuelgue de `/superadmin` nace protegida sin que nadie tenga que acordarse.
 *
 * Se ve distinto a propósito. Trabajar en la trastienda y trabajar en la
 * cuenta de un cliente no deben parecerse: confundirlas es cómo se toca por
 * error algo de alguien.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: esAdmin } = await supabase.rpc("is_platform_admin");
  // Al panel del cliente, no a una pantalla de "no tienes permiso": para quien
  // no es del equipo, esto sencillamente no existe.
  if (!esAdmin) redirect("/dashboard");

  // AQUÍ NO HABÍA NI RASTRO DE QUE HUBIERA UNA CUENTA AJENA ABIERTA. El aviso
  // rojo solo vive en el marco del cliente, así que desde la trastienda el
  // acceso de soporte era invisible —y sin embargo seguía mandando en
  // `/dashboard`. De ahí que «Volver a la plataforma» llevara a la cuenta del
  // cliente: no fallaba el enlace, faltaba saber que el soporte estaba abierto.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const soporte = user ? await sesionDeSoporte(user.id) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea bg-[#0b0d1a] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-demandu-gradient">
            <Crown className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="font-display text-sm font-bold leading-tight text-white">Demandu · Superadmin</p>
            <p className="text-[11px] leading-tight text-white/50">Panel interno. Los clientes no ven nada de esto.</p>
          </div>
        </div>

        <nav className="flex items-center gap-1.5">
          <Link
            href="/superadmin/equipo"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Equipo
          </Link>
          <Link
            href="/superadmin/estado"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Estado
          </Link>
          <Link
            href="/superadmin/clientes"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Clientes
          </Link>
          <Link
            href="/superadmin/planes"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Planes
          </Link>
          <Link
            href="/superadmin/complementos"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Complementos
          </Link>
          <Link
            href="/superadmin/consumo"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Consumo
          </Link>
          <Link
            href="/superadmin/correos"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Correos
          </Link>
          <Link
            href="/superadmin/bitacora"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Bitácora
          </Link>
          <Link
            href="/superadmin/bajas"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Bajas
          </Link>
          {/* CON SOPORTE ABIERTO NO ES UN ENLACE: es salir. Ver `volver.ts`. */}
          {soporte ? (
            <form action={volverAMiCuenta}>
              <button
                title={`Cierra el soporte de ${soporte.negocio} y te lleva a tu cuenta`}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Volver a la plataforma
              </button>
            </form>
          ) : (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a la plataforma
            </Link>
          )}
          {/* Aquí NO había forma de cerrar sesión: había que volver a la
              plataforma y buscar el menú del avatar. Se aguanta cuando tienes
              organización propia; a quien no la tiene lo dejaba dando vueltas.
              Poder salir no puede depender de por qué puerta entraste. */}
          <form action={cerrarSesion}>
            <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
              <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
            </button>
          </form>
        </nav>
      </header>

      {/* El mismo aviso que ve el marco del cliente, porque el acceso es el
          mismo. Aquí faltaba, y su ausencia se leía como «no hay nada abierto». */}
      {soporte && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-danger px-4 py-2 text-sm text-white sm:px-6">
          <LifeBuoy className="h-4 w-4 flex-none" />
          <p className="font-semibold">
            Tienes abierta la cuenta de <b className="underline">{soporte.negocio}</b> como soporte.
          </p>
          <p className="opacity-80">
            Mientras dure, la plataforma te enseña la suya. «Volver a la plataforma» cierra ese acceso y te
            deja en tu propia cuenta.
          </p>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
