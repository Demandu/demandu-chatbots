import type { Metadata } from "next";
import { FormularioDeContrasena } from "@/components/FormularioDeContrasena";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Crea tu contraseña · Demandu" };

/**
 * A donde llega quien acepta una invitación al equipo — y también quien entró
 * con una contraseña temporal que le dio el equipo de Demandu al darle de alta.
 *
 * La página es de servidor y el formulario va aparte, en un componente de
 * cliente: `export const dynamic` solo vale en componentes de servidor, y esta
 * pantalla nunca debe servirse desde una caché — llega con una sesión recién
 * creada por el enlace del correo.
 */
export default async function CrearContrasenaPage({
  searchParams,
}: {
  searchParams?: { motivo?: string };
}) {
  // Quien viene de "olvidé mi contraseña" NO fue invitado por nadie: leer «te
  // invitaron a Demandu» le hace dudar de si el enlace es el suyo.
  const recuperando = searchParams?.motivo === "recuperar";

  // Cuál de los dos casos es, para que el texto diga la verdad. Si algo falla,
  // se enseña el texto de invitación: es el que más se usa.
  let temporal = false;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("memberships")
        .select("debe_cambiar_contrasena")
        .eq("user_id", user.id)
        .maybeSingle();
      temporal = !!data?.debe_cambiar_contrasena;
    }
  } catch {
    temporal = false;
  }

  return <FormularioDeContrasena temporal={temporal} recuperando={recuperando} />;
}
