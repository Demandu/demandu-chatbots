import { redirect } from "next/navigation";
import { Sidebar, type ResumenDePlan } from "@/components/Sidebar";
import { Shell } from "@/components/Shell";
import { faltaNombreDelNegocio, getCurrentOrgId } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { getUsage } from "@/lib/billing/usage";
import { sesionDeSoporte } from "@/lib/soporte";
import { AvisoDeSoporte } from "@/components/AvisoDeSoporte";

/**
 * ¿Esta persona entró con una contraseña temporal y todavía no ha puesto la
 * suya? Ante cualquier fallo contesta que NO: dejar entrar a alguien que ya
 * cambió su clave es un mal menor comparado con encerrar a todo el mundo
 * fuera del panel por un error de lectura.
 */
async function debeCambiarContrasena(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("memberships")
      .select("debe_cambiar_contrasena")
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data?.debe_cambiar_contrasena;
  } catch {
    return false;
  }
}

/**
 * EL DESVÍO A «BIENVENIDA» VA AQUÍ, en el marco común, y no en cada pantalla:
 * quien entra con Apple o Facebook no siempre aterriza en el panel —puede venir
 * de un enlace directo al Inbox o al Embudo— y el nombre del negocio se ve en
 * todas. Poniéndolo en el marco, no hay puerta por la que colarse.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // ¿Es alguien de Demandu metido en la cuenta de un cliente? Se resuelve
  // antes que nada porque el aviso tiene que salir en TODAS las pantallas del
  // panel, no solo en la primera.
  const { data: { user: quienEs } } = await createClient().auth.getUser();
  const soporte = quienEs ? await sesionDeSoporte(quienEs.id) : null;

  // Quien entró con una clave temporal no pasa de aquí sin elegir la suya.
  // Va en el marco por la misma razón que el desvío a «bienvenida»: hay
  // muchas puertas al panel y comprobarlo pantalla por pantalla es garantizar
  // que un día alguien se cuele por la que se olvidó.
  if (await debeCambiarContrasena()) redirect("/crear-contrasena");

  if (await faltaNombreDelNegocio()) redirect("/bienvenida");

  // El consumo de la tarjeta de la barra lateral se calcula AQUÍ y baja como
  // dato plano. La barra es un componente de cliente: si pidiera esto por su
  // cuenta, cada pantalla del panel abriría su propia petición y además haría
  // falta una ruta pública nueva para algo que el servidor ya tiene a mano.
  //
  // Nunca revienta: si falla, `getUsage` devuelve vacío y la tarjeta no se
  // pinta. Que no se vea el consumo no puede tumbar el panel entero.
  let plan: ResumenDePlan | null = null;
  try {
    const orgId = await getCurrentOrgId();
    const usage = await getUsage(createClient(), orgId);
    const m = usage.metrics.find((x) => x.key === "messages");
    if (m) plan = { nombre: usage.planName, usados: m.used, limite: m.limit, pct: m.pct };
  } catch {
    plan = null;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {soporte && <AvisoDeSoporte negocio={soporte.negocio} hasta={soporte.hasta} />}
      <div className="min-h-0 flex-1">
        <Shell sidebar={<Sidebar plan={plan} />}>{children}</Shell>
      </div>
    </div>
  );
}
