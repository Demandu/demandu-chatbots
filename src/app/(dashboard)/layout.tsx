import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Shell } from "@/components/Shell";
import { faltaNombreDelNegocio } from "@/lib/org";

/**
 * EL DESVÍO A «BIENVENIDA» VA AQUÍ, en el marco común, y no en cada pantalla:
 * quien entra con Apple o Facebook no siempre aterriza en el panel —puede venir
 * de un enlace directo al Inbox o al Embudo— y el nombre del negocio se ve en
 * todas. Poniéndolo en el marco, no hay puerta por la que colarse.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (await faltaNombreDelNegocio()) redirect("/bienvenida");

  return <Shell sidebar={<Sidebar />}>{children}</Shell>;
}
