import type { Metadata } from "next";
import { FormularioDeContrasena } from "@/components/FormularioDeContrasena";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Crea tu contraseña · Demandu" };

/**
 * A donde llega quien acepta una invitación al equipo.
 *
 * La página es de servidor y el formulario va aparte, en un componente de
 * cliente: `export const dynamic` solo vale en componentes de servidor, y esta
 * pantalla nunca debe servirse desde una caché — llega con una sesión recién
 * creada por el enlace del correo.
 */
export default function CrearContrasenaPage() {
  return <FormularioDeContrasena />;
}
