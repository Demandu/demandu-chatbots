import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Esta pantalla se mudó a `/superadmin/planes`.
 *
 * Los planes a la medida son cosa del equipo de Demandu, no de la app del
 * cliente: colgaban de Configuración y ahí no pintaban nada. Queda esta
 * redirección para que un enlace guardado o un marcador viejo siga llevando
 * a algún sitio en vez de dar un 404.
 *
 * El permiso lo comprueba el marco de `/superadmin`, así que aquí no hace
 * falta repetirlo: quien no sea del equipo acaba en su panel de siempre.
 */
export default function AdminPlanesMudado() {
  redirect("/superadmin/planes");
}
