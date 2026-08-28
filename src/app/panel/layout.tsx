import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Briefcase, ArrowLeft } from "lucide-react";
import { anotarPaso } from "@/lib/equipo/asistencia";

export const dynamic = "force-dynamic";

/**
 * El panel de un vendedor de Demandu o de un partner.
 *
 * NO ES EL PANEL DE UN CLIENTE Y NO ES EL SUPERADMIN. Es una tercera casa, y
 * tiene que verse distinta de las otras dos: quien trabaja aquí entra y sale
 * de cuentas ajenas todo el día, y confundir en cuál está es exactamente cómo
 * se toca por error algo de un cliente.
 *
 * El permiso se comprueba UNA VEZ aquí, igual que en /superadmin, para que
 * toda pantalla que cuelgue de /panel nazca protegida sin que nadie tenga que
 * acordarse. Un miembro dado de baja pierde el acceso al instante: la
 * comprobación exige `activo`.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login");

  // Queda constancia de que hoy pasó por aquí. No se espera al resultado: es
  // un apunte de gestión, no puede retrasar la carga de nadie.
  anotarPaso(user.id);

  const { data: miembro } = await createAdminClient()
    .from("equipo_demandu")
    .select("nombre, tipo, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  // Al panel normal, no a una pantalla de «no tienes permiso»: para quien no
  // es del equipo de ventas, esto sencillamente no existe.
  if (!miembro?.activo) redirect("/dashboard");

  const esPartner = miembro.tipo === "partner";

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea bg-[#131033] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-demandu-gradient">
            <Briefcase className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="font-display text-sm font-bold leading-tight text-white">
              {esPartner ? "Panel de partner" : "Panel de ventas"}
            </p>
            <p className="text-[11px] leading-tight text-white/50">{miembro.nombre}</p>
          </div>
        </div>

        <nav className="flex items-center gap-1.5">
          <Link
            href="/panel"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Mis clientes
          </Link>
          <Link
            href="/crear-contrasena"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Cambiar mi contraseña
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Salir
          </Link>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
