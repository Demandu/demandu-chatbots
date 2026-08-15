import { Topbar } from "@/components/Topbar";
import { SettingsNav } from "@/components/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar crumb={<span className="font-semibold text-white">Configuración</span>} />
      <div className="flex-1 overflow-auto p-8">
        <h2 className="font-display text-2xl font-bold text-white">Configuración</h2>
        <p className="mb-6 mt-1 max-w-xl text-muted">
          Crea los catálogos que usarás en las Acciones de tus flujos: etiquetas, equipos y miembros, grupos de leads y estados.
        </p>
        <SettingsNav />
        <div className="mt-6 max-w-3xl">{children}</div>
      </div>
    </>
  );
}
