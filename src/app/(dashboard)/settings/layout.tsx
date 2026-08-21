import { Topbar } from "@/components/Topbar";
import { SettingsNav, TituloSeccion } from "@/components/SettingsNav";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Marco de Configuración: columna de secciones a la izquierda, contenido a la
 * derecha. Mismo patrón que dentro de un chatbot, para que la app no tenga dos
 * criterios distintos.
 *
 * La barra superior va ARRIBA DEL TODO y ocupa el ancho completo; la columna
 * cuelga por debajo. Así la jerarquía se lee sola: primero dónde estoy en la
 * plataforma, después dentro de qué sección.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // Las pestañas internas de Demandu solo se muestran al equipo de la plataforma.
  const { data: esAdmin } = await createClient().rpc("is_platform_admin");

  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Configuración</span>} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <SettingsNav isAdmin={!!esAdmin} />
        <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4 pb-[env(safe-area-inset-bottom)] text-ink sm:p-6 lg:p-8">
          <div className="max-w-4xl">
            <TituloSeccion />
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
