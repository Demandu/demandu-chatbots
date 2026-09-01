import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Crown, ArrowLeft, LogOut } from "lucide-react";
import { cerrarSesion } from "../salir";

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
  const { data: esAdmin } = await createClient().rpc("is_platform_admin");
  // Al panel del cliente, no a una pantalla de "no tienes permiso": para quien
  // no es del equipo, esto sencillamente no existe.
  if (!esAdmin) redirect("/dashboard");

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
            href="/superadmin/consumo"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Consumo
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
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a la plataforma
          </Link>
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

      <main className="min-h-0 flex-1 overflow-auto p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
