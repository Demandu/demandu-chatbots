import { Topbar } from "@/components/Topbar";
import { SettingsNav } from "@/components/SettingsNav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Las pestañas internas de Demandu solo se muestran al equipo de la plataforma.
  const { data: esAdmin } = await createClient().rpc("is_platform_admin");

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Configuración</span>} />
      <div className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] bg-canvas p-4 sm:p-6 lg:p-8 text-ink">
        <h2 className="font-display text-2xl font-bold text-ink">Configuración</h2>
        <p className="mb-6 mt-1 max-w-xl text-ink-2">
          Crea los catálogos que usarás en tus conversaciones: atributos, etiquetas, equipos y miembros, grupos de leads y estados.
        </p>
        <SettingsNav isAdmin={!!esAdmin} />
        <div className="mt-6 max-w-4xl">{children}</div>
      </div>
    </>
  );
}
