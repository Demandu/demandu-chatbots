import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentOrgId, faltaNombreDelNegocio } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { confirmarNombre, crearMiNegocio } from "./actions";

export const dynamic = "force-dynamic";

/**
 * La primera pantalla de quien todavía no tiene su negocio en orden.
 *
 * Atiende DOS situaciones que se parecen mucho y no son la misma:
 *
 *   1. TIENE NEGOCIO Y NO LE PUSO NOMBRE — quien entró con Apple o Facebook.
 *      Salió a la pantalla del proveedor y volvió por otra ruta, así que nunca
 *      pasó por el formulario donde se pregunta. Su organización nació con un
 *      nombre sacado del correo.
 *
 *   2. NO TIENE NINGÚN NEGOCIO. Le eliminaron la cuenta desde superadmin y su
 *      usuario sobrevivió con cero membresías. Antes caía en un panel vacío,
 *      sin nada que hacer y sin explicación; ahora puede crear el suyo aquí.
 *
 * Una sola pregunta en los dos casos, y la que de verdad hace falta. Se
 * resistió la tentación de aprovechar el momento para pedir teléfono, sector y
 * tamaño de la empresa: es el primer segundo del cliente dentro de la
 * plataforma y cada campo de más es una razón para cerrar la pestaña.
 *
 * NO ESTÁ DENTRO DE (dashboard) A PROPÓSITO: el marco del panel es justo quien
 * redirige hasta aquí. Si esta pantalla viviera ahí dentro, se redirigiría a sí
 * misma para siempre.
 */
export default async function Bienvenida() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login");

  const orgId = await getCurrentOrgId();

  // ── SIN NINGÚN NEGOCIO ────────────────────────────────────────────────────
  if (!orgId) {
    // El equipo de Demandu tampoco tiene negocio, y a propósito: su sitio es la
    // trastienda. Sin esta comprobación acabaría creándose uno por error y
    // ensuciando la lista de clientes, que es justo lo que la 0060 evitó.
    const { data: miembro } = await createAdminClient()
      .from("equipo_demandu")
      .select("id")
      .eq("user_id", user.id)
      .eq("activo", true)
      .maybeSingle();
    if (miembro) redirect("/panel");

    return (
      <Marco
        titulo="Vamos a crear tu negocio"
        texto={
          <>
            Tu cuenta existe, pero ahora mismo no está ligada a ningún negocio.
            Ponle nombre al tuyo y entras.
          </>
        }
        accion={crearMiNegocio}
        boton="Crear mi negocio"
      />
    );
  }

  // Quien ya lo contestó no tiene por qué volver a ver esto, ni aunque escriba
  // la dirección a mano.
  if (!(await faltaNombreDelNegocio())) redirect("/dashboard");

  return (
    <Marco
      titulo="Una cosa antes de empezar"
      texto={
        <>
          Entraste con tu cuenta, así que no llegamos a preguntarte lo más importante:{" "}
          <b className="text-white">¿cómo se llama tu negocio?</b>
        </>
      }
      accion={confirmarNombre}
      boton="Entrar a Demandu"
    />
  );
}

/** El mismo marco para los dos casos: cambia el texto, no la pantalla. */
function Marco({
  titulo,
  texto,
  accion,
  boton,
}: {
  titulo: string;
  texto: React.ReactNode;
  accion: (formData: FormData) => Promise<void>;
  boton: string;
}) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-navy p-6">
      <div className="absolute inset-0 bg-demandu-radial" />

      <div className="relative w-full max-w-md">
        <Logo />

        <h1 className="mt-10 font-display text-3xl font-extrabold leading-tight text-white">{titulo}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{texto}</p>

        <form action={accion} className="mt-8 space-y-4">
          <div>
            <input
              name="negocio"
              required
              autoFocus
              maxLength={80}
              className="input"
              placeholder="Pastelería La Dulce"
            />
            <p className="mt-2 text-[11px] text-muted-2">
              Así aparecerá en tu plataforma y en tus chats. Lo puedes cambiar cuando quieras desde
              Configuración.
            </p>
          </div>

          <button type="submit" className="btn-primary w-full">
            {boton}
          </button>
        </form>
      </div>
    </main>
  );
}
